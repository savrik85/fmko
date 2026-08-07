/**
 * Standardní výšky widgetů.
 *
 * Bez nich si každá karta drží výšku podle obsahu a dashboard vypadá roztřepeně.
 * Tři stupně stojí na jednom rytmu: 200 px plus 20 px mezera, takže dva nízké
 * widgety pod sebou přesně vyplní jeden střední a tři nízké jeden vysoký.
 * Sloupce se pak srovnají samy.
 *
 * Výšky se uplatní až od velkého displeje. Na mobilu je jeden sloupec, takže
 * není co srovnávat — a pevná výška by tam navíc znamenala scrollování uvnitř
 * karty i mimo ni, což se na dotyku pere.
 */

export type WidgetHeight = 1 | 2 | 3 | "auto";

/**
 * Základ rytmu. Každá výška musí být násobkem MASONRY_ROW, jinak se span
 * v mřížce zaokrouhlí nahoru a sloupce se rozejdou o pár pixelů — viz komentář
 * u MASONRY_ROW v use-masonry.ts.
 */
const BASE = 200;
const GAP = 20;

export const HEIGHT_PX: Record<Exclude<WidgetHeight, "auto">, number> = {
  1: BASE,
  2: BASE * 2 + GAP,
  3: BASE * 3 + GAP * 2,
};

export const HEIGHT_OPTIONS: Array<{ value: WidgetHeight; label: string; title: string }> = [
  { value: 1, label: "1", title: "Nízký" },
  { value: 2, label: "2", title: "Střední" },
  { value: 3, label: "3", title: "Vysoký" },
  { value: "auto", label: "∞", title: "Podle obsahu" },
];

export const HEIGHT_VALUES: WidgetHeight[] = [1, 2, 3, "auto"];

/** Je hodnota platná výška? Používá se i při čtení uloženého layoutu. */
export function isWidgetHeight(value: unknown): value is WidgetHeight {
  return value === 1 || value === 2 || value === 3 || value === "auto";
}

/** CSS hodnota pro proměnnou --widget-h, nebo null když se má nechat obsahu. */
export function heightVar(height: WidgetHeight): string | null {
  return height === "auto" ? null : `${HEIGHT_PX[height]}px`;
}

// ── Kolik řádků seznamu se do widgetu vejde ─────────────────────────────────

/** Odsazení karty a popisek widgetu — o tolik je vždycky míň místa na obsah. */
const CHROME_PX = 64;
/** Výška podle obsahu žádnou mez nemá; ať je aspoň v rozumné délce. */
const AUTO_ROWS = 6;

/**
 * Výšky řádku podle toho, co seznam obsahuje. Čísla jsou naměřená v prohlížeči,
 * ne odhadnutá — s odhadem seznamy přetékaly přes spodní hranu karty.
 */
export const ROW_PX = {
  /** Jméno nad vodorovným pruhem (HBarChart). */
  bar: 45,
  /** Prostý řádek: jméno a hodnota vedle sebe. */
  list: 41,
  /** Řádek tabulky bez grafiky. */
  table: 33,
  /** Řádek tabulky s erbem soupeře. */
  tableBadge: 41,
  /** Řádek s ikonou a dvěma řádky textu. */
  rich: 55,
} as const;

/**
 * Kolik položek seznamu ukázat, aby zaplnily výšku widgetu a nepřetekly.
 *
 * Dřív měl každý widget natvrdo svoje číslo, takže vedle sebe stály karty se
 * stejnou výškou a jiným počtem řádků — a u vysoké karty zbývalo prázdné místo.
 *
 * @param reservedPx místo na patičku s odkazem, úvodní větu a podobně
 */
export function rowsForHeight(height: WidgetHeight, rowPx: number, reservedPx = 0): number {
  if (height === "auto") return AUTO_ROWS;
  const usable = HEIGHT_PX[height] - CHROME_PX - reservedPx;
  return Math.max(1, Math.floor(usable / rowPx));
}
