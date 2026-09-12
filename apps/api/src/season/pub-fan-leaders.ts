/**
 * Vůdci fanoušků v hospodě.
 *
 * Hospoda U Pralesa byla dosud jen mezi hráči. Přitom je to jediné místo, kde
 * se v okresním fotbale potkává kabina s tribunou: hospodský vůdce tam má
 * výčep, pamětník tam chodí od nepaměti a kápo kotle si tam sedne, když chce
 * někomu něco vytknout.
 *
 * Interakce jde oběma směry a obě strany si z ní něco odnesou:
 * - hráči morálku a kondici (běžné `PubEffect`),
 * - parta náladu a naštvanost, vůdce vztah k trenérovi (`FanDopad`).
 *
 * Bez DB, aby to šlo testovat.
 */

import type { FanGroupKind } from "../engine/fan-groups";

/** Jak často který archetyp v hospodě vůbec sedí. */
const DOCHAZKA: Record<string, number> = {
  hospodsky_vudce: 0.85,
  stary_kapo: 0.45,
  pametnik: 0.5,
  predseda_fanklubu: 0.35,
  mlady_radikal: 0.3,
  organizatorka: 0.1,
};

/** Kolik hráčů v hospodě je večer před zápasem už moc. */
export const HRACU_UZ_MOC = 4;

export interface VudceVHospode {
  leaderId: string;
  groupId: string;
  groupKind: FanGroupKind;
  jmeno: string;
  archetype: string;
  /** Radikálnost 0–100. Radikál vytýká, vyjednavač spíš platí rundu. */
  radikalnost: number;
  vyjednavani: number;
  /** Nálada a naštvanost jeho party. */
  mood: number;
  heat: number;
  /** Vztah k trenérovi −100…100. */
  sentiment: number;
}

/** Dopad na partu a vůdce. Hráčské dopady řeší `PubEffect`. */
export interface FanDopad {
  groupId: string;
  leaderId: string;
  mood: number;
  heat: number;
  sentiment: number;
  duvod: string;
}

export interface HospodskaScena {
  type: string;
  text: string;
  /** Kterých hráčů se to týká. */
  playerIds: string[];
  /** Morálka hráčů: kladné i záporné. */
  moraleDelta: number;
  fan: FanDopad;
}

/** Jde dnes do hospody? Rozhoduje archetyp a nálada, ne náhoda samotná. */
export function dorazilDoHospody(v: VudceVHospode, roll: number): boolean {
  const zaklad = DOCHAZKA[v.archetype] ?? 0.3;
  // Naštvaná parta posílá svého člověka do hospody spíš. Je to místo, kde se
  // v okrese řeší věci, co se jinde neřeknou.
  const tlak = 1 + (v.heat / 100) * 0.5 + ((50 - Math.min(50, v.mood)) / 50) * 0.3;
  return roll < Math.min(0.95, zaklad * tlak);
}

/**
 * Co se v hospodě semele mezi vůdcem a hráči.
 *
 * `hracu` je počet hráčů v podniku, `predZapasem` říká, jestli se zítra hraje.
 * Vrací `null`, když se nic nestane, protože ticho je nejčastější výsledek.
 */
export function scenaSVudcem(
  v: VudceVHospode,
  hraci: Array<{ playerId: string; jmeno: string }>,
  opts: { predZapasem: boolean; roll: number; vyberHrace: number },
): HospodskaScena | null {
  if (hraci.length === 0) {
    // Vůdce v prázdné hospodě. Nic se nestane, ale postěžuje si.
    if (v.heat < 50) return null;
    return {
      type: "vudce_sam",
      text: `${v.jmeno} seděl u výčepu sám a celý večer nadával na vedení. Hospodský to poslouchal za oba.`,
      playerIds: [],
      moraleDelta: 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: -1, heat: 2, sentiment: -2,
        duvod: "Neměl si to v hospodě s kým vyříkat." },
    };
  }

  const hrac = hraci[Math.abs(opts.vyberHrace) % hraci.length];
  const jmena = hraci.length <= 2
    ? hraci.map((h) => h.jmeno).join(" a ")
    : `${hraci[0].jmeno} a další`;

  // 1. Večer před zápasem a plná hospoda. Tohle vůdce nenechá být, ať je
  //    jakkoli smířlivý: zítra se hraje.
  if (opts.predZapasem && hraci.length >= HRACU_UZ_MOC) {
    const ostry = v.radikalnost >= 55;
    return {
      type: "vudce_vytka",
      text: ostry
        ? `${v.jmeno} napočítal u stolu ${hraci.length} hráčů den před zápasem a řekl jim nahlas, co si o tom myslí. Hospoda ztichla.`
        : `${v.jmeno} přišel k stolu, kde sedělo ${hraci.length} hráčů, a poprosil je, ať to zítra nepokazí. Bylo to trapné.`,
      playerIds: hraci.map((h) => h.playerId),
      moraleDelta: ostry ? -4 : -2,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: -4, heat: 6, sentiment: -3,
        duvod: `Našel ${hraci.length} hráčů v hospodě den před zápasem.` },
    };
  }

  // 2. Naštvaná parta a hráč po ruce. Vyříkají si to.
  if (v.heat >= 55 && opts.roll < 0.45) {
    return {
      type: "vudce_konfrontace",
      text: `${v.jmeno} si u výčepu podal ${hrac.jmeno}. Řekl mu, co si kotel myslí o posledních výkonech. Nebylo to příjemné.`,
      playerIds: [hrac.playerId],
      moraleDelta: -3,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: -3, sentiment: 0,
        duvod: `Vyříkal si to s hráčem ${hrac.jmeno} v hospodě.` },
    };
  }

  // 3. Spokojená parta nebo vyjednavač. Runda a klid.
  if (v.mood >= 55 || v.vyjednavani >= 65) {
    if (opts.roll < 0.5) {
      return {
        type: "vudce_runda",
        text: `${v.jmeno} zaplatil rundu a ${jmena} si s ním připili. Prý že za nima stojí, ať to dopadne jak chce.`,
        playerIds: hraci.map((h) => h.playerId),
        moraleDelta: 3,
        fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 2, heat: -2, sentiment: 2,
          duvod: "Zaplatil hráčům rundu a odešel spokojený." },
      };
    }
    return {
      type: "vudce_historky",
      text: `${v.jmeno} vyprávěl ${hrac.jmeno}ovi, jak se hrálo dřív. Ten to vydržel do konce a ještě přikyvoval.`,
      playerIds: [hrac.playerId],
      moraleDelta: 1,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 1, heat: 0, sentiment: 1,
        duvod: "V hospodě si padli do noty s hráčem." },
    };
  }

  // 4. Vlažno. Jen se pozdraví.
  if (opts.roll < 0.35) {
    return {
      type: "vudce_klid",
      text: `${v.jmeno} seděl u vedlejšího stolu než ${jmena}. Pozdravili se a každý si hleděl svého.`,
      playerIds: [],
      moraleDelta: 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: 0, sentiment: 0,
        duvod: "" },
    };
  }
  return null;
}

/**
 * Setkání vůdce s trenérem. Ten do hospody chodí jen na vlastní pozvání
 * (`createCoachLedSession`), takže když se potkají, něco to znamená.
 */
export function scenaSTrenerem(v: VudceVHospode, roll: number): HospodskaScena | null {
  if (v.heat >= 60) {
    return {
      type: "vudce_trener_hadka",
      text: `${v.jmeno} potkal v hospodě trenéra a hned mu začal vyčítat, jak to v klubu vypadá. Odešel dřív než on.`,
      playerIds: [],
      moraleDelta: 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: -5, sentiment: -4,
        duvod: "V hospodě si to s tebou vyříkal osobně." },
    };
  }
  if (roll < 0.6) {
    return {
      type: "vudce_trener_pivo",
      text: `${v.jmeno} si přisedl k trenérovi a probrali sestavu. Odcházeli po dvou pivech jako staří známí.`,
      playerIds: [],
      moraleDelta: 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 3, heat: -4, sentiment: 6,
        duvod: "Dali jste si spolu v hospodě pivo." },
    };
  }
  return null;
}
