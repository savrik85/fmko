/**
 * Ruční založení III. třídy uprostřed sezóny (spec 2026-10-25, část 2: III. třída Prachatice).
 *
 * Automatická III. třída (`district-leagues.ts`) vzniká až s registrací a v běžící sezóně
 * dostane rozpis teprve po rolloveru. Tady se založí hned a s rozpisem na zbytek sezóny:
 *  - 14 obcí okresu bez klubu (žádný tým, ani U21), bez okresního města, od největší,
 *  - plnohodnotné AI kluby (`completeAiClub`: stadion, vybavení, trenér s povahou, čísla dresů,
 *    bydliště) a jejich U21 (`backfillU21ForLeague`, kolo U21 = kolo áčka + 24 h),
 *  - dvoukolový rozpis ve středu a v neděli v 18:00 v Praze, první kolo nejdřív dva dny po
 *    založení, poslední nejpozději s posledním kolem přeboru; co se nevejde, doplní pátky
 *    od konce (nejvýš tři kola týdně), jinak chyba,
 *  - týmy dostanou herní datum a hranice sezóny jako přebor okresu,
 *  - bez postupu a sestupu (`promotion_enabled = 0` u III. třídy i přeboru),
 *  - narovnání `below-league` áčka i U21.
 *
 * Opakované volání po přerušení (limit dotazů Workeru) dokončí rozdělanou ligu: co už je
 * hotové, přeskočí. Nanečisto (`dryRun`) nic nezapíše a vrátí obce, jména klubů a rozpis.
 */

import { applyLeveling, planLeveling, type LevelingPlan, type LevelingResult } from "../ai-clubs/leveling";
import { completeAiClub } from "../ai-clubs/complete-club";
import { FIRSTNAMES } from "../data/czech-names";
import { getDistrictDataFromDB } from "../data/districts";
import { categoryFromVillageSize } from "../generators/create-player";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { generateRemainingSeasonCalendar, type CalendarEntry } from "../season/calendar";
import { generateAITeams } from "./ai-teams";
import { districtLeagueName, LOWER_LEAGUE_MIN_SIZE, LOWER_LEAGUE_SIZE } from "./district-leagues";
import { insertAITeamsIntoDB } from "./insert-ai-teams";
import type { LeagueSetup } from "./league-generator";
import { generateSchedule, totalRounds } from "./schedule";
import { backfillU21ForLeague } from "./u21-generator";

const M = "lower-league-setup";

/** Hrací dny III. třídy (`getUTCDay`): středa a neděle, přebor hraje v pondělí a čtvrtek. */
export const LOWER_LEAGUE_WEEKDAYS = [3, 0];
/** Den, kterým se doplní kola, která se do středy a neděle nevejdou. */
export const LOWER_LEAGUE_EXTRA_WEEKDAY = 5;
/** První kolo nejdřív tolik dní po založení. */
export const FIRST_ROUND_DELAY_DAYS = 2;
const BATCH_SIZE = 80;

/** Chyba, kterou má vidět admin (špatný okres, plno, rozpis se nevejde). */
export class LowerLeagueError extends Error {}

interface VillageRow {
  id: string;
  name: string;
  size: string;
  population: number;
  region: string | null;
}

export interface LevelingStep {
  plan: LevelingPlan;
  result: LevelingResult | null;
}

export interface LowerLeagueResult {
  district: string;
  dryRun: boolean;
  /** Liga už existovala a tohle volání ji dokončilo. */
  resumed: boolean;
  name: string;
  leagueId: string | null;
  u21LeagueId: string | null;
  preborLeagueId: string;
  seasonNumber: number;
  villages: Array<{ id: string; name: string; population: number; size: string }>;
  teams: Array<{ teamId: string | null; name: string; villageId: string }>;
  calendar: {
    rounds: number;
    firstRoundAt: string | null;
    lastRoundAt: string | null;
    /** Nejpozdější možné poslední kolo (poslední kolo přeboru téže sezóny). */
    latestAllowed: string;
    fridayRounds: number;
    entries: Array<{ round: number; scheduledAt: string; matchDay: string }>;
  };
  u21Matches: number;
  promotionDisabled: string[];
  leveling: { senior: LevelingStep | null; u21: LevelingStep | null };
  warnings: string[];
}

/** Obce okresu bez klubu (žádný tým, ani U21), bez okresního a velkého města, od největší. */
export async function pickLowerLeagueVillages(db: D1Database, district: string, count = LOWER_LEAGUE_SIZE): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT v.id FROM villages v
      WHERE v.district = ? AND v.size NOT IN ('small_city', 'city')
        AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.village_id = v.id)
      ORDER BY v.population DESC, v.name
      LIMIT ?`,
  ).bind(district, count).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

async function loadVillages(db: D1Database, ids: readonly string[]): Promise<VillageRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.prepare(
    `SELECT id, name, size, population, region FROM villages WHERE id IN (${ids.map(() => "?").join(", ")})
      ORDER BY population DESC, name`,
  ).bind(...ids).all<VillageRow>();
  return rows.results;
}

async function runInBatches(db: D1Database, stmts: D1PreparedStatement[], label: string): Promise<void> {
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    try {
      await db.batch(stmts.slice(i, i + BATCH_SIZE));
    } catch (e) {
      logger.error({ module: M }, `${label}: dávka ${i}–${i + BATCH_SIZE} selhala`, e);
      throw e;
    }
  }
}

/**
 * Založí (nebo dokončí) III. třídu okresu se 14 AI kluby, U21 a rozpisem na zbytek sezóny.
 * Nanečisto nic nezapíše.
 */
export async function createLowerLeague(
  db: D1Database,
  opts: { district: string; seed: number; dryRun: boolean },
): Promise<LowerLeagueResult> {
  const { district, seed, dryRun } = opts;
  const warnings: string[] = [];

  const season = await db.prepare("SELECT id, number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string; number: number }>();
  if (!season) throw new LowerLeagueError("Není aktivní sezóna.");

  const prebor = await db.prepare(
    `SELECT id, name FROM leagues
      WHERE district = ? AND season_id = ? AND level = 'okresni_prebor'
        AND COALESCE(league_type, 'senior') = 'senior' AND status = 'active'
      LIMIT 1`,
  ).bind(district, season.id).first<{ id: string; name: string }>();
  if (!prebor) throw new LowerLeagueError(`V okrese ${district} se v aktivní sezóně nehraje přebor.`);

  const preborDates = await db.prepare(
    "SELECT MAX(game_date) AS game_date, MAX(season_start) AS season_start, MAX(season_end) AS season_end FROM teams WHERE league_id = ?",
  ).bind(prebor.id).first<{ game_date: string | null; season_start: string | null; season_end: string | null }>();
  const preborLast = await db.prepare(
    `SELECT MAX(sc.scheduled_at) AS last FROM season_calendar sc
      WHERE sc.league_id = ? AND sc.season_number = ?
        AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id)`,
  ).bind(prebor.id, season.number).first<{ last: string | null }>();
  if (!preborLast?.last) throw new LowerLeagueError(`${prebor.name} nemá v sezóně ${season.number} rozpis, III. třída by neměla do kdy hrát.`);
  const gameDate = preborDates?.game_date ?? new Date().toISOString();

  const existing = await db.prepare(
    `SELECT id, name, match_weekdays FROM leagues
      WHERE district = ? AND season_id = ? AND level = 'okresni_soutez' AND COALESCE(league_type, 'senior') = 'senior'
      LIMIT 1`,
  ).bind(district, season.id).first<{ id: string; name: string; match_weekdays: string | null }>();
  // Dokončit jde jen ligu, kterou založila tahle funkce (středa a neděle). Automatickou
  // III. třídu z registrace nepřepisujeme.
  if (existing && existing.match_weekdays !== LOWER_LEAGUE_WEEKDAYS.join(",")) {
    throw new LowerLeagueError(`${existing.name} už v okrese existuje (vznikla registrací), znovu ji nezakládám.`);
  }
  const name = existing?.name ?? districtLeagueName(district, "okresni_soutez");

  const existingTeams = existing
    ? (await db.prepare("SELECT id, name, village_id FROM teams WHERE league_id = ? ORDER BY name").bind(existing.id)
      .all<{ id: string; name: string; village_id: string }>()).results
    : [];
  const villageIds = existingTeams.length > 0 ? existingTeams.map((t) => t.village_id) : await pickLowerLeagueVillages(db, district);
  if (villageIds.length < LOWER_LEAGUE_MIN_SIZE) {
    throw new LowerLeagueError(`Na III. třídu je v okrese ${district} jen ${villageIds.length} obcí bez klubu (potřeba aspoň ${LOWER_LEAGUE_MIN_SIZE}).`);
  }
  if (villageIds.length < LOWER_LEAGUE_SIZE) warnings.push(`Obcí bez klubu je jen ${villageIds.length}, liga bude mít ${villageIds.length} klubů.`);
  const villages = await loadVillages(db, villageIds);

  // Jména a barvy klubů jdou z prvního losování semínka: nanečisto i naostro stejná.
  const rng = createRng(seed);
  const districtData = await getDistrictDataFromDB(db, district);
  const used = await db.prepare(
    "SELECT t.name FROM teams t JOIN leagues l ON l.id = t.league_id WHERE l.district IN (?, ?)",
  ).bind(district, `${district} U21`).all<{ name: string }>();
  const aiTeams = generateAITeams(
    rng,
    villages.map((v) => ({
      name: v.name, code: v.id, region_code: v.region || "CZ031",
      category: categoryFromVillageSize(v.size), population: v.population,
    })),
    villages.length, districtData.surnames, { male: FIRSTNAMES }, new Set(used.results.map((r) => r.name)),
  );

  const existingCalendar = existing
    ? (await db.prepare("SELECT COUNT(*) AS n FROM season_calendar WHERE league_id = ? AND season_number = ?")
      .bind(existing.id, season.number).first<{ n: number }>())?.n ?? 0
    : 0;
  const planCalendar = (leagueId: string): CalendarEntry[] => {
    try {
      return generateRemainingSeasonCalendar({
        leagueId, seasonNumber: season.number,
        from: new Date(new Date(gameDate).getTime() + FIRST_ROUND_DELAY_DAYS * 86_400_000),
        lastDate: new Date(preborLast.last!),
        rounds: totalRounds(villages.length),
        weekdays: LOWER_LEAGUE_WEEKDAYS,
        extraWeekday: LOWER_LEAGUE_EXTRA_WEEKDAY,
      });
    } catch (e) {
      throw new LowerLeagueError(e instanceof Error ? e.message : String(e));
    }
  };

  const result: LowerLeagueResult = {
    district, dryRun, resumed: !!existing, name,
    leagueId: existing?.id ?? null, u21LeagueId: null, preborLeagueId: prebor.id, seasonNumber: season.number,
    villages: villages.map((v) => ({ id: v.id, name: v.name, population: v.population, size: v.size })),
    teams: existingTeams.length > 0
      ? existingTeams.map((t) => ({ teamId: t.id, name: t.name, villageId: t.village_id }))
      : aiTeams.map((t) => ({ teamId: null, name: t.teamName, villageId: t.villageCode })),
    calendar: { rounds: 0, firstRoundAt: null, lastRoundAt: null, latestAllowed: preborLast.last, fridayRounds: 0, entries: [] },
    u21Matches: 0,
    promotionDisabled: [],
    leveling: { senior: null, u21: null },
    warnings,
  };
  const describeCalendar = (entries: Array<{ gameWeek: number; scheduledAt: string; matchDay: string }>) => {
    const sorted = [...entries].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    result.calendar = {
      rounds: sorted.length,
      firstRoundAt: sorted[0]?.scheduledAt ?? null,
      lastRoundAt: sorted[sorted.length - 1]?.scheduledAt ?? null,
      latestAllowed: preborLast.last!,
      fridayRounds: sorted.filter((e) => e.matchDay === "friday").length,
      entries: sorted.map((e) => ({ round: e.gameWeek, scheduledAt: e.scheduledAt, matchDay: e.matchDay })),
    };
  };

  if (dryRun) {
    if (existingCalendar === 0) describeCalendar(planCalendar(existing?.id ?? ""));
    else warnings.push("Rozpis už existuje, nanečisto ho nepřepočítávám.");
    return result;
  }

  // ── Naostro ──
  let leagueId = existing?.id ?? null;
  if (!leagueId) {
    leagueId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO leagues (id, season_id, district, name, level, status, league_type, promotion_enabled, match_weekdays)
       VALUES (?, ?, ?, ?, 'okresni_soutez', 'active', 'senior', 0, ?)`,
    ).bind(leagueId, season.id, district, name, LOWER_LEAGUE_WEEKDAYS.join(",")).run();
    result.leagueId = leagueId;
    logger.info({ module: M }, `${name}: liga založena (${leagueId})`);
  }
  await db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none')").run();

  if (existingTeams.length === 0) {
    const setup: LeagueSetup = {
      name, district, season: String(season.number), level: 1, totalRounds: totalRounds(aiTeams.length),
      teams: aiTeams.map((t) => ({
        teamName: t.teamName, villageName: t.villageName, villageCode: t.villageCode,
        primaryColor: t.primaryColor, secondaryColor: t.secondaryColor, isPlayer: false, aiTeam: t,
      })),
      schedule: [],
    };
    // `category` = velikost obce z DB, podle ní se volí úroveň hráčů (stejně jako v bootstrap-league).
    await insertAITeamsIntoDB(db, leagueId, setup,
      villages.map((v) => ({ code: v.id, name: v.name, population: v.population, category: v.size })), rng, "village", district);
  }
  const teams = (await db.prepare("SELECT id, name, village_id FROM teams WHERE league_id = ? ORDER BY name").bind(leagueId)
    .all<{ id: string; name: string; village_id: string }>()).results;
  if (teams.length < LOWER_LEAGUE_MIN_SIZE) throw new Error(`${name}: vzniklo jen ${teams.length} klubů, zkontroluj log`);
  result.teams = teams.map((t) => ({ teamId: t.id, name: t.name, villageId: t.village_id }));

  for (const t of teams) await completeAiClub(db, t.id);

  if (existingCalendar === 0) {
    const entries = planCalendar(leagueId);
    const calendarByRound = new Map(entries.map((e) => [e.gameWeek, e.id]));
    const stmts: D1PreparedStatement[] = entries.map((e) => db.prepare(
      "INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(e.id, leagueId, season.number, e.gameWeek, e.matchDay, e.scheduledAt));
    for (const m of generateSchedule(rng, teams.length)) {
      const home = teams[m.homeTeamIndex];
      const away = teams[m.awayTeamIndex];
      const calendarId = calendarByRound.get(m.round);
      if (!home || !away || !calendarId) continue;
      stmts.push(db.prepare(
        "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
      ).bind(crypto.randomUUID(), leagueId, calendarId, m.round, home.id, away.id));
    }
    await runInBatches(db, stmts, `${name}: rozpis`);
    describeCalendar(entries);
  } else {
    const rows = await db.prepare("SELECT game_week, scheduled_at, match_day FROM season_calendar WHERE league_id = ? AND season_number = ?")
      .bind(leagueId, season.number).all<{ game_week: number; scheduled_at: string; match_day: string }>();
    describeCalendar(rows.results.map((r) => ({ gameWeek: r.game_week, scheduledAt: r.scheduled_at, matchDay: r.match_day })));
  }

  // Herní čas a hranice sezóny jako přebor okresu (daily tick pak posouvá všechny stejně).
  await db.prepare("UPDATE teams SET game_date = ?, season_start = ?, season_end = ? WHERE league_id = ?")
    .bind(gameDate, preborDates?.season_start ?? null, preborDates?.season_end ?? null, leagueId).run();

  // U21: liga, týmy, kádry a zrcadlový rozpis (kolo U21 = kolo áčka + 24 h). Idempotentní.
  const u21 = await backfillU21ForLeague(db, leagueId, rng);
  result.u21LeagueId = u21.u21LeagueId;
  const u21Teams = (await db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY id").bind(u21.u21LeagueId).all<{ id: string }>()).results;
  for (const t of u21Teams) await completeAiClub(db, t.id);
  const preborU21 = await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21' LIMIT 1")
    .bind(prebor.id).first<{ id: string }>();
  const u21Dates = preborU21
    ? await db.prepare("SELECT MAX(game_date) AS game_date, MAX(season_start) AS season_start, MAX(season_end) AS season_end FROM teams WHERE league_id = ?")
      .bind(preborU21.id).first<{ game_date: string | null; season_start: string | null; season_end: string | null }>()
    : null;
  await db.prepare(
    "UPDATE teams SET game_date = ?, season_start = COALESCE(?, season_start), season_end = COALESCE(?, season_end) WHERE league_id = ?",
  ).bind(u21Dates?.game_date ?? gameDate, u21Dates?.season_start ?? null, u21Dates?.season_end ?? null, u21.u21LeagueId).run();
  result.u21Matches = (await db.prepare("SELECT COUNT(*) AS n FROM matches WHERE league_id = ?").bind(u21.u21LeagueId).first<{ n: number }>())?.n ?? 0;

  // Bez postupu a sestupu mezi přeborem a III. třídou (district-promotion, sliby sponzorům).
  await db.prepare("UPDATE leagues SET promotion_enabled = 0 WHERE id IN (?, ?)").bind(leagueId, prebor.id).run();
  result.promotionDisabled = [leagueId, prebor.id];

  // Narovnání: síla mezi nejslabším klubem přeboru minus 12 a nejslabším klubem přeboru.
  const seniorPlan = await planLeveling(db, { leagueId, mode: "below-league", seed });
  result.leveling.senior = { plan: seniorPlan, result: await applyLeveling(db, seniorPlan) };
  const u21Plan = await planLeveling(db, { leagueId: u21.u21LeagueId, mode: "below-league", seed: (seed + 1) >>> 0 });
  result.leveling.u21 = { plan: u21Plan, result: await applyLeveling(db, u21Plan) };
  for (const w of [...seniorPlan.warnings, ...u21Plan.warnings]) warnings.push(w);

  logger.info({ module: M }, `${name}: ${teams.length} klubů, ${result.calendar.rounds} kol (${result.calendar.firstRoundAt} až ${result.calendar.lastRoundAt}), U21 ${result.u21Matches} zápasů`);
  return result;
}
