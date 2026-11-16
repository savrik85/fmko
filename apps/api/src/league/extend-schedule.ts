/**
 * Rozšíření jednokolového rozpisu ligy na plné dvoukolo.
 *
 * Ligy založené registrací uprostřed sezóny dostávaly do 2026-11-16 jen jednokolový rozpis
 * (každý s každým jednou). Tahle oprava jim dá stejných 2·(N−1) kol jako ostatním:
 * odehraná a právě hraná kola nechá, zbylá kola první poloviny posune na dřívější termíny
 * (hrací dny ligy a soboty, nejvýš tři kola týdně) a přidá odvety s obráceným domácím
 * prostředím. U21 liga dostane totéž den po áčku.
 *
 * Jde pustit opakovaně: hotovou ligu pozná a jen dozrcadlí U21, kdyby minule spadla.
 */

import { logger } from "../lib/logger";
import { generateRemainingSeasonCalendar, parseMatchWeekdays, type CalendarEntry } from "../season/calendar";
import { getRunningSeason } from "./district-leagues";
import { MID_SEASON_EXTRA_WEEKDAY } from "./mid-season-schedule";
import { totalRounds } from "./schedule";
import { mirrorScheduleToU21 } from "./u21-generator";

const M = "extend-schedule";
const DAY_MS = 86_400_000;
/** Kolo, které se hraje dřív než za tolik hodin, už se nepřesouvá (sestavy, delegace sudích). */
const FIXED_WINDOW_HOURS = 24;

interface RoundRow {
  id: string;
  game_week: number;
  scheduled_at: string;
  status: string;
}

interface MatchRow {
  calendar_id: string;
  home_team_id: string;
  away_team_id: string;
}

export interface MovedRound { gameWeek: number; from: string; to: string }

export interface ExtendResult {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  teams?: number;
  roundsBefore?: number;
  roundsAfter?: number;
  /** Kola, která zůstala na svém termínu (odehraná nebo těsně před výkopem). */
  fixedRounds?: number;
  moved?: MovedRound[];
  added?: { gameWeek: number; at: string }[];
  matchesAdded?: number;
  u21?: { leagueId: string; roundsMoved: number; roundsAdded: number; matchesAdded: number } | null;
}

function fail(reason: string, dryRun: boolean): ExtendResult {
  return { ok: false, reason, dryRun };
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Rozšíří jednokolový rozpis seniorské ligy (a její U21) na dvoukolo. */
export async function extendLeagueToDouble(
  db: D1Database, leagueId: string, opts: { dryRun: boolean; now?: Date },
): Promise<ExtendResult> {
  const { dryRun } = opts;
  const now = opts.now ?? new Date();

  const league = await db.prepare(
    `SELECT l.id, l.match_weekdays, COALESCE(l.league_type, 'senior') AS league_type, s.number AS season_number
       FROM leagues l JOIN seasons s ON s.id = l.season_id WHERE l.id = ?`,
  ).bind(leagueId).first<{ id: string; match_weekdays: string | null; league_type: string; season_number: number }>();
  if (!league) return fail("Soutěž nenalezena.", dryRun);
  if (league.league_type !== "senior") return fail("Rozšířit jde jen seniorskou soutěž, U21 se dozrcadlí sama.", dryRun);

  const teamRows = await db.prepare("SELECT id FROM teams WHERE league_id = ?").bind(leagueId).all<{ id: string }>();
  const teamCount = teamRows.results.length;
  if (teamCount < 2 || teamCount % 2 !== 0) return fail(`Soutěž má ${teamCount} klubů, rozšíření umí jen sudý počet.`, dryRun);
  const half = teamCount - 1;
  const full = totalRounds(teamCount);

  const loadRounds = (id: string) => db.prepare(
    `SELECT id, game_week, scheduled_at, status FROM season_calendar
      WHERE league_id = ? AND season_number = ? ORDER BY game_week`,
  ).bind(id, league.season_number).all<RoundRow>().then((r) => r.results);

  const u21 = await db.prepare(
    "SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21' AND status = 'active' LIMIT 1",
  ).bind(leagueId).first<{ id: string }>();

  const rounds = await loadRounds(leagueId);

  // Hotovo z minula: zbývá nanejvýš dozrcadlit U21, když zápis spadl mezi áčkem a dorostem.
  if (rounds.length === full) {
    if (!u21) return fail("Soutěž už dvoukolový rozpis má.", dryRun);
    const u21Rounds = await loadRounds(u21.id);
    if (u21Rounds.length >= full) return fail("Soutěž už dvoukolový rozpis má.", dryRun);
    if (u21Rounds.length !== half) return fail(`U21 má ${u21Rounds.length} kol, čekal jsem ${half} nebo ${full}.`, dryRun);
    const mirrored = dryRun ? { calendarEntries: half, matches: half * (teamCount / 2) }
      : await mirrorScheduleToU21(db, leagueId, u21.id, half + 1);
    return {
      ok: true, dryRun, teams: teamCount, roundsBefore: full, roundsAfter: full,
      u21: { leagueId: u21.id, roundsMoved: 0, roundsAdded: mirrored.calendarEntries, matchesAdded: mirrored.matches },
    };
  }

  if (rounds.length !== half || rounds.some((r, i) => r.game_week !== i + 1)) {
    return fail(`Soutěž má ${rounds.length} kol, jednokolový rozpis by jich měl ${half}.`, dryRun);
  }

  const matches = (await db.prepare(
    `SELECT m.calendar_id, m.home_team_id, m.away_team_id FROM matches m
       JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE sc.league_id = ? AND sc.season_number = ?`,
  ).bind(leagueId, league.season_number).all<MatchRow>()).results;
  const pairs = new Set(matches.map((m) => pairKey(m.home_team_id, m.away_team_id)));
  const expectedPairs = (teamCount * half) / 2;
  if (matches.length !== expectedPairs || pairs.size !== expectedPairs) {
    return fail(`Rozpis není čistě jednokolový: ${matches.length} zápasů, ${pairs.size} různých dvojic, čekal jsem ${expectedPairs}.`, dryRun);
  }

  // Co se už nehýbe: odehraná kola a kolo těsně před výkopem. Musí to být začátek rozpisu.
  const fixedUntil = now.getTime() + FIXED_WINDOW_HOURS * 3_600_000;
  const isFixed = (r: RoundRow) => r.status !== "scheduled" || Date.parse(r.scheduled_at) <= fixedUntil;
  const fixedCount = rounds.filter(isFixed).length;
  if (rounds.slice(0, fixedCount).some((r) => !isFixed(r))) {
    return fail("Odehraná kola netvoří souvislý začátek rozpisu, tohle ručně.", dryRun);
  }

  const running = await getRunningSeason(db, league.season_number);
  if (!running?.lastMatchAt) return fail("Nejde zjistit poslední kolo běžící sezóny.", dryRun);

  const lastFixedAt = fixedCount > 0 ? Date.parse(rounds[fixedCount - 1].scheduled_at) : 0;
  const from = new Date(Math.max(fixedUntil, lastFixedAt + DAY_MS));
  let slots: CalendarEntry[];
  try {
    slots = generateRemainingSeasonCalendar({
      leagueId, seasonNumber: league.season_number, from, lastDate: new Date(running.lastMatchAt),
      rounds: full - fixedCount, weekdays: parseMatchWeekdays(league.match_weekdays),
      extraWeekday: MID_SEASON_EXTRA_WEEKDAY,
    });
  } catch (e) {
    logger.warn({ module: M }, `liga ${leagueId}: dvoukolo se do konce sezóny nevejde`, e);
    return fail(e instanceof Error ? e.message : "Dvoukolo se do konce sezóny nevejde.", dryRun);
  }

  const moved: MovedRound[] = [];
  const statements: D1PreparedStatement[] = [];
  for (let i = fixedCount; i < half; i++) {
    const slot = slots[i - fixedCount];
    if (slot.scheduledAt === rounds[i].scheduled_at) continue;
    moved.push({ gameWeek: rounds[i].game_week, from: rounds[i].scheduled_at, to: slot.scheduledAt });
    statements.push(db.prepare("UPDATE season_calendar SET scheduled_at = ?, match_day = ? WHERE id = ? AND status = 'scheduled'")
      .bind(slot.scheduledAt, slot.matchDay, rounds[i].id));
  }

  // Odvety: kolo r + (N−1) je kolo r s obráceným domácím prostředím, stejně jako v `generateSchedule`.
  const added: { gameWeek: number; at: string }[] = [];
  const matchesByRound = new Map<string, MatchRow[]>();
  for (const m of matches) matchesByRound.set(m.calendar_id, [...(matchesByRound.get(m.calendar_id) ?? []), m]);
  let matchesAdded = 0;
  for (let i = 0; i < half; i++) {
    const slot = slots[half - fixedCount + i];
    const gameWeek = half + i + 1;
    added.push({ gameWeek, at: slot.scheduledAt });
    statements.push(db.prepare(
      "INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(slot.id, leagueId, league.season_number, gameWeek, slot.matchDay, slot.scheduledAt));
    for (const m of matchesByRound.get(rounds[i].id) ?? []) {
      statements.push(db.prepare(
        "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
      ).bind(crypto.randomUUID(), leagueId, slot.id, gameWeek, m.away_team_id, m.home_team_id));
      matchesAdded++;
    }
  }

  // U21 hraje den po áčku: posunutá kola se posunou s ním, odvety se dozrcadlí po zápisu áčka.
  let u21Moved = 0;
  let u21Rounds: RoundRow[] = [];
  if (u21) {
    u21Rounds = await loadRounds(u21.id);
    if (u21Rounds.length !== half) return fail(`U21 má ${u21Rounds.length} kol, čekal jsem ${half}.`, dryRun);
    for (const mv of moved) {
      const row = u21Rounds[mv.gameWeek - 1];
      if (row.status !== "scheduled") return fail(`U21 kolo ${mv.gameWeek} už se hraje, áčko by se mu vzdálilo.`, dryRun);
      const at = new Date(Date.parse(mv.to) + DAY_MS);
      statements.push(db.prepare("UPDATE season_calendar SET scheduled_at = ?, match_day = ? WHERE id = ? AND status = 'scheduled'")
        .bind(at.toISOString(), U21_DAY_NAMES[at.getUTCDay()], row.id));
      u21Moved++;
    }
  }

  const result: ExtendResult = {
    ok: true, dryRun, teams: teamCount, roundsBefore: half, roundsAfter: full, fixedRounds: fixedCount,
    moved, added, matchesAdded,
    u21: u21 ? { leagueId: u21.id, roundsMoved: u21Moved, roundsAdded: half, matchesAdded: half * (teamCount / 2) } : null,
  };
  if (dryRun) return result;

  // Jedna dávka = jedna transakce: buď se áčko přepíše celé, nebo vůbec.
  await db.batch(statements);
  logger.info({ module: M }, `liga ${leagueId}: rozpis rozšířen na ${full} kol, posunuto ${moved.length}, přidáno ${added.length} kol a ${matchesAdded} zápasů`);

  if (u21) {
    const mirrored = await mirrorScheduleToU21(db, leagueId, u21.id, half + 1);
    result.u21 = { leagueId: u21.id, roundsMoved: u21Moved, roundsAdded: mirrored.calendarEntries, matchesAdded: mirrored.matches };
  }
  return result;
}

const U21_DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
