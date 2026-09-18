/**
 * Kolik co stojí: hodnota škody, srážka ze mzdy, pokuta (spec 7d). Čisté funkce.
 */

import { cumulativeInvestment, getRepairCost } from "../equipment/equipment-generator";
import { logger } from "../lib/logger";
import { cenaOpravy } from "../stadium/stadium-damage";
import {
  CENA_BODU_TRAVNIKU, OBLIBENY_POCET_VZTAHU, OBLIBENY_VUDCOVSTVI, POKUTA_STROP_KC, SRAZKA_TYDNU,
} from "./nastaveni";
import type { Ztrata } from "./typy";

const M = "incidents-tresty";

/** Hodnota škody v Kč: u vybavení cena ztracených úrovní, u zařízení a opotřebení cena opravy. */
export function hodnotaSkody(ztraty: readonly Ztrata[]): number {
  let soucet = 0;
  for (const z of ztraty) {
    switch (z.typ) {
      case "vybaveni":
        soucet += cumulativeInvestment(z.kategorie, z.uroven)
          - cumulativeInvestment(z.kategorie, Math.max(0, z.uroven - z.urovniDolu));
        break;
      case "vybaveni_stav":
        // Úroveň se u opotřebení neukládá, počítá se s opravou první úrovně.
        soucet += getRepairCost(z.kategorie, 1, 100 - Math.max(0, z.stavPred - z.stavPo));
        break;
      case "stadion":
        soucet += z.cena ?? cenaOpravy(z.zarizeni, z.urovni, z.urovni);
        break;
      case "travnik":
        soucet += Math.max(0, z.pred - z.po) * CENA_BODU_TRAVNIKU;
        break;
      case "penize":
        soucet += z.castka;
        break;
      case "oprava":
      case "vybaveni_nahoru":
        // Pozitivní incident, ne škoda: nic se nepřičítá, nikdo za to neplatí pokutu.
        break;
      default: {
        // Vyčerpávající switch: nový druh Ztraty bez větve tu spadne na typecheck,
        // ne na tiché započtení nuly do škody.
        const nezname: never = z;
        logger.error({ module: M }, `neznámý typ škody ${JSON.stringify(nezname)}`);
      }
    }
  }
  return Math.max(0, Math.round(soucet));
}

/** Celková srážka ze mzdy: nejvýš škoda a nejvýš čtyři týdenní mzdy. */
export function castkaSrazky(skoda: number, tydenniMzda: number): number {
  return Math.max(0, Math.round(Math.min(skoda, SRAZKA_TYDNU * tydenniMzda)));
}

/** Splátka v týdnu, kdy zbývá `tydnuZbyva` srážek. Poslední doplatí zaokrouhlení. */
export function splatkaSrazky(celkem: number, tydnuZbyva: number): number {
  if (tydnuZbyva <= 0) return 0;
  const tydne = Math.floor(celkem / SRAZKA_TYDNU);
  return tydnuZbyva === 1 ? celkem - tydne * (SRAZKA_TYDNU - 1) : tydne;
}

/** Jednorázová pokuta: nejvýš škoda, dvě týdenní mzdy a 5 000 Kč. */
export function castkaPokuty(skoda: number, tydenniMzda: number): number {
  return Math.max(0, Math.round(Math.min(skoda, 2 * tydenniMzda, POKUTA_STROP_KC)));
}

/** Oblíbený hráč (spec 7c): vůdce kabiny, nebo aspoň dva silné vztahy. */
export function jeOblibeny(vudcovstvi: number, silnychVztahu: number): boolean {
  return vudcovstvi >= OBLIBENY_VUDCOVSTVI || silnychVztahu >= OBLIBENY_POCET_VZTAHU;
}
