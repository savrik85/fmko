/**
 * Rozpis pro ligu, která vznikla registrací uprostřed běžící sezóny (první klub v novém
 * okrese). Dřív taková liga čekala bez zápasů v přípravném období až do rolloveru, klidně
 * dva měsíce.
 *
 * Teď dostane rozpis na zbytek sezóny (stejný generátor jako ručně zakládaná III. třída,
 * `season/calendar.ts`): dvoukolově, když se dvě kola do posledního kola sezóny vejdou,
 * jinak jednokolově (každý s každým jednou). Když do konce sezóny zbývá méně než osm
 * hracích dnů nebo se nevejde ani jedno kolo, zůstává přípravné období a onboarding to
 * hráči řekne předem (`districtStartInfo`).
 */

import { logger } from "../lib/logger";
import {
  DEFAULT_MATCH_WEEKDAYS, generateRemainingSeasonCalendar, isSeniorHolidayBlocked, setPrague18, type CalendarEntry,
} from "../season/calendar";
import type { Rng } from "../generators/rng";
import { getRunningSeason, LOWER_LEAGUE_SIZE, resolveDistrictSlot } from "./district-leagues";
import { generateSchedule, totalRounds, type ScheduledMatch } from "./schedule";

const M = "mid-season-schedule";
const DAY_MS = 86_400_000;

/** Méně hracích dnů do konce sezóny = liga už nezačne a čeká na novou sezónu. */
export const MIN_MATCH_DAYS_FOR_SCHEDULE = 8;
/** První kolo nejdřív tolik dní po založení ligy (sestava, seznámení s kádrem). */
export const FIRST_ROUND_DELAY_DAYS = 2;
/** Liga z registrace hraje jen ve svých hracích dnech, žádný den navíc (v sobotu je pohár). */
const NO_EXTRA_WEEKDAY = -1;
const BATCH_SIZE = 80;

export type MidSeasonFormat = "double" | "single" | "preseason";

export interface MidSeasonPlan {
  format: MidSeasonFormat;
  /** Volné hrací dny ligy od prvního možného termínu do posledního kola sezóny. */
  matchDays: number;
  entries: CalendarEntry[];
  matches: ScheduledMatch[];
}

export interface MidSeasonOptions {
  leagueId: string;
  seasonNumber: number;
  /** Herní den založení ligy. */
  gameDate: Date;
  /** Poslední kolo běžící sezóny; po něm už se nehraje. */
  lastDate: Date;
  teamCount: number;
  weekdays?: readonly number[];
}

/** Kolik hracích dnů ligy zbývá mezi `from` a `lastDate` (o svátcích se nehraje). */
export function countMatchDays(from: Date, lastDate: Date, weekdays: readonly number[] = DEFAULT_MATCH_WEEKDAYS): number {
  const days = new Set(weekdays);
  let count = 0;
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let guard = 0; guard < 800; guard++, day.setUTCDate(day.getUTCDate() + 1)) {
    const slot = new Date(day);
    setPrague18(slot);
    if (slot.getTime() > lastDate.getTime()) break;
    if (slot.getTime() < from.getTime()) continue;
    if (days.has(slot.getUTCDay()) && !isSeniorHolidayBlocked(slot)) count++;
  }
  return count;
}

/** Počet kol jednokolové soutěže (každý s každým jednou). */
export function singleRoundRobinRounds(teamCount: number): number {
  return totalRounds(teamCount) / 2;
}

/** Jaký formát se do zbytku sezóny vejde. Čistá funkce, používá ji i náhled v onboardingu. */
export function midSeasonFormat(matchDays: number, teamCount: number): MidSeasonFormat {
  if (teamCount < 2 || matchDays < MIN_MATCH_DAYS_FOR_SCHEDULE) return "preseason";
  if (matchDays >= totalRounds(teamCount)) return "double";
  if (matchDays >= singleRoundRobinRounds(teamCount)) return "single";
  return "preseason";
}

/** Rozpis nové ligy na zbytek sezóny, nebo přípravné období, když se nevejde. */
export function planMidSeasonSchedule(opts: MidSeasonOptions, rng: Rng): MidSeasonPlan {
  const weekdays = [...(opts.weekdays ?? DEFAULT_MATCH_WEEKDAYS)];
  const from = new Date(opts.gameDate.getTime() + FIRST_ROUND_DELAY_DAYS * DAY_MS);
  const matchDays = countMatchDays(from, opts.lastDate, weekdays);
  const format = midSeasonFormat(matchDays, opts.teamCount);
  if (format === "preseason") return { format, matchDays, entries: [], matches: [] };

  const rounds = format === "double" ? totalRounds(opts.teamCount) : singleRoundRobinRounds(opts.teamCount);
  const entries = generateRemainingSeasonCalendar({
    leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, from, lastDate: opts.lastDate,
    rounds, weekdays, extraWeekday: NO_EXTRA_WEEKDAY,
  });
  // První polovina dvoukolového rozpisu je přesně jednou každý s každým.
  const matches = generateSchedule(rng, opts.teamCount).filter((m) => m.round <= rounds);
  return { format, matchDays, entries, matches };
}

/** Zapíše rozpis ligy (kalendář a zápasy) po dávkách. */
export async function insertLeagueSchedule(
  db: D1Database, leagueId: string, seasonNumber: number, plan: MidSeasonPlan, teamIds: readonly string[],
): Promise<{ rounds: number; matches: number }> {
  const calendarByRound = new Map(plan.entries.map((e) => [e.gameWeek, e.id]));
  const statements: D1PreparedStatement[] = plan.entries.map((e) => db.prepare(
    "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
  ).bind(e.id, leagueId, seasonNumber, e.gameWeek, e.matchDay, e.scheduledAt));
  let matches = 0;
  for (const m of plan.matches) {
    const calendarId = calendarByRound.get(m.round);
    if (!calendarId || m.homeTeamIndex >= teamIds.length || m.awayTeamIndex >= teamIds.length) continue;
    statements.push(db.prepare(
      "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), leagueId, calendarId, m.round, teamIds[m.homeTeamIndex], teamIds[m.awayTeamIndex]));
    matches++;
  }
  for (let i = 0; i < statements.length; i += BATCH_SIZE) await db.batch(statements.slice(i, i + BATCH_SIZE));
  logger.info({ module: M }, `liga ${leagueId}: rozpis na zbytek sezóny (${plan.format}), ${plan.entries.length} kol, ${matches} zápasů`);
  return { rounds: plan.entries.length, matches };
}

export interface DistrictStartInfo {
  /** `join` = klub převezme místo v hrající lize; ostatní = založí se nová liga. */
  mode: "join" | "new_league" | "new_league_single" | "new_league_preseason";
  /** U přípravného období: termín posledního kola sezóny, po něm liga dostane rozpis. */
  startsAfter: string | null;
}

/**
 * Co nový klub v okrese čeká: hrající liga, nová liga s rozpisem, nebo přípravné období.
 * Pro onboarding, ať se to hráč dozví dřív, než klub založí. Plný okres vrací null.
 */
export async function districtStartInfo(db: D1Database, district: string, now: Date = new Date()): Promise<DistrictStartInfo | null> {
  const season = await db.prepare("SELECT id, number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string; number: number }>();
  if (!season) return null;
  const slot = await resolveDistrictSlot(db, district, season.id, null, now);
  if (slot.kind === "full") return null;
  if (slot.kind === "join") return { mode: "join", startsAfter: null };
  const running = await getRunningSeason(db, season.number);
  if (!running) return { mode: "new_league", startsAfter: null };
  // III. třída založená registrací v běžící sezóně čeká na rollover vždy (routes/teams.ts).
  if (slot.level !== "okresni_prebor" || !running.lastMatchAt) return { mode: "new_league_preseason", startsAfter: running.lastMatchAt };
  const from = new Date(Date.parse(running.gameDate) + FIRST_ROUND_DELAY_DAYS * DAY_MS);
  const format = midSeasonFormat(countMatchDays(from, new Date(running.lastMatchAt)), slot.size ?? LOWER_LEAGUE_SIZE);
  if (format === "preseason") return { mode: "new_league_preseason", startsAfter: running.lastMatchAt };
  return { mode: format === "single" ? "new_league_single" : "new_league", startsAfter: null };
}
