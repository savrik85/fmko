/**
 * Prosba o příspěvek u majitele firmy: DB vrstva (vzorce v requests.ts, texty v request-texts.ts).
 *
 * Podání (`submitRequest`) zapíše prosbu, peníze, transakci a změnu náklonnosti v jedné dávce
 * hlídané existencí nového řádku prosby; dvojklik narazí na „jedna prosba u majitele za den".
 * Denní tick (`evaluateSponsorRequests`) po SPEND_DAYS dnech zkontroluje, jestli klub peníze
 * utratil na slíbený účel.
 */
import { logger } from "../lib/logger";
import { postOwnerMessages, type OwnerIdentity } from "../messaging/system-sms";
import { budgetEstimateRange, sponsorBudgetB } from "./budget";
import { ensureSponsorOwner, favorDeltaStmts, getFavor, type SponsorOwner } from "./favor";
import { FAVOR_REASONS } from "./favor-math";
import { activeSeason, loadNegotiationSponsor, loadNegotiationTeam, type NegotiationSponsor, type NegotiationTeam } from "./negotiation-db";
import { addDays, dayDiff } from "./owner-sms-rules";
import { coachRequestText, requestCheckText, requestReplyText } from "./request-texts";
import {
  BROKEN_FAVOR, decideRequest, exhaustedBelow, isRequestPurpose, MAX_ASK, MIN_ASK, PURPOSE_LABELS, PURPOSE_SPEND_TYPES, REPEAT_DAYS,
  REQUEST_PURPOSES, REQUEST_WINDOW_DAYS, requestBlock, requestCap, requestFavorDelta, SPEND_DAYS,
  type RequestDecision, type RequestPurpose, type RequestRefusal, type RequestRelation,
} from "./requests";
import { advanceItemsTotals, parseAdvance } from "./signing";

const M = "sponsor-requests";

interface RequestContext {
  team: NegotiationTeam;
  sponsor: NegotiationSponsor;
  owner: SponsorOwner;
  favor: number;
  relation: RequestRelation;
  /** Herní den klubu YYYY-MM-DD. */
  day: string;
  season: number;
  monthlyB: number;
  /** Co firma klubu dala za posledních REQUEST_WINDOW_DAYS dní. */
  given: number;
  /** Nejdřívější den, kdy z okna vypadne nejstarší dar (pro „zkuste to po …"). */
  retryDay: string | null;
  lastRequestDay: string | null;
  brokenThisSeason: boolean;
}

type Fail = { error: string; status: 400 | 404 | 409 };

const RELATION_ORDER: Record<string, number> = { main: 0, stadium: 1, banner: 2 };

async function loadRequestContext(db: D1Database, teamId: string, sponsorId: number): Promise<RequestContext | Fail> {
  const [team, sponsor, owner, season] = await Promise.all([
    loadNegotiationTeam(db, teamId), loadNegotiationSponsor(db, sponsorId), ensureSponsorOwner(db, sponsorId), activeSeason(db),
  ]);
  if (!team || !sponsor || !owner) return { error: "Firma nenalezena", status: 404 };
  if (team.district !== sponsor.district) return { error: "Firma není z tvého okresu", status: 400 };
  const day = (team.game_date ?? new Date().toISOString()).slice(0, 10);

  const [favor, contracts, requests] = await Promise.all([
    getFavor(db, sponsorId, teamId),
    db.prepare(
      `SELECT sc.id, sc.category, sc.status, sc.signing_bonus, sc.paid_construction, sc.negotiation_id,
              COALESCE((SELECT substr(tr.game_date, 1, 10) FROM transactions tr
                        WHERE tr.team_id = sc.team_id AND tr.reference_id = 'sponsor-bonus-' || sc.id LIMIT 1),
                       substr(sc.signed_at, 1, 10)) AS given_day
       FROM sponsor_contracts sc WHERE sc.team_id = ? AND sc.sponsor_id = ?`,
    ).bind(teamId, sponsorId).all<{
      id: string; category: string | null; status: string; signing_bonus: number | null; paid_construction: string | null;
      negotiation_id: string | null; given_day: string | null;
    }>(),
    db.prepare(
      "SELECT request_day, granted, status, season FROM sponsor_requests WHERE team_id = ? AND sponsor_id = ?",
    ).bind(teamId, sponsorId).all<{ request_day: string; granted: number; status: string; season: number | null }>(),
  ]);

  const active = contracts.results
    .filter((c) => c.status === "active" && (c.category ?? "main") in RELATION_ORDER)
    .sort((a, b) => RELATION_ORDER[a.category ?? "main"] - RELATION_ORDER[b.category ?? "main"]);
  const relation = (active[0]?.category ?? "none") as RequestRelation;

  // Okno darů: den v rozmezí [day - 90, day]. Po rolloveru se herní čas vrací, dary z minulé
  // sezóny pak mají pozdější datum než dnešek a do okna nepatří.
  const inWindow = (d: string | null): d is string => !!d && d <= day && dayDiff(d, day) <= REQUEST_WINDOW_DAYS;
  const gifts: Array<{ day: string; amount: number }> = [];
  for (const c of contracts.results) {
    if (!c.negotiation_id || !inWindow(c.given_day)) continue;
    const t = advanceItemsTotals(parseAdvance(c.paid_construction, c.id).items);
    const amount = (c.signing_bonus ?? 0) + t.construction + t.equipment + t.paidFee;
    if (amount > 0) gifts.push({ day: c.given_day, amount });
  }
  for (const r of requests.results) {
    if (r.granted > 0 && inWindow(r.request_day)) gifts.push({ day: r.request_day, amount: r.granted });
  }
  const given = gifts.reduce((s, g) => s + g.amount, 0);
  const oldest = gifts.map((g) => g.day).sort()[0];
  const retryDay = oldest ? addDays(oldest, REQUEST_WINDOW_DAYS + 1) : null;

  const thisSeason = requests.results.filter((r) => r.season === season);
  const lastRequestDay = thisSeason.map((r) => r.request_day).filter((d) => d <= day).sort().pop() ?? null;
  const brokenThisSeason = thisSeason.some((r) => r.status === "broken");

  const monthlyB = sponsorBudgetB({
    monthlyMax: sponsor.monthly_max, reputation: team.reputation, villageSize: team.size, category: "main", favor,
  });
  return { team, sponsor, owner, favor, relation, day, season, monthlyB, given, retryDay, lastRequestDay, brokenThisSeason };
}

function blockOf(ctx: RequestContext): RequestRefusal | null {
  return requestBlock({
    favor: ctx.favor, relation: ctx.relation, brokenThisSeason: ctx.brokenThisSeason,
    lastRequestDaysAgo: ctx.lastRequestDay ? dayDiff(ctx.lastRequestDay, ctx.day) : null,
  });
}

function capOf(ctx: RequestContext, purpose: RequestPurpose): number {
  return requestCap({ monthlyB: ctx.monthlyB, favor: ctx.favor, relation: ctx.relation, personality: ctx.owner.personality, purpose });
}

/** Utraceno na účel v rozmezí herních dní (včetně krajních), kladné číslo. */
async function spentOnPurpose(db: D1Database, teamId: string, purpose: RequestPurpose, from: string, to: string): Promise<number> {
  const types = PURPOSE_SPEND_TYPES[purpose];
  const row = await db.prepare(
    `SELECT COALESCE(-SUM(amount), 0) AS spent FROM transactions
     WHERE team_id = ? AND amount < 0 AND type IN (${types.map(() => "?").join(",")})
       AND substr(game_date, 1, 10) BETWEEN ? AND ?`,
  ).bind(teamId, ...types, from, to).first<{ spent: number }>();
  return row?.spent ?? 0;
}

/**
 * Kolik musí klub utratit, aby prosba prošla: její příspěvek plus příspěvky na stejný účel
 * z ostatních proseb v předchozích SPEND_DAYS dnech. Jeden nákup tak nekryje dvě prosby.
 */
async function requiredFor(
  db: D1Database, r: { id: string; team_id: string; purpose: string; request_day: string; granted: number; season: number | null },
): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(granted), 0) AS other FROM sponsor_requests
     WHERE team_id = ? AND purpose = ? AND id != ? AND granted > 0 AND season IS ?
       AND request_day BETWEEN ? AND ? AND (request_day < ? OR (request_day = ? AND created_at < (SELECT created_at FROM sponsor_requests WHERE id = ?)))`,
  ).bind(
    r.team_id, r.purpose, r.id, r.season, addDays(r.request_day, -SPEND_DAYS), r.request_day, r.request_day, r.request_day, r.id,
  ).first<{ other: number }>();
  return r.granted + (row?.other ?? 0);
}

export interface RequestInfo {
  owner: { name: string; firmName: string; faceConfig: Record<string, unknown> };
  favor: number;
  relation: RequestRelation;
  given: number;
  block: RequestRefusal | null;
  /** Kdy jde znovu požádat (u too_soon), herní den YYYY-MM-DD. */
  nextAskDay: string | null;
  purposes: Array<{ purpose: RequestPurpose; label: string; estimate: { low: number; high: number } | null }>;
  obligations: Array<{ id: string; purpose: RequestPurpose; label: string; granted: number; required: number; spent: number; checkDay: string }>;
  history: Array<{ purpose: RequestPurpose; label: string; asked: number; granted: number; status: string; day: string }>;
  minAsk: number;
}

export async function requestInfo(db: D1Database, teamId: string, sponsorId: number): Promise<RequestInfo | Fail> {
  const ctx = await loadRequestContext(db, teamId, sponsorId);
  if ("error" in ctx) return ctx;
  const block = blockOf(ctx);
  const purposes = REQUEST_PURPOSES.map((purpose) => {
    const cap = capOf(ctx, purpose);
    const remaining = Math.max(0, cap - ctx.given);
    const estimate = block || remaining < exhaustedBelow(cap) ? null : budgetEstimateRange(remaining, ctx.favor);
    return { purpose, label: PURPOSE_LABELS[purpose], estimate };
  });

  const rows = await db.prepare(
    `SELECT id, team_id, purpose, asked, granted, status, request_day, check_day, season, created_at FROM sponsor_requests
     WHERE team_id = ? AND sponsor_id = ? ORDER BY created_at DESC LIMIT 20`,
  ).bind(teamId, sponsorId).all<{
    id: string; team_id: string; purpose: string; asked: number; granted: number; status: string;
    request_day: string; check_day: string | null; season: number | null; created_at: string;
  }>();
  const obligations: RequestInfo["obligations"] = [];
  for (const r of rows.results) {
    if (r.status !== "granted" || !r.check_day || !isRequestPurpose(r.purpose)) continue;
    const [required, spent] = await Promise.all([
      requiredFor(db, r),
      spentOnPurpose(db, teamId, r.purpose, r.request_day, r.check_day),
    ]);
    obligations.push({ id: r.id, purpose: r.purpose, label: PURPOSE_LABELS[r.purpose], granted: r.granted, required, spent, checkDay: r.check_day });
  }
  const history = rows.results
    .filter((r): r is typeof r & { purpose: RequestPurpose } => isRequestPurpose(r.purpose))
    .slice(0, 5)
    .map((r) => ({ purpose: r.purpose, label: PURPOSE_LABELS[r.purpose], asked: r.asked, granted: r.granted, status: r.status, day: r.request_day }));

  return {
    owner: { name: `${ctx.owner.firstName} ${ctx.owner.lastName}`, firmName: ctx.sponsor.name, faceConfig: ctx.owner.faceConfig },
    favor: ctx.favor, relation: ctx.relation, given: ctx.given, block,
    nextAskDay: block === "too_soon" && ctx.lastRequestDay ? addDays(ctx.lastRequestDay, REPEAT_DAYS) : null,
    purposes, obligations, history, minAsk: MIN_ASK,
  };
}

export interface RequestResult {
  kind: RequestDecision["kind"];
  amount: number;
  refusal: RequestRefusal | null;
  reply: string;
  checkDay: string | null;
  favorDelta: number;
}

function ownerIdentity(owner: SponsorOwner, firmName: string): OwnerIdentity {
  return { sponsorId: owner.sponsorId, name: `${owner.firstName} ${owner.lastName}`, firmName, avatar: JSON.stringify(owner.faceConfig) };
}

export async function submitRequest(
  db: D1Database, teamId: string, sponsorId: number, input: { purpose: unknown; amount: unknown; note: unknown },
): Promise<RequestResult | Fail> {
  if (!isRequestPurpose(input.purpose)) return { error: "Vyber, na co peníze chceš", status: 400 };
  const asked = typeof input.amount === "number" ? Math.round(input.amount) : NaN;
  if (!Number.isFinite(asked) || asked < MIN_ASK || asked > MAX_ASK) {
    return { error: `Částka musí být od ${MIN_ASK.toLocaleString("cs-CZ")} do ${MAX_ASK.toLocaleString("cs-CZ")} Kč`, status: 400 };
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 300) : "";
  const purpose = input.purpose;

  const ctx = await loadRequestContext(db, teamId, sponsorId);
  if ("error" in ctx) return ctx;
  const decision = decideRequest({ asked, cap: capOf(ctx, purpose), given: ctx.given, block: blockOf(ctx) });
  const granted = decision.kind === "refused" ? 0 : decision.amount;
  const refusal = decision.kind === "refused" ? decision.refusal : null;
  const checkDay = granted > 0 ? addDays(ctx.day, SPEND_DAYS) : null;
  const favorDelta = requestFavorDelta(decision);
  const id = crypto.randomUUID();
  const gameDate = ctx.team.game_date ?? new Date().toISOString();

  // Jedna prosba u majitele za herní den: druhé kliknutí nic nezapíše.
  const insert = db.prepare(
    `INSERT INTO sponsor_requests (id, team_id, sponsor_id, purpose, asked, granted, status, refusal, note, request_day, check_day, season)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM sponsor_requests WHERE team_id = ? AND sponsor_id = ? AND request_day = ?)`,
  ).bind(
    id, teamId, sponsorId, purpose, asked, granted, granted > 0 ? "granted" : "refused", refusal, note || null, ctx.day, checkDay, ctx.season,
    teamId, sponsorId, ctx.day,
  );
  const guard = { sql: "EXISTS (SELECT 1 FROM sponsor_requests WHERE id = ?)", params: [id] };
  const stmts: D1PreparedStatement[] = [insert];
  if (granted > 0) {
    stmts.push(
      db.prepare(`UPDATE teams SET budget = budget + ? WHERE id = ? AND ${guard.sql}`).bind(granted, teamId, ...guard.params),
      db.prepare(
        `INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date)
         SELECT ?, ?, 'sponsor_request', ?, (SELECT budget FROM teams WHERE id = ?), ?, ?, ? WHERE ${guard.sql}`,
      ).bind(
        crypto.randomUUID(), teamId, granted, teamId, `Příspěvek od ${ctx.sponsor.name} na ${PURPOSE_LABELS[purpose]}`,
        `sponsor-request-${id}`, gameDate, ...guard.params,
      ),
    );
  }
  if (favorDelta !== 0) {
    const reason = refusal === "too_soon" ? FAVOR_REASONS.requestTooSoon : FAVOR_REASONS.requestRefused;
    stmts.push(...favorDeltaStmts(db, sponsorId, teamId, favorDelta, reason, guard));
  }
  const results = await db.batch(stmts);
  if ((results[0]?.meta?.changes ?? 0) !== 1) return { error: "Dnes už jsi ho o peníze prosil", status: 409 };

  const vars = { castka: decision.kind === "refused" ? asked : decision.amount, ucel: purpose, termin: checkDay ?? undefined, kdy: ctx.retryDay ?? undefined };
  const reply = requestReplyText(decision.kind, ctx.owner.personality, vars, refusal, `request|${id}`);
  await postOwnerMessages(db, teamId, ownerIdentity(ctx.owner, ctx.sponsor.name), [
    { from: "coach", body: coachRequestText({ castka: asked, ucel: purpose }, note) },
    { from: "owner", body: reply },
  ], { coachName: ctx.team.name, unread: false });
  logger.info({ module: M, teamId }, `prosba u firmy ${sponsorId}: ${purpose} ${asked} → ${decision.kind} ${granted}`);

  return { kind: decision.kind, amount: granted, refusal, reply, checkDay, favorDelta };
}

/**
 * Po SPEND_DAYS dnech: utratil klub peníze na slíbený účel? Ne = velký pokles náklonnosti a do
 * konce sezóny od majitele nic. Prosba z minulé sezóny (rollover vrátil herní čas) propadne
 * bez postihu, lhůta se nedala dodržet.
 */
export async function evaluateSponsorRequests(db: D1Database, dateIso: string): Promise<{ kept: number; broken: number; lapsed: number }> {
  const day = dateIso.slice(0, 10);
  const season = await activeSeason(db);
  const due = await db.prepare(
    `SELECT r.id, r.team_id, r.sponsor_id, r.purpose, r.granted, r.request_day, r.check_day, r.season, t.name AS team_name
     FROM sponsor_requests r JOIN teams t ON t.id = r.team_id
     WHERE r.status = 'granted' AND (r.check_day <= ? OR r.season IS NOT ?)
     ORDER BY r.request_day, r.created_at LIMIT 200`,
  ).bind(day, season).all<{
    id: string; team_id: string; sponsor_id: number; purpose: string; granted: number; request_day: string;
    check_day: string; season: number | null; team_name: string;
  }>();
  const out = { kept: 0, broken: 0, lapsed: 0 };
  for (const r of due.results) {
    try {
      if (r.season !== season || !isRequestPurpose(r.purpose)) {
        await db.prepare("UPDATE sponsor_requests SET status = 'lapsed' WHERE id = ? AND status = 'granted'").bind(r.id).run();
        out.lapsed++;
        continue;
      }
      const [required, spent] = await Promise.all([
        requiredFor(db, r), spentOnPurpose(db, r.team_id, r.purpose, r.request_day, r.check_day),
      ]);
      const kept = spent >= required;
      // Nárok: souběžný tick nesmí stejnou prosbu vyhodnotit dvakrát. `.all()` kvůli RETURNING (viz owner-sms.ts).
      const claim = await db.prepare(
        "UPDATE sponsor_requests SET status = ? WHERE id = ? AND status = 'granted' RETURNING id",
      ).bind(kept ? "kept" : "broken", r.id).all<{ id: string }>();
      if (claim.results.length !== 1) continue;
      if (!kept) await db.batch(favorDeltaStmts(db, r.sponsor_id, r.team_id, BROKEN_FAVOR, FAVOR_REASONS.requestBroken));
      if (kept) out.kept++; else out.broken++;

      const [owner, firm] = await Promise.all([
        ensureSponsorOwner(db, r.sponsor_id),
        db.prepare("SELECT name FROM district_sponsors WHERE id = ?").bind(r.sponsor_id).first<{ name: string }>(),
      ]);
      if (owner) {
        const text = requestCheckText(kept, { castka: r.granted, ucel: r.purpose }, `request-check|${r.id}`);
        await postOwnerMessages(db, r.team_id, ownerIdentity(owner, firm?.name ?? ""), [{ from: "owner", body: text }],
          { coachName: r.team_name, unread: true });
      }
    } catch (e) {
      logger.warn({ module: M, teamId: r.team_id }, `vyhodnocení prosby ${r.id}`, e);
    }
  }
  return out;
}
