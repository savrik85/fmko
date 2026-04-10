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
  matchDay: "wednesday" | "saturday" | "sunday";
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
  let currentDate = new Date(startDate);
  // Skip 2 days so first match is ~3-4 days after registration (2 + nearest Wednesday)
  currentDate.setDate(currentDate.getDate() + 2);
  let round = 1;

  // Find first Wednesday from adjusted start date
  while (currentDate.getDay() !== 3) { // 3 = Wednesday
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const autumnStart = currentDate.toISOString();

  // AUTUMN: 8 weeks, 2 rounds per week (St + So)
  for (let week = 0; week < 8 && round <= 15; week++) {
    // Wednesday 18:00 Europe/Prague
    const wed = new Date(currentDate);
    wed.setDate(currentDate.getDate() + week * 7);
    setPrague18(wed);

    // Check if this is a cup week (week 5, 8) — still a match slot
    entries.push({
      id: crypto.randomUUID(),
      leagueId,
      seasonNumber,
      gameWeek: round,
      matchDay: "wednesday",
      scheduledAt: wed.toISOString(),
      status: "scheduled",
    });
    round++;

    if (round > 15) break;

    // Saturday 18:00 Europe/Prague
    const sat = new Date(wed);
    sat.setDate(wed.getDate() + 3);
    setPrague18(sat);

    entries.push({
      id: crypto.randomUUID(),
      leagueId,
      seasonNumber,
      gameWeek: round,
      matchDay: "saturday",
      scheduledAt: sat.toISOString(),
      status: "scheduled",
    });
    round++;
  }

  // Winter break start
  const lastAutumnEntry = entries[entries.length - 1];
  const winterBreakStart = new Date(lastAutumnEntry.scheduledAt);
  winterBreakStart.setDate(winterBreakStart.getDate() + 3);

  // Spring start: 1 week after winter break
  const springStart = new Date(winterBreakStart);
  springStart.setDate(springStart.getDate() + 7);

  // Find next Wednesday for spring
  while (springStart.getDay() !== 3) {
    springStart.setDate(springStart.getDate() + 1);
  }

  // SPRING: 8 weeks, rounds 16-30
  for (let week = 0; week < 8 && round <= 30; week++) {
    const wed = new Date(springStart);
    wed.setDate(springStart.getDate() + week * 7);
    setPrague18(wed);

    entries.push({
      id: crypto.randomUUID(),
      leagueId,
      seasonNumber,
      gameWeek: round,
      matchDay: "wednesday",
      scheduledAt: wed.toISOString(),
      status: "scheduled",
    });
    round++;

    if (round > 30) break;

    const sat = new Date(wed);
    sat.setDate(wed.getDate() + 3);
    setPrague18(sat);

    entries.push({
      id: crypto.randomUUID(),
      leagueId,
      seasonNumber,
      gameWeek: round,
      matchDay: "saturday",
      scheduledAt: sat.toISOString(),
      status: "scheduled",
    });
    round++;
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
