/**
 * Orchestrátor konce sezóny — chunkovaný a idempotentní.
 *
 * Volá se OPAKOVANĚ (admin tlačítko / curl loop) dokud allDone=true.
 * Jedna jednotka práce na invokaci (1 fáze, departures po ~3 týmech) →
 * každé volání < worker timeout.
 *
 * Pořadí fází (awards + archive PŘED odchody, aby šla resolvnout jména
 * oceněných hráčů — retired se mažou z players):
 *   finalize → rewards → awards → archive → departures → replenish
 *   → village → articles → interviews → new_calendar
 *
 * Stav drží season_end_progress (PK league_id+season_number+phase).
 */

import { calculateStandings } from "../stats/standings";
import { applySeasonRewards } from "./season-rewards";
import { generateSeasonAwards } from "./season-awards";
import { archiveLeagueSeason } from "./season-archive";
import { processTeamDepartures, refreshFreeAgents } from "./season-departures";
import { applyVillageSeasonReaction } from "./season-village";
import { generateSeasonWrapArticle } from "../news/season-wrap";
import { createSeasonWrapInterviews } from "../news/season-interview";
import { rolloverLeague } from "./season-rollover";
import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";

const PHASES = [
  "finalize", "rewards", "awards", "archive", "departures",
  "replenish", "village", "articles", "interviews", "new_calendar",
] as const;
type Phase = (typeof PHASES)[number];

const DEPARTURES_CHUNK = 3;

export interface EndSeasonStepResult {
  allDone: boolean;
  leagueId?: string;
  seasonNumber?: number;
  phase?: Phase;
  status?: "done" | "in_progress" | "error" | "skipped";
  remainingLeagues: number;
  detail?: string;
}

interface LeagueState {
  leagueId: string;
  seasonNumber: number;
  complete: boolean;
}

async function getLeagueState(db: D1Database, leagueId: string): Promise<LeagueState | null> {
  const row = await db.prepare(
    `SELECT MAX(season_number) AS n,
            COUNT(*) AS total,
            SUM(CASE WHEN status != 'simulated' THEN 1 ELSE 0 END) AS pending
     FROM season_calendar
     WHERE league_id = ? AND season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)`,
  ).bind(leagueId, leagueId).first<{ n: number | null; total: number; pending: number }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "league state", e); return null; });
  if (!row || row.n == null) return null;
  return { leagueId, seasonNumber: row.n, complete: row.total > 0 && row.pending === 0 };
}

async function getProgress(db: D1Database, leagueId: string, seasonNumber: number, phase: Phase) {
  return db.prepare("SELECT status, cursor, data FROM season_end_progress WHERE league_id = ? AND season_number = ? AND phase = ?")
    .bind(leagueId, seasonNumber, phase).first<{ status: string; cursor: string | null; data: string | null }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "get progress", e); return null; });
}

async function setProgress(
  db: D1Database, leagueId: string, seasonNumber: number, phase: Phase,
  status: string, cursor?: string | null, data?: string | null,
): Promise<void> {
  await db.prepare(
    `INSERT INTO season_end_progress (league_id, season_number, phase, status, cursor, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(league_id, season_number, phase)
     DO UPDATE SET status = excluded.status, cursor = excluded.cursor, data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(leagueId, seasonNumber, phase, status, cursor ?? null, data ?? null).run()
    .catch((e) => logger.warn({ module: "end-season" }, "set progress", e));
}

async function getGameDate(db: D1Database, leagueId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL ORDER BY game_date DESC LIMIT 1")
    .bind(leagueId).first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "game date", e); return null; });
  return row?.game_date ?? new Date().toISOString();
}

/** Spustí jednu jednotku práce konce sezóny. */
export async function runEndSeasonStep(
  db: D1Database,
  geminiApiKey: string | undefined,
  opts: { leagueId?: string; force?: boolean } = {},
): Promise<EndSeasonStepResult> {
  // 1. Kandidátní senior ligy
  const leaguesRes = await db.prepare(
    `SELECT id FROM leagues WHERE league_type = 'senior'${opts.leagueId ? " AND id = ?" : ""}`,
  ).bind(...(opts.leagueId ? [opts.leagueId] : [])).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "load leagues", e); return { results: [] as { id: string }[] }; });

  const states: LeagueState[] = [];
  for (const l of leaguesRes.results) {
    const st = await getLeagueState(db, l.id);
    if (!st) continue;
    if (!st.complete && !opts.force) continue; // nedohraná liga
    states.push(st);
  }

  if (states.length === 0) {
    return { allDone: true, remainingLeagues: 0, detail: opts.leagueId ? "liga není dohraná (použij force=1)" : "žádná dohraná senior liga" };
  }

  // 2. Najdi první ligu s nedokončenou fází
  let remainingLeagues = 0;
  for (const st of states) {
    let firstPending: Phase | null = null;
    for (const phase of PHASES) {
      const prog = await getProgress(db, st.leagueId, st.seasonNumber, phase);
      if (prog?.status !== "done") { firstPending = phase; break; }
    }
    if (firstPending) {
      remainingLeagues++;
      // zpracuj tuto fázi (případně 1 chunk)
      const status = await runPhase(db, geminiApiKey, st, firstPending);
      return {
        allDone: false,
        leagueId: st.leagueId,
        seasonNumber: st.seasonNumber,
        phase: firstPending,
        status,
        remainingLeagues,
        detail: `${firstPending} → ${status}`,
      };
    }
  }

  // 3. Vše hotovo → globální finalize (uzavřít nereferencované sezóny)
  await db.prepare("UPDATE seasons SET status = 'finished' WHERE status = 'active' AND id NOT IN (SELECT DISTINCT season_id FROM leagues)")
    .run().catch((e) => logger.warn({ module: "end-season" }, "finalize seasons", e));

  return { allDone: true, remainingLeagues: 0, detail: "všechny ligy dokončeny" };
}

async function runPhase(
  db: D1Database,
  geminiApiKey: string | undefined,
  st: LeagueState,
  phase: Phase,
): Promise<"done" | "in_progress" | "error"> {
  const { leagueId, seasonNumber } = st;
  try {
    switch (phase) {
      case "finalize": {
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "rewards": {
        const standings = await calculateStandings(db, leagueId);
        const levelRow = await db.prepare("SELECT level FROM leagues WHERE id = ?").bind(leagueId).first<{ level: string }>()
          .catch((e) => { logger.warn({ module: "end-season" }, "load level", e); return null; });
        const gameDate = await getGameDate(db, leagueId);
        await applySeasonRewards(db, standings, seasonNumber, gameDate, levelRow?.level ?? "okresni_prebor");
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "awards": {
        await generateSeasonAwards(db, geminiApiKey, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "archive": {
        await archiveLeagueSeason(db, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
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
        const allDone = processedSet.size >= teamIds.length;
        await setProgress(db, leagueId, seasonNumber, phase, allDone ? "done" : "pending", JSON.stringify([...processedSet]));
        return allDone ? "done" : "in_progress";
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
      case "articles": {
        await generateSeasonWrapArticle(db, geminiApiKey, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "interviews": {
        await createSeasonWrapInterviews(db, geminiApiKey, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "new_calendar": {
        await rolloverLeague(db, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
    }
  } catch (e) {
    logger.error({ module: "end-season" }, `phase ${phase} failed league=${leagueId}`, e);
    return "error";
  }
  return "error";
}
