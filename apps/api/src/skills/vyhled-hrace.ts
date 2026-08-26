/**
 * Výhled hráče — JEDINÉ místo, kde se skládá dohromady všechno, co manažer o potenciálu vidí.
 *
 * Profil hráče, seznam dorostu i přehled kádru dřív tenhle výpočet skládaly každý po svém
 * z týchž dílků. Stačilo, aby jeden bral teoretický strop a druhý reálný, a u téhož kluka
 * pak stálo „Výhled: sestava" hned vedle „Nedotáhne se". Proto to má tvar jedné funkce:
 * kdo chce hráči něco slíbit, musí projít tudy.
 */

import {
  pasmo, slovneNadejnost, sezonDoLatky, realneDosazitelnyStrop,
  type LatkyKadru, type Verdikt,
} from "./verdikt";
import { ratingWeightsFor } from "@okresni-masina/shared";

export interface VstupVyhledu {
  vek: number;
  hodnoceni: number;
  pozice: string;
  /** Skrytý talent 0–100. */
  talent: number;
  /** Stropy jednotlivých dovedností z `skills_max`. */
  stropyDovednosti: Record<string, { maxPotential?: number }>;
  /** Laťky kádru, proti kterým se hráč poměřuje. */
  latky: LatkyKadru;
  /** Přesnost skauta: ± bodů kolem odhadu. */
  rozptyl: number;
  /**
   * Stabilní posun odhadu v rozsahu −1…1. Manažer nikdy nevidí přesné číslo z databáze,
   * ale odhad se nesmí měnit při každém načtení stránky — proto se posun odvozuje
   * z ID hráče, ne z náhody.
   */
  posun: number;
  /** Skutečné tempo růstu z tréninkové historie; bez ní se odhadne podle věku. */
  tempoZHistorie?: number;
}

export interface Vyhled {
  /** Hodnocení, kdyby měl všechny dovednosti na maximu. `null` = strop se nedá spočítat. */
  teoretickyStrop: number | null;
  /** Teoretický strop, jak ho vidí manažer — posunutý podle přesnosti skauta. */
  odhadStropu: number | null;
  /** Kam hráč REÁLNĚ dojde, než ho dožene věk. Tohle číslo řídí verdikt i prognózu. */
  realnyStrop: number | null;
  dolniOdhad: number | null;
  horniOdhad: number | null;
  /** Kolik bodů hodnocení hráči do reálného stropu zbývá. */
  zbyvaDoStropu: number;
  verdikt: Verdikt | null;
  /** Za kolik sezón se dostane do základní sestavy. `null` = za zbytek kariéry ne. */
  sezonDoSestavy: number | null;
  /** Už na sestavu má — povýšit ho jde hned. */
  jizNaSestavu: boolean;
}

/** Teoretický strop hráče: hodnocení, kdyby měl všechny dovednosti na maximu.
 *
 * Počítá se nad `skills_max`, kde brankáři mají vlastní názvy dovedností — proto tu žádný
 * překlad není a být nesmí. Dokud si tenhle výpočet dělalo každé zobrazení samo, lišila se
 * u brankářů čísla o pár bodů: seznam bral `reflexes` a `catching` jako dvě dovednosti,
 * profil je přes alias sčítal do jednoho `goalkeeping`.
 */
export function teoretickyStropHrace(
  pozice: string,
  stropyDovednosti: Record<string, { maxPotential?: number }>,
  talent: number,
): number | null {
  const vahy = ratingWeightsFor(pozice);
  let soucet = 0, vaha = 0;
  for (const [dovednost, w] of Object.entries(vahy)) {
    const strop = stropyDovednosti[dovednost]?.maxPotential;
    if (typeof strop === "number") { soucet += strop * w; vaha += w; }
  }
  if (vaha === 0) return null;
  return Math.round(soucet / vaha + talent * 0.15);
}

/** Kompletní výhled hráče. Bez stropů dovedností vrací samá `null` — manažer nemá co vidět. */
export function vyhledHrace(v: VstupVyhledu): Vyhled {
  const jizNaSestavu = v.hodnoceni >= v.latky.sestavaDnes;
  const teoreticky = teoretickyStropHrace(v.pozice, v.stropyDovednosti, v.talent);

  if (teoreticky === null) {
    return {
      teoretickyStrop: null, odhadStropu: null, realnyStrop: null,
      dolniOdhad: null, horniOdhad: null, zbyvaDoStropu: 0,
      verdikt: null, sezonDoSestavy: null, jizNaSestavu,
    };
  }

  // Odhad nikdy neklesne pod dnešní hodnocení — hráč, kterého manažer vidí hrát na 60,
  // nemůže mít „strop 54".
  const odhadStropu = Math.max(v.hodnoceni, Math.min(100, teoreticky + Math.round(v.posun * v.rozptyl)));
  const realnyStrop = realneDosazitelnyStrop(v.vek, v.hodnoceni, odhadStropu, v.talent);
  const zbyva = Math.max(0, realnyStrop - v.hodnoceni);

  const dolni = Math.max(v.hodnoceni, realnyStrop - v.rozptyl);
  const horni = Math.min(100, realnyStrop + v.rozptyl);

  const sezon = sezonDoLatky(
    v.vek, v.hodnoceni, realnyStrop, v.talent, v.latky.sestavaDnes, v.tempoZHistorie,
  );

  return {
    teoretickyStrop: teoreticky,
    odhadStropu,
    realnyStrop,
    dolniOdhad: dolni,
    horniOdhad: horni,
    zbyvaDoStropu: zbyva,
    verdikt: slovneNadejnost(realnyStrop, dolni, horni, v.hodnoceni, v.latky, zbyva),
    // `sezonDoLatky` vrací 0 u hráče, který na laťce už je; ven se posílá jen skutečná
    // prognóza, „už na to má" si UI přečte z `jizNaSestavu`.
    sezonDoSestavy: sezon === 0 ? null : sezon,
    jizNaSestavu,
  };
}

/** Pásmo, do kterého hráč spadá dnes — pro porovnání s výhledem. */
export function pasmoDnes(hodnoceni: number, latky: LatkyKadru): 0 | 1 | 2 | 3 {
  return pasmo(hodnoceni, latky);
}
