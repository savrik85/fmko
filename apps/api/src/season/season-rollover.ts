/**
 * GLOBÁLNÍ rollover do nové sezóny — všechny senior ligy NAJEDNOU.
 *
 * Jedna nová globální sezóna (`seasons`), synchronizovaný start kalendáře a
 * sdílený `game_date` napříč všemi ligami (sezóna je globální, ne per-liga).
 * Staré zápasy/kalendář zůstávají (historie); season-aware standings je ignoruje.
 *
 * Mirror logiky z bootstrap-league (game.ts), BEZ tvorby AI týmů.
 * U21 mimo rozsah (vlastní lifecycle — follow-up).
 */

import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";

export interface GlobalRolloverResult {
  newSeasonNumber: number;
  rolledLeagues: number;
  matchesCreated: number;
}

export async function rolloverAllLeagues(
  db: D1Database,
  oldSeasonNumber: number,
): Promise<GlobalRolloverResult> {
  const newNum = oldSeasonNumber + 1;
  const seasonId = `season-${newNum}`;

  // 1. Jedna nová globální sezóna (number UNIQUE → IGNORE pokud existuje).
  //    Explicitně aktivovat — i kdyby řádek existoval jako finished z dřívějška.
  await db.prepare("INSERT OR IGNORE INTO seasons (id, number, status) VALUES (?, ?, 'active')")
    .bind(seasonId, newNum).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "insert season", e));
  await db.prepare("UPDATE seasons SET status = 'active' WHERE number = ?")
    .bind(newNum).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "activate season", e));

  // 2. Synchronizovaný start — navázat na současný globální game_date
  const gdRow = await db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL")
    .first<{ d: string | null }>()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "load global game_date", e); return null; });
  const startDate = gdRow?.d ? new Date(gdRow.d) : new Date();

  // 3. Roll každou senior ligu se SDÍLENÝM startem
  const leagues = await db.prepare("SELECT id FROM leagues WHERE league_type = 'senior'").all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "load leagues", e); return { results: [] as { id: string }[] }; });

  let rolledLeagues = 0;
  let matchesCreated = 0;
  for (const l of leagues.results) {
    const r = await rolloverLeagueCalendar(db, l.id, newNum, seasonId, startDate);
    if (r.rolled) { rolledLeagues++; matchesCreated += r.matchesCreated; }
  }

  // 4. Uzavřít starou sezónu
  await db.prepare("UPDATE seasons SET status = 'finished' WHERE number = ? AND status = 'active'")
    .bind(oldSeasonNumber).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "finish old season", e));

  logger.info({ module: "season-rollover" }, `global rollover → sezóna ${newNum}, ${rolledLeagues} lig, ${matchesCreated} zápasů`);
  return { newSeasonNumber: newNum, rolledLeagues, matchesCreated };
}

async function rolloverLeagueCalendar(
  db: D1Database,
  leagueId: string,
  newNum: number,
  seasonId: string,
  startDate: Date,
): Promise<{ rolled: boolean; matchesCreated: number }> {
  // Idempotence: už má nová sezóna kalendář?
  const exists = await db.prepare("SELECT 1 FROM season_calendar WHERE league_id = ? AND season_number = ? LIMIT 1")
    .bind(leagueId, newNum).first()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "guard", e); return null; });
  if (exists) return { rolled: false, matchesCreated: 0 };

  await db.prepare("UPDATE leagues SET season_id = ? WHERE id = ?").bind(seasonId, leagueId).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "repoint league season", e));

  const teamsRes = await db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY name").bind(leagueId).all()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "load teams", e); return { results: [] as Record<string, unknown>[] }; });
  const teamIds = teamsRes.results.map((r) => r.id as string);
  if (teamIds.length < 2) return { rolled: false, matchesCreated: 0 };

  const { generateSchedule } = await import("../league/schedule");
  const { generateSeasonCalendar } = await import("./calendar");
  const rng = createRng(cryptoSeed());

  const schedule = generateSchedule(rng, teamIds.length);
  const calendar = generateSeasonCalendar(leagueId, newNum, new Date(startDate));

  for (const entry of calendar.entries) {
    await db.prepare(
      "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(entry.id, leagueId, newNum, entry.gameWeek, entry.matchDay, entry.scheduledAt).run()
      .catch((e) => logger.warn({ module: "season-rollover" }, "insert calendar", e));
  }

  const calByWeek = new Map<number, string>();
  for (const entry of calendar.entries) if (!calByWeek.has(entry.gameWeek)) calByWeek.set(entry.gameWeek, entry.id);

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

  // game_date + hranice sezóny — JEDNOTNĚ napříč ligami (stejný startDate → stejný kalendář týden 1)
  if (calendar.entries.length > 0) {
    const firstMatch = new Date(calendar.entries[0].scheduledAt);
    firstMatch.setDate(firstMatch.getDate() - 1);
    await db.prepare("UPDATE teams SET game_date = ?, season_start = ?, season_end = ? WHERE league_id = ?")
      .bind(firstMatch.toISOString(), calendar.autumnStart, calendar.seasonEnd, leagueId).run()
      .catch((e) => logger.warn({ module: "season-rollover" }, "set team dates", e));
  }

  return { rolled: true, matchesCreated };
}
