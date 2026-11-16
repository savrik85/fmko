/**
 * Rozpis pro ligu, která vznikla registrací uprostřed běžící sezóny (první klub v novém
 * okrese). Dřív taková liga čekala bez zápasů v přípravném období až do rolloveru, klidně
 * dva měsíce.
 *
 * Teď dostane rozpis na zbytek sezóny (stejný generátor jako ručně zakládaná III. třída,
 * `season/calendar.ts`), vždy dvoukolový jako ostatní ligy. Když se celé dvoukolo do
 * hracích dnů nevejde, doplní se soboty, nejvýš tři kola týdně. Když se nevejde ani tak,
 * zůstává přípravné období a onboarding to hráči řekne předem (`districtStartInfo`).
 *
 * Jednokolová varianta (každý s každým jednou) tu byla do 2026-11-16 a je zrušená: liga
 * s polovičním rozpisem nebyla s ostatními srovnatelná.
 */

import { logger } from "../lib/logger";
import {
  DEFAULT_MATCH_WEEKDAYS, MAX_ROUNDS_PER_WEEK, generateRemainingSeasonCalendar, isSeniorHolidayBlocked, setPrague18,
  type CalendarEntry,
} from "../season/calendar";
import type { Rng } from "../generators/rng";
import { getRunningSeason, LOWER_LEAGUE_SIZE, resolveDistrictSlot } from "./district-leagues";
import { generateSchedule, totalRounds, type ScheduledMatch } from "./schedule";

const M = "mid-season-schedule";
const DAY_MS = 86_400_000;

/** První kolo nejdřív tolik dní po založení ligy (sestava, seznámení s kádrem). */
export const FIRST_ROUND_DELAY_DAYS = 2;
/**
 * Den, kterým se doplní kola, která se do hracích dnů ligy nevejdou: sobota (`getUTCDay`).
 * Jediný den, kdy áčko nehraje dva dny po sobě a nekříží se s U21 (ta hraje den po áčku).
 * V sobotu se hraje pohár, ale liga založená uprostřed sezóny v něm ještě není.
 */
export const MID_SEASON_EXTRA_WEEKDAY = 6;
const BATCH_SIZE = 80;

export type MidSeasonFormat = "double" | "preseason";

export interface MidSeasonPlan {
  format: MidSeasonFormat;
  /** Kolik kol se od prvního možného termínu do posledního kola sezóny vejde (i se sobotami). */
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

/** Pondělí týdne, do kterého termín patří. */
function weekStart(d: Date): number {
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return monday - ((d.getUTCDay() + 6) % 7) * DAY_MS;
}

/**
 * Kolik kol se mezi `from` a `lastDate` vejde: hrací dny ligy a k nim den navíc, dokud
 * týden nemá `MAX_ROUNDS_PER_WEEK` kol. O svátcích se nehraje. Počítá stejně, jako
 * `generateRemainingSeasonCalendar` termíny rozdává.
 */
export function countRoundSlots(
  from: Date, lastDate: Date,
  weekdays: readonly number[] = DEFAULT_MATCH_WEEKDAYS, extraWeekday: number = MID_SEASON_EXTRA_WEEKDAY,
): number {
  const days = new Set(weekdays);
  const perWeek = new Map<number, { base: number; extra: number }>();
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let guard = 0; guard < 800; guard++, day.setUTCDate(day.getUTCDate() + 1)) {
    const slot = new Date(day);
    setPrague18(slot);
    if (slot.getTime() > lastDate.getTime()) break;
    if (slot.getTime() < from.getTime() || isSeniorHolidayBlocked(slot)) continue;
    const week = perWeek.get(weekStart(slot)) ?? { base: 0, extra: 0 };
    if (days.has(slot.getUTCDay())) week.base++;
    else if (slot.getUTCDay() === extraWeekday) week.extra++;
    perWeek.set(weekStart(slot), week);
  }
  let count = 0;
  for (const week of perWeek.values()) {
    count += week.base + Math.min(week.extra, Math.max(0, MAX_ROUNDS_PER_WEEK - week.base));
  }
  return count;
}

/** Vejde se do zbytku sezóny celé dvoukolo? Čistá funkce, používá ji i náhled v onboardingu. */
export function midSeasonFormat(roundSlots: number, teamCount: number): MidSeasonFormat {
  if (teamCount < 2) return "preseason";
  return roundSlots >= totalRounds(teamCount) ? "double" : "preseason";
}

/** Rozpis nové ligy na zbytek sezóny, nebo přípravné období, když se nevejde. */
export function planMidSeasonSchedule(opts: MidSeasonOptions, rng: Rng): MidSeasonPlan {
  const weekdays = [...(opts.weekdays ?? DEFAULT_MATCH_WEEKDAYS)];
  const from = new Date(opts.gameDate.getTime() + FIRST_ROUND_DELAY_DAYS * DAY_MS);
  const matchDays = countRoundSlots(from, opts.lastDate, weekdays);
  const format = midSeasonFormat(matchDays, opts.teamCount);
  if (format === "preseason") return { format, matchDays, entries: [], matches: [] };

  const entries = generateRemainingSeasonCalendar({
    leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, from, lastDate: opts.lastDate,
    rounds: totalRounds(opts.teamCount), weekdays, extraWeekday: MID_SEASON_EXTRA_WEEKDAY,
  });
  return { format, matchDays, entries, matches: generateSchedule(rng, opts.teamCount) };
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
  mode: "join" | "new_league" | "new_league_preseason";
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
  const format = midSeasonFormat(countRoundSlots(from, new Date(running.lastMatchAt)), slot.size ?? LOWER_LEAGUE_SIZE);
  if (format === "preseason") return { mode: "new_league_preseason", startsAfter: running.lastMatchAt };
  return { mode: "new_league", startsAfter: null };
}
