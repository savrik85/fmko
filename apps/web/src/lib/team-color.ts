/**
 * Kontrast pro týmové barvy.
 *
 * Dresy sahají od tmavě modré po bílou, takže cokoli obarveného `primary_color`
 * musí počítat s oběma extrémy — jinak světlý dres zmizí na bílém pozadí karty
 * (nebo bílý text zmizí na světlém dresu).
 */

const FALLBACK: [number, number, number] = [45, 95, 45]; // #2D5F2D

function parseHex(hex: string): [number, number, number] {
  const c = (hex || "").replace("#", "").trim();
  const full = c.length === 3 ? c[0] + c[0] + c[1] + c[1] + c[2] + c[2] : c;
  if (full.length !== 6 || !/^[0-9a-f]{6}$/i.test(full)) return FALLBACK;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  // Zaokrouhlení dolů — nahoru by ztmavenou barvu vrátilo těsně pod cílový kontrast.
  return "#" + [r, g, b].map((v) => Math.floor(v).toString(16).padStart(2, "0")).join("");
}

/** Relativní jas dle WCAG 2.1 (0 = černá, 1 = bílá). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * Je barva dost světlá na to, aby na ní bílý text zanikl?
 * Používej tam, kde je týmová barva POZADÍM a vybíráš barvu textu na ní.
 */
export function isLightColor(hex: string): boolean {
  const [r, g, b] = parseHex(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

/** Kontrastní poměr dvou barev dle WCAG (1 = žádný, 21 = černá na bílé). */
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Vybere čitelnější text na daném pozadí porovnáním skutečného kontrastu.
 *
 * Oproti `isLightColor` nepracuje s pevným prahem jasu, takže správně obslouží
 * i sytě zelené a tyrkysové dresy — ty práh označí za tmavé, ale bílý text na
 * nich má horší kontrast než tmavý (např. #16A34A: bílá 3.3, tmavá 5.4).
 * Používej pro malý text na barevném pozadí, kde na kontrastu záleží nejvíc.
 */
export function bestTextOn(hex: string): "light" | "dark" {
  const bg = parseHex(hex);
  return contrastRatio(bg, [255, 255, 255]) >= contrastRatio(bg, [17, 24, 39]) ? "light" : "dark";
}

/**
 * Ztmaví týmovou barvu tak, aby splnila kontrast 4.5:1 proti bílému pozadí.
 * Odstín zůstává (poměr RGB se nemění), mění se jen jas — žlutý dres tedy
 * zůstane žlutý, jen okrový. Barvy, které kontrast splňují, vrací beze změny.
 *
 * Používej tam, kde je týmová barva BARVOU TEXTU na světlém pozadí.
 */
export function readableOnLight(hex: string): string {
  // 4.5:1 proti bílé (L=1) vychází na maximální luminanci 1.05/4.5 - 0.05.
  const MAX_LUMINANCE = 1.05 / 4.5 - 0.05;

  const rgb = parseHex(hex);
  if (relativeLuminance(rgb) <= MAX_LUMINANCE) return toHex(rgb);

  // Luminance není v RGB lineární (gamma), takže správný škálovací faktor hledáme půlením.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const scaled: [number, number, number] = [rgb[0] * mid, rgb[1] * mid, rgb[2] * mid];
    if (relativeLuminance(scaled) > MAX_LUMINANCE) hi = mid;
    else lo = mid;
  }
  return toHex([rgb[0] * lo, rgb[1] * lo, rgb[2] * lo]);
}
