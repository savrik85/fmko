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
