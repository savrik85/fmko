/**
 * Recap konce sezóny — per-tým snapshot pro obrazovku, co manažerovi naskočí
 * po přihlášení po přelomu sezóny.
 *
 * Departures se zachytí během fáze departures (captureDepartures), zbytek
 * (umístění, odměna, ocenění, trofej, statistiky) sestaví buildTeamRecap
 * ve fázi recap z league_history (jeden archivní zdroj) + transactions.
 */

import { logger } from "../lib/logger";
import type { TeamDeparturesResult } from "./season-departures";

const M = "season-recap";

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** Zachytí odchody týmu do recap snapshotu (volá fáze departures). */
export async function captureDepartures(
  db: D1Database,
  teamId: string,
  seasonNumber: number,
  result: TeamDeparturesResult,
): Promise<void> {
  const existing = await db.prepare("SELECT data FROM season_recap WHERE team_id = ? AND season_number = ?")
    .bind(teamId, seasonNumber).first<{ data: string }>()
    .catch((e) => { logger.warn({ module: M }, "load recap for departures", e); return null; });
  const data = parseJson<Record<string, unknown>>(existing?.data, {});
  data.departures = result.departures.map((d) => ({ name: d.name, age: d.age, position: d.position, kind: d.kind, reason: d.reason, wasCaptain: d.wasCaptain }));
  data.agedCount = result.agedCount;
  await db.prepare(
    "INSERT INTO season_recap (team_id, season_number, data, seen) VALUES (?, ?, ?, 0) ON CONFLICT(team_id, season_number) DO UPDATE SET data = excluded.data",
  ).bind(teamId, seasonNumber, JSON.stringify(data)).run()
    .catch((e) => logger.warn({ module: M }, "upsert departures", e));
}

interface StandingRow { pos: number; teamId: string; teamName: string }
interface BestElevenEntry { playerId: string; name: string; position: string; teamName: string }

/** Sestaví kompletní recap pro lidský tým (volá fáze recap, PŘED rolloverem). */
export async function buildTeamRecap(
  db: D1Database,
  teamId: string,
  leagueId: string,
  seasonNumber: number,
): Promise<void> {
  const lh = await db.prepare("SELECT final_standings, awards, season_stats FROM league_history WHERE league_id = ? AND season_number = ?")
    .bind(leagueId, seasonNumber).first<{ final_standings: string; awards: string | null; season_stats: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load league_history", e); return null; });
  if (!lh) { logger.warn({ module: M }, `no league_history for league=${leagueId} s=${seasonNumber}`); return; }

  const finalStandings = parseJson<StandingRow[]>(lh.final_standings, []);
  const awards = parseJson<Record<string, any>>(lh.awards, {});
  const seasonStats = parseJson<Record<string, unknown>>(lh.season_stats, {});

  const team = await db.prepare("SELECT name, primary_color, secondary_color, trophies FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; primary_color: string; secondary_color: string; trophies: string }>()
    .catch((e) => { logger.warn({ module: M }, "load team", e); return null; });
  if (!team) return;

  const leagueName = (await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, "load league name", e); return null; }))?.name ?? "Liga";

  const myEntry = finalStandings.find((s) => s.teamId === teamId);
  const pos = myEntry?.pos ?? null;
  const totalTeams = finalStandings.length;

  const rewardRow = await db.prepare("SELECT amount FROM transactions WHERE reference_id = ? LIMIT 1")
    .bind(`season-${seasonNumber}-rwd-${teamId}`).first<{ amount: number }>()
    .catch((e) => { logger.warn({ module: M }, "load reward", e); return null; });
  const reward = rewardRow?.amount ?? 0;
  const repDelta = pos ? Math.round((totalTeams / 2 - pos + 0.5) * 1.5) : 0;

  const trophies = parseJson<Array<Record<string, unknown>>>(team.trophies, []);
  const trophy = trophies.find((t) => t.seasonNumber === seasonNumber && t.leagueId === leagueId) ?? null;

  const existing = await db.prepare("SELECT data FROM season_recap WHERE team_id = ? AND season_number = ?")
    .bind(teamId, seasonNumber).first<{ data: string }>()
    .catch((e) => { logger.warn({ module: M }, "load existing recap", e); return null; });
  const prev = parseJson<Record<string, unknown>>(existing?.data, {});

  const bestEleven = (awards.bestEleven as BestElevenEntry[]) ?? [];
  const bestElevenMine = bestEleven.filter((p) => p.teamName === team.name);
  const championIsMe = awards.champion?.teamId === teamId || finalStandings[0]?.teamId === teamId;

  const data = {
    seasonNumber,
    newSeasonNumber: seasonNumber + 1,
    leagueName,
    teamName: team.name,
    primaryColor: team.primary_color || "#2D5F2D",
    secondaryColor: team.secondary_color || "#FFFFFF",
    finalPos: pos,
    totalTeams,
    champion: { name: awards.champion?.name ?? finalStandings[0]?.teamName ?? "?", isMe: championIsMe },
    reward,
    repDelta,
    departures: prev.departures ?? [],
    agedCount: prev.agedCount ?? 0,
    awards: {
      playerOfSeason: awards.playerOfSeason ?? null,
      topScorer: awards.topScorer ?? null,
      managerOfSeason: awards.managerOfSeason ?? null,
      discovery: awards.discovery ?? null,
      bestEleven,
      bestElevenMine,
    },
    trophy,
    seasonStats,
  };

  await db.prepare(
    "INSERT INTO season_recap (team_id, season_number, data, seen) VALUES (?, ?, ?, 0) ON CONFLICT(team_id, season_number) DO UPDATE SET data = excluded.data, seen = 0",
  ).bind(teamId, seasonNumber, JSON.stringify(data)).run()
    .catch((e) => logger.warn({ module: M }, "upsert recap", e));

  logger.info({ module: M }, `recap built team=${teamId} s=${seasonNumber} pos=${pos}`);
}
