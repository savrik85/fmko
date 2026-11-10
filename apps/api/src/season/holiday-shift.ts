/**
 * Jednorázová oprava rozpisu: kola naplánovaná na vánoční přestávku (22. 12. až 2. 1.)
 * a všechna následující kola téže ligy se posunou za svátky. Rytmus hracích dnů ligy
 * zůstává a U21 hraje dál den po kole áčka, na které je navázaná (`parent_calendar_id`).
 *
 * Generátory rozpisu se svátkům vyhýbají samy (season/calendar.ts); tohle řeší rozpis,
 * který vznikl před opravou. Volá se z admin endpointu, s `dryRun` jen vrátí plán.
 *
 * Termín kola žije jen v `season_calendar.scheduled_at` (zápasy vlastní termín nemají,
 * sázky, připomínky i omluvenky ho čtou přes kalendář), takže se mění jen kalendář
 * a `teams.season_end`.
 */

import { logger } from "../lib/logger";
import { DEFAULT_MATCH_WEEKDAYS, isHolidayBreak, isSeniorHolidayBlocked, parseMatchWeekdays, setPrague18 } from "./calendar";

const M = "holiday-shift";
const DAY_MS = 86_400_000;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
/** Konec sezóny je týden po posledním kole, stejně jako ho klade rollover. */
const SEASON_END_AFTER_LAST_ROUND_DAYS = 7;

export interface ShiftLeague {
  id: string;
  name: string;
  leagueType: "senior" | "u21";
  /** Hrací dny áčka (`getUTCDay`). U21 se řídí kolem áčka, případně svými dosavadními dny. */
  weekdays: number[];
}

export interface ShiftRound {
  id: string;
  leagueId: string;
  gameWeek: number;
  scheduledAt: string;
  status: string;
  parentCalendarId: string | null;
}

export interface RoundShift {
  calendarId: string;
  leagueId: string;
  gameWeek: number;
  from: string;
  to: string;
}

export interface LeagueShiftSummary {
  leagueId: string;
  name: string;
  movedRounds: number;
  firstMovedRound: number | null;
  lastRoundBefore: string | null;
  lastRoundAfter: string | null;
  /** O kolik dní později liga skončí. */
  endShiftDays: number;
  /** Proč se liga neposunula, i když kolo ve svátcích má. */
  skipped?: string;
}

export interface HolidayShiftPlan {
  shifts: RoundShift[];
  leagues: LeagueShiftSummary[];
}

export interface HolidayShiftOptions {
  /**
   * true = posunutá kola nejdřív zaplní volné hrací dny před svátky (po posledním kole,
   * které se nehýbe), teprve zbytek jde za svátky. false = všechna posunutá kola až po 2. 1.
   */
  useFreeDaysBefore?: boolean;
}

function dayStart(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** První den po vánoční přestávce, která následuje po daném dni (3. 1.). */
function dayAfterBreak(from: Date): Date {
  const year = from.getUTCMonth() === 0 && from.getUTCDate() <= 2 ? from.getUTCFullYear() : from.getUTCFullYear() + 1;
  return new Date(Date.UTC(year, 0, 3));
}

function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / DAY_MS);
}

/**
 * Nové termíny pro kola ligy od `firstIndex` dál: postupně další hrací dny, které nejsou
 * blokované, nejdřív od `startDay`.
 */
function fillSlots(count: number, startDay: Date, weekdays: ReadonlySet<number>, blocked: (d: Date) => boolean): Date[] {
  const out: Date[] = [];
  const day = new Date(startDay);
  // Pojistka proti nekonečné smyčce při nesmyslných hracích dnech.
  for (let guard = 0; out.length < count && guard < 3660; guard++, day.setUTCDate(day.getUTCDate() + 1)) {
    if (!weekdays.has(day.getUTCDay()) || blocked(day)) continue;
    const slot = new Date(day);
    setPrague18(slot);
    out.push(slot);
  }
  return out;
}

/** Plán posunu. Čistá funkce nad načtenými řádky, ať jde otestovat bez databáze. */
export function planHolidayShift(leagues: readonly ShiftLeague[], rounds: readonly ShiftRound[], opts: HolidayShiftOptions = {}): HolidayShiftPlan {
  const byLeague = new Map<string, ShiftRound[]>();
  for (const r of rounds) {
    const list = byLeague.get(r.leagueId);
    if (list) list.push(r);
    else byLeague.set(r.leagueId, [r]);
  }
  for (const list of byLeague.values()) list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.gameWeek - b.gameWeek);

  const shifts: RoundShift[] = [];
  const summaries: LeagueShiftSummary[] = [];
  /** Nový termín posunutých kol, podle něj se řadí navázaná kola U21. */
  const movedTo = new Map<string, Date>();

  const planLeague = (league: ShiftLeague, senior: boolean): void => {
    const list = byLeague.get(league.id) ?? [];
    const lastBefore = list.length > 0 ? list[list.length - 1].scheduledAt : null;
    const summary: LeagueShiftSummary = {
      leagueId: league.id, name: league.name, movedRounds: 0, firstMovedRound: null,
      lastRoundBefore: lastBefore, lastRoundAfter: lastBefore, endShiftDays: 0,
    };
    summaries.push(summary);
    const blocked = senior ? isSeniorHolidayBlocked : isHolidayBreak;

    // První kolo, které se musí pohnout: neodehrané ve svátcích, u U21 i kolo, jehož áčko se pohnulo.
    const firstIndex = list.findIndex((r) => r.status === "scheduled"
      && (blocked(new Date(r.scheduledAt)) || (r.parentCalendarId !== null && movedTo.has(r.parentCalendarId))));
    if (firstIndex < 0) return;
    const tail = list.slice(firstIndex);
    if (tail.some((r) => r.status !== "scheduled")) {
      summary.skipped = "za kolem ve svátcích je kolo, které už není ve stavu scheduled";
      return;
    }

    const weekdays = new Set(senior
      ? (league.weekdays.length > 0 ? league.weekdays : DEFAULT_MATCH_WEEKDAYS)
      : list.map((r) => new Date(r.scheduledAt).getUTCDay()));
    const previous = firstIndex > 0 ? dayStart(list[firstIndex - 1].scheduledAt) : null;
    const firstMoved = dayStart(tail[0].scheduledAt);
    let cursor = opts.useFreeDaysBefore
      ? new Date((previous ?? firstMoved).getTime() + (previous ? DAY_MS : 0))
      : dayAfterBreak(firstMoved);

    for (const round of tail) {
      const parentAt = round.parentCalendarId ? movedTo.get(round.parentCalendarId) : undefined;
      let to: Date;
      if (parentAt) {
        // U21 den po áčku, ve stejnou hodinu.
        to = new Date(parentAt.getTime() + DAY_MS);
      } else {
        // Kolo nikdy nepůjde dřív, než bylo: posun řeší svátky, rozpis nezhušťuje.
        const original = dayStart(round.scheduledAt);
        const from = !opts.useFreeDaysBefore || blocked(original) || original.getTime() < cursor.getTime() ? cursor : original;
        const slot = fillSlots(1, from, weekdays, blocked)[0];
        if (!slot) { summary.skipped = "nenašel se volný hrací den"; return; }
        to = slot;
      }
      cursor = new Date(dayStart(to.toISOString()).getTime() + DAY_MS);
      movedTo.set(round.id, to);
      if (to.toISOString() !== round.scheduledAt) {
        shifts.push({ calendarId: round.id, leagueId: league.id, gameWeek: round.gameWeek, from: round.scheduledAt, to: to.toISOString() });
        summary.movedRounds++;
        summary.firstMovedRound ??= round.gameWeek;
      }
    }
    const after = [...list.slice(0, firstIndex).map((r) => r.scheduledAt), ...tail.map((r) => movedTo.get(r.id)!.toISOString())].sort();
    summary.lastRoundAfter = after[after.length - 1] ?? lastBefore;
    summary.endShiftDays = daysBetween(lastBefore, summary.lastRoundAfter);
  };

  // Nejdřív áčka, U21 se pak řadí den po nich.
  for (const league of leagues.filter((l) => l.leagueType === "senior")) planLeague(league, true);
  for (const league of leagues.filter((l) => l.leagueType !== "senior")) planLeague(league, false);
  return { shifts, leagues: summaries };
}

export interface HolidayShiftResult extends HolidayShiftPlan {
  dryRun: boolean;
  seasonNumber: number | null;
  seasonEndBefore: string | null;
  seasonEndAfter: string | null;
  applied: number;
}

/** Načte rozpis aktivní sezóny, sestaví plán a (bez dryRun) ho zapíše. */
export async function shiftHolidayRounds(db: D1Database, opts: HolidayShiftOptions & { dryRun: boolean }): Promise<HolidayShiftResult> {
  const season = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>();
  if (!season) return { shifts: [], leagues: [], dryRun: opts.dryRun, seasonNumber: null, seasonEndBefore: null, seasonEndAfter: null, applied: 0 };

  const leagueRows = await db.prepare(
    `SELECT DISTINCT l.id, l.name, COALESCE(l.league_type, 'senior') AS league_type, l.match_weekdays
       FROM leagues l JOIN season_calendar sc ON sc.league_id = l.id AND sc.season_number = ?`,
  ).bind(season.number).all<{ id: string; name: string; league_type: "senior" | "u21"; match_weekdays: string | null }>();
  const roundRows = await db.prepare(
    `SELECT id, league_id, game_week, scheduled_at, status, parent_calendar_id
       FROM season_calendar WHERE season_number = ? ORDER BY league_id, scheduled_at`,
  ).bind(season.number).all<{ id: string; league_id: string; game_week: number; scheduled_at: string; status: string; parent_calendar_id: string | null }>();

  const plan = planHolidayShift(
    leagueRows.results.map((l) => ({ id: l.id, name: l.name, leagueType: l.league_type, weekdays: parseMatchWeekdays(l.match_weekdays) })),
    roundRows.results.map((r) => ({
      id: r.id, leagueId: r.league_id, gameWeek: r.game_week, scheduledAt: r.scheduled_at, status: r.status, parentCalendarId: r.parent_calendar_id,
    })),
    opts,
  );

  const endRow = await db.prepare("SELECT MAX(season_end) AS season_end FROM teams WHERE season_end IS NOT NULL").first<{ season_end: string | null }>();
  const seasonEndBefore = endRow?.season_end ?? null;
  const lastRound = plan.leagues.map((l) => l.lastRoundAfter).filter((x): x is string => !!x).sort().pop() ?? null;
  const wantedEnd = lastRound ? new Date(Date.parse(lastRound) + SEASON_END_AFTER_LAST_ROUND_DAYS * DAY_MS).toISOString() : null;
  const seasonEndAfter = wantedEnd && seasonEndBefore && wantedEnd > seasonEndBefore && plan.shifts.length > 0 ? wantedEnd : seasonEndBefore;

  let applied = 0;
  if (!opts.dryRun && plan.shifts.length > 0) {
    const statements = plan.shifts.map((s) => db.prepare(
      "UPDATE season_calendar SET scheduled_at = ?, match_day = ? WHERE id = ? AND status = 'scheduled' AND scheduled_at = ?",
    ).bind(s.to, DAY_NAMES[new Date(s.to).getUTCDay()], s.calendarId, s.from));
    if (seasonEndAfter && seasonEndAfter !== seasonEndBefore) {
      statements.push(db.prepare("UPDATE teams SET season_end = ? WHERE season_end IS NOT NULL AND season_end < ?").bind(seasonEndAfter, seasonEndAfter));
    }
    // Jedna dávka = jedna transakce: rozpis nezůstane posunutý napůl.
    const results = await db.batch(statements);
    applied = results.slice(0, plan.shifts.length).reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);
    logger.info({ module: M }, `posun kol z vánoční přestávky: ${applied}/${plan.shifts.length} kol, konec sezóny ${seasonEndBefore} → ${seasonEndAfter}`);
  }
  return { ...plan, dryRun: opts.dryRun, seasonNumber: season.number, seasonEndBefore, seasonEndAfter, applied };
}
