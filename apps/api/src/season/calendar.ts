/**
 * FMK-52: Season calendar — generátor rozpisu zápasů s reálnými časy.
 *
 * St 18:00 Europe/Prague — liga/pohár
 * So 18:00 Europe/Prague — liga
 * Ne 18:00 Europe/Prague — liga (jen nabitý týden)
 *
 * Kol tolik, kolik jich má rozpis ligy (14 týmů = 26), 2 zápasy/týden, půlka na podzim
 * a půlka na jaře + zimní přestávka (1 týden) + letní (1-2 týdny)
 */

/**
 * Nastaví datum na 18:00 Europe/Prague (bere DST v potaz).
 * Cloudflare Workers běží v UTC, takže setHours() by nastavil UTC čas.
 * European DST: last Sunday of March → last Sunday of October.
 */
export function setPrague18(d: Date): void {
  const y = d.getUTCFullYear();
  // Poslední neděle v březnu
  const marchEnd = new Date(Date.UTC(y, 2, 31));
  const lastSunMarch = new Date(Date.UTC(y, 2, 31 - marchEnd.getUTCDay()));
  // Poslední neděle v říjnu
  const octEnd = new Date(Date.UTC(y, 9, 31));
  const lastSunOct = new Date(Date.UTC(y, 9, 31 - octEnd.getUTCDay()));
  const isDST = d >= lastSunMarch && d < lastSunOct;
  // CEST (DST): UTC+2 → 18:00 CEST = 16:00 UTC
  // CET: UTC+1 → 18:00 CET = 17:00 UTC
  d.setUTCHours(isDST ? 16 : 17, 0, 0, 0);
}

const DAY_MS = 86_400_000;

/**
 * Vánoční přestávka: mezi 22. 12. a 2. 1. včetně se nehraje žádné kolo. Den se bere v UTC,
 * večerní výkop (18:00 v Praze) má v UTC stejné datum.
 */
export function isHolidayBreak(d: Date): boolean {
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return (month === 12 && day >= 22) || (month === 1 && day <= 2);
}

/**
 * Den, na který nesmí padnout kolo áčka: přestávka sama a den před ní, protože U21 hraje
 * den po áčku a její kolo by do přestávky spadlo.
 */
export function isSeniorHolidayBlocked(d: Date): boolean {
  return isHolidayBreak(d) || isHolidayBreak(new Date(d.getTime() + DAY_MS));
}

export interface CalendarEntry {
  id: string;
  leagueId: string;
  seasonNumber: number;
  gameWeek: number;       // 1..počet kol
  matchDay: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  scheduledAt: string;    // ISO datetime
  status: "scheduled" | "lineup_locked" | "simulated";
}

export interface SeasonCalendar {
  entries: CalendarEntry[];
  autumnStart: string;
  winterBreakStart: string;
  springStart: string;
  seasonEnd: string;
}

/** Hrací dny ligy, když v `leagues.match_weekdays` nic není: pondělí a čtvrtek (`getUTCDay`). */
export const DEFAULT_MATCH_WEEKDAYS: readonly number[] = [1, 4];

/** Nejvýš tolik kol jedné ligy v jednom týdnu (pondělí až neděle). */
export const MAX_ROUNDS_PER_WEEK = 3;

const DAY_NAMES: readonly CalendarEntry["matchDay"][] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

/** `leagues.match_weekdays` („3,0“) na čísla dnů; prázdné nebo neplatné = pondělí a čtvrtek. */
export function parseMatchWeekdays(raw: string | null | undefined): number[] {
  const days = (raw ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const unique = [...new Set(days)];
  return unique.length > 0 ? unique : [...DEFAULT_MATCH_WEEKDAYS];
}

/**
 * Generate a full season calendar starting from a given date.
 *
 * `rounds` = počet kol rozpisu (`totalRounds(počet týmů)`). Dřív bylo napevno 30 kol
 * jako pro 16 týmů, takže ligám se 14 týmy zbyla 4 prázdná kola a sezóna se o dva
 * týdny protáhla (2026-10-19).
 * `weekdays` = hrací dny ligy (`getUTCDay`, výchozí pondělí a čtvrtek; III. třída Prachatice
 * hraje ve středu a v neděli, viz `leagues.match_weekdays`).
 * - Podzim: první polovina kol (u 26 kol 1-13)
 * - Zimní přestávka: 1 týden
 * - Jaro: druhá polovina
 *
 * Mezi 22. 12. a 2. 1. se nehraje (`isSeniorHolidayBlocked`), kola se posunou za svátky.
 * Když sezóna svátky přechází, je zimní přestávkou právě tahle vánoční a týdenní přestávka
 * po polovině kol se nevkládá, jinak by sezóna měla přestávky dvě.
 */
export function generateSeasonCalendar(
  leagueId: string,
  seasonNumber: number,
  startDate: Date,
  rounds = 30,
  weekdays: readonly number[] = DEFAULT_MATCH_WEEKDAYS,
): SeasonCalendar {
  const overHolidays = buildSeasonCalendar(leagueId, seasonNumber, startDate, rounds, weekdays, false);
  if (overHolidays.holidayBreakAfterRound !== null) return overHolidays.calendar;
  return buildSeasonCalendar(leagueId, seasonNumber, startDate, rounds, weekdays, true).calendar;
}

function buildSeasonCalendar(
  leagueId: string,
  seasonNumber: number,
  startDate: Date,
  rounds: number,
  weekdays: readonly number[],
  midSeasonBreak: boolean,
): { calendar: SeasonCalendar; holidayBreakAfterRound: number | null } {
  // Jen platné dny 0–6, jinak by hledání hracího dne nikdy neskončilo.
  const valid = weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const days = new Set(valid.length > 0 ? valid : DEFAULT_MATCH_WEEKDAYS);
  const entries: CalendarEntry[] = [];
  // Liga hraje 2× týdně (např. po + čt) → sezóna může začít kterýmkoli hracím dnem. První
  // kolo = nejbližší ligový den aspoň 5 dní po startu → pauza po konci sezóny je 5-8 dní.
  // Dny se počítají v UTC jako na Workeru, ať test na počítači v jiném pásmu vyjde stejně.
  const cursor = new Date(startDate);
  cursor.setUTCDate(cursor.getUTCDate() + 5);
  // Po kterém kole přišla vánoční přestávka (null = sezóna svátky nepřechází).
  let holidayBreakAfterRound: number | null = null;
  const snapToMatchDay = () => {
    while (!days.has(cursor.getUTCDay()) || isSeniorHolidayBlocked(cursor)) {
      if (days.has(cursor.getUTCDay()) && entries.length > 0 && holidayBreakAfterRound === null) holidayBreakAfterRound = entries.length;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  };
  snapToMatchDay();

  const advance = () => { // na další hrací den (po→čt, čt→po u výchozích dnů)
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    snapToMatchDay();
  };
  const pushRound = (round: number) => {
    const e = new Date(cursor);
    setPrague18(e);
    entries.push({
      id: crypto.randomUUID(),
      leagueId,
      seasonNumber,
      gameWeek: round,
      matchDay: DAY_NAMES[cursor.getUTCDay()],
      scheduledAt: e.toISOString(),
      status: "scheduled",
    });
  };

  const autumnStart = cursor.toISOString();
  let round = 1;

  // PODZIM: první polovina kol, každý ligový den
  const autumnRounds = Math.ceil(rounds / 2);
  for (; round <= autumnRounds; round++) {
    pushRound(round);
    advance();
  }

  // Zimní přestávka + jaro začíná dalším ligovým dnem ~týden po přestávce
  let winterBreakStart = new Date(entries[entries.length - 1].scheduledAt);
  winterBreakStart.setUTCDate(winterBreakStart.getUTCDate() + 3);
  if (midSeasonBreak) {
    cursor.setTime(winterBreakStart.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    snapToMatchDay();
  }
  let springStart = new Date(cursor);

  // JARO: zbytek kol
  for (; round <= rounds; round++) {
    pushRound(round);
    advance();
  }

  // Bez přestávky po polovině je zimní přestávkou ta vánoční: začíná po posledním kole
  // před svátky a jaro prvním kolem po nich.
  if (!midSeasonBreak && holidayBreakAfterRound !== null && holidayBreakAfterRound < entries.length) {
    winterBreakStart = new Date(entries[holidayBreakAfterRound - 1].scheduledAt);
    winterBreakStart.setUTCDate(winterBreakStart.getUTCDate() + 3);
    springStart = new Date(entries[holidayBreakAfterRound].scheduledAt);
  } else if (!midSeasonBreak) {
    holidayBreakAfterRound = null;
  }

  const seasonEnd = new Date(entries[entries.length - 1].scheduledAt);
  seasonEnd.setUTCDate(seasonEnd.getUTCDate() + 7);

  return {
    calendar: {
      entries,
      autumnStart,
      winterBreakStart: winterBreakStart.toISOString(),
      springStart: springStart.toISOString(),
      seasonEnd: seasonEnd.toISOString(),
    },
    holidayBreakAfterRound,
  };
}

export interface RemainingSeasonOptions {
  leagueId: string;
  seasonNumber: number;
  /** Nejdřívější možný výkop (např. herní den založení + 2 dny). */
  from: Date;
  /** Nejpozdější možný výkop posledního kola (poslední kolo přeboru téže sezóny). */
  lastDate: Date;
  rounds: number;
  /** Hrací dny ligy (`getUTCDay`). */
  weekdays: number[];
  /** Den, kterým se doplní kola, která se do hracích dnů nevejdou (od konce sezóny). */
  extraWeekday: number;
}

/** Pondělí týdne, do kterého termín patří (klíč pro limit kol na týden). */
function weekKey(d: Date): string {
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

/**
 * Rozpis pro ligu, která vzniká uprostřed sezóny (III. třída Prachatice, spec část 2).
 *
 * Kola padají na hrací dny ligy v 18:00 v Praze, od prvního termínu po `from`. Mezi 22. 12.
 * a 2. 1. se nehraje (`isSeniorHolidayBlocked`), jiná přestávka tu není.
 * Když se do hracích dnů do `lastDate` nevejdou, doplní se `extraWeekday`
 * od konce sezóny, nejvýš `MAX_ROUNDS_PER_WEEK` kola týdně. Když se nevejdou ani tak,
 * vyhodí chybu: liga nesmí zdržet konec sezóny.
 */
export function generateRemainingSeasonCalendar(opts: RemainingSeasonOptions): CalendarEntry[] {
  const days = new Set(opts.weekdays);
  const base: Date[] = [];
  const extra: Date[] = [];
  const day = new Date(Date.UTC(opts.from.getUTCFullYear(), opts.from.getUTCMonth(), opts.from.getUTCDate()));
  const lastDay = Date.UTC(opts.lastDate.getUTCFullYear(), opts.lastDate.getUTCMonth(), opts.lastDate.getUTCDate());
  for (; day.getTime() <= lastDay; day.setUTCDate(day.getUTCDate() + 1)) {
    const slot = new Date(day);
    setPrague18(slot);
    if (slot.getTime() < opts.from.getTime() || slot.getTime() > opts.lastDate.getTime()) continue;
    if (isSeniorHolidayBlocked(slot)) continue;
    if (days.has(slot.getUTCDay())) base.push(slot);
    else if (slot.getUTCDay() === opts.extraWeekday) extra.push(slot);
  }

  let chosen: Date[];
  if (base.length >= opts.rounds) {
    chosen = base.slice(0, opts.rounds);
  } else {
    chosen = [...base];
    const perWeek = new Map<string, number>();
    for (const d of chosen) perWeek.set(weekKey(d), (perWeek.get(weekKey(d)) ?? 0) + 1);
    for (const d of [...extra].reverse()) {
      if (chosen.length >= opts.rounds) break;
      const key = weekKey(d);
      if ((perWeek.get(key) ?? 0) >= MAX_ROUNDS_PER_WEEK) continue;
      chosen.push(d);
      perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
    }
    if (chosen.length < opts.rounds) {
      throw new Error(
        `Rozpis se nevejde: ${opts.rounds} kol, termínů od ${opts.from.toISOString().slice(0, 10)} do ${opts.lastDate.toISOString().slice(0, 10)} je jen ${chosen.length}`,
      );
    }
    chosen.sort((a, b) => a.getTime() - b.getTime());
  }

  return chosen.map((at, i) => ({
    id: crypto.randomUUID(),
    leagueId: opts.leagueId,
    seasonNumber: opts.seasonNumber,
    gameWeek: i + 1,
    matchDay: DAY_NAMES[at.getUTCDay()],
    scheduledAt: at.toISOString(),
    status: "scheduled",
  }));
}

/**
 * Get lineup deadline for a match (1 hour before).
 */
export function getLineupDeadline(scheduledAt: string): Date {
  const d = new Date(scheduledAt);
  d.setHours(d.getHours() - 1);
  return d;
}
