/**
 * Stropy dovedností a skrytý talent pro hráče, který vznikl mimo hlavní generátor.
 *
 * `players.skills_max` a `players.hidden_talent` mají v schématu `DEFAULT '{}'` a
 * `DEFAULT 0`, takže cesta, která je do INSERTu zapomene, nic neshodí — hráč jen tiše
 * vznikne bez potenciálu. Karta Potenciálu pak zůstane prázdná a výhled nemá z čeho
 * počítat. Přesně to se dělo u hráčů kupovaných z AI klubů od dubna 2026.
 *
 * Tenhle modul je jediné místo, kde se stropy dopočítávají z plochých dovedností.
 */

import type { Rng } from "../generators/rng";
import { generateHiddenTalent, prostorPodleVeku } from "./generator";

export { prostorPodleVeku };

export interface StropDovednosti { current: number; maxPotential: number }

/**
 * Stropy z plochých dovedností. Mladík dostane víc prostoru než veterán, každá
 * dovednost svůj vlastní, aby hráč nebyl rovnoměrně nudný. Strop nikdy neklesne
 * pod dnešní hodnotu — hráč, kterého manažer vidí hrát na 60, nemá strop 54.
 */
export function stropyZDovednosti(
  rng: Rng,
  dovednosti: Record<string, number>,
  vek: number,
): Record<string, StropDovednosti> {
  const { min, max } = prostorPodleVeku(vek);
  const stropy: Record<string, StropDovednosti> = {};
  for (const [nazev, hodnota] of Object.entries(dovednosti)) {
    if (typeof hodnota !== "number") continue;
    // Zkušenost se nabírá odehranými zápasy, ne tréninkem, a věk ji nebrzdí — stoletý
    // strop má i každý normálně vygenerovaný hráč. Kdyby se jí tady strop uzavřel podle
    // věku, měl by dopočítaný hráč jako jediný v lize zaseknutou zkušenost.
    stropy[nazev] = nazev === "experience"
      ? { current: hodnota, maxPotential: 100 }
      : { current: hodnota, maxPotential: Math.min(100, Math.max(hodnota, hodnota + rng.int(min, max))) };
  }
  return stropy;
}

/**
 * Skrytý talent pro hráče z AI klubu. Starší hráč má menší šanci na vysoký talent —
 * kdo ho měl, ten už ho z velké části proměnil v dovednosti.
 */
export function talentPodleVeku(rng: Rng, vek: number, velikostObce = "town"): number {
  const zaklad = generateHiddenTalent(rng, velikostObce);
  if (vek <= 23) return zaklad;
  if (vek <= 28) return Math.round(zaklad * 0.7);
  return Math.round(zaklad * 0.4);
}
