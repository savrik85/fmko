/**
 * Přechod kurzového modelu na engine podle rolí (2026-10-10).
 *
 * Úroveň gólů soutěže se měří z posledních šesti kol (board.ts loadGoalLevel). Kola
 * před nasazením se ale hrála na starém enginu — v Praze a Prachaticích „hokejově“
 * se 6,5–7 góly na zápas — a model by po nasazení dvě až tři kola přeceňoval góly.
 * Proto se úroveň měří jen z kol od ENGINE_SINCE a do prvního takového kola platí
 * úroveň naměřená pro každou ligu v lokálním přehrání celé sezóny skutečným herním
 * runnerem na novém enginu (8 průchodů, 6 552 zápasů, kopie produkce z 9. 10.).
 */

/** První den, kdy se ligová kola hrají na enginu podle rolí. */
export const ENGINE_SINCE = "2026-10-11";

/** Úroveň gólů nového enginu podle ligy (league_id), změřená při STRENGTH_K 0,085. */
export const ENGINE_FALLBACK_LEVEL: Readonly<Record<string, number>> = {
  "7a82b469-d4db-4ee6-b730-2ec85a68122d": 1.38, // Okresní přebor Prachatice
  "042b993a-de48-4049-a48a-c716b152f044": 1.19, // Okresní přebor Prachatice — U21
  "9513dc13-4a13-487e-9547-4a1ec755dd6c": 1.12, // Okresní přebor České Budějovice
  "d1b45b99-6154-4334-a17f-bf853d594686": 1.14, // Okresní přebor České Budějovice — U21
  "dbd9bd42-3c72-44af-b21b-215bc3ef7ec9": 1.36, // Přebor Prahy
  "b483bf66-861e-4619-a600-b68d73445d22": 1.17, // Přebor Prahy — U21
};

/** Pro ligu, která v přehrání nebyla (nová soutěž): průměr naměřených úrovní. */
export const ENGINE_FALLBACK_DEFAULT = 1.25;

export function engineFallbackLevel(leagueId: string): number {
  return ENGINE_FALLBACK_LEVEL[leagueId] ?? ENGINE_FALLBACK_DEFAULT;
}
