/**
 * Termín příštího zápasu pro prompt hráče v SMS.
 *
 * Bez něj model improvizoval: v den zápasu ráno hráč trenérovi tvrdil, že se hraje
 * až v pondělí a že „ve čtvrtek se nikdy nehrálo" (Spůle, 2026-10-29).
 */

const TZ = "Europe/Prague";

/** Pražské datum jako YYYY-MM-DD, aby šlo porovnat „dnes" a „zítra" i přes půlnoc v UTC. */
export function pragueDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Pražský zítřek jako YYYY-MM-DD: další den v kalendáři, ne „teď + 24 hodin“. V noci
 * přechodu na zimní čas má den 25 hodin a „za 24 hodin“ je pořád dnešek, při přechodu na
 * letní čas (23 hodin) už pozítří.
 */
export function pragueTomorrow(now: Date): string {
  const d = new Date(`${pragueDay(now)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** „DNES (čtvrtek 29. 10.)“, „zítra (čtvrtek 29. 10.)“, jinak „čtvrtek 29. 10.“ */
export function matchDayLabel(at: Date, now: Date): string {
  const weekday = new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, weekday: "long" }).format(at);
  const date = new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, day: "numeric", month: "numeric" }).format(at);
  const day = pragueDay(at);
  return day === pragueDay(now)
    ? `DNES (${weekday} ${date})`
    : day === pragueTomorrow(now)
      ? `zítra (${weekday} ${date})`
      : `${weekday} ${date}`;
}

function kickoffTime(at: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

export function describeNextMatch(
  scheduledAt: Date,
  isHome: boolean,
  opponentName: string,
  now: Date = new Date(),
): string {
  return `${matchDayLabel(scheduledAt, now)} v ${kickoffTime(scheduledAt)} ${isHome ? "doma s" : "venku s"} ${opponentName}`;
}

/**
 * Domluvený přátelák ve stejném tvaru jako ligový zápas. Na neutrální půdě (výzva s
 * `venue = 'neutral'`) „na hřišti v obci X“ místo „doma“ a „venku“.
 */
export function describeNextFriendly(
  kickoff: Date,
  o: { isHome: boolean; opponentName: string; neutralVillage?: string | null },
  now: Date = new Date(),
): string {
  if (!o.neutralVillage) return describeNextMatch(kickoff, o.isHome, o.opponentName, now);
  return `${matchDayLabel(kickoff, now)} v ${kickoffTime(kickoff)} na hřišti v obci ${o.neutralVillage} s ${o.opponentName}`;
}
