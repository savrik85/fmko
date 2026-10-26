/**
 * Pozvání majitelů firem do VIP lóže AI klubu (pondělní správa).
 *
 * Lidský manažer zve majitele na nejbližší domácí zápas tlačítkem u karty majitele: dárek zaplatí
 * hned, majitel přijme podle náklonnosti, povahy, formy klubu a lóže, a když přijde, má klub raději.
 * AI trenér jde stejnou službou (sponsors/invitations.ts), jen když má použitelnou VIP lóži
 * a nejvýš tolik hostů, kolik lóže pojme. Kód nabídne jen majitele, které jde pozvat, a jen za dárky
 * nad rezervou (sponsor-invite-decision.ts); model vybere koho, nebo nikoho. Bez modelu (výpadek,
 * neplatná odpověď, režim off) rozhodne pravidlo podle povahy. V režimu shadow a nanečisto jen
 * rozhodne a zapíše do deníku (`sponsor_invite`).
 *
 * AI klubu žádné zprávy nechodí (SMS majitelů klubům AI fronta nepřijme, enqueueOwnerSms);
 * lidským klubům se nic nemění: obsazený den majitele vidí stejně, jako by ho obsadil člověk.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { budgetEstimateRange, sponsorBudgetB } from "../sponsors/budget";
import { ensureSponsorOwners, getFavorsForTeam } from "../sponsors/favor";
import { DEFAULT_FAVOR, invitationGiftCost, vipBoxAcceptanceBonus, vipBoxFavorBonus } from "../sponsors/favor-math";
import { inviteSponsorOwner, nextHomeMatch, recentLosses, vipBoxLevelForInvites } from "../sponsors/invitations";
import { BASE_WILLINGNESS } from "../sponsors/negotiation";
import { loadNegotiationTeam, teamGameDate } from "../sponsors/negotiation-db";
import { NO_TRACE, type ModelTrace } from "./buy-model";
import { logDecision } from "./decision-log";
import { callCoachModel } from "./llm";
import type { CoachMode } from "./mode";
import type { AiCoachProfile } from "./profile";
import {
  checkInvite, fallbackInvite, guestSeats, INVITE_SYSTEM_PROMPT, inviteSchema, MAX_INVITE_OPTIONS, renderInvitePrompt,
  type InviteContext, type InviteDecision, type InviteOption, type InviteRelation,
} from "./sponsor-invite-decision";

const M = "ai-coach-sponsor-invites";
/** Pozvání je krátké rozhodnutí: pondělní správa na model nemá čekat dlouho. */
const MODEL_TIMEOUT_MS = 60_000;

export interface InviteOpts {
  /** Režim přepínače (oblast weekly). */
  mode?: CoachMode;
  /** Nanečisto (admin): rozhodne, nic neprovede, do deníku jako shadow. */
  dryRun?: boolean;
  ai?: Pick<Bindings, "AI"> | null;
  model?: string;
  /** Týden pondělní správy (do deníku). */
  contextRef?: string;
  /** Rezerva z pondělní správy: dárky pod ni nesáhnou. */
  reserve: number;
  /** Zdroj náhody pro pozvání (jinak Math.random, stejně jako u člověka). */
  random?: () => number;
}

export interface InvitedOwner {
  sponsorId: number;
  name: string;
  ok: boolean;
  /** `accepted` / `declined`, nebo důvod, proč pozvání neproběhlo. */
  detail: string;
  giftCost: number;
}

export interface InviteRunResult {
  invited: InvitedOwner[];
  /** Kolik stály dárky. */
  spent: number;
  detail: string;
}

const NOTHING = (detail: string): InviteRunResult => ({ invited: [], spent: 0, detail });

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) / 86_400_000));
}

/** Kontext rozhodnutí, nebo důvod, proč se tento týden nerozhoduje (bez lóže, zápasu, hostů, peněz). */
async function loadInviteContext(
  db: D1Database, teamId: string, profile: AiCoachProfile, reserve: number,
): Promise<InviteContext | string> {
  const vipBoxLevel = await vipBoxLevelForInvites(db, teamId);
  const seatsAtMost = guestSeats(vipBoxLevel, 0);
  if (seatsAtMost <= 0) return "bez VIP lóže";
  const match = await nextHomeMatch(db, teamId);
  if (!match) return "žádný domácí zápas";
  const team = await loadNegotiationTeam(db, teamId);
  if (!team) return "tým nenalezen";
  const matchDay = match.scheduled_at.slice(0, 10);

  const [mine, takenElsewhere, contracts, mainElsewhere, firms, favors, losses] = await Promise.all([
    db.prepare("SELECT sponsor_id, status FROM sponsor_invitations WHERE team_id = ? AND match_id = ?")
      .bind(teamId, match.id).all<{ sponsor_id: number; status: string }>(),
    db.prepare("SELECT DISTINCT sponsor_id FROM sponsor_invitations WHERE match_day = ? AND status IN ('accepted','attended') AND team_id != ?")
      .bind(matchDay, teamId).all<{ sponsor_id: number }>(),
    db.prepare("SELECT sponsor_id, COALESCE(category, 'main') AS category, seasons_remaining FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND sponsor_id IS NOT NULL")
      .bind(teamId).all<{ sponsor_id: number; category: string; seasons_remaining: number }>(),
    db.prepare("SELECT DISTINCT sponsor_id FROM sponsor_contracts WHERE status = 'active' AND category = 'main' AND team_id != ? AND sponsor_id IS NOT NULL")
      .bind(teamId).all<{ sponsor_id: number }>(),
    db.prepare("SELECT id, name, type, monthly_max FROM district_sponsors WHERE district = ?")
      .bind(team.district).all<{ id: number; name: string; type: string; monthly_max: number }>(),
    getFavorsForTeam(db, teamId),
    recentLosses(db, teamId),
  ]);
  const seats = guestSeats(vipBoxLevel, mine.results.filter((r) => r.status === "accepted" || r.status === "attended").length);
  if (seats <= 0) return "lóže je na zápas plná";
  const spendable = Math.max(0, team.budget - reserve);

  // Na tenhle zápas už zvaní (i odmítnutí) a majitelé, kteří ten den jdou k jinému klubu, nejdou.
  const unavailable = new Set([...mine.results.map((r) => r.sponsor_id), ...takenElsewhere.results.map((r) => r.sponsor_id)]);
  const elsewhere = new Set(mainElsewhere.results.map((r) => r.sponsor_id));
  const relationOf = (id: number): { relation: InviteRelation; ending: boolean } => {
    const own = contracts.results.filter((c) => c.sponsor_id === id);
    const pick = own.find((c) => c.category === "main") ?? own.find((c) => c.category === "stadium") ?? own.find((c) => c.category === "banner");
    if (!pick) return { relation: null, ending: false };
    const relation = pick.category === "main" ? "main" : pick.category === "stadium" ? "stadium" : "banner";
    return { relation, ending: relation !== "banner" && pick.seasons_remaining <= 1 };
  };
  const candidates = firms.results.filter((f) => !unavailable.has(f.id));
  const owners = await ensureSponsorOwners(db, candidates.map((f) => f.id));
  const options: InviteOption[] = candidates
    .flatMap((f) => {
      const owner = owners.get(f.id);
      if (!owner) return [];
      const favor = favors.get(f.id) ?? DEFAULT_FAVOR;
      const giftCost = invitationGiftCost(favor);
      if (giftCost > spendable) return [];
      const { relation, ending } = relationOf(f.id);
      const b = sponsorBudgetB({ monthlyMax: f.monthly_max, reputation: team.reputation, villageSize: team.size, category: "main", favor });
      return [{
        key: "", sponsorId: f.id, name: f.name, type: f.type, owner: owner.personality, favor, giftCost, relation,
        contractEnding: ending, mainElsewhere: elsewhere.has(f.id), mainMonthly: budgetEstimateRange(BASE_WILLINGNESS * b, favor),
      }];
    })
    // Nejdřív vlastní sponzoři (hlavní, stadion, banner), pak firmy s největšími penězi.
    .sort((a, b) => relationOrder(a.relation) - relationOrder(b.relation) || b.mainMonthly.high - a.mainMonthly.high || a.sponsorId - b.sponsorId)
    .slice(0, MAX_INVITE_OPTIONS)
    .map((o, i) => ({ ...o, key: `O${i + 1}` }));
  if (options.length === 0) return "nikoho nejde pozvat";

  return {
    teamName: team.name, profile, budget: team.budget, spendable,
    match: { matchId: match.id, day: matchDay, opponentName: match.opponent_name, daysAhead: daysBetween(teamGameDate(team), matchDay) },
    vipBoxLevel, seats, vipAcceptancePoints: Math.round(vipBoxAcceptanceBonus(vipBoxLevel) * 100), vipFavorBonus: vipBoxFavorBonus(vipBoxLevel),
    recentLosses: losses, options,
  };
}

function relationOrder(r: InviteRelation): number {
  return r === "main" ? 0 : r === "stadium" ? 1 : r === "banner" ? 2 : 3;
}

async function decideWithModel(
  ai: Pick<Bindings, "AI">, c: InviteContext, model: string | undefined,
): Promise<{ decision: InviteDecision | null; trace: ModelTrace }> {
  const prompt = renderInvitePrompt(c);
  const res = await callCoachModel(ai, {
    system: INVITE_SYSTEM_PROMPT, user: prompt, maxTokens: 300,
    schema: { name: "sponsor_invite", schema: inviteSchema(c) }, model, timeoutMs: MODEL_TIMEOUT_MS,
  });
  const trace: ModelTrace = {
    model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
    latencyMs: res.latencyMs, prompt,
  };
  if (!res.json) return { decision: null, trace };
  const check = checkInvite(res.json, c);
  return check.ok ? { decision: check.decision, trace } : { decision: null, trace: { ...trace, error: check.reason } };
}

/**
 * Pondělní pozvání majitelů do lóže. Nikdy nehází ven: chyba DB jde do logu a nic se nepozve.
 * Když není o čem rozhodovat (bez lóže, zápasu, volného místa nebo koho pozvat), model se neptá
 * a deník mlčí.
 */
export async function maybeInviteSponsorOwners(
  db: D1Database, teamId: string, profile: AiCoachProfile, opts: InviteOpts,
): Promise<InviteRunResult> {
  const mode = opts.mode ?? "on";
  const logMode: CoachMode = opts.dryRun ? "shadow" : mode;
  const loaded = await loadInviteContext(db, teamId, profile, opts.reserve)
    .catch((e) => {
      logger.warn({ module: M, teamId }, "kontext pozvání majitelů", e);
      return "chyba při načtení";
    });
  if (typeof loaded === "string") return NOTHING(loaded);
  const c = loaded;

  const { decision, trace } = mode !== "off" && opts.ai
    ? await decideWithModel(opts.ai, c, opts.model)
    : { decision: null, trace: NO_TRACE };
  const decidedBy: "model" | "fallback" = decision ? "model" : "fallback";
  const choice = decision ?? fallbackInvite(c);
  const chosen = choice.keys.flatMap((k) => c.options.filter((o) => o.key === k));

  const log = (executed: unknown) => logDecision(db, {
    teamId, kind: "sponsor_invite", mode: logMode, model: trace.model, contextRef: opts.contextRef ?? c.match.day,
    inputSummary: trace.prompt ?? `zápas ${c.match.day}, lóže ${c.vipBoxLevel}, míst ${c.seats}: ${c.options.map((o) => `${o.key} ${o.name} (${o.giftCost} Kč)`).join(", ")}`,
    rawOutput: trace.raw,
    actions: {
      invite: chosen.map((o) => ({ key: o.key, sponsorId: o.sponsorId, name: o.name, giftCost: o.giftCost })),
      reason: choice.reason, decidedBy, matchId: c.match.matchId, vipBoxLevel: c.vipBoxLevel, seats: c.seats,
      options: c.options.map((o) => ({ key: o.key, sponsorId: o.sponsorId, name: o.name, giftCost: o.giftCost })),
    },
    executed, usedFallback: decidedBy === "fallback", error: trace.error,
    tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
  });

  if (logMode === "shadow") {
    await log(null);
    return NOTHING(`nanečisto: ${chosen.map((o) => o.name).join(", ") || "nikoho"}`);
  }

  const invited: InvitedOwner[] = [];
  let spent = 0;
  for (const o of chosen) {
    // Model přemýšlí i minutu a mezitím se rozpočet může změnit: dárek nesmí sáhnout na rezervu.
    const fresh = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "rozpočet před pozváním", e); return null; });
    if (!fresh || fresh.budget - o.giftCost < opts.reserve) {
      invited.push({ sponsorId: o.sponsorId, name: o.name, ok: false, detail: `rezerva: rozpočet ${fresh?.budget ?? "?"} Kč`, giftCost: o.giftCost });
      continue;
    }
    const res = await inviteSponsorOwner(db, teamId, o.sponsorId, c.match.matchId, opts.random)
      .catch((e) => {
        logger.warn({ module: M, teamId }, `pozvání majitele ${o.sponsorId}`, e);
        return { ok: false as const, error: String((e as Error)?.message ?? e).slice(0, 200), status: 409 as const };
      });
    if (res.ok) {
      spent += res.giftCost;
      invited.push({ sponsorId: o.sponsorId, name: o.name, ok: true, detail: res.status, giftCost: res.giftCost });
    } else {
      invited.push({ sponsorId: o.sponsorId, name: o.name, ok: false, detail: res.error, giftCost: o.giftCost });
    }
  }
  await log(invited);
  const detail = invited.length ? invited.map((i) => `${i.name}: ${i.detail}`).join(", ") : "nikoho";
  return { invited, spent, detail };
}
