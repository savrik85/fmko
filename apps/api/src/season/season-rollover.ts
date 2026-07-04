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

  // 2. SYNCHRONIZACE S REÁLNÝM KALENDÁŘEM — nová sezóna se kotví na REÁLNÉ dnešní datum (ne na
  // herní game_date, které nese starý posun). Zároveň se vynuluje game_clock offset → herní datum
  // = reálné datum a rozpis (po/čt/so) sedí 1:1 se skutečným kalendářem.
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0));
  await db.prepare("INSERT INTO game_clock (id, offset_days) VALUES (1, 0) ON CONFLICT(id) DO UPDATE SET offset_days = 0").run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "reset game clock offset", e));

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

  // 5. Celorepublikový pohár pro novou sezónu (kola na soboty, finále na konci ligy).
  try {
    const { createCup } = await import("../cup/cup");
    await createCup(db, newNum);
  } catch (e) { logger.warn({ module: "season-rollover" }, "create cup on rollover failed", e); }

  // 6. Uvítání do nové sezóny pro všechny lidské týmy → obrazovka /nova-sezona (INSERT OR IGNORE = idempotentní).
  await db.prepare(
    "INSERT OR IGNORE INTO season_welcome (team_id, season_number, seen) SELECT id, ?, 0 FROM teams WHERE user_id != 'ai' AND team_type = 'senior'",
  ).bind(newNum).run().catch((e) => logger.warn({ module: "season-rollover" }, "create season welcome", e));

  // 7. U21: nová sezóna i pro mládež — repoint season_id, nový rozpis (šetrná regenerace maže jen
  //    cílovou sezónu) a stárnutí hráčů +1 (idempotentně přes marker v season_end_progress).
  try {
    const { regenerateU21Schedule } = await import("../league/u21-generator");
    const u21Leagues = await db.prepare("SELECT id FROM leagues WHERE league_type = 'u21'").all<{ id: string }>()
      .catch((e) => { logger.warn({ module: "season-rollover" }, "load u21 leagues", e); return { results: [] as { id: string }[] }; });
    for (const ul of u21Leagues.results) {
      await db.prepare("UPDATE leagues SET season_id = ? WHERE id = ?").bind(seasonId, ul.id).run()
        .catch((e) => logger.warn({ module: "season-rollover" }, "repoint u21 season", e));
      // Idempotence: přeskoč, když už U21 liga má rozpis nové sezóny se zápasy
      const has = await db.prepare(
        "SELECT 1 FROM season_calendar sc WHERE sc.league_id = ? AND sc.season_number = ? AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id) LIMIT 1",
      ).bind(ul.id, newNum).first().catch((e) => { logger.warn({ module: "season-rollover" }, "u21 guard", e); return null; });
      if (!has) await regenerateU21Schedule(db, ul.id, createRng(cryptoSeed()), startDate);
    }
    // Stárnutí U21 hráčů (+1) — jednou za rollover (marker), senior kádry řeší fáze departures.
    const agedMark = await db.prepare("SELECT status FROM season_end_progress WHERE league_id = '__u21__' AND season_number = ? AND phase = 'u21_aging'")
      .bind(newNum).first<{ status: string }>().catch((e) => { logger.warn({ module: "season-rollover" }, "u21 aging marker", e); return { status: "done" }; });
    if (agedMark?.status !== "done") {
      await db.prepare("UPDATE players SET age = age + 1 WHERE team_id IN (SELECT id FROM teams WHERE team_type = 'u21')").run()
        .catch((e) => logger.warn({ module: "season-rollover" }, "u21 aging", e));
      await db.prepare("INSERT INTO season_end_progress (league_id, season_number, phase, status, updated_at) VALUES ('__u21__', ?, 'u21_aging', 'done', strftime('%Y-%m-%dT%H:%M:%SZ','now')) ON CONFLICT(league_id, season_number, phase) DO UPDATE SET status = 'done'")
        .bind(newNum).run().catch((e) => logger.warn({ module: "season-rollover" }, "u21 aging marker save", e));
    }
  } catch (e) { logger.warn({ module: "season-rollover" }, "u21 rollover failed", e); }

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
  // Idempotence: rollover je HOTOVÝ jen když existují ZÁPASY nové sezóny (kalendář sám nestačí —
  // pád mezi vložením kalendáře a zápasů by jinak nechal ligu tiše bez zápasů).
  const hasMatches = await db.prepare("SELECT 1 FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE sc.league_id = ? AND sc.season_number = ? LIMIT 1")
    .bind(leagueId, newNum).first()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "guard matches", e); return null; });
  if (hasMatches) return { rolled: false, matchesCreated: 0 };
  // Uklidit částečný stav z předchozího spadlého pokusu (kalendář bez zápasů) → čistá regenerace.
  await db.prepare("DELETE FROM matches WHERE calendar_id IN (SELECT id FROM season_calendar WHERE league_id = ? AND season_number = ?)").bind(leagueId, newNum).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "cleanup partial matches", e));
  await db.prepare("DELETE FROM season_calendar WHERE league_id = ? AND season_number = ?").bind(leagueId, newNum).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "cleanup partial calendar", e));

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
  // Krátká předsezóna — generátor sám posune o +2 dny a snapne na ligové pondělí,
  // takže první zápas padne 2-8 dní po konci sezóny (max ~týden, žádných 10-15 dní čekání).
  const calendar = generateSeasonCalendar(leagueId, newNum, startDate);

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

  // game_date + hranice sezóny — JEDNOTNĚ napříč ligami. Den 1 = startDate = REÁLNÉ dnešní datum
  // (offset 0 → denní tick drží herní datum 1:1 s realitou); první zápas je ~týden po startu (předsezóna).
  if (calendar.entries.length > 0) {
    await db.prepare("UPDATE teams SET game_date = ?, season_start = ?, season_end = ? WHERE league_id = ?")
      .bind(startDate.toISOString(), startDate.toISOString(), calendar.seasonEnd, leagueId).run()
      .catch((e) => logger.warn({ module: "season-rollover" }, "set team dates", e));
  }

  return { rolled: true, matchesCreated };
}
