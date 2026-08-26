/**
 * Verdikt o hráči: kam to dotáhne a za jak dlouho.
 *
 * Celá logika je tady, na jednom místě a bez databáze — právě proto, aby ji šlo otestovat
 * a aby dvě různá místa nepočítala totéž jinak. Přesně to se stalo: odznak „Výhled: …"
 * bral horní hranici odhadu, prognóza „za kolik sezón" počítala se středem, a u téhož
 * hráče pak stálo „Výhled: sestava" vedle „Nedotáhne se".
 */

import { bodyDospivani, DOSPIVANI_DO_VEKU } from "../season/dospivani";

export type UrovenNadeje = "hvezda" | "nadejny" | "prumer" | "slaby";

/** Laťky kádru, jak vypadá dnes. Proti nim se hráč poměřuje. */
export interface LatkyKadru {
  /** Průměr celého kádru. */
  prumerKadru: number;
  /** Průměr základní jedenáctky — od téhle hodnoty hráč do sestavy patří. */
  sestavaDnes: number;
  /** Od jakého STROPU je hráč klenot (špička potenciálu klubu). */
  latkaKlenotu: number;
}

const UROVEN_PASMA: Record<number, UrovenNadeje> = { 3: "hvezda", 2: "nadejny", 1: "prumer", 0: "slaby" };

/** Do kterého pásma spadá hodnocení proti kádru. */
export function pasmo(hodnota: number, l: LatkyKadru): 0 | 1 | 2 | 3 {
  if (hodnota >= l.latkaKlenotu) return 3;
  if (hodnota >= l.sestavaDnes) return 2;
  if (hodnota >= l.prumerKadru) return 1;
  return 0;
}

/**
 * Tempo růstu z tréninku a zápasů podle věku (bodů hodnocení za sezónu).
 *
 * Používá se jen jako záloha, když hráč nemá tréninkovou historii — jinak se počítá
 * ze skutečného přírůstku za posledních 120 dní.
 *
 * Čísla jsou NAMĚŘENÁ simulací celé sezóny (16 týdnů) nad `simulateTraining`, ne odhad:
 * při třech trénincích týdně vyjde šestnáctiletému 2,83 bodu, dvacetiletému 2,57
 * a dvaadvacetiletému 1,70. K tomu se přičítá zhruba 0,3 bodu ze zápasových minut.
 *
 * Původní řada (3,2 pod 20 let a 2,8 do 25) odpovídala klubu, který trénuje 4–5× týdně.
 * Výchozí režim jsou přitom dva tréninky, kde skutečný přírůstek vychází kolem 1,6 —
 * prognóza tedy slibovala skoro dvojnásobek toho, co manažer dostal. Řada je proto
 * srovnaná na tři tréninky týdně: kdo trénuje víc, dorazí dřív, než mu odznak sliboval.
 */
export function tempoPodleVeku(vek: number): number {
  if (vek < 18) return 3.1;
  if (vek < 20) return 2.9;
  if (vek < 22) return 2.8;
  if (vek < 25) return 2.0;
  if (vek < 30) return 1.5;
  if (vek < 34) return 0.9;
  return 0.4;
}

const KONEC_KARIERY = 37;

/**
 * Kam hráč REÁLNĚ dojde, než ho dožene věk.
 *
 * Teoretický strop je u staršího hráče prázdný slib: třicátník roste zlomkem toho co
 * mladík, takže by na zbývajících dvacet bodů potřeboval víc sezón, než mu zbývá kariéry.
 */
export function realneDosazitelnyStrop(
  vek: number,
  hodnoceni: number,
  teoretickyStrop: number,
  talent: number,
): number {
  let rating = hodnoceni;
  for (let v = vek; v < KONEC_KARIERY; v++) {
    const zDospivani = v <= DOSPIVANI_DO_VEKU ? bodyDospivani(v, talent) : 0;
    rating = Math.round(rating + tempoPodleVeku(v) + zDospivani);
    if (rating >= teoretickyStrop) return teoretickyStrop;
  }
  return Math.min(teoretickyStrop, Math.round(rating));
}

/**
 * Za kolik sezón se hráč dostane na laťku. `null` = za zbytek kariéry to nestihne.
 *
 * Bere TÝŽ strop jako verdikt — jinak by prognóza slibovala něco jiného než odznak.
 */
export function sezonDoLatky(
  vek: number,
  hodnoceni: number,
  realnyStrop: number,
  talent: number,
  latka: number,
  /** Skutečné tempo z tréninkové historie; bez ní se použije odhad podle věku. */
  tempoZHistorie?: number,
): number | null {
  if (hodnoceni >= latka) return 0;

  let rating = hodnoceni;
  let v = vek;
  // Horizont je zbytek kariéry, ne pevných osm sezón. `realneDosazitelnyStrop` počítá
  // taky do konce kariéry, takže s kratším limitem tvrdila prognóza „nedotáhne se"
  // u hráčů, kterým verdikt sestavu sliboval — sedmnáctiletý se na laťku dostal
  // v desáté sezóně, což se do osmi nevešlo.
  const sezonDoKonce = Math.max(1, KONEC_KARIERY - vek);
  for (let s = 1; s <= sezonDoKonce; s++) {
    const zTreninku = tempoZHistorie && tempoZHistorie > 0 ? tempoZHistorie : tempoPodleVeku(v);
    const zDospivani = v <= DOSPIVANI_DO_VEKU ? bodyDospivani(v, talent) : 0;
    // Zaokrouhlit po každé sezóně — hodnocení je celé číslo a bez toho se přes osm sezón
    // nasčítá desetinná chyba, kvůli které hráč skončí na 51,9999 místo 52 a prognóza
    // ohlásí „nedotáhne se", i když na laťku přesně dosáhne.
    rating = Math.min(realnyStrop, Math.round(rating + zTreninku + zDospivani));
    v++;
    if (rating >= latka) return s;
    if (rating >= realnyStrop) return null; // na stropu, dál se neposune
  }
  return null;
}

export interface Verdikt {
  slovne: string;
  uroven: UrovenNadeje;
  /** Odznak se ukazuje jen tehdy, když výhled slibuje skutečný posun. */
  zobrazit: boolean;
}

/**
 * Verdikt se VŽDY měří proti áčku, i u dorostence — a musí to být na něm vidět. Dokud
 * stálo jen „Výhled: možná sestava", četlo se to jako sestava toho kádru, ve kterém hráč
 * je, a u nejlepšího dorostence pak svítilo „Hvězda dorostu" vedle „možná sestava".
 */
const TEXTY: Record<number, { jiste: string; mozna: string; roste: string }> = {
  3: { jiste: "Výhled: tahoun áčka", mozna: "Výhled: možná tahoun áčka", roste: "Výhled: tahoun áčka" },
  2: { jiste: "Výhled: sestava áčka", mozna: "Výhled: možná sestava áčka", roste: "Výhled: sestava áčka" },
  1: { jiste: "Výhled: střídání v áčku", mozna: "Výhled: možná střídání v áčku", roste: "Výhled: střídání v áčku" },
  0: { jiste: "Výhled: na áčko nemá", mozna: "Výhled: na áčko spíš nemá", roste: "Výhled: na áčko nemá" },
};

/**
 * Slovní verdikt. Úroveň se řídí STŘEDEM odhadu — stejnou hodnotou, ze které počítá
 * prognóza sezón. Rozpětí ovlivňuje jen to, jestli je verdikt jistý, nebo „možná".
 */
export function slovneNadejnost(
  /** Kam hráč reálně dojde — TÁŽ hodnota, ze které počítá prognóza sezón. */
  realnyStrop: number,
  dolniOdhad: number,
  horniOdhad: number,
  hodnoceniDnes: number,
  latky: LatkyKadru,
  /** Kolik bodů hráči do stropu ještě zbývá — u vytrénovaného veterána skoro nic. */
  zbyvaDoStropu: number,
): Verdikt {
  // Úroveň se řídí reálným stropem, ne středem rozpětí. Dolní hranice se ořezává na
  // dnešní hodnocení, takže u hráče, který už na stropu je, vycházel střed NAD stropem
  // a odznak sliboval sestavu tomu, kdo se na ni podle prognózy nedotáhne.
  const pStred = pasmo(realnyStrop, latky);
  const pDolni = pasmo(dolniOdhad, latky);
  const pHorni = pasmo(horniOdhad, latky);
  const pDnes = pasmo(hodnoceniDnes, latky);

  // „Může z něj být" dává smysl jen u hráče, který ještě reálně poroste
  const jesteRoste = zbyvaDoStropu >= 8;
  const jiste = pDolni === pHorni;

  const t = TEXTY[pStred];
  return {
    slovne: jiste ? (jesteRoste ? t.roste : t.jiste) : t.mozna,
    uroven: UROVEN_PASMA[pStred],
    // Odznak jen když posune hráče výš, než kde dnes je, a zbývá mu na to dost růstu
    zobrazit: pStred > pDnes && zbyvaDoStropu >= 5,
  };
}
