/**
 * FMK-52: Season calendar — generátor rozpisu zápasů s reálnými časy.
 *
 * St 20:00 CET — liga/pohár
 * So 15:00 CET — liga
 * Ne 15:00 CET — liga (jen nabitý týden)
 *
 * 30 kol, 2 zápasy/týden = ~15 týdnů podzim + 15 jaro
 * + zimní přestávka (1 týden) + letní (1-2 týdny)
 */

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
  let round = 1;

  // Find first Wednesday from start date
  while (currentDate.getDay() !== 3) { // 3 = Wednesday
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const autumnStart = currentDate.toISOString();

  // AUTUMN: 8 weeks, 2 rounds per week (St + So)
  for (let week = 0; week < 8 && round <= 15; week++) {
    // Wednesday 20:00 CET
    const wed = new Date(currentDate);
    wed.setDate(currentDate.getDate() + week * 7);
    wed.setHours(20, 0, 0, 0);

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

    // Saturday 15:00 CET
    const sat = new Date(wed);
    sat.setDate(wed.getDate() + 3);
    sat.setHours(15, 0, 0, 0);

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
    wed.setHours(20, 0, 0, 0);

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
    sat.setHours(15, 0, 0, 0);

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
