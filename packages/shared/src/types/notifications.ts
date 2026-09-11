/**
 * Rozbor titulku oznámení pro telefon.
 *
 * Titulky si emoji nesou samy („🚨 Výtržnosti na stadionu"), protože vznikaly
 * pro web push, kde žádná ikona vedle není. V oznamovacím centru ale ikona je,
 * takže by na kartě svítily dvě naráz. Emoji z titulku je konkrétnější než
 * ikona podle druhu, proto se použije jako ikona a z textu zmizí.
 */

/** Záložní ikona, když si titulek žádnou nenese. */
export const NOTIFIKACE_IKONY: Record<string, string> = {
  match_reminder: "\u{23F0}",
  match_result: "\u{26BD}",
  event: "\u{1F389}",
  challenge: "\u{1F91C}",
  transfer: "\u{1F91D}",
  season: "\u{1F3C6}",
  system: "\u{2699}\u{FE0F}",
};

const VYCHOZI_IKONA = "\u{1F4E3}";

/**
 * Vede-li titulek emoji, oddělí ho. Bere i emoji složené z víc znaků
 * (varianta s `️`, spojení přes ZWJ) — jinak by se rozpůlilo.
 */
const VEDOUCI_EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

export function rozdelTitulekOznameni(
  title: string,
  type: string,
): { ikona: string; text: string } {
  const m = title.match(VEDOUCI_EMOJI);
  // Titulek složený jen z emoji by po odstranění zůstal prázdný — pak se nechá celý.
  if (m) {
    const zbytek = title.slice(m[0].length).trim();
    return { ikona: m[1], text: zbytek || title };
  }
  return { ikona: NOTIFIKACE_IKONY[type] ?? VYCHOZI_IKONA, text: title };
}
