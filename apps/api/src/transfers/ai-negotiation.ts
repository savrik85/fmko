/**
 * Jednání s cizím klubem o přestupu (spec 2026-10-04).
 *
 * Kupující pošle návrh (cena, záloha, splátky), klub odpoví souhlasem, protinávrhem nebo
 * jednání ukončí. Jednání je živé: odpověď se spočítá a doručí hned při tahu kupujícího
 * (`deliverNow`). Mezikrok přes `pending_reply` zůstává kvůli atomicitě a kvůli jednáním,
 * která čekala na odpověď ještě z doby s prodlevou; ty doručí `revealDueAiReplies` při cronu.
 *
 * Když klub souhlasí, kupující podepíše. Teprve tehdy se rozhoduje hráč (dojíždění,
 * síla klubu, plný kádr) a teprve tehdy se platí.
 */

import {
  MAX_TRANSFER_AMOUNT, marketValue, transferSchedule, transferTermsError, formatTermsSummary,
  type AiNegotiationStatus, type AiSellerStance, type TransferTerms,
} from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { stableSeed } from "../lib/scout-estimate";
import {
  AI_SELLER, decideAiSellerReply, initAiSellerState,
  type AiReplyTone, type AiSellerState,
} from "./ai-seller";
import { aiReplyText } from "./ai-seller-texts";
import { installmentBudgetError, installmentLimitError, weeklyInstallment } from "./installments";
import { purchaseVirtualPlayer, type VirtualPlayerData } from "./virtual-purchase";
import { clubValuation } from "../scouting/youth-growth";

/** Nejvíc hráčů v kádru; víc klub z trhu nekoupí (stejně jako u volných hráčů). */
export const SQUAD_CAP = 30;

export interface AiNegotiationRow {
  id: string;
  team_id: string;
  target_squad: "senior" | "u21";
  source: "listing" | "scout_report";
  listing_id: string | null;
  scout_report_id: string | null;
  player_key: string;
  player_name: string;
  player_position: string | null;
  player_age: number | null;
  club_name: string;
  club_city: string | null;
  club_district: string | null;
  stance: AiSellerStance;
  ai_state: string;
  amount: number;
  upfront_pct: number;
  installments: number;
  last_action_by: "buyer" | "club";
  status: AiNegotiationStatus;
  pending_reply: string | null;
  reply_due_at: string | null;
  player_id: string | null;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
}

interface PendingReply {
  kind: "agree" | "counter" | "break_off";
  tone: AiReplyTone;
  counterTerms?: TransferTerms;
  nextState: AiSellerState;
  message: string;
}

export type NegotiationError = { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string };

export interface PushEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

const fail = (status: NegotiationError["status"], error: string): NegotiationError => ({ ok: false, status, error });

export function termsOf(row: Pick<AiNegotiationRow, "amount" | "upfront_pct" | "installments">): TransferTerms {
  return { amount: row.amount, upfrontPct: row.upfront_pct, installments: row.installments, sellOnPct: 0 };
}

// ─── Zdroj hráče: inzerát na trhu, nebo hlášení skauta ───────────────────────

interface NegotiationSource {
  source: "listing" | "scout_report";
  id: string;
  player: VirtualPlayerData;
  clubName: string;
  clubCity: string | null;
  clubDistrict: string | null;
  stance: AiSellerStance;
  askingPrice?: number;
  clubRank?: number;
  clubMean?: number | null;
  villageId?: string | null;
  distanceKm?: number | null;
  expiresAt: string;
  /** Hráč vás už jednou odmítl (inzerát) — nemá cenu jednat. */
  rejectedBy: string[];
}

function parseJson<T>(raw: string | null | undefined, fallback: T, what: string): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch (e) {
    logger.warn({ module: "ai-negotiation" }, `parse ${what}`, e);
    return fallback;
  }
}

async function loadSource(db: D1Database, source: "listing" | "scout_report", id: string, buyerClubTeamId: string): Promise<NegotiationSource | NegotiationError> {
  if (source === "listing") {
    const l = await db.prepare(
      "SELECT id, ai_player_data, asking_price, expires_at, rejected_by, status, is_ai_listing FROM transfer_listings WHERE id = ?",
    ).bind(id).first<{ id: string; ai_player_data: string; asking_price: number; expires_at: string; rejected_by: string | null; status: string; is_ai_listing: number }>();
    if (!l || !l.is_ai_listing) return fail(404, "Inzerát nenalezen.");
    if (l.status !== "active") return fail(409, "Hráč už na trhu není.");
    const player = parseJson<VirtualPlayerData | null>(l.ai_player_data, null, "ai_player_data");
    if (!player) return fail(500, "Inzerát je poškozený.");
    return {
      source, id, player, stance: "listed", askingPrice: l.asking_price,
      clubName: player.fromTeam ?? "Cizí klub", clubCity: player.fromCity ?? null, clubDistrict: player.fromDistrict ?? null,
      expiresAt: l.expires_at, rejectedBy: parseJson<string[]>(l.rejected_by, [], "rejected_by"),
    };
  }
  const r = await db.prepare(
    `SELECT id, team_id, source, player_data, club_name, club_city, district, club_rank, club_mean, village_id, distance_km,
            status, expires_at FROM scout_reports WHERE id = ?`,
  ).bind(id).first<{ id: string; team_id: string; source: string; player_data: string; club_name: string | null; club_city: string | null; district: string | null; club_rank: number | null; club_mean: number | null; village_id: string | null; distance_km: number; status: string; expires_at: string }>();
  if (!r || r.team_id !== buyerClubTeamId) return fail(404, "Hlášení nenalezeno.");
  if (r.source !== "village_club") return fail(400, "Volný hráč nemá klub, s kým jednat. Podepiš ho rovnou.");
  const player = parseJson<VirtualPlayerData | null>(r.player_data, null, "player_data");
  if (!player) return fail(500, "Hlášení je poškozené.");
  return {
    source, id, player, stance: "poached", clubRank: r.club_rank ?? 12, clubMean: r.club_mean,
    clubName: r.club_name ?? "Cizí klub", clubCity: r.club_city, clubDistrict: r.district,
    villageId: r.village_id, distanceKm: r.distance_km, expiresAt: r.expires_at, rejectedBy: [],
  };
}

/**
 * Z jaké ceny klub vychází. Klub z hlášení skauta zná svého kluka a mladíka ocení podle toho,
 * kým bude za sezónu (`clubValuation`); inzerát vychází z tržní ceny jako dřív.
 */
function sellerValuation(src: NegotiationSource): number {
  const p = src.player;
  if (src.source === "scout_report") {
    return clubValuation({
      age: p.age, rating: p.overallRating, position: p.position, talent: p.hiddenTalent ?? 0, skillsMax: p.skillCaps ?? {},
    });
  }
  return marketValue(p.overallRating, p.age, p.position);
}

/** Kontroly návrhu kupujícího: podmínky, strop splátek, peníze na zálohu. */
async function termsProblem(db: D1Database, buyerClubTeamId: string, terms: TransferTerms): Promise<string | null> {
  if (!Number.isInteger(terms.amount) || terms.amount <= 0) return "Nabídka musí být kladné celé číslo.";
  if (terms.amount > MAX_TRANSFER_AMOUNT) return `Částka může být nejvýš ${MAX_TRANSFER_AMOUNT.toLocaleString("cs")} Kč.`;
  const termsError = transferTermsError(terms);
  if (termsError) return termsError;
  if (terms.installments > 0) {
    const limit = await installmentLimitError(db, buyerClubTeamId)
      ?? await installmentBudgetError(db, buyerClubTeamId, weeklyInstallment(terms));
    if (limit) return limit;
  }
  const team = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(buyerClubTeamId).first<{ budget: number }>();
  const upfront = transferSchedule(terms).upfront;
  if (!team || team.budget < upfront) {
    return terms.installments > 0
      ? `Nedostatek peněz na zálohu. Máte ${(team?.budget ?? 0).toLocaleString("cs")} Kč, záloha je ${upfront.toLocaleString("cs")} Kč.`
      : `Nedostatek peněz. Máte ${(team?.budget ?? 0).toLocaleString("cs")} Kč, nabízíte ${terms.amount.toLocaleString("cs")} Kč.`;
  }
  return null;
}

async function u21TeamOf(db: D1Database, clubTeamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(clubTeamId).first<{ id: string }>();
  return row?.id ?? null;
}

function plannedReply(state: AiSellerState, terms: TransferTerms, now: Date): { reply: PendingReply; dueAt: Date } {
  const decision = decideAiSellerReply(state, terms);
  const round = decision.nextState.round;
  const rng = createRng(state.seed + round * 104_729);
  const message = aiReplyText(rng, decision.tone, decision.counterTerms?.amount);
  return { reply: { ...decision, message }, dueAt: now };
}

/** Živé jednání: odpověď klubu se doručí hned, bez SMS (kupující ji vidí na stránce). */
async function deliverNow(db: D1Database, negotiationId: string): Promise<void> {
  await revealDueAiReplies(db, undefined, { negotiationId, force: true, notify: false })
    .catch((e) => logger.error({ module: "ai-negotiation" }, "okamžitá odpověď klubu", e));
}

// ─── Zahájení a tahy kupujícího ─────────────────────────────────────────────

export async function startAiNegotiation(db: D1Database, input: {
  buyerClubTeamId: string;
  source: "listing" | "scout_report";
  sourceId: string;
  terms: TransferTerms;
  targetSquad?: "senior" | "u21";
  now?: Date;
}): Promise<{ ok: true; negotiationId: string; existing?: boolean } | NegotiationError> {
  const now = input.now ?? new Date();
  const buyer = input.buyerClubTeamId;
  const terms: TransferTerms = { ...input.terms, sellOnPct: 0 };
  const targetSquad = input.targetSquad === "u21" ? "u21" : "senior";

  const src = await loadSource(db, input.source, input.sourceId, buyer);
  if ("ok" in src) return src;
  const playerKey = src.id;

  const open = await db.prepare(
    "SELECT id FROM ai_negotiations WHERE team_id = ? AND player_key = ? AND status IN ('open','agreed') LIMIT 1",
  ).bind(buyer, playerKey).first<{ id: string }>();
  if (open) return { ok: true, negotiationId: open.id, existing: true };

  if (src.rejectedBy.includes(buyer)) return fail(409, "Hráč vás už jednou odmítl. Momentálně nemá zájem.");

  const history = await db.prepare(
    `SELECT COUNT(*) AS attempts,
            MAX(CASE WHEN status = 'broken_off' THEN resolved_at END) AS last_break
       FROM ai_negotiations WHERE team_id = ? AND player_key = ? AND status IN ('broken_off','withdrawn','refused')`,
  ).bind(buyer, playerKey).first<{ attempts: number; last_break: string | null }>();
  if (history?.last_break) {
    const until = new Date(new Date(history.last_break).getTime() + AI_SELLER.breakOffCooldownDays * 86_400_000);
    if (until > now) return fail(409, `${src.clubName} s vámi o tomhle hráči teď nejedná. Zkuste to po ${until.toLocaleDateString("cs-CZ")}.`);
  }

  if (targetSquad === "u21") {
    if (src.player.age > 21) return fail(400, "Hráč starší 21 let nemůže do U21.");
    if (!await u21TeamOf(db, buyer)) return fail(400, "Tvůj klub nemá U21 tým.");
  }

  const problem = await termsProblem(db, buyer, terms);
  if (problem) return fail(400, problem);

  // Seed z hráče a kupujícího: znovu zahájené jednání má stejnou rezervační cenu, takže se
  // nedá „přerolovat" stažením a novým začátkem. Každý další pokus stojí trpělivost.
  const state = initAiSellerState({
    stance: src.stance,
    marketValue: sellerValuation(src),
    askingPrice: src.askingPrice,
    clubRank: src.clubRank,
    seed: stableSeed(`${playerKey}:${buyer}`),
    priorBreakOffs: history?.attempts ?? 0,
  });
  const { reply, dueAt } = plannedReply(state, terms, now);

  const id = crypto.randomUUID();
  if (src.source === "scout_report") {
    const claimed = await db.prepare(
      "UPDATE scout_reports SET status = 'negotiating', negotiation_id = ? WHERE id = ? AND team_id = ? AND status = 'active'",
    ).bind(id, src.id, buyer).run();
    if ((claimed.meta?.changes ?? 0) === 0) return fail(409, "Hlášení už neplatí.");
  }

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO ai_negotiations (id, team_id, target_squad, source, listing_id, scout_report_id, player_key, player_name,
           player_position, player_age, club_name, club_city, club_district, stance, ai_state, amount, upfront_pct, installments,
           last_action_by, status, pending_reply, reply_due_at, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'buyer', 'open', ?, ?, ?, ?)`,
      ).bind(
        id, buyer, targetSquad, src.source,
        src.source === "listing" ? src.id : null, src.source === "scout_report" ? src.id : null,
        playerKey, `${src.player.firstName} ${src.player.lastName}`, src.player.position, src.player.age,
        src.clubName, src.clubCity, src.clubDistrict, src.stance, JSON.stringify(state),
        terms.amount, terms.upfrontPct, terms.installments,
        JSON.stringify(reply), dueAt.toISOString(), src.expiresAt, now.toISOString(),
      ),
      db.prepare(
        `INSERT INTO ai_negotiation_events (id, negotiation_id, actor, event_type, amount, upfront_pct, installments, created_at)
         VALUES (?, ?, 'buyer', 'offer', ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), id, terms.amount, terms.upfrontPct, terms.installments, now.toISOString()),
    ]);
  } catch (e) {
    logger.error({ module: "ai-negotiation" }, "zahájení jednání", e);
    if (src.source === "scout_report") {
      await db.prepare("UPDATE scout_reports SET status = 'active', negotiation_id = NULL WHERE id = ? AND negotiation_id = ?")
        .bind(src.id, id).run().catch((e2) => logger.error({ module: "ai-negotiation" }, "vrácení hlášení", e2));
    }
    return fail(409, "Jednání se nepodařilo zahájit. Možná už o hráče jednáš.");
  }
  await deliverNow(db, id);
  return { ok: true, negotiationId: id };
}

async function loadOwnNegotiation(db: D1Database, id: string, buyerClubTeamId: string): Promise<AiNegotiationRow | NegotiationError> {
  const row = await db.prepare("SELECT * FROM ai_negotiations WHERE id = ?").bind(id).first<AiNegotiationRow>();
  if (!row || row.team_id !== buyerClubTeamId) return fail(404, "Jednání nenalezeno.");
  return row;
}

/** Další návrh kupujícího poté, co klub odpověděl protinávrhem. */
export async function counterAiNegotiation(db: D1Database, input: {
  negotiationId: string; buyerClubTeamId: string; terms: TransferTerms; now?: Date;
}): Promise<{ ok: true } | NegotiationError> {
  const now = input.now ?? new Date();
  const row = await loadOwnNegotiation(db, input.negotiationId, input.buyerClubTeamId);
  if ("ok" in row) return row;
  if (row.status !== "open") return fail(409, "Jednání už neběží.");
  if (row.last_action_by !== "club" || row.pending_reply) return fail(409, "Klub ještě neodpověděl.");
  if (new Date(row.expires_at) < now) return fail(409, "Jednání vypršelo.");

  const terms: TransferTerms = { ...input.terms, sellOnPct: 0 };
  const problem = await termsProblem(db, input.buyerClubTeamId, terms);
  if (problem) return fail(400, problem);

  const state = parseJson<AiSellerState | null>(row.ai_state, null, "ai_state");
  if (!state) return fail(500, "Jednání je poškozené.");
  const { reply, dueAt } = plannedReply(state, terms, now);

  const res = await db.prepare(
    `UPDATE ai_negotiations SET amount = ?, upfront_pct = ?, installments = ?, last_action_by = 'buyer',
       pending_reply = ?, reply_due_at = ?
     WHERE id = ? AND status = 'open' AND last_action_by = 'club' AND pending_reply IS NULL`,
  ).bind(terms.amount, terms.upfrontPct, terms.installments, JSON.stringify(reply), dueAt.toISOString(), row.id).run();
  if ((res.meta?.changes ?? 0) === 0) return fail(409, "Jednání se mezitím změnilo, načti ho znovu.");

  await db.prepare(
    `INSERT INTO ai_negotiation_events (id, negotiation_id, actor, event_type, amount, upfront_pct, installments, created_at)
     VALUES (?, ?, 'buyer', 'offer', ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), row.id, terms.amount, terms.upfrontPct, terms.installments, now.toISOString()).run()
    .catch((e) => logger.warn({ module: "ai-negotiation" }, "událost návrhu", e));
  await deliverNow(db, row.id);
  return { ok: true };
}

/** Kupující jednání stáhne. Hlášení skauta se vrátí mezi ta, o kterých jde jednat. */
export async function withdrawAiNegotiation(db: D1Database, input: {
  negotiationId: string; buyerClubTeamId: string; now?: Date;
}): Promise<{ ok: true } | NegotiationError> {
  const now = input.now ?? new Date();
  const row = await loadOwnNegotiation(db, input.negotiationId, input.buyerClubTeamId);
  if ("ok" in row) return row;
  const res = await db.prepare(
    `UPDATE ai_negotiations SET status = 'withdrawn', pending_reply = NULL, reply_due_at = NULL, resolved_at = ?
     WHERE id = ? AND status IN ('open','agreed')`,
  ).bind(now.toISOString(), row.id).run();
  if ((res.meta?.changes ?? 0) === 0) return fail(409, "Jednání už neběží.");
  await addEvent(db, row.id, "buyer", "withdraw", null, null, now);
  if (row.scout_report_id) await releaseReport(db, row.scout_report_id, row.id, now);
  return { ok: true };
}

// ─── Odpovědi klubu ─────────────────────────────────────────────────────────

async function addEvent(
  db: D1Database, negotiationId: string, actor: "buyer" | "club" | "player",
  type: string, terms: TransferTerms | null, message: string | null, at: Date,
): Promise<void> {
  await db.prepare(
    `INSERT INTO ai_negotiation_events (id, negotiation_id, actor, event_type, amount, upfront_pct, installments, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), negotiationId, actor, type, terms?.amount ?? null, terms?.upfrontPct ?? null,
    terms?.installments ?? null, message, at.toISOString()).run()
    .catch((e) => logger.warn({ module: "ai-negotiation" }, `událost ${type}`, e));
}

/** Hlášení po skončeném jednání: platí-li ještě, jde o hráči jednat znovu. */
async function releaseReport(db: D1Database, reportId: string, negotiationId: string, now: Date): Promise<void> {
  await db.prepare(
    `UPDATE scout_reports SET status = CASE WHEN expires_at > ? THEN 'active' ELSE 'expired' END, negotiation_id = NULL
     WHERE id = ? AND negotiation_id = ? AND status = 'negotiating'`,
  ).bind(now.toISOString(), reportId, negotiationId).run()
    .catch((e) => logger.warn({ module: "ai-negotiation" }, "uvolnění hlášení", e));
}

/** SMS od sportovního ředitele s tlačítkem na jednání + push. */
async function notifyBuyer(db: D1Database, env: PushEnv | undefined, teamId: string, negotiationId: string, title: string, body: string): Promise<void> {
  try {
    let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Sportovní ředitel'")
      .bind(teamId).first<{ id: string }>().then((r) => r?.id ?? null);
    if (!convId) {
      convId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at)
         VALUES (?, ?, 'system', 'Sportovní ředitel', 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      ).bind(convId, teamId).run();
    }
    await db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', 'Sportovní ředitel', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(crypto.randomUUID(), convId, body, JSON.stringify({ type: "ai_negotiation", negotiationId })).run();
    await db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    ).bind(body.slice(0, 100), convId).run();
  } catch (e) {
    logger.warn({ module: "ai-negotiation" }, "SMS o jednání", e);
  }
  try {
    const { createNotification } = await import("../community/notifications");
    await createNotification(db, teamId, "transfer", title, body, `/prestupy/jednani/${negotiationId}`,
      env?.VAPID_PUBLIC_KEY ? { ...env, DB: db } as Parameters<typeof createNotification>[6] : undefined);
  } catch (e) {
    logger.warn({ module: "ai-negotiation" }, "notifikace o jednání", e);
  }
}

/** Je hráč pořád k mání? Inzerát aktivní, hlášení drží právě tohle jednání. */
async function sourceStillThere(db: D1Database, row: AiNegotiationRow): Promise<boolean> {
  if (row.listing_id) {
    const l = await db.prepare("SELECT status FROM transfer_listings WHERE id = ?").bind(row.listing_id).first<{ status: string }>();
    return l?.status === "active";
  }
  if (row.scout_report_id) {
    const r = await db.prepare("SELECT status, negotiation_id FROM scout_reports WHERE id = ?").bind(row.scout_report_id)
      .first<{ status: string; negotiation_id: string | null }>();
    return r?.status === "negotiating" && r.negotiation_id === row.id;
  }
  return false;
}

/** Ukončí jednání, protože hráč už není k mání nebo vypršel čas. */
export async function expireNegotiation(db: D1Database, env: PushEnv | undefined, row: AiNegotiationRow, reason: string, now: Date): Promise<boolean> {
  const res = await db.prepare(
    `UPDATE ai_negotiations SET status = 'expired', pending_reply = NULL, reply_due_at = NULL, resolved_at = ?
     WHERE id = ? AND status IN ('open','agreed')`,
  ).bind(now.toISOString(), row.id).run();
  if ((res.meta?.changes ?? 0) === 0) return false;
  await addEvent(db, row.id, "club", "expire", null, reason, now);
  if (row.scout_report_id) await releaseReport(db, row.scout_report_id, row.id, now);
  await notifyBuyer(db, env, row.team_id, row.id, `⌛ Konec jednání: ${row.player_name}`,
    `⌛ Konec jednání: ${row.player_name} (${row.club_name}). ${reason}`);
  return true;
}

/**
 * Doručí odpovědi klubů, jejichž čas nastal. `force` doručí hned (admin testování).
 * Vrací počet doručených odpovědí.
 */
export async function revealDueAiReplies(db: D1Database, env: PushEnv | undefined, opts: {
  negotiationId?: string; teamId?: string; force?: boolean; now?: Date; limit?: number;
  /** false = bez SMS a push (živé jednání, kupující odpověď vidí na stránce). */
  notify?: boolean;
} = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const where = ["pending_reply IS NOT NULL", "status = 'open'"];
  const binds: unknown[] = [];
  if (!opts.force) { where.push("reply_due_at <= ?"); binds.push(now.toISOString()); }
  if (opts.negotiationId) { where.push("id = ?"); binds.push(opts.negotiationId); }
  if (opts.teamId) { where.push("team_id = ?"); binds.push(opts.teamId); }
  const rows = await db.prepare(`SELECT * FROM ai_negotiations WHERE ${where.join(" AND ")} ORDER BY reply_due_at LIMIT ?`)
    .bind(...binds, opts.limit ?? 50).all<AiNegotiationRow>()
    .catch((e) => { logger.warn({ module: "ai-negotiation" }, "načtení čekajících odpovědí", e); return { results: [] as AiNegotiationRow[] }; });

  let delivered = 0;
  for (const row of rows.results) {
    try {
      if (!await sourceStillThere(db, row)) {
        await expireNegotiation(db, env, row, "Hráč už není k mání, sebral ho jiný klub.", now);
        continue;
      }
      const reply = parseJson<PendingReply | null>(row.pending_reply, null, "pending_reply");
      if (!reply) continue;
      const at = opts.force || !row.reply_due_at ? now : new Date(row.reply_due_at);
      const state = JSON.stringify(reply.nextState);

      let res: D1Result;
      if (reply.kind === "counter" && reply.counterTerms) {
        const t = reply.counterTerms;
        res = await db.prepare(
          `UPDATE ai_negotiations SET status = 'open', last_action_by = 'club', amount = ?, upfront_pct = ?, installments = ?,
             ai_state = ?, pending_reply = NULL, reply_due_at = NULL
           WHERE id = ? AND status = 'open' AND pending_reply IS NOT NULL`,
        ).bind(t.amount, t.upfrontPct, t.installments, state, row.id).run();
      } else if (reply.kind === "agree") {
        // Souhlas platí 48 hodin, déle klub na podpis nečeká.
        const hold = new Date(now.getTime() + AI_SELLER.agreementHoldHours * 3_600_000).toISOString();
        res = await db.prepare(
          `UPDATE ai_negotiations SET status = 'agreed', last_action_by = 'club', ai_state = ?, pending_reply = NULL,
             reply_due_at = NULL, expires_at = MIN(expires_at, ?)
           WHERE id = ? AND status = 'open' AND pending_reply IS NOT NULL`,
        ).bind(state, hold, row.id).run();
      } else {
        res = await db.prepare(
          `UPDATE ai_negotiations SET status = 'broken_off', last_action_by = 'club', ai_state = ?, pending_reply = NULL,
             reply_due_at = NULL, resolved_at = ?
           WHERE id = ? AND status = 'open' AND pending_reply IS NOT NULL`,
        ).bind(state, now.toISOString(), row.id).run();
      }
      if ((res.meta?.changes ?? 0) === 0) continue;
      delivered++;

      const type = reply.kind === "counter" ? "counter" : reply.kind === "agree" ? "agree" : "break_off";
      await addEvent(db, row.id, "club", type, reply.kind === "counter" ? reply.counterTerms ?? null : null, reply.message, at);
      if (reply.kind === "break_off" && row.scout_report_id) {
        await db.prepare("UPDATE scout_reports SET status = 'closed', resolved_at = ? WHERE id = ? AND negotiation_id = ?")
          .bind(now.toISOString(), row.scout_report_id, row.id).run()
          .catch((e) => logger.warn({ module: "ai-negotiation" }, "hlášení po konci jednání", e));
      }

      if (opts.notify === false) continue;
      const head = reply.kind === "agree" ? "🤝" : reply.kind === "counter" ? "🔄" : "🚪";
      const what = reply.kind === "counter" && reply.counterTerms ? ` Chtějí ${formatTermsSummary(reply.counterTerms)}.` : "";
      await notifyBuyer(db, env, row.team_id, row.id, `${head} ${row.club_name}: ${row.player_name}`,
        `${head} Jednání o přestupu: ${row.player_name} (${row.club_name})\n„${reply.message}“${what}`);
    } catch (e) {
      logger.error({ module: "ai-negotiation" }, `doručení odpovědi ${row.id}`, e);
    }
  }
  return delivered;
}

/**
 * Jednání po termínu: vypršelý inzerát, hlášení nebo nepodepsaný souhlas klubu.
 *
 * Termíny jsou v reálném čase záměrně: inzeráty na trhu (`transfer_listings.expires_at`)
 * i hlášení skauta vznikají v reálném čase a prodleva odpovědi klubu se počítá v hodinách.
 * Herní den se od reálného liší jen pevným posunem, takže lhůta ve dnech vychází stejně.
 */
export async function expireAiNegotiations(db: D1Database, env: PushEnv | undefined, now = new Date()): Promise<number> {
  const rows = await db.prepare("SELECT * FROM ai_negotiations WHERE status IN ('open','agreed') AND expires_at < ? LIMIT 100")
    .bind(now.toISOString()).all<AiNegotiationRow>()
    .catch((e) => { logger.warn({ module: "ai-negotiation" }, "načtení prošlých jednání", e); return { results: [] as AiNegotiationRow[] }; });
  let n = 0;
  for (const row of rows.results) {
    const reason = row.status === "agreed" ? "Klub na podpis nečekal věčně." : "Čas na jednání vypršel.";
    if (await expireNegotiation(db, env, row, reason, now)) n++;
  }
  return n;
}

// ─── Podpis ─────────────────────────────────────────────────────────────────

export type SignResult =
  | { ok: true; signed: true; playerId: string }
  | { ok: true; signed: false; explanation: string; factors: { name: string; value: number; detail: string }[] }
  | NegotiationError;

/**
 * Kupující podepíše: buď po souhlasu klubu, nebo přijetím protinávrhu klubu.
 * Rozhodne hráč (seedovaně na hráče, kupujícího a sezónu, takže to nejde zkoušet dokola)
 * a teprve pak se platí.
 */
export async function signAiNegotiation(db: D1Database, env: PushEnv | undefined, input: {
  negotiationId: string; buyerClubTeamId: string; now?: Date;
}): Promise<SignResult> {
  const now = input.now ?? new Date();
  const buyer = input.buyerClubTeamId;
  const row = await loadOwnNegotiation(db, input.negotiationId, buyer);
  if ("ok" in row) return row;
  const canSign = row.status === "agreed" || (row.status === "open" && row.last_action_by === "club" && !row.pending_reply);
  if (!canSign) return fail(409, row.status === "open" ? "Klub ještě neodpověděl." : "Jednání už neběží.");
  if (new Date(row.expires_at) < now) {
    await expireNegotiation(db, env, row, "Čas na jednání vypršel.", now);
    return fail(409, "Jednání vypršelo.");
  }

  const terms = termsOf(row);
  const problem = await termsProblem(db, buyer, terms);
  if (problem) return fail(400, problem);

  const destTeamId = row.target_squad === "u21" ? await u21TeamOf(db, buyer) : buyer;
  if (!destTeamId) return fail(400, "Tvůj klub nemá U21 tým.");
  const squad = await db.prepare("SELECT COUNT(*) AS n, AVG(overall_rating) AS avg FROM players WHERE team_id = ?")
    .bind(destTeamId).first<{ n: number; avg: number | null }>();
  if ((squad?.n ?? 0) >= SQUAD_CAP) return fail(400, `Kádr je plný (${SQUAD_CAP} hráčů). Nejdřív někoho pusť.`);

  const src = await loadSourceForSigning(db, row);
  if (!src) {
    await expireNegotiation(db, env, row, "Hráč už není k mání, sebral ho jiný klub.", now);
    return fail(409, "Hráč už není k mání.");
  }

  // ── Rozhodnutí hráče ──
  const decision = await playerDecision(db, row, src, buyer, destTeamId, squad?.n ?? 15, squad?.avg ?? null);
  if (decision && !decision.accepted) {
    const res = await db.prepare(
      "UPDATE ai_negotiations SET status = 'refused', resolved_at = ? WHERE id = ? AND status IN ('open','agreed')",
    ).bind(now.toISOString(), row.id).run();
    if ((res.meta?.changes ?? 0) === 0) return fail(409, "Jednání se mezitím změnilo.");
    await addEvent(db, row.id, "player", "refuse", null, decision.explanation, now);
    if (row.scout_report_id) {
      await db.prepare("UPDATE scout_reports SET status = 'refused', resolved_at = ? WHERE id = ?")
        .bind(now.toISOString(), row.scout_report_id).run()
        .catch((e) => logger.warn({ module: "ai-negotiation" }, "hlášení po odmítnutí", e));
    }
    if (row.listing_id) {
      const rejected = [...src.rejectedBy, buyer];
      await db.prepare("UPDATE transfer_listings SET rejected_by = ? WHERE id = ?").bind(JSON.stringify(rejected), row.listing_id).run()
        .catch((e) => logger.warn({ module: "ai-negotiation" }, "odmítnutí u inzerátu", e));
    }
    return { ok: true, signed: false, explanation: decision.explanation, factors: decision.factors };
  }

  // ── Koupě ──
  const prevStatus = row.status;
  const result = await purchaseVirtualPlayer({
    db, playerId: row.player_key, player: src.player, buyerClubTeamId: buyer, destTeamId,
    sellerName: row.club_name, terms, dealId: row.id,
    description: `Přestup: ${row.player_name} z ${row.club_name}`,
    residence: src.residence,
    claimSource: async () => {
      const claimed = await db.prepare(
        "UPDATE ai_negotiations SET status = 'signed', player_id = ?, resolved_at = ? WHERE id = ? AND status = ? AND pending_reply IS NULL",
      ).bind(row.player_key, now.toISOString(), row.id, prevStatus).run();
      if ((claimed.meta?.changes ?? 0) === 0) return false;
      const sourceClaim = row.listing_id
        ? await db.prepare("UPDATE transfer_listings SET status = 'sold' WHERE id = ? AND status = 'active'").bind(row.listing_id).run()
        : await db.prepare("UPDATE scout_reports SET status = 'signed', resolved_at = ? WHERE id = ? AND status = 'negotiating' AND negotiation_id = ?")
          .bind(now.toISOString(), row.scout_report_id, row.id).run();
      if ((sourceClaim.meta?.changes ?? 0) > 0) return true;
      await db.prepare("UPDATE ai_negotiations SET status = ?, player_id = NULL, resolved_at = NULL WHERE id = ?")
        .bind(prevStatus, row.id).run().catch((e) => logger.error({ module: "ai-negotiation" }, "vrácení jednání", e));
      return false;
    },
    releaseSource: async () => {
      await db.prepare("UPDATE ai_negotiations SET status = ?, player_id = NULL, resolved_at = NULL WHERE id = ?")
        .bind(prevStatus, row.id).run().catch((e) => logger.error({ module: "ai-negotiation" }, "vrácení jednání", e));
      if (row.listing_id) {
        await db.prepare("UPDATE transfer_listings SET status = 'active' WHERE id = ? AND status = 'sold'").bind(row.listing_id).run()
          .catch((e) => logger.error({ module: "ai-negotiation" }, "vrácení inzerátu", e));
      } else if (row.scout_report_id) {
        await db.prepare("UPDATE scout_reports SET status = 'negotiating', resolved_at = NULL WHERE id = ? AND status = 'signed'")
          .bind(row.scout_report_id).run().catch((e) => logger.error({ module: "ai-negotiation" }, "vrácení hlášení", e));
      }
    },
  });
  if (!result.ok) return result;

  await addEvent(db, row.id, "player", "sign", terms, decision?.explanation ?? null, now);

  // Ostatní kluby, které o stejného hráče jednaly, mají smůlu.
  const rivals = await db.prepare(
    "SELECT * FROM ai_negotiations WHERE player_key = ? AND id != ? AND status IN ('open','agreed')",
  ).bind(row.player_key, row.id).all<AiNegotiationRow>()
    .catch((e) => { logger.warn({ module: "ai-negotiation" }, "souběžná jednání", e); return { results: [] as AiNegotiationRow[] }; });
  for (const r of rivals.results) {
    await expireNegotiation(db, env, r, "Hráče koupil jiný klub.", now);
  }
  return { ok: true, signed: true, playerId: result.playerId };
}

interface SigningSource {
  player: VirtualPlayerData;
  rejectedBy: string[];
  villageCoords: { lat: number; lng: number } | null;
  clubMean: number | null;
  residence?: { name: string; commuteKm: number };
}

async function loadSourceForSigning(db: D1Database, row: AiNegotiationRow): Promise<SigningSource | null> {
  if (row.listing_id) {
    const l = await db.prepare("SELECT ai_player_data, rejected_by, status FROM transfer_listings WHERE id = ?")
      .bind(row.listing_id).first<{ ai_player_data: string; rejected_by: string | null; status: string }>();
    if (!l || l.status !== "active") return null;
    const player = parseJson<VirtualPlayerData | null>(l.ai_player_data, null, "ai_player_data");
    if (!player) return null;
    const v = await db.prepare("SELECT lat, lng FROM villages WHERE name = ? OR name LIKE ? LIMIT 1")
      .bind(player.fromCity ?? "", `${player.fromCity ?? ""}%`).first<{ lat: number; lng: number }>()
      .catch((e) => { logger.warn({ module: "ai-negotiation" }, "souřadnice města klubu", e); return null; });
    return { player, rejectedBy: parseJson<string[]>(l.rejected_by, [], "rejected_by"), villageCoords: v ?? null, clubMean: null };
  }
  if (!row.scout_report_id) return null;
  const r = await db.prepare(
    `SELECT sr.player_data, sr.status, sr.negotiation_id, sr.club_mean, sr.distance_km, sr.club_city, v.lat, v.lng
       FROM scout_reports sr LEFT JOIN villages v ON v.id = sr.village_id WHERE sr.id = ?`,
  ).bind(row.scout_report_id).first<{ player_data: string; status: string; negotiation_id: string | null; club_mean: number | null; distance_km: number; club_city: string | null; lat: number | null; lng: number | null }>();
  if (!r || r.status !== "negotiating" || r.negotiation_id !== row.id) return null;
  const player = parseJson<VirtualPlayerData | null>(r.player_data, null, "player_data");
  if (!player) return null;
  return {
    player, rejectedBy: [],
    villageCoords: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null,
    clubMean: r.club_mean,
    residence: r.club_city ? { name: r.club_city, commuteKm: r.distance_km } : undefined,
  };
}

async function playerDecision(
  db: D1Database, row: AiNegotiationRow, src: SigningSource, buyer: string, destTeamId: string,
  squadSize: number, squadAvg: number | null,
) {
  const teamInfo = await db.prepare(
    "SELECT t.reputation, v.lat, v.lng, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(buyer).first<{ reputation: number; lat: number; lng: number; district: string }>();
  if (!teamInfo) return null;
  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1").first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "ai-negotiation" }, "sezóna pro rozhodnutí hráče", e); return null; });
  const { evaluateSigningChance } = await import("./player-agency");
  const { loadCoachStandings } = await import("./player-interest");
  const coach = (await loadCoachStandings(db, [buyer])).get(buyer) ?? null;

  const extra = clubStrengthFactor(squadAvg, src.clubMean);
  // Hráč z inzerátu je patriot svého okresu (jako dřív u okamžitého nákupu).
  const personality = row.listing_id ? { ...(src.player.personality ?? {}), patriotism: 65 } : (src.player.personality ?? {});
  const seed = stableSeed(`${row.player_key}:${buyer}:${season?.id ?? "?"}`);
  return evaluateSigningChance(
    { weekly_wage: src.player.weeklyWage ?? 200, personality, district: row.club_district },
    { reputation: teamInfo.reputation, villageLat: teamInfo.lat, villageLon: teamInfo.lng, squadSize, district: teamInfo.district, coach },
    src.villageCoords, src.player.weeklyWage ?? 200, createRng(seed), extra,
  );
}

/**
 * Síla klubu: hráč jde rád do silnějšího kádru, než má doma, a nerad do slabšího
 * (vzor player-interest.ts: rozdíl průměrů × 1,3, omezeno −20…+30).
 */
export function clubStrengthFactor(buyerSquadAvg: number | null, sourceClubMean: number | null) {
  if (buyerSquadAvg == null || sourceClubMean == null) return [];
  const value = Math.max(-20, Math.min(30, Math.round((buyerSquadAvg - sourceClubMean) * 1.3)));
  return [{
    name: "Síla klubu", value,
    detail: value >= 10 ? "U vás by hrál vyšší fotbal" : value <= -5 ? "U vás by si pohoršil" : "Podobná úroveň jako doma",
  }];
}

// ─── Čtení pro web ──────────────────────────────────────────────────────────

/** Odhad, jak ochotný hráč bude (pro hlášení a detail jednání) bez hodu kostkou. */
export async function estimateWillingness(
  db: D1Database, buyer: string, player: VirtualPlayerData, district: string | null,
  coords: { lat: number; lng: number } | null, clubMean: number | null, patriotismOverride?: number,
): Promise<number | null> {
  const teamInfo = await db.prepare(
    "SELECT t.reputation, v.lat, v.lng, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(buyer).first<{ reputation: number; lat: number; lng: number; district: string }>()
    .catch((e) => { logger.warn({ module: "ai-negotiation" }, "tým pro odhad ochoty", e); return null; });
  if (!teamInfo) return null;
  const squad = await db.prepare("SELECT COUNT(*) AS n, AVG(overall_rating) AS avg FROM players WHERE team_id = ?")
    .bind(buyer).first<{ n: number; avg: number | null }>()
    .catch((e) => { logger.warn({ module: "ai-negotiation" }, "kádr pro odhad ochoty", e); return null; });
  const { evaluateSigningChance } = await import("./player-agency");
  const { loadCoachStandings } = await import("./player-interest");
  const coach = (await loadCoachStandings(db, [buyer])).get(buyer) ?? null;
  const personality = patriotismOverride != null ? { ...(player.personality ?? {}), patriotism: patriotismOverride } : (player.personality ?? {});
  // Náhoda se vynechá: rng vrací pořád střed, takže vyjde čistý součet faktorů.
  const mid = {
    random: () => 0.5,
    int: (a: number, b: number) => Math.round((a + b) / 2),
    pick: <T,>(arr: readonly T[]) => arr[0],
  } as unknown as ReturnType<typeof createRng>;
  const d = evaluateSigningChance(
    { weekly_wage: player.weeklyWage ?? 200, personality, district },
    { reputation: teamInfo.reputation, villageLat: teamInfo.lat, villageLon: teamInfo.lng, squadSize: squad?.n ?? 15, district: teamInfo.district, coach },
    coords, player.weeklyWage ?? 200, mid, clubStrengthFactor(squad?.avg ?? null, clubMean),
  );
  return d.probability;
}

export function negotiationOnTurn(row: Pick<AiNegotiationRow, "status" | "last_action_by" | "pending_reply">): boolean {
  return row.status === "agreed" || (row.status === "open" && row.last_action_by === "club" && !row.pending_reply);
}
