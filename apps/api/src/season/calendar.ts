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

/**
 * Generate a full season calendar starting from a given date.
 *
 * `rounds` = počet kol rozpisu (`totalRounds(počet týmů)`). Dřív bylo napevno 30 kol
 * jako pro 16 týmů, takže ligám se 14 týmy zbyla 4 prázdná kola a sezóna se o dva
 * týdny protáhla (2026-10-19).
 * - Podzim: první polovina kol (u 26 kol 1-13)
 * - Zimní přestávka: 1 týden
 * - Jaro: druhá polovina
 */
export function generateSeasonCalendar(
  leagueId: string,
  seasonNumber: number,
  startDate: Date,
  rounds = 30,
): SeasonCalendar {
  const entries: CalendarEntry[] = [];
  // Liga hraje 2× týdně (po + čt) → sezóna může začít i čtvrtkem. První kolo = nejbližší
  // ligový den aspoň 5 dní po startu → pauza po konci sezóny je vždy 5-8 dní (~týden).
  const cursor = new Date(startDate);
  cursor.setDate(cursor.getDate() + 5);
  while (cursor.getDay() !== 1 && cursor.getDay() !== 4) cursor.setDate(cursor.getDate() + 1);

  const advance = () => cursor.setDate(cursor.getDate() + (cursor.getDay() === 1 ? 3 : 4)); // po→čt, čt→po
  const pushRound = (round: number) => {
    const e = new Date(cursor);
    setPrague18(e);
    entries.push({
      id: crypto.randomUUID(),
      leagueId,
      seasonNumber,
      gameWeek: round,
      matchDay: cursor.getDay() === 1 ? "monday" : "thursday",
      scheduledAt: e.toISOString(),
      status: "scheduled",
    });
  };

  const autumnStart = cursor.toISOString();
  let round = 1;

  // PODZIM: první polovina kol, každý ligový den (po/čt)
  const autumnRounds = Math.ceil(rounds / 2);
  for (; round <= autumnRounds; round++) {
    pushRound(round);
    advance();
  }

  // Zimní přestávka + jaro začíná dalším ligovým dnem ~týden po přestávce
  const winterBreakStart = new Date(entries[entries.length - 1].scheduledAt);
  winterBreakStart.setDate(winterBreakStart.getDate() + 3);
  cursor.setTime(winterBreakStart.getTime());
  cursor.setDate(cursor.getDate() + 7);
  while (cursor.getDay() !== 1 && cursor.getDay() !== 4) cursor.setDate(cursor.getDate() + 1);
  const springStart = new Date(cursor);

  // JARO: zbytek kol
  for (; round <= rounds; round++) {
    pushRound(round);
    advance();
  }

  const seasonEnd = new Date(entries[entries.length - 1].scheduledAt);
  seasonEnd.setDate(seasonEnd.getDate() + 7);

  return {
    entries,
    autumnStart,
    winterBreakStart: winterBreakStart.toISOString(),
    springStart: springStart.toISOString(),
    seasonEnd: seasonEnd.toISOString(),
  };
}

/**
 * Get lineup deadline for a match (1 hour before).
 */
export function getLineupDeadline(scheduledAt: string): Date {
  const d = new Date(scheduledAt);
  d.setHours(d.getHours() - 1);
  return d;
}
