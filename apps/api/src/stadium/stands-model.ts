/**
 * Tribuny po stranách.
 *
 * Dřív byly tribuny jedno číslo `stadiums.stands` (0–3). Teď má každá ze čtyř
 * stran vlastní úroveň, stavbu i cenu. Tabulka kapacit je sestavená tak, aby
 * čtyři strany na stejné úrovni daly přesně dnešních +90 / +290 / +500 míst,
 * takže převod stávajících klubů nikomu nepřidá ani neubere místa.
 *
 * Tenhle soubor nezná databázi. Sloupec `stands` v DB zůstává jako odvozené
 * maximum (drží ho trigger z migrace 0239), aby ho mohlo dál číst všechno,
 * co se ptá jen „jsou tribuny postavené".
 */

export const STAND_SIDES = [
  "stand_main", "stand_opposite", "stand_goal_west", "stand_goal_east",
] as const;
export type StandSide = (typeof STAND_SIDES)[number];
/** Sloupce stran do SQL SELECTu. */
export const STAND_COLUMNS = STAND_SIDES.join(", ");
export type StandLevels = Record<StandSide, number>;

export const STAND_SIDE_LABELS: Record<StandSide, string> = {
  stand_main: "Hlavní tribuna",
  stand_opposite: "Protější tribuna",
  stand_goal_west: "Tribuna za levou brankou",
  stand_goal_east: "Tribuna za pravou brankou",
};

/**
 * Kapacita strany podle úrovně (index 0–3).
 * Součty po úrovních: 0, 30+20+20+20 = 90, 100+60+65+65 = 290, 170+110+110+110 = 500.
 * Přírůstky každé strany s úrovní neklesají (dražší stupeň nikdy nedá míň).
 */
export const STAND_SIDE_CAPACITY: Record<StandSide, readonly number[]> = {
  stand_main: [0, 30, 100, 170],
  stand_opposite: [0, 20, 60, 110],
  stand_goal_west: [0, 20, 65, 110],
  stand_goal_east: [0, 20, 65, 110],
};

function clampLevel(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.max(0, Math.min(3, n));
}

/** Předal volající sloupce stran? Starší volání posílají jen `stands`. */
export function hasStandSides(f: Record<string, unknown>): boolean {
  return STAND_SIDES.some((s) => s in f);
}

export function readStandLevels(f: Record<string, unknown> | null | undefined): StandLevels {
  return {
    stand_main: clampLevel(f?.stand_main),
    stand_opposite: clampLevel(f?.stand_opposite),
    stand_goal_west: clampLevel(f?.stand_goal_west),
    stand_goal_east: clampLevel(f?.stand_goal_east),
  };
}

/** Starý model: jedna úroveň platí pro všechny čtyři strany. */
export function legacyStandsToSides(level: number): StandLevels {
  const l = clampLevel(level);
  return { stand_main: l, stand_opposite: l, stand_goal_west: l, stand_goal_east: l };
}

export function standsCapacity(levels: StandLevels): number {
  return STAND_SIDES.reduce((sum, s) => sum + (STAND_SIDE_CAPACITY[s][clampLevel(levels[s])] ?? 0), 0);
}

export function standsMaxLevel(levels: StandLevels): number {
  return Math.max(...STAND_SIDES.map((s) => clampLevel(levels[s])));
}

/** O kolik míst strana přibude přechodem mezi úrovněmi. */
export function standSideGain(side: StandSide, from: number, to: number): number {
  const cap = STAND_SIDE_CAPACITY[side];
  return (cap[clampLevel(to)] ?? 0) - (cap[clampLevel(from)] ?? 0);
}

/**
 * Cena stavby strany na úroveň 1–3.
 *
 * Staré ceny tribun (`legacyCosts`) se rozdělí mezi strany podle toho, kolik
 * míst která strana v daném kroku přidá, takže všechny čtyři dohromady stojí
 * zhruba totéž co dřív jedna úroveň. Zaokrouhleno na stovky.
 */
export function standSideCosts(side: StandSide, legacyCosts: readonly number[]): number[] {
  const totalAt = (l: number) => STAND_SIDES.reduce((s, x) => s + STAND_SIDE_CAPACITY[x][l], 0);
  const out = [0];
  for (let l = 1; l <= 3; l++) {
    const share = (STAND_SIDE_CAPACITY[side][l] - STAND_SIDE_CAPACITY[side][l - 1]) / (totalAt(l) - totalAt(l - 1));
    out.push(Math.round(((legacyCosts[l] ?? 0) * share) / 100) * 100);
  }
  return out;
}
