/**
 * Slib prodeje, který AI trenér dal nespokojenému hráči („Slíbit prodej při další nabídce“,
 * unhappy-players.ts). AI ho dodrží, jak by ho dodržel poctivý člověk:
 * - po dobu slibu je hráč na trhu. Inzerát trvá týden a slib 30 dní, proto ho AI po propadnutí
 *   vystaví znovu. Cenu vybere model mezi 60 % tržní hodnoty a tržní hodnotou (sale-promise-decision.ts),
 *   bez modelu platí tržní hodnota,
 * - odpovědi na nabídky (transfer-replies.ts) přijmou každý přestup od 60 % tržní hodnoty, bez
 *   protinávrhu nahoru (transfer-decision.ts). Pod 60 % ne: pevná pojistka platí vždy.
 * Když hráč z klubu odejde, hra slib uzavře jako dodržený (transfers/promises.ts).
 *
 * AI klubu se nic nepíše.
 */

import { marketValue } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { listPlayerOnMarket } from "../services/transfer-actions";
import { activeTransferPromise, type PlayerPromise } from "../transfers/promises";
import { claimCoachTask } from "./claims";
import { logDecision, type DecisionMode } from "./decision-log";
import { callCoachModel } from "./llm";
import type { AiCoachProfile } from "./profile";
import {
  fallbackPromiseListing, PROMISE_LISTING_SYSTEM_PROMPT, promiseListingBounds, promiseListingSchema, renderPromiseListingPrompt,
  validatePromiseListing,
  type PromiseListingContext, type PromiseListingDecision,
} from "./sale-promise-decision";
import { loadAiClubState, type AiClubState } from "./transfer-club";

const M = "ai-coach-sale-promise";
const DAY_MS = 86_400_000;
/** Přes den, ne v noci: v kolik hodin (Praha) trenér hráče na trh dává (jako u dohod s hráči). */
const DAY_FROM_HOUR = 8;
const DAY_TO_HOUR = 20;
/** Hodinová úloha nesmí stát: na model se čeká nejvýš minutu. */
const MODEL_TIMEOUT_MS = 60_000;

export interface SalePromiseOpts {
  /** Režim oblasti nespokojených hráčů. `shadow` rozhodne a zapíše, ale nevystaví. */
  mode?: DecisionMode;
  ai?: Pick<Bindings, "AI"> | null;
  model?: string;
}

export interface PromiseListingResult {
  playerId: string;
  price: number;
  decidedBy: "model" | "fallback";
  /** Založený inzerát (null v režimu shadow a při chybě). */
  listingId: string | null;
  error?: string;
}

interface PromisedPlayerRow {
  id: string;
  position: string;
  age: number;
  overall_rating: number;
  deadline: string | null;
}

/** Běžící slib prodeje hráče (ne „pustit ho“: ten AI dodrží hned), nebo null. */
export async function activeSalePromise(db: D1Database, playerId: string, now: Date): Promise<PlayerPromise | null> {
  const promise = await activeTransferPromise(db, playerId);
  if (!promise || promise.type !== "transfer") return null;
  if (promise.deadline && new Date(promise.deadline).getTime() <= now.getTime()) return null;
  return promise;
}

/**
 * Hráči AI klubu s běžícím slibem prodeje, kteří nejsou na trhu: v kádru klubu (áčko i U21),
 * ne na hostování a aktivní. Hráč na hostování jinde na trh nejde (služba ho nevystaví).
 */
async function loadUnlistedPromisedPlayers(db: D1Database, clubTeamId: string, now: Date): Promise<PromisedPlayerRow[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.position, p.age, p.overall_rating, pr.deadline
       FROM player_promises pr
       JOIN players p ON p.id = pr.player_id
       JOIN teams t ON t.id = p.team_id
      WHERE pr.team_id = ?1 AND pr.type = 'transfer' AND pr.status = 'active'
        AND (pr.deadline IS NULL OR pr.deadline > ?2)
        AND COALESCE(t.parent_team_id, t.id) = ?1 AND p.loan_from_team_id IS NULL
        AND (p.status IS NULL OR p.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM transfer_listings tl WHERE tl.player_id = p.id AND tl.status = 'active')
      ORDER BY pr.made_at, p.id`,
  ).bind(clubTeamId, now.toISOString()).all<PromisedPlayerRow>()
    .catch((e) => { logger.warn({ module: M, teamId: clubTeamId }, "hráči se slibem prodeje bez inzerátu", e); return { results: [] as PromisedPlayerRow[] }; });
  return rows.results;
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

/** Vystaví hráče se slibem prodeje: cenu v mezích slibu vybere model, bez něj tržní hodnota. */
async function listPromisedPlayer(
  env: Bindings, club: AiClubState, row: PromisedPlayerRow, now: Date, mode: DecisionMode, opts: SalePromiseOpts,
): Promise<PromiseListingResult> {
  const value = marketValue(Number(row.overall_rating) || 0, Number(row.age) || 25, row.position);
  const ctx: PromiseListingContext = {
    teamName: club.name, profile: club.profile, budget: club.budget, spendable: club.spendable,
    player: {
      position: row.position, age: Number(row.age) || 25, rating: Number(row.overall_rating) || 0,
      importance: club.analysis.importanceOf(row.id), marketValue: value,
    },
    daysLeft: row.deadline ? Math.max(0, Math.ceil((Date.parse(row.deadline) - now.getTime()) / DAY_MS)) : 30,
    ...promiseListingBounds(value),
  };

  let decision: PromiseListingDecision = fallbackPromiseListing(ctx);
  let decidedBy: PromiseListingResult["decidedBy"] = "fallback";
  let trace: ModelTrace = NO_TRACE;
  if (mode !== "off" && opts.ai) {
    const prompt = renderPromiseListingPrompt(ctx);
    const res = await callCoachModel(opts.ai, {
      system: PROMISE_LISTING_SYSTEM_PROMPT, user: prompt, maxTokens: 200,
      schema: { name: "promise_listing", schema: promiseListingSchema(ctx) }, model: opts.model, timeoutMs: MODEL_TIMEOUT_MS,
    });
    trace = {
      model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
      latencyMs: res.latencyMs, prompt,
    };
    const parsed = res.json ? validatePromiseListing(res.json, ctx) : null;
    if (parsed) {
      decision = parsed;
      decidedBy = "model";
    } else {
      trace = { ...trace, error: trace.error ?? "neplatná odpověď modelu" };
    }
  }

  let listingId: string | null = null;
  let error: string | undefined;
  if (mode !== "shadow") {
    const res = await listPlayerOnMarket(env, club.teamId, row.id, decision.price);
    if (res.ok) listingId = res.listingId;
    else {
      error = res.error;
      logger.warn({ module: M, teamId: club.teamId, playerId: row.id }, `hráče se slibem prodeje nešlo vystavit: ${res.error}`);
    }
  }

  await logDecision(env.DB, {
    teamId: club.teamId, kind: "promise_listing", mode, model: trace.model, contextRef: row.id,
    inputSummary: trace.prompt ?? `player=${row.id} ${row.position} ${row.overall_rating} value=${value} range=${ctx.minPrice}-${ctx.maxPrice}`,
    rawOutput: trace.raw,
    actions: { playerId: row.id, price: decision.price, reason: decision.reason, decidedBy, minPrice: ctx.minPrice, maxPrice: ctx.maxPrice },
    executed: mode === "shadow" ? null : listingId ? { listingId } : { error },
    usedFallback: decidedBy === "fallback",
    error: [trace.error, error].filter(Boolean).join("; ") || null,
    tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
  });
  return { playerId: row.id, price: decision.price, decidedBy, listingId, ...(error ? { error } : {}) };
}

/**
 * Hráče AI klubu s běžícím slibem prodeje, kteří nejsou na trhu (čerstvý slib, propadlý inzerát),
 * vystaví. Přes den, každého hráče nejvýš jednou za herní den (nárok `promise_listing:<hráč>`,
 * v režimu shadow zvlášť), ať neúspěšný pokus nezkouší každou hodinu znovu.
 */
export async function keepPromisedPlayersListed(
  env: Bindings, teamId: string, profile: AiCoachProfile, now: Date, opts: SalePromiseOpts = {},
): Promise<PromiseListingResult[]> {
  const db = env.DB;
  const mode = opts.mode ?? "on";
  const hour = pragueHour(now);
  if (hour !== null && (hour < DAY_FROM_HOUR || hour > DAY_TO_HOUR)) return [];
  const rows = await loadUnlistedPromisedPlayers(db, teamId, now);
  if (rows.length === 0) return [];
  const club = await loadAiClubState(db, teamId, profile, now);
  if (!club) return [];
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "herní den pro inzerát po slibu prodeje", e); return null; });
  const gameDay = (team?.game_date ?? now.toISOString()).slice(0, 10);

  const out: PromiseListingResult[] = [];
  for (const row of rows) {
    const task = `${mode === "shadow" ? "shadow:" : ""}promise_listing:${row.id}`;
    if (!(await claimCoachTask(db, teamId, task, gameDay))) continue;
    try {
      out.push(await listPromisedPlayer(env, club, row, now, mode, opts));
    } catch (e) {
      logger.error({ module: M, teamId, playerId: row.id }, "inzerát hráče se slibem prodeje", e);
    }
  }
  return out;
}
