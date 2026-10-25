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
function setPrague18(d: Date): void {
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
 */
export function generateSeasonCalendar(
  leagueId: string,
  seasonNumber: number,
  startDate: Date,
  rounds = 30,
  weekdays: readonly number[] = DEFAULT_MATCH_WEEKDAYS,
): SeasonCalendar {
  const days = new Set(weekdays.length > 0 ? weekdays : DEFAULT_MATCH_WEEKDAYS);
  const entries: CalendarEntry[] = [];
  // Liga hraje 2× týdně (např. po + čt) → sezóna může začít kterýmkoli hracím dnem. První
  // kolo = nejbližší ligový den aspoň 5 dní po startu → pauza po konci sezóny je 5-8 dní.
  // Dny se počítají v UTC jako na Workeru, ať test na počítači v jiném pásmu vyjde stejně.
  const cursor = new Date(startDate);
  cursor.setUTCDate(cursor.getUTCDate() + 5);
  const snapToMatchDay = () => {
    while (!days.has(cursor.getUTCDay())) cursor.setUTCDate(cursor.getUTCDate() + 1);
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
  const winterBreakStart = new Date(entries[entries.length - 1].scheduledAt);
  winterBreakStart.setUTCDate(winterBreakStart.getUTCDate() + 3);
  cursor.setTime(winterBreakStart.getTime());
  cursor.setUTCDate(cursor.getUTCDate() + 7);
  snapToMatchDay();
  const springStart = new Date(cursor);

  // JARO: zbytek kol
  for (; round <= rounds; round++) {
    pushRound(round);
    advance();
  }

  const seasonEnd = new Date(entries[entries.length - 1].scheduledAt);
  seasonEnd.setUTCDate(seasonEnd.getUTCDate() + 7);

  return {
    entries,
    autumnStart,
    winterBreakStart: winterBreakStart.toISOString(),
    springStart: springStart.toISOString(),
    seasonEnd: seasonEnd.toISOString(),
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
 * Kola padají na hrací dny ligy v 18:00 v Praze, od prvního termínu po `from` bez zimní
 * přestávky. Když se do hracích dnů do `lastDate` nevejdou, doplní se `extraWeekday`
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
