/**
 * Vznik nového hráče — JEDINÝ vstup pro každé místo ve hře, kde hráč vzniká.
 *
 * Registrace, AI kluby, dorost, akademie, volní hráči, nabídky přes SMS, virtuální trh
 * i pohárové kluby si dřív skládaly hráče každé po svém (vlastní losování dovedností,
 * vlastní stropy, vlastní talent, vlastní fyzička). Teď se liší jen parametry:
 * věk, úroveň, posun úrovně a bonus akademie. Výpočet je jeden.
 *
 *   identita (jméno, věk, vzhled, povaha, povolání) → `generatePlayer`
 *   dovednosti, strop, talent, hodnocení              → `generatePlayerSkills`
 *   výška a váha                                     → `generateHeightWeight`
 */

import type { Rng } from "./rng";
import { generatePlayer, type GeneratedPlayer, type PlayerIdentity, type VillageInfo } from "./player";
import { generateHeightWeight } from "./physicals";
import { generatePlayerSkills, type PlayerSkillsOptions, type PlayerPositionCode } from "../skills/generator";
import { generatePlayerFace } from "../routes/teams";

const LEVELS = ["hamlet", "village", "town", "small_city", "city"] as const;
export type SkillLevel = typeof LEVELS[number];

const LEVEL_BY_CATEGORY: Record<VillageInfo["category"], SkillLevel> = {
  vesnice: "hamlet", obec: "village", mestys: "town", mesto: "small_city",
};

const CATEGORY_BY_SIZE: Record<SkillLevel, VillageInfo["category"]> = {
  hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto",
};

/** Kategorie obce (vesnice/obec/městys/město) → úroveň dovedností. */
export function levelFromCategory(category: VillageInfo["category"]): SkillLevel {
  return LEVEL_BY_CATEGORY[category] ?? "village";
}

/** Velikost obce z DB (`villages.size`) → úroveň dovedností. Velké město zůstává velkým městem. */
export function levelFromVillageSize(size: string | null | undefined): SkillLevel {
  return (LEVELS as readonly string[]).includes(size ?? "") ? size as SkillLevel : "village";
}

/** Velikost obce z DB → kategorie pro identitu (jména, povolání, patriotismus). */
export function categoryFromVillageSize(size: string | null | undefined): VillageInfo["category"] {
  return CATEGORY_BY_SIZE[levelFromVillageSize(size)];
}

interface NameData {
  surnameData: { surnames: Record<string, number>; female_forms: Record<string, string> };
  firstnameData: { male: Record<string, Record<string, number>>; female: Record<string, Record<string, number>> };
}

export interface CreatePlayerOptions extends Omit<PlayerSkillsOptions, "position" | "age" | "level"> {
  position: PlayerPositionCode;
  /** Obec, odkud hráč je — identita (jména, povolání, patriotismus) a výchozí úroveň. */
  village?: VillageInfo;
  /** Úroveň dovedností; bez ní se vezme z kategorie obce. */
  level?: string;
  /** Věk; bez něj ho vylosuje `generatePlayer`. */
  age?: number;
  /** Hotová identita (AI kádry z `generateLeague`); jinak se vygeneruje z `names`. */
  identity?: PlayerIdentity;
  names?: NameData;
}

export interface CreatedPlayer {
  identity: PlayerIdentity;
  firstName: string;
  lastName: string;
  age: number;
  position: PlayerPositionCode;
  nationality: string;
  skills: Record<string, number>;
  skillsMax: Record<string, { current: number; maxPotential: number }>;
  hiddenTalent: number;
  rating: number;
  experience: number;
  physical: {
    stamina: number; strength: number; injuryProneness: number;
    height: number; weight: number;
    preferredFoot: PlayerIdentity["preferredFoot"]; preferredSide: PlayerIdentity["preferredSide"];
  };
  personality: {
    discipline: number; patriotism: number; alcohol: number; temper: number;
    leadership: number; workRate: number; aggression: number; consistency: number; clutch: number;
  };
  lifeContext: { occupation: string; condition: number; morale: number };
  avatar: Record<string, unknown>;
}

export function createPlayer(rng: Rng, opts: CreatePlayerOptions): CreatedPlayer {
  const { position, village, identity: given, names, level: givenLevel, age: givenAge, ...skillOptions } = opts;
  if (!given && (!village || !names)) {
    throw new Error("createPlayer: bez hotové identity je potřeba obec i jména");
  }
  const identity = given ?? generatePlayer(rng, village!, position, names!.surnameData, names!.firstnameData, { age: givenAge });
  const age = identity.age;
  const level = givenLevel ?? (village ? levelFromCategory(village.category) : "village");

  const generated = generatePlayerSkills(rng, { ...skillOptions, position, age, level });

  return {
    identity,
    firstName: identity.firstName,
    lastName: identity.lastName,
    age,
    position,
    nationality: identity.nationality ?? "CZ",
    ...generated,
    // Výdrž a síla se ukládají do skills i do physical — MUSÍ tam být stejné číslo,
    // jinak hodnocení počítá s jednou a zápasový engine s druhou.
    physical: {
      stamina: generated.skills.stamina,
      strength: generated.skills.strength,
      injuryProneness: identity.injuryProneness,
      ...generateHeightWeight(rng, position, identity.bodyType),
      preferredFoot: identity.preferredFoot,
      preferredSide: identity.preferredSide,
    },
    personality: {
      discipline: identity.discipline, patriotism: identity.patriotism,
      alcohol: identity.alcohol, temper: identity.temper,
      leadership: identity.leadership, workRate: identity.workRate,
      aggression: identity.aggression, consistency: identity.consistency, clutch: identity.clutch,
    },
    lifeContext: { occupation: identity.occupation, condition: 100, morale: identity.morale },
    avatar: generatePlayerFace({ age, bodyType: identity.bodyType, ethnicity: identity.ethnicity }),
  };
}

/**
 * AI kluby jsou o 6–12 bodů slabší než stejně velká obec lidského hráče — počítač
 * nemá trenéra, který by kádr pilně tréninkem zvedal.
 */
export function aiTeamShift(rng: Rng): number {
  return -rng.int(6, 12);
}

/**
 * Dospělí hráči zvenku (volní hráči, tipy od hospodského, kapitána, starosty) jsou o 15 bodů
 * nad obcí, odkud jsou: hrávali jinde a vyšší soutěž. Vychází to na průměr ~42 v obci, tedy
 * stejně, jako trh měl na produkci před sjednocením generátorů (volní 41,9, nabídky 41–44).
 */
export const MARKET_SHIFT = 15;

/** Hráč jako jeden objekt identita + ploché dovednosti (pro kód, který pracuje s `GeneratedPlayer`). */
export function toGeneratedPlayer(created: CreatedPlayer): GeneratedPlayer {
  const s = created.skills;
  return {
    ...created.identity,
    speed: s.speed, technique: s.technique, shooting: s.shooting, passing: s.passing,
    heading: s.heading, defense: s.defense, goalkeeping: s.goalkeeping,
    stamina: s.stamina, strength: s.strength,
  };
}
