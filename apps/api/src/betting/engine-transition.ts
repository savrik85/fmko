/**
 * Přechod kurzového modelu na engine podle rolí (2026-10-10).
 *
 * Úroveň gólů soutěže se měří z posledních šesti kol (board.ts loadGoalLevel). Kola
 * před nasazením se ale hrála na starém enginu — v Praze a Prachaticích „hokejově“
 * se 6,5–7 góly na zápas — a model by po nasazení dvě až tři kola přeceňoval góly.
 * Proto se úroveň měří jen z kol od ENGINE_SINCE a do prvního takového kola platí
 * úroveň z ENGINE_FALLBACK_LEVEL. Od 2026-10-30 se úroveň měří jen z kol aktuální
 * sezóny, takže tahle tabulka je zároveň prior na začátek každého ročníku.
 */

/** První den, kdy se ligová kola hrají na enginu podle rolí. */
export const ENGINE_SINCE = "2026-10-11";

/**
 * Úroveň gólů nového enginu podle ligy (league_id).
 *
 * Přeměřeno 2026-10-29 na produkci z kol sezóny 3 (Budějovice, Prachatice, Praha
 * a jejich U21 po 14 zápasech, III. třída a její U21 po 7), se silou kádrů
 * (top-11) z 29. 10. Úroveň soutěže je Σ gólů / Σ gólů modelu při úrovni 1,
 * smrštěná k průměru skupiny (dospělí 1,33 ze 49 zápasů, U21 1,08 ze 49) váhou
 * 14 zápasů, tedy LEVEL_PRIOR_MATCHES: (14 · průměr + n · soutěž) / (14 + n).
 *
 * Proč přeměřeno: předchozí hodnoty byly z lokálního přehrání nad kopií z 9. 10.,
 * kdy Budějovice a většinu Prahy vedl automat. Od 25. 10. je vedou AI trenéři
 * a góly se změnily: Budějovice 1,12 → naměřeno 1,45, Praha 1,36 → 1,28.
 * Přehrání v laboratoři enginu by to nezachytilo, sestavy a taktiky AI klubů
 * vybírá model Workers AI a lokálně se zopakovat nedají.
 *
 * Je to fit na stejných zápasech, ze kterých se teď měří i data, takže na začátku
 * sezóny 4 je dobré tabulku přeměřit z celé sezóny 3.
 *
 * Přeměřeno znovu 2026-11-09 stejným postupem, na 35 zápasech soutěže (III. třída 28)
 * a s novým tvarem modelu: STRENGTH_K 0,035, báze 1,93 : 1,292 a klubová výhoda
 * domácích (odds-model.ts). Úroveň se měří proti gólům modelu při úrovni 1, a ty
 * s menším vlivem síly vycházejí u nevyrovnaných zápasů nižší, proto čísla stoupla.
 * Průměr skupiny: dospělí 1,42 ze 133 zápasů, U21 1,21 ze 133.
 */
export const ENGINE_FALLBACK_LEVEL: Readonly<Record<string, number>> = {
  "7a82b469-d4db-4ee6-b730-2ec85a68122d": 1.39, // Okresní přebor Prachatice (naměřeno 1,38)
  "042b993a-de48-4049-a48a-c716b152f044": 1.27, // Okresní přebor Prachatice — U21 (1,30)
  "9513dc13-4a13-487e-9547-4a1ec755dd6c": 1.52, // Okresní přebor České Budějovice (1,56)
  "d1b45b99-6154-4334-a17f-bf853d594686": 1.20, // Okresní přebor České Budějovice — U21 (1,20)
  "dbd9bd42-3c72-44af-b21b-215bc3ef7ec9": 1.38, // Přebor Prahy (1,37)
  "b483bf66-861e-4619-a600-b68d73445d22": 1.32, // Přebor Prahy — U21 (1,37)
  "5570384b-2b92-44d6-9814-62e8edc7cc40": 1.38, // III. třída Prachatice (1,36)
  "2914ffa4-f6c9-44be-bbe0-fba06d80b0c8": 1.02, // III. třída Prachatice — U21 (0,93)
};

/** Pro ligu, která v tabulce není (nová soutěž): průměr hodnot z tabulky. */
export const ENGINE_FALLBACK_DEFAULT = 1.31;

export function engineFallbackLevel(leagueId: string): number {
  return ENGINE_FALLBACK_LEVEL[leagueId] ?? ENGINE_FALLBACK_DEFAULT;
}
