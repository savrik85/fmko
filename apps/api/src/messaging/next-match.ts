/**
 * Termín příštího zápasu pro prompt hráče v SMS.
 *
 * Bez něj model improvizoval: v den zápasu ráno hráč trenérovi tvrdil, že se hraje
 * až v pondělí a že „ve čtvrtek se nikdy nehrálo" (Spůle, 2026-10-29).
 */

const TZ = "Europe/Prague";

/** Pražské datum jako YYYY-MM-DD, aby šlo porovnat „dnes" a „zítra" i přes půlnoc v UTC. */
function pragueDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function describeNextMatch(
  scheduledAt: Date,
  isHome: boolean,
  opponentName: string,
  now: Date = new Date(),
): string {
  const weekday = new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, weekday: "long" }).format(scheduledAt);
  const date = new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, day: "numeric", month: "numeric" }).format(scheduledAt);
  const time = new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(scheduledAt);

  const today = pragueDay(now);
  const tomorrow = pragueDay(new Date(now.getTime() + 24 * 3600 * 1000));
  const day = pragueDay(scheduledAt);
  const when = day === today
    ? `DNES (${weekday} ${date})`
    : day === tomorrow
      ? `zítra (${weekday} ${date})`
      : `${weekday} ${date}`;

  return `${when} v ${time} ${isHome ? "doma s" : "venku s"} ${opponentName}`;
}
