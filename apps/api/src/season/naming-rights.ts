/**
 * FMK-43: Naming rights — sponzorský název klubu a hřiště.
 *
 * Hráč volí mezi identitou a penězi.
 */

import type { Rng } from "../generators/rng";

export type NamingType = "classic" | "sponsor" | "custom";

export interface NamingRightsOffer {
  sponsorName: string;
  sponsorType: string;
  teamNameTemplate: string;
  seasonBonus: number;
  extraBenefit?: string;
  requirement?: string;
}

export interface ArenaRightsOffer {
  sponsorName: string;
  arenaName: string;
  seasonBonus: number;
}

// Sponzoři pro naming rights
const SPONSOR_TEMPLATES: Array<{
  nameTemplate: string;
  type: string;
  teamFormat: string;
  bonusRange: [number, number];
  extra?: string;
  requirement?: string;
}> = [
  { nameTemplate: "Autoservis {surname}", type: "remeslo", teamFormat: "SK Autoservis {surname}", bonusRange: [20000, 35000], requirement: "Top 8 v tabulce" },
  { nameTemplate: "Řeznictví {surname}", type: "obchod", teamFormat: "FK Řeznictví {surname} {village}", bonusRange: [12000, 20000] },
  { nameTemplate: "Hospoda U {surname_gen}", type: "hospoda", teamFormat: "TJ U {surname_gen} {village}", bonusRange: [6000, 12000], extra: "Pivo po zápase zdarma" },
  { nameTemplate: "Stavby {surname}", type: "firma", teamFormat: "FC Stavby {surname}", bonusRange: [25000, 40000], requirement: "Top 6 v tabulce" },
  { nameTemplate: "Pila {surname}", type: "firma", teamFormat: "SK Pila {surname} {village}", bonusRange: [15000, 25000] },
  { nameTemplate: "Zemědělské družstvo {village}", type: "firma", teamFormat: "TJ ZD {village}", bonusRange: [10000, 18000] },
  { nameTemplate: "Potraviny {surname}", type: "obchod", teamFormat: "FK Potraviny {surname} {village}", bonusRange: [8000, 15000], extra: "Občerstvení na zápasy" },
  { nameTemplate: "Elektro {surname}", type: "remeslo", teamFormat: "SK Elektro {surname}", bonusRange: [12000, 22000] },
  { nameTemplate: "Pojišťovna {surname}", type: "firma", teamFormat: "FK {surname} Insurance {village}", bonusRange: [30000, 50000], requirement: "Top 4 v tabulce" },
  { nameTemplate: "Pekárna {surname}", type: "obchod", teamFormat: "TJ Pekárna {surname} {village}", bonusRange: [8000, 14000], extra: "Koláče pro hráče" },
];

const ARENA_TEMPLATES: Array<{
  nameFormat: string;
  bonusRange: [number, number];
}> = [
  { nameFormat: "{surname} Auto Aréna", bonusRange: [8000, 15000] },
  { nameFormat: "{surname}ova louka", bonusRange: [4000, 8000] },
  { nameFormat: "Stadion {surname}", bonusRange: [5000, 10000] },
  { nameFormat: "{surname} Park", bonusRange: [6000, 12000] },
  { nameFormat: "Na {surname}ově", bonusRange: [3000, 6000] },
];

const SURNAMES = [
  "Novotný", "Kuchař", "Dvořák", "Procházka", "Novák",
  "Horák", "Sedláček", "Veselý", "Kovář", "Pokorný",
  "Marek", "Hájek", "Jelínek", "Fiala", "Šimek",
];

const SURNAME_GENITIVES: Record<string, string> = {
  "Novotný": "Novotných", "Kuchař": "Kuchařů", "Dvořák": "Dvořáků",
  "Procházka": "Procházků", "Novák": "Nováků", "Horák": "Horáků",
  "Sedláček": "Sedláčků", "Veselý": "Veselých", "Kovář": "Kovářů",
  "Pokorný": "Pokorných", "Marek": "Marků", "Hájek": "Hájků",
  "Jelínek": "Jelínků", "Fiala": "Fialů", "Šimek": "Šimků",
};

/**
 * Generate naming rights offers for a new team.
 */
export function generateNamingOffers(
  rng: Rng,
  villageName: string,
  villageCategory: string,
): NamingRightsOffer[] {
  const count = villageCategory === "vesnice" ? 2 : 3;
  const templates = [...SPONSOR_TEMPLATES];
  rng.shuffle(templates);

  const offers: NamingRightsOffer[] = [];
  const usedSurnames = new Set<string>();

  for (let i = 0; i < count && i < templates.length; i++) {
    const t = templates[i];
    let surname: string;
    do {
      surname = rng.pick(SURNAMES);
    } while (usedSurnames.has(surname));
    usedSurnames.add(surname);

    const gen = SURNAME_GENITIVES[surname] ?? surname + "ů";
    const bonus = rng.int(t.bonusRange[0], t.bonusRange[1]);

    // Category modifier — bigger village = bigger sponsors
    const catMod = villageCategory === "mesto" ? 1.5
      : villageCategory === "mestys" ? 1.2
      : villageCategory === "obec" ? 1.0
      : 0.7;

    offers.push({
      sponsorName: t.nameTemplate.replace("{surname}", surname).replace("{surname_gen}", gen),
      sponsorType: t.type,
      teamNameTemplate: t.teamFormat
        .replace("{surname}", surname)
        .replace("{surname_gen}", gen)
        .replace("{village}", villageName),
      seasonBonus: Math.round(bonus * catMod),
      extraBenefit: t.extra,
      requirement: t.requirement,
    });
  }

  return offers;
}

/**
 * Generate arena naming rights offers (typically after first season).
 */
export function generateArenaOffers(
  rng: Rng,
  villageName: string,
  villageCategory: string,
): ArenaRightsOffer[] {
  const count = rng.int(1, 2);
  const templates = [...ARENA_TEMPLATES];
  rng.shuffle(templates);

  return templates.slice(0, count).map((t) => {
    const surname = rng.pick(SURNAMES);
    const catMod = villageCategory === "mesto" ? 1.5 : villageCategory === "obec" ? 1.0 : 0.7;
    const bonus = rng.int(t.bonusRange[0], t.bonusRange[1]);

    return {
      sponsorName: surname,
      arenaName: t.nameFormat.replace("{surname}", surname),
      seasonBonus: Math.round(bonus * catMod),
    };
  });
}
