/**
 * Nabídky místních hráčů AI klubu (hospodský, trenér dorostu, kapitán, starosta).
 *
 * AI klub je dostává stejně jako člověk (denní tick, events/player-offers.ts), jen bez SMS,
 * a jednou za herní den o nich rozhodne v hodinu, kterou má každý klub jinou (jako člověk, který
 * se na nabídky podívá po práci). Podpis i odmítnutí jdou přes stejnou službu jako u člověka
 * (services/player-offer-actions.ts): stejný hráč, smlouva i registrace.
 *
 * Model navrhuje, kód hlídá (player-offer-decision.ts): podepsat jde jen pod strop soupisky
 * a jen když klub z peněz nad rezervou unese registraci a mzdu na sezónu dopředu. Kde zbylo
 * jen odmítnutí, rozhodne kód bez modelu. Jinak vybere model; při výpadku, nesmyslu, v režimu
 * off a bez bindingu AI náhradní pravidlo podle povahy. Režim shadow rozhodne a zapíše do deníku,
 * ale nic neprovede.
 *
 * AI klubu se nic nepíše: žádná SMS, zpráva ani oznámení.
 */

import type { OfferSource } from "../events/player-offers";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { acceptPlayerOffer, PLAYER_OFFER_SIGNING_FEE, rejectPlayerOffer } from "../services/player-offer-actions";
import { claimCoachTask } from "./claims";
import { logDecision, type DecisionMode } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import { callCoachModel } from "./llm";
import { readCoachMode, type CoachArea } from "./mode";
import {
  PLAYER_OFFER_SYSTEM_PROMPT, playerOfferSchema, renderPlayerOfferPrompt, resolvePlayerOfferDecisions, talentBand,
  validatePlayerOfferDecision,
  type PlayerOfferCandidate, type PlayerOfferChoice, type PlayerOfferContext, type PlayerOfferDecision, type PlayerOfferValidation,
} from "./player-offer-decision";
import type { AiCoachProfile } from "./profile";
import { formationSlots, MAX_SQUAD, TARGET_SENIOR_SQUAD } from "./squad";
import { loadAiClubState, type AiClubState } from "./transfer-club";
import { RAISE_COVER_WEEKS } from "./unhappy-players";
import { stableUnit } from "./valuation";

const M = "ai-coach-player-offers";
const DAY_MS = 86_400_000;

/** Nabídky hráčů patří k trhu (podpisy hráčů): přepínač je společný s přestupy. */
export const PLAYER_OFFER_COACH_AREA: CoachArea = "market";
/** Do kolika hodin (Praha) trenér nabídky vyřizuje; začíná v hodinu klubu (`offerReviewHour`). */
const DAY_TO_HOUR = 20;
/** Hodinová úloha nesmí stát: na model se čeká nejvýš minutu. */
const MODEL_TIMEOUT_MS = 60_000;
/** Mzdu nového hráče musí klub z peněz nad rezervou unést na sezónu dopředu, stejně jako zvýšení odměn. */
export const WAGE_COVER_WEEKS = RAISE_COVER_WEEKS;

export interface PlayerOfferCoachOpts {
  /** Režim přepínače. `shadow` rozhodne a zapíše do deníku, ale nic neprovede. */
  mode?: DecisionMode;
  /** Binding Workers AI. Bez něj rozhoduje náhradní pravidlo. */
  ai?: Pick<Bindings, "AI"> | null;
  /** Jiný model (srovnání). */
  model?: string;
}

export interface PlayerOfferExecution {
  offerId: string;
  action: PlayerOfferChoice;
  ok: boolean;
  /** Podepsaný hráč. */
  playerId?: string;
  error?: string;
}

export interface PlayerOfferRunResult {
  status: "not_ai" | "not_yet" | "nothing" | "duplicate" | "done";
  decisions: PlayerOfferDecision[];
  executed: PlayerOfferExecution[];
}

interface OfferRow {
  id: string;
  source: OfferSource;
  age: number;
  position: string;
  overall_rating: number;
  weekly_wage: number;
  personality: string | null;
  expires_at: string;
}

interface ModelTrace {
  model: string | null;
  raw: string | null;
  error: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  prompt: string | null;
}

const NO_TRACE: ModelTrace = { model: null, raw: null, error: null, tokensIn: null, tokensOut: null, latencyMs: null, prompt: null };

function emptyResult(status: PlayerOfferRunResult["status"]): PlayerOfferRunResult {
  return { status, decisions: [], executed: [] };
}

/** Pražská hodina, od které se trenér nabídkám ten den věnuje (9–19, každý klub jinak). */
export function offerReviewHour(teamId: string): number {
  return 9 + Math.floor(stableUnit(`player-offer-hour|${teamId}`) * 11);
}

/** Proč podpis nejde: soupiska áčka je plná, nebo klub z peněz nad rezervou neunese registraci a mzdu. */
export function signBlock(input: { seniorRoster: number; spendable: number; weeklyWage: number }): "squad_full" | "too_expensive" | null {
  if (input.seniorRoster + 1 > MAX_SQUAD) return "squad_full";
  if (PLAYER_OFFER_SIGNING_FEE + Math.max(0, input.weeklyWage) * WAGE_COVER_WEEKS > input.spendable) return "too_expensive";
  return null;
}

/** Čekající nabídky, které člověk v Přestupech vidí: do konce lhůty v herním čase. */
async function loadPendingOffers(db: D1Database, teamId: string, gameDate: string): Promise<OfferRow[]> {
  const rows = await db.prepare(
    `SELECT id, source, age, position, overall_rating, weekly_wage, personality, expires_at
       FROM player_offers WHERE team_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at, id`,
  ).bind(teamId, gameDate).all<OfferRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "čekající nabídky hráčů AI klubu", e); return { results: [] as OfferRow[] }; });
  return rows.results;
}

function hiddenTalentOf(row: OfferRow): number | null {
  if (!row.personality) return null;
  try {
    const v = (JSON.parse(row.personality) as { hiddenTalent?: unknown }).hiddenTalent;
    return typeof v === "number" ? v : null;
  } catch (e) {
    logger.warn({ module: M }, `nečitelná povaha hráče z nabídky ${row.id}`, e);
    return null;
  }
}

/** Co model o nabídce ví: hráč, jak ho vidí člověk na kartě nabídky, a jeho post v kádru. */
function candidateOf(club: AiClubState, row: OfferRow, key: string, gameDate: string): PlayerOfferCandidate {
  const slots = formationSlots(club.analysis.formation) as Record<string, number>;
  const need = club.analysis.needs.find((n) => n.position === row.position);
  const talent = row.source === "youth" ? hiddenTalentOf(row) : null;
  return {
    key,
    offerId: row.id,
    source: row.source,
    age: Number(row.age) || 25,
    position: row.position,
    rating: Number(row.overall_rating) || 0,
    weeklyWage: Number(row.weekly_wage) || 0,
    talent: talent === null ? null : talentBand(talent),
    daysLeft: Math.max(0, Math.ceil((Date.parse(row.expires_at) - Date.parse(gameDate)) / DAY_MS)),
    samePosition: club.members.filter((m) => !m.isU21Roster && m.position === row.position).map((m) => m.rating).sort((a, b) => b - a),
    starters: slots[row.position] ?? 0,
    need: need?.need ?? 0,
    missing: need?.missing ?? 0,
  };
}

/** Provede rozhodnutí stejnou službou jako člověk. Místo a peníze se hlídají znovu: mohl je vzít dřívější podpis. */
async function executeDecisions(
  db: D1Database, club: AiClubState, rows: OfferRow[], decisions: PlayerOfferDecision[], seniorRoster: number,
): Promise<PlayerOfferExecution[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const executed: PlayerOfferExecution[] = [];
  let signed = 0;
  let committed = 0;
  for (const d of decisions) {
    const row = byId.get(d.offerId);
    if (!row) continue;
    const base = { offerId: row.id, action: d.action };
    try {
      if (d.action === "decline") {
        await rejectPlayerOffer(db, club.teamId, row.id);
        executed.push({ ...base, ok: true });
        continue;
      }
      const wage = Number(row.weekly_wage) || 0;
      const block = signBlock({ seniorRoster: seniorRoster + signed, spendable: club.spendable - committed, weeklyWage: wage });
      if (block) {
        // Místo nebo peníze vzal dřívější podpis z téhož běhu: nabídka počká na další den.
        executed.push({ ...base, ok: false, error: block === "squad_full" ? "soupiska áčka je plná" : "na registraci a mzdu už nezbyly peníze nad rezervou" });
        continue;
      }
      const res = await acceptPlayerOffer(db, club.teamId, row.id);
      if (!res.ok) {
        executed.push({ ...base, ok: false, error: res.error });
        continue;
      }
      signed++;
      committed += PLAYER_OFFER_SIGNING_FEE + wage * WAGE_COVER_WEEKS;
      executed.push({ ...base, ok: true, playerId: res.playerId });
    } catch (e) {
      logger.error({ module: M, teamId: club.teamId }, `nabídka hráče ${row.id} AI klubu`, e);
      executed.push({ ...base, ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) });
    }
  }
  return executed;
}

/**
 * Vyřídí čekající nabídky místních hráčů AI klubu: každou podepíše, nebo odmítne.
 * Nejvýš jednou za herní den (nárok `player_offer`, v režimu shadow zvlášť `shadow:player_offer`).
 */
export async function handlePlayerOffers(
  env: Bindings, teamId: string, profile: AiCoachProfile, now: Date, opts: PlayerOfferCoachOpts = {},
): Promise<PlayerOfferRunResult> {
  const db = env.DB;
  const mode = opts.mode ?? "on";
  const hour = pragueHour(now);
  if (hour !== null && (hour < offerReviewHour(teamId) || hour > DAY_TO_HOUR)) return emptyResult("not_yet");

  const team = await db.prepare("SELECT user_id, parent_team_id, game_date FROM teams WHERE id = ?").bind(teamId)
    .first<{ user_id: string | null; parent_team_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "klub pro nabídky hráčů", e); return null; });
  // Lidský klub (a U21) o nabídkách rozhoduje jeho trenér sám.
  if (!team || team.user_id !== "ai" || team.parent_team_id) return emptyResult("not_ai");

  const gameDate = team.game_date ?? now.toISOString();
  const rows = await loadPendingOffers(db, teamId, gameDate);
  if (rows.length === 0) return emptyResult("nothing");
  const gameDay = gameDate.slice(0, 10);
  if (!(await claimCoachTask(db, teamId, mode === "shadow" ? "shadow:player_offer" : "player_offer", gameDay))) return emptyResult("duplicate");
  const club = await loadAiClubState(db, teamId, profile, now);
  if (!club) return emptyResult("not_ai");

  // Hostující u nás na soupisce taky zabírají místo (strop soupisky počítá všechny hráče áčka).
  const seniorRoster = club.members.filter((m) => !m.isU21Roster).length;
  const guarded: PlayerOfferDecision[] = [];
  const candidates: PlayerOfferCandidate[] = [];
  for (const row of rows) {
    const block = signBlock({ seniorRoster, spendable: club.spendable, weeklyWage: Number(row.weekly_wage) || 0 });
    if (block) {
      guarded.push({ key: null, offerId: row.id, action: "decline", reason: block, decidedBy: "guard" });
      continue;
    }
    candidates.push(candidateOf(club, row, `O${candidates.length + 1}`, gameDate));
  }

  const ctx: PlayerOfferContext = {
    teamName: club.name, profile, budget: club.budget, reserve: club.reserve, spendable: club.spendable, weeklyCosts: club.weeklyCosts,
    squadSize: seniorRoster, targetSquad: TARGET_SENIOR_SQUAD, maxSquad: MAX_SQUAD, formation: club.analysis.formation,
    top11Average: club.analysis.top11Average, signingFee: PLAYER_OFFER_SIGNING_FEE, offers: candidates,
  };
  let validation: PlayerOfferValidation | null = null;
  let reasoning = "";
  let trace: ModelTrace = NO_TRACE;
  if (candidates.length > 0 && mode !== "off" && opts.ai) {
    const prompt = renderPlayerOfferPrompt(ctx);
    const res = await callCoachModel(opts.ai, {
      system: PLAYER_OFFER_SYSTEM_PROMPT, user: prompt, maxTokens: 400,
      schema: { name: "player_offer", schema: playerOfferSchema(ctx) }, model: opts.model, timeoutMs: MODEL_TIMEOUT_MS,
    });
    trace = {
      model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
      latencyMs: res.latencyMs, prompt,
    };
    validation = res.json ? validatePlayerOfferDecision(res.json, ctx) : null;
    if (!validation) trace = { ...trace, error: trace.error ?? "neplatná odpověď modelu" };
    const r = (res.json as Record<string, unknown> | null)?.reasoning;
    if (typeof r === "string") reasoning = r.trim().slice(0, 300);
  }
  const decisions = [...guarded, ...resolvePlayerOfferDecisions(ctx, validation)];
  const executed = mode === "shadow" ? [] : await executeDecisions(db, club, rows, decisions, seniorRoster);

  const rejected = validation?.rejected ?? [];
  const error = [trace.error, rejected.length > 0 ? `zahozeno: ${rejected.join("; ")}` : null].filter(Boolean).join("; ") || null;
  await logDecision(db, {
    teamId, kind: "player_offer", mode, model: trace.model, contextRef: gameDay,
    inputSummary: trace.prompt
      ?? `budget=${club.budget} reserve=${club.reserve} squad=${seniorRoster} offers=${rows.map((r) => `${r.id}:${r.position}:${r.overall_rating}:${r.weekly_wage}`).join(",")}`,
    rawOutput: trace.raw,
    actions: { decisions, rejected, reasoning },
    executed: mode === "shadow" ? null : executed,
    usedFallback: decisions.some((d) => d.decidedBy === "fallback"),
    error,
    tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
  });
  return { status: "done", decisions, executed };
}

/** Hodinová část AI trenéra pro nabídky místních hráčů (podpis HourlyHook z ai-coach/hourly-hooks.ts). */
export const playerOffersHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  const mode = await readCoachMode(env.CACHE_KV, PLAYER_OFFER_COACH_AREA);
  await handlePlayerOffers(env, teamId, profile, now, { mode, ai: env });
};
