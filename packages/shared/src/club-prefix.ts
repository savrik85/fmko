/**
 * Zkratka na začátku názvu klubu („FK" v „FK Rohlík Břevnov").
 * Klub si ji vybírá jen z tohoto seznamu, aby v názvu nebyl nesmysl.
 * Zbytek názvu (sponzor, obec) zkratka nemění.
 */
export const CLUB_PREFIXES = ["FK", "SK", "AC", "FC", "TJ", "AFK", "SFK", "MFK", "SC"] as const;

export type ClubPrefix = (typeof CLUB_PREFIXES)[number];

export function isClubPrefix(value: unknown): value is ClubPrefix {
  return typeof value === "string" && (CLUB_PREFIXES as readonly string[]).includes(value);
}

/** Zkratka na začátku názvu, nebo null, když název žádnou ze seznamu nemá (např. „Sokol Lhenice"). */
export function clubPrefixOf(name: string): ClubPrefix | null {
  const first = name.trim().split(/\s+/)[0];
  return isClubPrefix(first) ? first : null;
}

/** Název s jinou zkratkou: stávající zkratku nahradí, název bez zkratky ji dostane na začátek. */
export function withClubPrefix(name: string, prefix: ClubPrefix): string {
  const trimmed = name.trim();
  const current = clubPrefixOf(trimmed);
  const rest = current ? trimmed.slice(current.length).trim() : trimmed;
  return `${prefix} ${rest}`.trim();
}
