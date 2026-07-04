/**
 * FMK-52: Season calendar — generátor rozpisu zápasů s reálnými časy.
 *
 * St 18:00 Europe/Prague — liga/pohár
 * So 18:00 Europe/Prague — liga
 * Ne 18:00 Europe/Prague — liga (jen nabitý týden)
 *
 * 30 kol, 2 zápasy/týden = ~15 týdnů podzim + 15 jaro
 * + zimní přestávka (1 týden) + letní (1-2 týdny)
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
  gameWeek: number;       // 1-30
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
 * 16 teams, 30 rounds:
 * - Autumn: rounds 1-15 (weeks 1-8)
 * - Winter break: 1 week
 * - Spring: rounds 16-30 (weeks 10-17)
 */
export function generateSeasonCalendar(
  leagueId: string,
  seasonNumber: number,
  startDate: Date,
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

  // PODZIM: kola 1-15, každý ligový den (po/čt)
  for (; round <= 15; round++) {
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

  // JARO: kola 16-30
  for (; round <= 30; round++) {
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
