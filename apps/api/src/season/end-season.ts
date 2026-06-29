/**
 * Orchestrátor konce sezóny — GLOBÁLNÍ, chunkovaný, idempotentní.
 *
 * Sezóna je GLOBÁLNÍ: jeden trigger zakončí celý ročník napříč VŠEMI senior
 * ligami a založí JEDEN nový globální ročník se synchronizovaným kalendářem.
 * Volá se OPAKOVANĚ (admin tlačítko / curl loop) dokud allDone=true.
 *
 * Pořadí per-liga wrap fází (awards+archive PŘED odchody — retired se mažou
 * z players): finalize → rewards → awards → archive → departures → replenish
 * → village → articles → interviews. Pak JEDEN globální rollover.
 *
 * Gate: zakončí se, až jsou dohrané LIDSKÉ senior ligy (AI-only ligy, které
 * match-tick nezpracovává, neblokují). `force` přebije. Wrap běží jen pro ligy,
 * co aspoň 1 zápas odehrály; rollnou se ale VŠECHNY senior ligy (kvůli poháru).
 */

import { calculateStandings } from "../stats/standings";
import { applySeasonRewards } from "./season-rewards";
import { generateSeasonAwards } from "./season-awards";
import { archiveLeagueSeason } from "./season-archive";
import { processTeamDepartures, refreshFreeAgents } from "./season-departures";
import { applyVillageSeasonReaction } from "./season-village";
import { generateSeasonWrapArticle } from "../news/season-wrap";
import { createSeasonWrapInterviews } from "../news/season-interview";
import { rolloverAllLeagues } from "./season-rollover";
import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";

const WRAP_PHASES = [
  "finalize", "rewards", "awards", "archive", "departures",
  "replenish", "village", "articles", "interviews",
] as const;
type WrapPhase = (typeof WRAP_PHASES)[number];

const ROLLOVER_KEY = "__global__";
const DEPARTURES_CHUNK = 3;

export interface EndSeasonStepResult {
  allDone: boolean;
  ready?: boolean;
  seasonNumber?: number;
  leagueId?: string;
  phase?: string;
  status?: "done" | "in_progress" | "error";
  remainingLeagues: number;
  detail?: string;
}

interface LeagueState {
  leagueId: string;
  total: number;
  pending: number;
  humans: number;
  started: boolean;
  complete: boolean;
}

async function getGlobalSeason(db: D1Database): Promise<number | null> {
  const row = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'")
    .first<{ n: number | null }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "global season", e); return null; });
  if (row?.n != null) return row.n;
  // fallback: nejvyšší season_number senior kalendářů
  const fb = await db.prepare("SELECT MAX(sc.season_number) AS n FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id WHERE l.league_type = 'senior'")
    .first<{ n: number | null }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "global season fallback", e); return null; });
  return fb?.n ?? null;
}

async function getSeniorStates(db: D1Database, seasonNumber: number): Promise<LeagueState[]> {
  const res = await db.prepare(
    `SELECT l.id AS league_id,
            (SELECT COUNT(*) FROM season_calendar sc WHERE sc.league_id = l.id AND sc.season_number = ?) AS total,
            (SELECT COUNT(*) FROM season_calendar sc WHERE sc.league_id = l.id AND sc.season_number = ? AND sc.status != 'simulated') AS pending,
            (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id AND t.user_id != 'ai') AS humans
     FROM leagues l WHERE l.league_type = 'senior'`,
  ).bind(seasonNumber, seasonNumber).all<{ league_id: string; total: number; pending: number; humans: number }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "senior states", e); return { results: [] as { league_id: string; total: number; pending: number; humans: number }[] }; });

  return res.results.map((r) => ({
    leagueId: r.league_id,
    total: r.total,
    pending: r.pending,
    humans: r.humans,
    started: r.total > 0 && r.pending < r.total,
    complete: r.total > 0 && r.pending === 0,
  }));
}

async function getProgress(db: D1Database, leagueId: string, seasonNumber: number, phase: string) {
  return db.prepare("SELECT status, cursor FROM season_end_progress WHERE league_id = ? AND season_number = ? AND phase = ?")
    .bind(leagueId, seasonNumber, phase).first<{ status: string; cursor: string | null }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "get progress", e); return null; });
}

async function setProgress(db: D1Database, leagueId: string, seasonNumber: number, phase: string, status: string, cursor?: string | null): Promise<void> {
  await db.prepare(
    `INSERT INTO season_end_progress (league_id, season_number, phase, status, cursor, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(league_id, season_number, phase)
     DO UPDATE SET status = excluded.status, cursor = excluded.cursor, updated_at = excluded.updated_at`,
  ).bind(leagueId, seasonNumber, phase, status, cursor ?? null).run()
    .catch((e) => logger.warn({ module: "end-season" }, "set progress", e));
}

async function getGameDate(db: D1Database, leagueId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL ORDER BY game_date DESC LIMIT 1")
    .bind(leagueId).first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "game date", e); return null; });
  return row?.game_date ?? new Date().toISOString();
}

/** Spustí jednu jednotku práce globálního konce sezóny. */
export async function runEndSeasonStep(
  db: D1Database,
  geminiApiKey: string | undefined,
  opts: { force?: boolean } = {},
): Promise<EndSeasonStepResult> {
  const seasonNumber = await getGlobalSeason(db);
  if (seasonNumber == null) return { allDone: true, ready: false, remainingLeagues: 0, detail: "žádná aktivní sezóna" };

  const states = await getSeniorStates(db, seasonNumber);
  const started = states.filter((s) => s.started);

  // Žádná odehraná liga → není co zakončit (a guard proti smyčce: čerstvě rollnutá sezóna)
  if (started.length === 0) {
    return { allDone: true, ready: false, seasonNumber, remainingLeagues: 0, detail: "sezóna zatím nezačala — žádná odehraná liga" };
  }

  // Gate: lidské odehrané ligy musí být dohrané (AI-only neblokují). force přebije.
  if (!opts.force) {
    const blocking = started.filter((s) => s.humans > 0 && !s.complete);
    if (blocking.length > 0) {
      return { allDone: true, ready: false, seasonNumber, remainingLeagues: blocking.length, detail: `sezóna ještě běží — ${blocking.length} lidských lig nedohraných (force=1 přebije)` };
    }
  }

  // 1. Per-liga wrap pro odehrané ligy
  for (const st of started) {
    let firstPending: WrapPhase | null = null;
    for (const phase of WRAP_PHASES) {
      const prog = await getProgress(db, st.leagueId, seasonNumber, phase);
      if (prog?.status !== "done") { firstPending = phase; break; }
    }
    if (firstPending) {
      const status = await runWrapPhase(db, geminiApiKey, st.leagueId, seasonNumber, firstPending);
      return { allDone: false, ready: true, seasonNumber, leagueId: st.leagueId, phase: firstPending, status, remainingLeagues: started.length, detail: `${firstPending} → ${status}` };
    }
  }

  // 2. Globální rollover (jednou, až mají všechny odehrané ligy wrap hotový)
  const rollProg = await getProgress(db, ROLLOVER_KEY, seasonNumber, "rollover");
  if (rollProg?.status !== "done") {
    try {
      const r = await rolloverAllLeagues(db, seasonNumber);
      await setProgress(db, ROLLOVER_KEY, seasonNumber, "rollover", "done");
      return { allDone: true, ready: true, seasonNumber, phase: "rollover", status: "done", remainingLeagues: 0, detail: `nová sezóna ${r.newSeasonNumber}, rollnuto ${r.rolledLeagues} lig` };
    } catch (e) {
      logger.error({ module: "end-season" }, "global rollover failed", e);
      return { allDone: false, ready: true, seasonNumber, phase: "rollover", status: "error", remainingLeagues: 0, detail: "rollover selhal" };
    }
  }

  return { allDone: true, ready: true, seasonNumber, remainingLeagues: 0, detail: "sezóna zakončena" };
}

async function runWrapPhase(
  db: D1Database,
  geminiApiKey: string | undefined,
  leagueId: string,
  seasonNumber: number,
  phase: WrapPhase,
): Promise<"done" | "in_progress" | "error"> {
  try {
    switch (phase) {
      case "finalize":
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      case "rewards": {
        const standings = await calculateStandings(db, leagueId);
        const levelRow = await db.prepare("SELECT level FROM leagues WHERE id = ?").bind(leagueId).first<{ level: string }>()
          .catch((e) => { logger.warn({ module: "end-season" }, "load level", e); return null; });
        const gameDate = await getGameDate(db, leagueId);
        await applySeasonRewards(db, standings, seasonNumber, gameDate, levelRow?.level ?? "okresni_prebor");
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "awards":
        await generateSeasonAwards(db, geminiApiKey, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      case "archive":
        await archiveLeagueSeason(db, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      case "departures": {
        const prog = await getProgress(db, leagueId, seasonNumber, phase);
        let processed: string[] = [];
        try { processed = JSON.parse(prog?.cursor ?? "[]"); } catch { processed = []; }
        const processedSet = new Set(processed);
        const teamsRes = await db.prepare("SELECT id FROM teams WHERE league_id = ?").bind(leagueId).all<{ id: string }>()
          .catch((e) => { logger.warn({ module: "end-season" }, "load teams for departures", e); return { results: [] as { id: string }[] }; });
        const teamIds = teamsRes.results.map((r) => r.id);
        const todo = teamIds.filter((id) => !processedSet.has(id)).slice(0, DEPARTURES_CHUNK);
        for (const tid of todo) {
          await processTeamDepartures(db, leagueId, tid, seasonNumber);
          processedSet.add(tid);
        }
        const done = processedSet.size >= teamIds.length;
        await setProgress(db, leagueId, seasonNumber, phase, done ? "done" : "pending", JSON.stringify([...processedSet]));
        return done ? "done" : "in_progress";
      }
      case "replenish": {
        const rng = createRng(cryptoSeed());
        const gameDate = await getGameDate(db, leagueId);
        await refreshFreeAgents(db, rng, new Date(gameDate));
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "village": {
        const standings = await calculateStandings(db, leagueId);
        await applyVillageSeasonReaction(db, standings);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "articles":
        await generateSeasonWrapArticle(db, geminiApiKey, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      case "interviews": {
        const { remaining } = await createSeasonWrapInterviews(db, geminiApiKey, leagueId, seasonNumber, DEPARTURES_CHUNK);
        const done = remaining === 0;
        await setProgress(db, leagueId, seasonNumber, phase, done ? "done" : "pending");
        return done ? "done" : "in_progress";
      }
    }
  } catch (e) {
    logger.error({ module: "end-season" }, `wrap phase ${phase} failed league=${leagueId}`, e);
    return "error";
  }
  return "error";
}
