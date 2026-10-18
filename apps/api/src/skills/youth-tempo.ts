/**
 * Naměřené tempo tréninku mladých (body hodnocení za sezónu) podle skrytého talentu.
 *
 * Naměřeno na produkci 2026-10-04: hráči do 21 let, součet bodů z `training_log` za posledních
 * 120 dní (bez dospívání) × 0,087 bodu hodnocení na bod:
 *
 *   talent < 30   434 hráčů   2,58 bodu hodnocení
 *   talent 30–49  282 hráčů   3,11
 *   talent 50–69   18 hráčů   4,28
 *   talent 70+     33 hráčů   5,87
 *
 * Samostatný soubor, ať ho můžou použít generátor hráčů (skills/generator.ts) i výhled
 * mladých pro skauta (scouting/youth-growth.ts) bez kruhového importu.
 */
export function youthTrainingTempo(talent: number): number {
  if (talent >= 70) return 5.87;
  if (talent >= 50) return 4.28;
  if (talent >= 30) return 3.11;
  return 2.58;
}
