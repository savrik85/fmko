/**
 * Rollover ligy do nové sezóny — nový kalendář + rozpis pro STEJNÉ týmy.
 *
 * Číslo sezóny je per-liga = MAX(season_calendar.season_number). Nová = +1.
 * Staré zápasy/kalendář zůstávají (historie); season-aware standings je ignoruje.
 *
 * Mirror logiky z bootstrap-league (game.ts), ale BEZ tvorby AI týmů.
 * Jen senior ligy (U21 má vlastní lifecycle — mimo rozsah).
 */

import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";

export interface RolloverResult {
  newSeasonNumber: number;
  matchesCreated: number;
  skipped?: string;
}

export async function rolloverLeague(
  db: D1Database,
  leagueId: string,
  currentSeasonNumber: number,
): Promise<RolloverResult> {
  const newNum = currentSeasonNumber + 1;

  // Idempotence: už má nová sezóna kalendář?
  const existsCal = await db.prepare("SELECT 1 FROM season_calendar WHERE league_id = ? AND season_number = ? LIMIT 1")
    .bind(leagueId, newNum).first()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "guard", e); return null; });
  if (existsCal) return { newSeasonNumber: newNum, matchesCreated: 0, skipped: "already rolled" };

  // Nová sezóna v tabulce seasons (number UNIQUE → IGNORE pokud už existuje)
  const seasonId = `season-${newNum}`;
  await db.prepare("INSERT OR IGNORE INTO seasons (id, number, status) VALUES (?, ?, 'active')")
    .bind(seasonId, newNum).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "insert season", e));
  await db.prepare("UPDATE leagues SET season_id = ? WHERE id = ?").bind(seasonId, leagueId).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "repoint league season", e));

  const teamsRes = await db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY name").bind(leagueId).all()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "load teams", e); return { results: [] as Record<string, unknown>[] }; });
  const teamIds = teamsRes.results.map((r) => r.id as string);
  if (teamIds.length < 2) {
    logger.warn({ module: "season-rollover" }, `league ${leagueId} has <2 teams, skip schedule`);
    return { newSeasonNumber: newNum, matchesCreated: 0, skipped: "not enough teams" };
  }

  const { generateSchedule, totalRounds } = await import("../league/schedule");
  const { generateSeasonCalendar } = await import("./calendar");
  const rng = createRng(cryptoSeed());

  const schedule = generateSchedule(rng, teamIds.length);
  void totalRounds; // počet kol je implicitní v rozpisu
  const calendar = generateSeasonCalendar(leagueId, newNum, new Date());

  // Kalendář
  for (const entry of calendar.entries) {
    await db.prepare(
      "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(entry.id, leagueId, newNum, entry.gameWeek, entry.matchDay, entry.scheduledAt).run()
      .catch((e) => logger.warn({ module: "season-rollover" }, "insert calendar", e));
  }

  const calByWeek = new Map<number, string>();
  for (const entry of calendar.entries) if (!calByWeek.has(entry.gameWeek)) calByWeek.set(entry.gameWeek, entry.id);

  // Zápasy
  let matchesCreated = 0;
  for (const match of schedule) {
    if (match.homeTeamIndex >= teamIds.length || match.awayTeamIndex >= teamIds.length) continue;
    const calId = calByWeek.get(match.round) ?? null;
    const res = await db.prepare(
      "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), leagueId, calId, match.round, teamIds[match.homeTeamIndex], teamIds[match.awayTeamIndex]).run()
      .catch((e) => { logger.warn({ module: "season-rollover" }, "insert match", e); return null; });
    if (res) matchesCreated++;
  }

  // Reset game_date (sync na globální max z ostatních lig) + season bounds
  if (calendar.entries.length > 0) {
    const globalDate = await db.prepare(
      "SELECT MAX(game_date) as max_date FROM teams WHERE game_date IS NOT NULL AND league_id != ?",
    ).bind(leagueId).first<{ max_date: string }>()
      .catch((e) => { logger.warn({ module: "season-rollover" }, "load global game_date", e); return null; });
    const firstMatch = new Date(calendar.entries[0].scheduledAt);
    firstMatch.setDate(firstMatch.getDate() - 1);
    const initDate = globalDate?.max_date && globalDate.max_date > firstMatch.toISOString()
      ? globalDate.max_date
      : firstMatch.toISOString();
    await db.prepare("UPDATE teams SET game_date = ?, season_start = ?, season_end = ? WHERE league_id = ?")
      .bind(initDate, calendar.autumnStart, calendar.seasonEnd, leagueId).run()
      .catch((e) => logger.warn({ module: "season-rollover" }, "reset team dates", e));
  }

  logger.info({ module: "season-rollover" }, `rolled league=${leagueId} → season ${newNum}, ${matchesCreated} matches`);
  return { newSeasonNumber: newNum, matchesCreated };
}
