/**
 * Kradené zboží v bazaru (spec Část 8). Čisté funkce bez DB.
 *
 * Invariant: cena nikdy pod výkupem zastavárny při stavu 100 % (`getBazarPriceBand().min`).
 * Jinak by se kradené zboží dalo koupit, hned zastavit a vyrobit tím peníze.
 */

import { getBazarPriceBand } from "../equipment/equipment-generator";
import type { Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { BAZAR_DNI_MAX, BAZAR_DNI_MIN, PRODEJNE_KRADEZE, SANCE_BAZARU, SLEVA_KRADENEHO } from "./nastaveni";
import type { Ztrata } from "./typy";

/** Od jaké úrovně okradený klub své věci v bazaru pozná: čísla na dresech, logo, nápisy. Ostatní nepozná nikdo. */
const POZNATELNE_OD: Record<string, number> = { jerseys: 2, team_van: 3, trophy_case: 1, fan_drums: 2 };

export function jePoznatelne(kategorie: string, uroven: number): boolean {
  const od = POZNATELNE_OD[kategorie];
  return od !== undefined && uroven >= od;
}

export function jeProdejnaKradez(kind: string): boolean {
  return (PRODEJNE_KRADEZE as readonly string[]).includes(kind);
}

export type KradeneZbozi = Extract<Ztrata, { typ: "vybaveni" }>;

/** Vybavení, které zloděj opravdu odnesl a dá se prodat (inzerát má úroveň 1 až 3). */
export function kradeneZbozi(ztraty: readonly Ztrata[]): KradeneZbozi[] {
  return ztraty.filter((z): z is KradeneZbozi => z.typ === "vybaveni" && z.uroven >= 1 && z.uroven <= 3);
}

/**
 * Herní den, kdy se zboží objeví v bazaru, nebo `null` (zloděj prodal jinde).
 * `rng` je `createRng(seedFromString("bazar|" + incidentId))`, první číslo je los.
 */
export function denBazaru(kind: string, ztraty: readonly Ztrata[], gameDate: string, rng: Rng): string | null {
  if (!jeProdejnaKradez(kind) || kradeneZbozi(ztraty).length === 0) return null;
  if (rng.random() >= SANCE_BAZARU) return null;
  return gameExpiry(gameDate, rng.int(BAZAR_DNI_MIN, BAZAR_DNI_MAX));
}

export function cenaKradenehoZbozi(kategorie: string, uroven: number, stav: number): number {
  const pasmo = getBazarPriceBand(kategorie, uroven, stav);
  return Math.max(pasmo.min, Math.round(pasmo.suggested * SLEVA_KRADENEHO));
}

const PREZDIVKY = ["Láďa", "Pepík", "Franta", "Jirka", "Mirek", "Standa", "Honza", "Zdeněk"] as const;
const ZALOZNI_OBCE = ["Lhota", "Újezd", "Dvory", "Zálesí"] as const;

/** „Láďa, Volary" nebo „Soukromý inzerát, Volary". Obec v 1. pádě, skloňovat názvy obcí neumíme. */
export function jmenoProdejce(obce: readonly string[], rng: Rng): string {
  const obec = obce.length > 0 ? rng.pick(obce) : rng.pick(ZALOZNI_OBCE);
  return rng.random() < 0.3 ? `Soukromý inzerát, ${obec}` : `${rng.pick(PREZDIVKY)}, ${obec}`;
}

/**
 * Co o inzerátu smí vidět klub, který se dívá do bazaru (spec 8, GET).
 * Že jde o jeho věci, pozná jen okradený klub a jen u poznatelného zboží.
 */
export function oznaceniInzeratu(
  inzerat: {
    teamId: string | null; isAiListing: boolean; incidentId: string | null; incidentTeamId: string | null;
    category: string; level: number;
  },
  divakTeamId: string,
): { isPrivateListing: boolean; vypadaJakoVase: boolean; incidentId: string | null } {
  const vypadaJakoVase = inzerat.incidentId !== null && inzerat.incidentTeamId === divakTeamId
    && jePoznatelne(inzerat.category, inzerat.level);
  return {
    isPrivateListing: inzerat.teamId === null && !inzerat.isAiListing,
    vypadaJakoVase,
    incidentId: vypadaJakoVase ? inzerat.incidentId : null,
  };
}
