/**
 * Nespokojení hráči AI klubu (spec AI klubů 3.2): AI trenér je řeší stejnou službou jako
 * člověk (`performUnrestAction`), jen bez textů. Nejvýš jednou za herní den a přes den.
 *
 * Model navrhuje, kód hlídá. Kód nabídne jen dohody, které by služba přijala (podle důvodu
 * trucu, bez už uzavřených dohod, s dnem mezi dohodami), a k tomu meze AI klubu: placené
 * dohody jen z peněz nad rezervou, „pustit ho“ jen tehdy, když by AI hráče prodala i jinak
 * (pojistky kádru, 60 % tržní hodnoty, limit obchodů podle povahy). Model u každého hráče
 * vybere jednu dohodu, nebo počká. Bez modelu (výpadek, nesmysl, režim off, chybějící binding)
 * rozhodne náhradní pravidlo podle povahy (unrest-decision.ts).
 *
 * Slib místa v sestavě a slib prodeje AI trenér nedává: jeho sestava ani odpovědi na nabídky
 * o slibech nevědí a sliby AI klubů hra nevyhodnocuje (`processTransferUnrest` AI kluby
 * přeskakuje), takže by hráče uklidnily zadarmo. „Pustit ho“ AI dodrží hned: nabídku,
 * kterou klub po telefonu pošle znovu, rovnou přijme stejnou službou jako člověk.
 *
 * AI klubu se nic nepíše: žádná SMS, zpráva ani oznámení.
 */

import { marketValue, termsFromRow } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { acceptTransferOffer } from "../services/transfer-actions";
import type { TransferUnrest } from "../transfers/offer-rejection-impact";
import {
  activeSeasonNumber, availableActions, bonusAmount, dealCooldownText, PERSONAL_TALK_COST, performUnrestAction, raisedWage,
  unrestContextFor, type UnrestActionId,
} from "../transfers/unrest";
import { claimCoachTask } from "./claims";
import { logDecision, type DecisionMode } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import { callCoachModel } from "./llm";
import { readCoachMode, type CoachArea } from "./mode";
import type { AiCoachProfile } from "./profile";
import { loadAiClubState, type AiClubState } from "./transfer-club";
import { loadSaleCosts } from "./transfer-guard";
import {
  renderUnrestPrompt, resolveUnrestDecisions, UNREST_SYSTEM_PROMPT, unrestDecisionSchema, validateUnrestDecision,
  type UnrestCandidate, type UnrestDecisionContext, type UnrestOption, type UnrestPlayerDecision, type UnrestValidation,
} from "./unrest-decision";
import { isBelowHardFloor, netSaleValue } from "./valuation";

const M = "ai-coach-unrest";

/** Nespokojení hráči patří ke správě klubu: přepínač je společný s týdenní správou. */
export const UNREST_COACH_AREA: CoachArea = "weekly";

/** Přes den, ne v noci: v kolik hodin (Praha) trenér s hráči jedná. */
const DAY_FROM_HOUR = 8;
const DAY_TO_HOUR = 20;
/** Nejvýš tolik hráčů za den (nejnaštvanější první), ať prompt i běh zůstanou malé. */
const MAX_PLAYERS_PER_RUN = 6;
/** Zvýšení odměn musí klub z peněz nad rezervou unést aspoň tolik týdnů (zhruba sezónu). */
export const RAISE_COVER_WEEKS = 26;
/** Hodinová úloha nesmí stát: na model se čeká nejvýš minutu. */
const MODEL_TIMEOUT_MS = 60_000;
/** Sliby, které by AI trenér nedodržel ani mu je hra nevyhodnotí (viz hlavička souboru). */
const AI_UNSUPPORTED_DEALS: ReadonlySet<UnrestActionId> = new Set(["promise_minutes", "promise_transfer"]);

export interface UnrestCoachOpts {
  /** Režim přepínače. `shadow` rozhodne a zapíše do deníku, ale nic neprovede. */
  mode?: DecisionMode;
  /** Binding Workers AI. Bez něj rozhoduje náhradní pravidlo. */
  ai?: Pick<Bindings, "AI"> | null;
  /** Jiný model (srovnání). */
  model?: string;
}

export interface UnrestExecution {
  player: string;
  playerId: string;
  action: UnrestActionId;
  ok: boolean;
  /** Nespokojenost po dohodě. */
  level?: number;
  /** „Pustit ho“: obnovená nabídka a jestli ji AI přijala. */
  offerId?: string | null;
  sold?: boolean;
  error?: string;
}

export interface UnrestRunResult {
  status: "not_ai" | "night" | "nothing" | "duplicate" | "done";
  decisions: UnrestPlayerDecision[];
  executed: UnrestExecution[];
}

interface UnhappyRow {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  overall_rating: number;
  weekly_wage: number | null;
  team_id: string;
  loan_from_team_id: string | null;
  personality: string | null;
  life_context: string | null;
  coach_relationship: number | null;
  captain_id: string | null;
  roster_parent_id: string | null;
  current_club_id: string;
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

function emptyResult(status: UnrestRunResult["status"]): UnrestRunResult {
  return { status, decisions: [], executed: [] };
}

function parseObject(raw: string | null, playerId: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M, playerId }, "nečitelný life_context hráče", e);
    return {};
  }
}

/** Jméno klubu z odmítnuté nabídky (klub mimo hru má jméno v `virtualTeamData`). */
function offerClubName(unrest: TransferUnrest): string {
  const data = unrest.offer?.virtualTeamData;
  if (data) {
    try {
      const name = (JSON.parse(data) as { name?: unknown }).name;
      if (typeof name === "string" && name) return name;
    } catch (e) {
      logger.warn({ module: M }, "nečitelný klub z odmítnuté nabídky", e);
    }
  }
  return unrest.teamName ?? "the club";
}

/**
 * Nespokojení hráči, které AI klub vlastní: v jeho kádru (áčko i U21, bez hostujících u nás,
 * ti patří jinému klubu) a jeho hráči na hostování jinde. Stejné vymezení klubu jako služba.
 */
async function loadUnhappyPlayers(db: D1Database, teamId: string): Promise<UnhappyRow[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.weekly_wage, p.team_id, p.loan_from_team_id,
            p.personality, p.life_context, p.coach_relationship, current_team.captain_id,
            current_team.parent_team_id AS roster_parent_id,
            COALESCE(current_team.parent_team_id, current_team.id) AS current_club_id
       FROM players p
       JOIN teams current_team ON current_team.id = p.team_id
       LEFT JOIN teams owner_team ON owner_team.id = p.loan_from_team_id
      WHERE (p.status IS NULL OR p.status = 'active')
        AND (CASE WHEN json_valid(p.life_context) THEN json_extract(p.life_context, '$.transferUnrest.level') ELSE 0 END) > 0
        AND ((p.loan_from_team_id IS NULL AND COALESCE(current_team.parent_team_id, current_team.id) = ?1)
          OR COALESCE(owner_team.parent_team_id, owner_team.id) = ?1)`,
  ).bind(teamId).all<UnhappyRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "nespokojení hráči AI klubu", e); return { results: [] as UnhappyRow[] }; });
  return rows.results;
}

/**
 * „Pustit ho“ jen za stejných podmínek, za jakých by AI hráče prodala sama: pojistky kádru
 * (poslední brankář, minimum kádru, opora bez náhrady), 60 % tržní hodnoty po odvodech
 * a limit obchodů za měsíc. Na hráče nesmí běžet jiná nabídka (služba by ji znovu neposlala).
 */
async function releaseOption(db: D1Database, club: AiClubState, row: UnhappyRow, unrest: TransferUnrest): Promise<UnrestOption | null> {
  const offer = unrest.offer;
  if (!offer?.virtualTeamData || club.overDealLimit) return null;
  if (club.analysis.sellBlock(row.id)) return null;
  const pending = await db.prepare("SELECT 1 AS x FROM transfer_offers WHERE player_id = ? AND status IN ('pending', 'countered') LIMIT 1")
    .bind(row.id).first();
  if (pending) return null;
  const costs = await loadSaleCosts(db, club.teamId, row.id, 0);
  const value = marketValue(Number(row.overall_rating) || 0, Number(row.age) || 25, row.position);
  if (isBelowHardFloor(netSaleValue(termsFromRow({}, offer.amount), 0, costs), value)) return null;
  return { id: "release", cost: 0, weeklyCost: 0, sale: { club: offerClubName(unrest), amount: offer.amount } };
}

/** Meze AI klubu nad pravidly služby: na co klub má (z peněz nad rezervou) a koho smí pustit. */
async function guardDeal(
  db: D1Database, club: AiClubState, row: UnhappyRow, unrest: TransferUnrest, id: UnrestActionId,
): Promise<UnrestOption | null> {
  if (AI_UNSUPPORTED_DEALS.has(id)) return null;
  switch (id) {
    case "bonus": {
      const cost = bonusAmount(unrest);
      return cost <= club.spendable ? { id, cost, weeklyCost: 0 } : null;
    }
    case "raise_wage": {
      const wage = Number(row.weekly_wage) || 0;
      const weeklyCost = raisedWage(wage) - wage;
      return weeklyCost * RAISE_COVER_WEEKS <= club.spendable ? { id, cost: 0, weeklyCost } : null;
    }
    case "personal_talk":
      return PERSONAL_TALK_COST <= club.spendable ? { id, cost: PERSONAL_TALK_COST, weeklyCost: 0 } : null;
    case "release":
      return releaseOption(db, club, row, unrest);
    default:
      return { id, cost: 0, weeklyCost: 0 };
  }
}

/** Hráči, o kterých je dnes co rozhodnout: aspoň jedna přípustná dohoda (čekání je vždy). */
async function buildCandidates(
  db: D1Database, club: AiClubState, rows: UnhappyRow[], seasonNumber: number | null, now: Date,
): Promise<UnrestCandidate[]> {
  const unhappy = rows
    .map((row) => {
      const lc = parseObject(row.life_context, row.id);
      return { row, lc, unrest: lc.transferUnrest as TransferUnrest | undefined };
    })
    .filter((x): x is { row: UnhappyRow; lc: Record<string, unknown>; unrest: TransferUnrest } =>
      !!x.unrest && typeof x.unrest.level === "number" && x.unrest.level > 0)
    .sort((a, b) => b.unrest.level - a.unrest.level || a.row.id.localeCompare(b.row.id));

  const out: UnrestCandidate[] = [];
  for (const { row, lc, unrest } of unhappy) {
    if (out.length >= MAX_PLAYERS_PER_RUN) break;
    // Dnes už s ním dohoda padla: další by služba odmítla.
    if (dealCooldownText(unrest, now)) continue;
    const ctx = unrestContextFor(row, row.id, club.teamId, seasonNumber, now);
    const options: UnrestOption[] = [];
    for (const deal of availableActions(unrest, lc, ctx)) {
      const option = await guardDeal(db, club, row, unrest, deal.id)
        .catch((e) => { logger.warn({ module: M, teamId: club.teamId, playerId: row.id }, `kontrola dohody ${deal.id}`, e); return null; });
      if (option) options.push(option);
    }
    if (options.length === 0) continue;
    out.push({
      key: `P${out.length + 1}`,
      playerId: row.id,
      name: `${row.first_name} ${row.last_name}`,
      age: Number(row.age) || 25,
      position: row.position,
      rating: Number(row.overall_rating) || 0,
      importance: club.analysis.importanceOf(row.id),
      inU21: row.roster_parent_id != null,
      onLoanElsewhere: row.loan_from_team_id != null,
      weeklyWage: Number(row.weekly_wage) || 0,
      level: unrest.level,
      reasons: unrest.reasons ?? [],
      offer: unrest.offer?.amount ? { club: offerClubName(unrest), amount: unrest.offer.amount } : null,
      dealsDone: (unrest.deals ?? []).map((d) => d.id),
      options,
    });
  }
  return out;
}

/** „Pustit ho“: služba poslala nabídku klubu znovu (slib ji přijmout), AI ji hned přijme. */
async function completeRelease(env: Bindings, teamId: string, playerId: string): Promise<{ offerId: string | null; sold: boolean; error?: string }> {
  const row = await env.DB.prepare("SELECT json_extract(life_context, '$.transferUnrest.pledge.offerId') AS offer_id FROM players WHERE id = ?")
    .bind(playerId).first<{ offer_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId, playerId }, "obnovená nabídka po „pustit ho“", e); return null; });
  const offerId = row?.offer_id ?? null;
  if (!offerId) return { offerId: null, sold: false, error: "obnovená nabídka se nenašla" };
  const accepted = await acceptTransferOffer(env, teamId, offerId);
  if (!accepted.ok) {
    logger.warn({ module: M, teamId, playerId }, `obnovenou nabídku ${offerId} nešlo přijmout: ${accepted.error}`);
    return { offerId, sold: false, error: accepted.error };
  }
  return { offerId, sold: true };
}

/** Provede rozhodnutí přes službu. Peníze se hlídají znovu: mohly padnout na dřívější dohodu. */
async function executeDecisions(
  env: Bindings, club: AiClubState, ctx: UnrestDecisionContext, decisions: UnrestPlayerDecision[], now: Date,
): Promise<UnrestExecution[]> {
  const byKey = new Map(ctx.players.map((p) => [p.key, p]));
  const executed: UnrestExecution[] = [];
  let committed = 0;
  let captaincyGiven = false;
  for (const d of decisions) {
    if (d.action === "wait") continue;
    const player = byKey.get(d.key);
    const option = player?.options.find((o) => o.id === d.action);
    if (!player || !option) continue;
    const base = { player: d.key, playerId: player.playerId, action: option.id };
    const needed = option.cost + option.weeklyCost * RAISE_COVER_WEEKS;
    if (needed > 0 && needed > club.spendable - committed) {
      executed.push({ ...base, ok: false, error: "na dohodu už nezbyly peníze nad rezervou" });
      continue;
    }
    // Páska je jen jedna: druhý kapitán v tomtéž dni by prvnímu pásku zase vzal.
    if (option.id === "captaincy" && captaincyGiven) {
      executed.push({ ...base, ok: false, error: "kapitánskou pásku dnes už dostal jiný hráč" });
      continue;
    }
    try {
      const res = await performUnrestAction(env.DB, env, club.teamId, player.playerId, option.id, { silent: true, now });
      if (!res.ok) {
        executed.push({ ...base, ok: false, error: res.error });
        continue;
      }
      committed += needed;
      if (option.id === "captaincy") captaincyGiven = true;
      const entry: UnrestExecution = { ...base, ok: true, level: res.unrestLevel };
      if (option.id === "release") Object.assign(entry, await completeRelease(env, club.teamId, player.playerId));
      executed.push(entry);
    } catch (e) {
      logger.error({ module: M, teamId: club.teamId, playerId: player.playerId }, `dohoda ${option.id} AI klubu`, e);
      executed.push({ ...base, ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) });
    }
  }
  return executed;
}

/**
 * Projde nespokojené hráče AI klubu a s každým uzavře nejvýš jednu dohodu, nebo počká.
 * Nejvýš jednou za herní den (nárok `unrest`, v režimu shadow zvlášť `shadow:unrest`).
 */
export async function resolveUnhappyPlayers(
  env: Bindings, teamId: string, profile: AiCoachProfile, now: Date, opts: UnrestCoachOpts = {},
): Promise<UnrestRunResult> {
  const db = env.DB;
  const mode = opts.mode ?? "on";
  const hour = pragueHour(now);
  if (hour !== null && (hour < DAY_FROM_HOUR || hour > DAY_TO_HOUR)) return emptyResult("night");

  const team = await db.prepare("SELECT user_id, parent_team_id, game_date FROM teams WHERE id = ?").bind(teamId)
    .first<{ user_id: string | null; parent_team_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "klub pro nespokojené hráče", e); return null; });
  // Lidský klub (a U21) řeší nespokojené hráče jeho trenér sám.
  if (!team || team.user_id !== "ai" || team.parent_team_id) return emptyResult("not_ai");

  const rows = await loadUnhappyPlayers(db, teamId);
  if (rows.length === 0) return emptyResult("nothing");
  const club = await loadAiClubState(db, teamId, profile, now);
  if (!club) return emptyResult("not_ai");
  const players = await buildCandidates(db, club, rows, await activeSeasonNumber(db), now);
  if (players.length === 0) return emptyResult("nothing");

  const gameDay = (team.game_date ?? now.toISOString()).slice(0, 10);
  if (!(await claimCoachTask(db, teamId, mode === "shadow" ? "shadow:unrest" : "unrest", gameDay))) return emptyResult("duplicate");

  const ctx: UnrestDecisionContext = {
    teamName: club.name, profile, budget: club.budget, reserve: club.reserve, spendable: club.spendable,
    top11Average: club.analysis.top11Average, players,
  };
  let validation: UnrestValidation | null = null;
  let reasoning = "";
  let trace: ModelTrace = NO_TRACE;
  if (mode !== "off" && opts.ai) {
    const prompt = renderUnrestPrompt(ctx);
    const res = await callCoachModel(opts.ai, {
      system: UNREST_SYSTEM_PROMPT, user: prompt, maxTokens: 600,
      schema: { name: "unrest_decision", schema: unrestDecisionSchema(ctx) }, model: opts.model, timeoutMs: MODEL_TIMEOUT_MS,
    });
    trace = {
      model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
      latencyMs: res.latencyMs, prompt,
    };
    validation = res.json ? validateUnrestDecision(res.json, ctx) : null;
    if (!validation) trace = { ...trace, error: trace.error ?? "neplatná odpověď modelu" };
    const r = (res.json as Record<string, unknown> | null)?.reasoning;
    if (typeof r === "string") reasoning = r.trim().slice(0, 300);
  }
  const decisions = resolveUnrestDecisions(ctx, validation);
  const executed = mode === "shadow" ? [] : await executeDecisions(env, club, ctx, decisions, now);

  const rejected = validation?.rejected ?? [];
  const error = [trace.error, rejected.length > 0 ? `zahozeno: ${rejected.join("; ")}` : null].filter(Boolean).join("; ") || null;
  await logDecision(db, {
    teamId, kind: "unrest", mode, model: trace.model, contextRef: gameDay,
    inputSummary: trace.prompt
      ?? `budget=${club.budget} reserve=${club.reserve} players=${players.map((p) => `${p.key}:${p.playerId}:${p.level}:${p.options.map((o) => o.id).join("/")}`).join(",")}`,
    rawOutput: trace.raw,
    actions: {
      decisions: decisions.map((d) => ({ ...d, name: players.find((p) => p.key === d.key)?.name ?? null })),
      rejected,
      reasoning,
    },
    executed: mode === "shadow" ? null : executed,
    usedFallback: decisions.some((d) => d.decidedBy === "fallback"),
    error,
    tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
  });
  return { status: "done", decisions, executed };
}

/** Hodinová část AI trenéra pro nespokojené hráče (podpis HourlyHook z ai-coach/hourly-hooks.ts). */
export const unrestHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  const mode = await readCoachMode(env.CACHE_KV, UNREST_COACH_AREA);
  await resolveUnhappyPlayers(env, teamId, profile, now, { mode, ai: env });
};
