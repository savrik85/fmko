/**
 * Konec sezóny v AI klubu (spec AI klubů 3.4: „kdo odchází"): souboje „kdo zůstane" rozhodne
 * AI trenér stejnou službou jako člověk (season/season-duels.ts `decideSeasonDuels`).
 *
 * Člověk souboje uvidí v přehledu konce sezóny, až se po přechodu do nové sezóny přihlásí.
 * AI trenér proto rozhoduje taky až v nové sezóně (rollover doběhl), přes den, jednou za sezónu.
 * Model navrhuje, kód hlídá (season-duels-decision.ts); bez modelu platí náhradní pravidlo podle
 * povahy, režim shadow jen zapíše do deníku.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { decideSeasonDuels, loadPendingSeasonDuels, type SeasonDuel, type SeasonDuelPlayer } from "../season/season-duels";
import { claimCoachTask, releaseCoachTask } from "./claims";
import { logDecision } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import { callCoachModel } from "./llm";
import { readCoachMode, type CoachArea, type CoachMode } from "./mode";
import type { AiCoachProfile } from "./profile";
import {
  SEASON_DUELS_SYSTEM_PROMPT, fallbackSeasonDuels, hasRealChoice, leavingPlayerIds, renderSeasonDuelsPrompt, seasonDuelsSchema,
  validateSeasonDuels,
  type DuelFacts, type DuelPlayerFacts, type DuelSide, type SeasonDuelsContext, type SeasonDuelsDecision,
} from "./season-duels-decision";
import { analyzeSquad, loadClubSquad, type SquadAnalysis, type SquadMember } from "./squad";

const M = "ai-coach-season-duels";

/** Kádr patří ke správě klubu, přepínač je společný s týdenní správou. */
export const SEASON_DUELS_COACH_AREA: CoachArea = "weekly";

const DAY_FROM_HOUR = 8;
const DAY_TO_HOUR = 20;
const MODEL_TIMEOUT_MS = 60_000;

export interface SeasonDuelsCoachOpts {
  mode?: CoachMode;
  /** Binding Workers AI. Bez něj rozhoduje náhradní pravidlo. */
  ai?: Pick<Bindings, "AI"> | null;
  model?: string;
}

export interface SeasonDuelsRunResult {
  skipped: "night" | "not_ai" | "nothing" | "season_running" | "done" | null;
  decidedBy?: "model" | "fallback";
  leaving?: string[];
  /** Služba rozhodnutí provedla (v režimu shadow nikdy). */
  executed?: boolean;
}

function claimKey(mode: CoachMode, task: string): string {
  return mode === "shadow" ? `shadow:${task}` : task;
}

async function loadAiClub(db: D1Database, teamId: string): Promise<{ id: string; name: string } | null> {
  const row = await db.prepare("SELECT id, name, user_id, parent_team_id, team_type FROM teams WHERE id = ?").bind(teamId)
    .first<{ id: string; name: string; user_id: string | null; parent_team_id: string | null; team_type: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "AI klub ke konci sezóny", e); return null; });
  if (!row || row.user_id !== "ai" || row.parent_team_id || (row.team_type ?? "senior") === "u21") return null;
  return { id: row.id, name: row.name };
}

/** Souboje z přehledu sezóny, která už skončila: nová sezóna běží a rollover doběhl. */
async function seasonIsOver(db: D1Database, seasonNumber: number): Promise<boolean> {
  const { findPendingRollover } = await import("../season/season-rollover");
  if ((await findPendingRollover(db)) !== null) return false;
  const row = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first<{ n: number | null }>();
  return typeof row?.n === "number" && row.n > seasonNumber;
}

function duelPlayer(p: SeasonDuelPlayer, members: Map<string, SquadMember>, analysis: SquadAnalysis, seniorOwn: SquadMember[]): DuelPlayerFacts {
  const m = members.get(p.playerId);
  const gone = !m || m.isU21Roster;
  const position = m?.position ?? p.position;
  return {
    playerId: p.playerId, name: p.name, position, age: m?.age ?? p.age, rating: Math.round(m?.rating ?? p.overallRating),
    importance: gone ? "surplus" : analysis.importanceOf(p.playerId),
    samePosition: seniorOwn.filter((x) => x.position === position && x.id !== p.playerId).length,
    gone,
  };
}

/** Kdo musí zůstat: ten, kdo je v klubu, když druhý už odešel, a poslední brankář áčka. */
function mustKeepOf(a: DuelPlayerFacts, b: DuelPlayerFacts, goalkeepers: number): DuelSide | null {
  if (a.gone !== b.gone) return a.gone ? "B" : "A";
  if (a.gone) return null;
  if (a.position === "GK" && goalkeepers <= 1) return "A";
  if (b.position === "GK" && goalkeepers <= 1) return "B";
  return null;
}

async function buildContext(db: D1Database, club: { id: string; name: string }, profile: AiCoachProfile, duels: SeasonDuel[]): Promise<SeasonDuelsContext> {
  const all = await loadClubSquad(db, club.id);
  const analysis = analyzeSquad(all, profile);
  const members = new Map(all.map((m) => [m.id, m]));
  const seniorOwn = all.filter((m) => !m.isU21Roster && !m.loanedIn);
  const goalkeepers = seniorOwn.filter((m) => m.position === "GK").length;
  const facts: DuelFacts[] = duels.map((d) => {
    const a = duelPlayer(d.a, members, analysis, seniorOwn);
    const b = duelPlayer(d.b, members, analysis, seniorOwn);
    return { a, b, mustKeep: mustKeepOf(a, b, goalkeepers) };
  });
  return { teamName: club.name, profile, squadSize: seniorOwn.length, goalkeepers, duels: facts };
}

/**
 * Rozhodne souboje AI klubu, když na ně přišla řada. Vrací, co se stalo (pro testy a admina).
 */
export async function resolveAiSeasonDuels(
  env: Bindings, teamId: string, profile: AiCoachProfile, now: Date, opts: SeasonDuelsCoachOpts = {},
): Promise<SeasonDuelsRunResult> {
  const mode = opts.mode ?? "on";
  const hour = pragueHour(now);
  if (hour !== null && (hour < DAY_FROM_HOUR || hour > DAY_TO_HOUR)) return { skipped: "night" };
  const db = env.DB;
  const club = await loadAiClub(db, teamId);
  if (!club) return { skipped: "not_ai" };
  const pending = await loadPendingSeasonDuels(db, teamId);
  if (!pending) return { skipped: "nothing" };
  if (!(await seasonIsOver(db, pending.seasonNumber))) return { skipped: "season_running" };

  const task = claimKey(mode, "season_duels");
  const day = String(pending.seasonNumber);
  if (!(await claimCoachTask(db, teamId, task, day))) return { skipped: "done" };
  try {
    const ctx = await buildContext(db, club, profile, pending.duels);
    let decision: SeasonDuelsDecision = fallbackSeasonDuels(ctx);
    let by: "model" | "fallback" = "fallback";
    let trace: { model: string | null; raw: string | null; error: string | null; tokensIn: number | null; tokensOut: number | null; latencyMs: number | null } =
      { model: null, raw: null, error: null, tokensIn: null, tokensOut: null, latencyMs: null };
    const prompt = renderSeasonDuelsPrompt(ctx);
    // Model se ptá jen tam, kde je co vybírat (daný souboj má jedinou dovolenou stranu).
    if (mode !== "off" && opts.ai && hasRealChoice(ctx)) {
      const res = await callCoachModel(opts.ai, {
        system: SEASON_DUELS_SYSTEM_PROMPT, user: prompt, maxTokens: 300,
        schema: { name: "season_duels", schema: seasonDuelsSchema(ctx) }, model: opts.model, timeoutMs: MODEL_TIMEOUT_MS,
      });
      trace = {
        model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
        latencyMs: res.latencyMs,
      };
      const parsed = res.json ? validateSeasonDuels(res.json, ctx) : null;
      if (parsed) {
        decision = parsed;
        by = "model";
      } else {
        trace = { ...trace, error: trace.error ?? "neplatná odpověď modelu" };
      }
    }

    const leaving = leavingPlayerIds(ctx, decision);
    let executed: Record<string, unknown> | null = null;
    if (mode !== "shadow") {
      const r = await decideSeasonDuels(db, teamId, leaving);
      executed = r.ok ? { ok: true, removed: r.removed } : { ok: false, error: r.error };
    }
    await logDecision(db, {
      teamId, kind: "season_duels", mode, model: trace.model, contextRef: `season-${pending.seasonNumber}`,
      inputSummary: prompt, rawOutput: trace.raw,
      actions: { keep: decision.keep, leaving, reason: decision.reason, decidedBy: by }, executed,
      usedFallback: by === "fallback", error: trace.error,
      tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
    });
    return { skipped: null, decidedBy: by, leaving, executed: executed?.ok === true };
  } catch (e) {
    await releaseCoachTask(db, teamId, task, day);
    throw e;
  }
}

/** Hodinová část AI trenéra pro konec sezóny (podpis HourlyHook z ai-coach/hourly-hooks.ts). */
export const seasonDuelsHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  const mode = await readCoachMode(env.CACHE_KV, SEASON_DUELS_COACH_AREA);
  await resolveAiSeasonDuels(env, teamId, profile, now, { mode, ai: env });
};
