/**
 * Barevné odlišení widgetů.
 *
 * Záměrně jen velmi světlé podklady — na tmavé barvě by se muselo řešit, kdy
 * překlopit text do bílé, a béžový vzhled hry by se rozsypal. Aby přitom byla
 * barva na první pohled poznat, doplňuje ji sytější proužek nad obsahem karty.
 */

export interface WidgetColor {
  key: string;
  label: string;
  /** Podklad karty. Světlost drží kontrast textu stejný jako na bílé. */
  bg: string;
  /** Proužek nad obsahem — tady barva unese sytost, protože na ní nic nestojí. */
  accent: string;
}

export const WIDGET_COLORS: WidgetColor[] = [
  { key: "green", label: "Zelená", bg: "#EDF6ED", accent: "#7FB77F" },
  { key: "gold", label: "Zlatá", bg: "#FBF4E2", accent: "#D9B94A" },
  { key: "peach", label: "Broskvová", bg: "#FCF1E7", accent: "#E2A46F" },
  { key: "rose", label: "Růžová", bg: "#FBEEF1", accent: "#DC8FA3" },
  { key: "lilac", label: "Levandulová", bg: "#F1EEFA", accent: "#9B8AD1" },
  { key: "blue", label: "Modrá", bg: "#ECF2FB", accent: "#7FA5DC" },
  { key: "mint", label: "Mátová", bg: "#EAF6F2", accent: "#6FBBA8" },
];

const BY_KEY = new Map(WIDGET_COLORS.map((c) => [c.key, c]));

/** Barva podle klíče; neznámý klíč i chybějící hodnota znamenají „bez barvy". */
export function getWidgetColor(key: string | undefined): WidgetColor | null {
  return key ? BY_KEY.get(key) ?? null : null;
}
