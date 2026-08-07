/**
 * Barvy a formátování pro dashboardové grafy.
 *
 * Kategorická paleta je v PEVNÉM pořadí a nikdy se necykluje — devátá série
 * neexistuje, místo ní se skupina složí do „Ostatní". Sada prošla validací na
 * pásmo světlosti, minimální sytost, odstup pod barvoslepostí (protan/deutan/
 * tritan), odstup pro normální zrak a kontrast vůči bílé kartě.
 *
 * Odstíny vycházejí z design tokenů v globals.css tam, kde to validace dovolila.
 */

/** Kategorická — pro série, které se od sebe musí odlišit identitou. */
export const CATEGORICAL = [
  "#2E7D32", // zelená (klubová)
  "#2563EB", // modrá
  "#C4761A", // okrová
  "#B23A8E", // purpurová
  "#D94032", // červená
  "#6B5BA8", // fialová
] as const;

/** Sekvenční — jeden odstín, světlá → tmavá. Výchozí volba pro „porovnej velikost". */
export const SEQUENTIAL = ["#C8E6C8", "#81C784", "#4CAF50", "#3A7A3A", "#2D5F2D", "#1E4A1E"] as const;

/** Hlavní jednobarevný odstín — sloupce a linie, kde barva nenese identitu. */
export const PRIMARY = "#2E7D32";

/** Divergentní — dva póly a neutrální šedý střed (nikdy odstín uprostřed). */
export const DIVERGING = { positive: "#2E7D32", neutral: "#B5AFA5", negative: "#D94032" } as const;

/** Stavové — vyhrazené, nikdy jako „další série v pořadí". */
export const STATUS = { good: "#2E7D32", warning: "#C4761A", critical: "#D94032" } as const;

/** Potlačené prvky — mřížka, osy, kontext. */
export const NEUTRAL = "#B5AFA5";
export const GRID = "#E5E1D9";
export const SURFACE = "#FFFFFF";

/** Barva série podle pořadí. Nad rámec palety se opakovat nesmí — volající skládá do „Ostatní". */
export function seriesColor(index: number): string {
  return CATEGORICAL[index] ?? NEUTRAL;
}

/** Krok sekvenční škály pro hodnotu 0–1. */
export function sequentialStep(ratio: number): string {
  const i = Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.round(ratio * (SEQUENTIAL.length - 1))));
  return SEQUENTIAL[i];
}

/** Bílý nebo inkoustový text podle světlosti podkladu — pro popisky uvnitř výplně. */
export function inkOn(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1A1714" : "#FFFFFF";
}

// ── Formátování ─────────────────────────────────────────────────────────────

/** Zkrácené číslo pro osy a špičky sloupců: 1 284 → 1,3 tis., 4 200 000 → 4,2 mil. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("cs", { maximumFractionDigits: 1 })} mil.`;
  if (abs >= 10_000) return `${Math.round(value / 1000).toLocaleString("cs")} tis.`;
  return Math.round(value).toLocaleString("cs");
}

/** Zkrácená částka v korunách — do popisků, kde se nevejde plný zápis. */
export function compactCZK(value: number): string {
  return `${compact(value)} Kč`;
}

/** Plná částka v korunách — do tooltipů a hodnot, kde je místo. */
export function fullCZK(value: number): string {
  return `${Math.round(value).toLocaleString("cs")} Kč`;
}

/**
 * Kulaté hodnoty pro osu — vrací 3 popisky (min, střed, max) zaokrouhlené na
 * čitelný krok, aby na ose nestály čísla jako 1 837.
 */
export function niceTicks(min: number, max: number): number[] {
  if (max === min) return [min];
  const step = niceStep((max - min) / 2);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const norm = rough / base;
  const snapped = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return snapped * base;
}
