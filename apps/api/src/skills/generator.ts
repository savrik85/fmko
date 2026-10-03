/**
 * FMK-53: Generátor skillů pro nového hráče (0-100 stupnice).
 */

import { createRng, type Rng } from "../generators/rng";
import type { FieldSkills, GoalkeeperSkills, SkillValue, LeagueLevelRange } from "./types";
import { SKILL_RANGES_BY_LEVEL } from "./types";
// Váhy hodnocení žijí ve sdíleném balíku — používá je i web pro zvýraznění atributů v profilu.
import { ratingWeightsFor } from "@okresni-masina/shared";

function generateSkillValue(rng: Rng, range: LeagueLevelRange, positionBonus: number): SkillValue {
  const cap = rng.int(range.capMin + positionBonus, range.capMax + positionBonus);
  const clampedCap = Math.min(100, Math.max(1, cap));
  const current = rng.int(
    Math.max(1, range.avgMin + positionBonus - 5),
    Math.min(clampedCap, range.avgMax + positionBonus),
  );
  return { current: Math.max(1, current), maxPotential: clampedCap };
}

/**
 * Jak moc je hráč v daném věku pod svým „dospělým" já.
 *
 * Mezi 16 a 21 lety se náběh počítá plynule. Dřív tu byl schod: všechno pod 20 let dostalo
 * 0,7 a od 20 rovnou 1,0, takže devatenáctiletý vypadal o 30 % hůř než dvacetiletý se
 * stejnými vlohami — v datech rozehrané ligy je ten zlom vidět jako skok průměrného
 * hodnocení dorostenců z 25,1 na 33,9 mezi 19. a 20. rokem.
 *
 * Náběh zároveň začíná výš (0,78 místo 0,7), protože nejmladší ročníky vycházely
 * z generátoru tak slabé, že se nedaly použít ani v dorostu.
 */
export function vekovyNasobitel(age: number): number {
  if (age >= 28) return age < 34 ? 0.9 : age < 40 ? 0.75 : 0.5;
  if (age >= 22) return 1.0;
  const vek = Math.min(21, Math.max(16, age));
  return 0.78 + (vek - 16) * 0.038; // 16 → 0,78 … 21 → 0,97
}

function applyAgeCurve(skill: SkillValue, age: number): SkillValue {
  return {
    current: Math.max(1, Math.round(skill.current * vekovyNasobitel(age))),
    maxPotential: skill.maxPotential,
  };
}

/**
 * Převede vygenerované dovednosti ({current, maxPotential}) na ploché hodnoty, jaké se ukládají
 * do `players.skills`. Brankář nemá střelbu, standardky, přehled ani výdrž — ty se mu skládají
 * z příbuzných dovedností, aby měl vyplněné všechny klíče jako hráč v poli.
 */
export function flattenGeneratedSkills(
  skills: FieldSkills | GoalkeeperSkills,
  isGK: boolean,
): Record<string, number> {
  if (isGK) {
    const gk = skills as GoalkeeperSkills;
    return {
      speed: gk.speed.current, technique: gk.technique.current, shooting: gk.technique.current,
      passing: gk.passing.current, heading: gk.heading.current, defense: gk.defense.current,
      goalkeeping: gk.goalkeeping.current, creativity: gk.creativity.current, setPieces: gk.technique.current,
      stamina: gk.strength.current, strength: gk.strength.current, vision: gk.defense.current,
      experience: gk.experience.current,
    };
  }
  const f = skills as FieldSkills;
  return {
    speed: f.speed.current, technique: f.technique.current, shooting: f.shooting.current,
    passing: f.passing.current, heading: f.heading.current, defense: f.defense.current, goalkeeping: 1,
    creativity: f.creativity.current, setPieces: f.setPieces.current, stamina: f.stamina.current,
    strength: f.strength.current, vision: f.vision.current, experience: f.experience.current,
  };
}

/**
 * Rozsahy úrovně posunuté o `shift` bodů. Kladný posun = lepší hráči (trh, celebrity),
 * záporný = slabší (AI kluby). Průměry i stropy se posouvají stejně, aby kladný posun
 * nenarazil na strop a hráč opravdu vyšel o tolik lepší.
 */
function shiftedRange(villageSize: string, shift: number): LeagueLevelRange {
  const base = SKILL_RANGES_BY_LEVEL[villageSize] ?? SKILL_RANGES_BY_LEVEL.village;
  return {
    avgMin: Math.max(1, base.avgMin + shift),
    avgMax: Math.max(5, base.avgMax + shift),
    capMin: Math.max(5, base.capMin + shift),
    capMax: Math.max(10, base.capMax + shift),
  };
}

/**
 * Generate field player skills.
 */
export function generateFieldSkills(
  rng: Rng,
  position: "DEF" | "MID" | "FWD",
  villageSize: string,
  age: number,
  shift = 0,
): FieldSkills {
  const range = shiftedRange(villageSize, shift);

  // Position-specific bonuses
  const bonuses: Record<string, Record<string, number>> = {
    DEF: { defense: 10, heading: 8, strength: 5, speed: 0, technique: -5, shooting: -8, passing: 0, vision: 3, stamina: 3, creativity: -5, setPieces: -5 },
    MID: { passing: 10, vision: 8, technique: 5, stamina: 5, defense: 0, heading: -3, shooting: 0, speed: 0, strength: -3, creativity: 15, setPieces: 10 },
    FWD: { shooting: 10, speed: 8, technique: 5, heading: 3, passing: 0, defense: -8, vision: 0, stamina: 0, strength: 0, creativity: 10, setPieces: 5 },
  };
  const b = bonuses[position];

  const skills: FieldSkills = {
    speed: applyAgeCurve(generateSkillValue(rng, range, b.speed), age),
    stamina: applyAgeCurve(generateSkillValue(rng, range, b.stamina), age),
    strength: applyAgeCurve(generateSkillValue(rng, range, b.strength), age),
    technique: applyAgeCurve(generateSkillValue(rng, range, b.technique), age),
    shooting: applyAgeCurve(generateSkillValue(rng, range, b.shooting), age),
    passing: applyAgeCurve(generateSkillValue(rng, range, b.passing), age),
    heading: applyAgeCurve(generateSkillValue(rng, range, b.heading), age),
    defense: applyAgeCurve(generateSkillValue(rng, range, b.defense), age),
    vision: applyAgeCurve(generateSkillValue(rng, range, b.vision ?? 0), age),
    creativity: applyAgeCurve(generateSkillValue(rng, range, b.creativity ?? 0), age),
    setPieces: (() => {
      const base = applyAgeCurve(generateSkillValue(rng, range, b.setPieces ?? 0), age);
      // 5% chance of set-piece specialist (+30 bonus)
      if (rng.int(0, 100) < 5) {
        base.current = Math.min(100, base.current + 30);
        // Strop musí zůstat aspoň na úrovni současné hodnoty. Bonus na current byl +30,
        // na strop jen +20, takže specialista mohl vzniknout NAD svým stropem — a trénink
        // ho pak nikdy nezlepšil, protože porovnává `current < cap`.
        base.maxPotential = Math.min(100, Math.max(base.maxPotential + 20, base.current));
      }
      return base;
    })(),
    experience: {
      current: Math.min(100, Math.max(0, (age - 16) * rng.int(3, 6))),
      maxPotential: 100,
    },
  };

  return skills;
}

/**
 * Generate goalkeeper skills.
 */
export function generateGKSkills(
  rng: Rng,
  villageSize: string,
  age: number,
  shift = 0,
): GoalkeeperSkills {
  const range = shiftedRange(villageSize, shift);
  const gkBonus = 5;

  // Bonusy odpovídají původním brankářským dovednostem, jen pod plochými názvy:
  // goalkeeping = reflexy a chytání (nejvyšší bonus), defense = postavení,
  // speed = vybíhání, technique = kopací technika, passing = rozehrávka,
  // heading = dosah, creativity = komunikace s obranou.
  return {
    goalkeeping: applyAgeCurve(generateSkillValue(rng, range, gkBonus + 5), age),
    defense: applyAgeCurve(generateSkillValue(rng, range, gkBonus + 3), age),
    speed: applyAgeCurve(generateSkillValue(rng, range, gkBonus), age),
    technique: applyAgeCurve(generateSkillValue(rng, range, gkBonus - 3), age),
    passing: applyAgeCurve(generateSkillValue(rng, range, gkBonus - 5), age),
    strength: applyAgeCurve(generateSkillValue(rng, range, 0), age),
    heading: applyAgeCurve(generateSkillValue(rng, range, gkBonus + 2), age),
    creativity: applyAgeCurve(generateSkillValue(rng, range, gkBonus), age),
    experience: {
      current: Math.min(100, Math.max(0, (age - 16) * rng.int(3, 6))),
      maxPotential: 100,
    },
  };
}

/**
 * Generate hidden talent value (0-100).
 */
export function generateHiddenTalent(rng: Rng, villageSize: string): number {
  const base = villageSize === "city" ? 25 : villageSize === "small_city" ? 20 : villageSize === "town" ? 15 : 10;
  return rng.int(0, base + 30);
}

/**
 * Calculate overall rating from skills and position.
 */
export function calculateOverallRating(
  position: string,
  skills: FieldSkills | GoalkeeperSkills,
  hiddenTalent: number,
): number {
  const weights = ratingWeightsFor(position);

  let weightedSum = 0;
  let totalWeight = 0;
  const skillsRecord = skills as unknown as Record<string, SkillValue>;

  for (const [key, weight] of Object.entries(weights)) {
    const sv = skillsRecord[key];
    if (sv) {
      weightedSum += sv.current * weight;
      totalWeight += weight;
    }
  }

  // POZOR: `hiddenTalent` se do hodnocení ZÁMĚRNĚ nepromítá.
  //
  // Je to SKRYTÁ vlastnost — kam hráč může vyrůst, ne co dnes umí. Dokud se
  // připočítávala (talent × 0,15), dostal hráč s talentem 95 rovnou +14 bodů
  // za schopnosti, které ještě nemá, a skrytá vlastnost byla v tabulce vidět.
  // Narovnání potenciálu pak zvedlo talent a hodnocení celé ligy skočilo,
  // aniž by kdokoli něco natrénoval.
  //
  // Parametr zůstává v signatuře, aby ho volající nemuseli přestat předávat;
  // potenciál se zobrazuje zvlášť přes skills/verdikt.ts a vyhled-hrace.ts.
  void hiddenTalent;
  return Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);
}

/**
 * Celkové hodnocení z plochých atributů, jak jsou uložené v DB.
 *
 * `calculateOverallRating` čte strukturu `{ skill: { current, maxPotential } }`, tedy sloupec
 * `skills_max`. Ten se ale po vzniku hráče už neaktualizuje — trénink zapisuje do plochého
 * `skills` (a u stamina/strength i do `physical`). Pro přepočet aktuálního hodnocení je proto
 * potřeba číst ploché hodnoty; `fallback` (typicky `skills_max`) doplní atributy, které
 * v `skills` u části hráčů vůbec nejsou (stamina, strength, vision, experience).
 */
export function overallRatingFromFlat(
  position: string,
  skills: Record<string, unknown>,
  physical: Record<string, unknown>,
  hiddenTalent: number,
  fallback?: Record<string, unknown>,
): number | null {
  const weights = ratingWeightsFor(position);
  const fullWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    let value: number | undefined;

    if (typeof skills[key] === "number") value = skills[key] as number;
    // stamina/strength drží pravdu v physical (read path ho preferuje)
    if (value === undefined && typeof physical[key] === "number") value = physical[key] as number;
    if (value === undefined && fallback) {
      const entry = fallback[key];
      if (typeof entry === "number") value = entry;
      else if (entry && typeof entry === "object" && typeof (entry as { current?: unknown }).current === "number") {
        value = (entry as { current: number }).current;
      }
    }

    if (value === undefined) continue; // atribut chybí → vynechat z průměru (shodně s calculateOverallRating)
    weightedSum += value * weight;
    totalWeight += weight;
  }

  // Když chybí většina atributů (část brankářů nemá vyplněné brankářské dovednosti nikde),
  // je zbylý průměr nereprezentativní — vrátit null a nechat volajícího hodnocení nesahat,
  // ať se z pár náhodných atributů nespočítá nesmysl.
  if (totalWeight < fullWeight / 2) return null;

  // Stejně jako v calculateOverallRating: skrytý talent do hodnocení nepatří.
  void hiddenTalent;
  return Math.round(weightedSum / totalWeight);
}

// ═══════════════════════════════════════════════
// JEDINÝ GENERÁTOR DOVEDNOSTÍ HRÁČE
// ═══════════════════════════════════════════════

export type PlayerPositionCode = "GK" | "DEF" | "MID" | "FWD";

/** Šance na klenot u kluka do 21 let: talent 70–95 a strop o 12–25 výš. */
export const GEM_CHANCE = 0.07;
const GEM_TALENT: [number, number] = [70, 95];
const GEM_EXTRA_CAP: [number, number] = [12, 25];

/** Co k běžnému klukovi přidá placená akademie (viz `YOUTH_BONUS` v season/youth.ts). */
export interface AcademyBonus {
  current: number;
  cap: number;
  talent: [number, number];
  gemChance: number;
}

export interface PlayerSkillsOptions {
  position: PlayerPositionCode;
  /** Skutečný věk hráče (zkušenost, talent, klenot). */
  age: number;
  /** Úroveň dovedností: hamlet | village | town | small_city | city. */
  level: string;
  /** Posun úrovně v bodech: AI kluby záporný, trh kladný. */
  shift?: number;
  /** Místo `shift`: hráč má v průměru vyjít na tohle hodnocení. */
  targetRating?: number;
  /** Věk pro věkovou křivku, když se liší od skutečného (legenda hraje na úrovni vrcholu kariéry). */
  skillAge?: number;
  academy?: AcademyBonus;
  /** Pevný talent (zkrachovalý talent z ligy). */
  hiddenTalent?: number;
  /** Strop výš o tolik bodů na každé dovednosti. */
  capBonus?: number;
}

export interface PlayerSkills {
  /** Ploché hodnoty do `skills`. */
  skills: Record<string, number>;
  /** Hodnoty se stropy do `skills_max`; `current` sedí se `skills`. */
  skillsMax: Record<string, SkillValue>;
  hiddenTalent: number;
  rating: number;
  experience: number;
}

/**
 * Skrytý talent podle úrovně a věku. Starší hráč ho z velké části už proměnil v dovednosti.
 */
export function talentForAge(rng: Rng, level: string, age: number): number {
  const base = generateHiddenTalent(rng, level);
  if (age <= 23) return base;
  if (age <= 28) return Math.round(base * 0.7);
  return Math.round(base * 0.4);
}

const ratingCurveCache = new Map<string, { base: number; slope: number }>();

/**
 * Průměrné hodnocení hráče daného věku na dané úrovni bez posunu (`base`) a o kolik ho
 * zvedne jeden bod posunu (`slope`). Počítá se ze vzorku generátoru, protože do hodnocení
 * vstupuje i zkušenost (roste s věkem, posun ji nemění) a věková křivka.
 */
function ratingCurve(level: string, position: PlayerPositionCode, age: number): { base: number; slope: number } {
  const key = `${level}:${position}:${age}`;
  const cached = ratingCurveCache.get(key);
  if (cached) return cached;
  const mean = (shift: number) => {
    // Pevné semínko, aby stejný dotaz dal vždy stejné číslo.
    const rng = createRng(20261003);
    const samples = 200;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const generated = position === "GK" ? generateGKSkills(rng, level, age, shift) : generateFieldSkills(rng, position, level, age, shift);
      const flat = flattenGeneratedSkills(generated, position === "GK");
      sum += overallRatingFromFlat(position, flat, { stamina: flat.stamina, strength: flat.strength }, 0) ?? 0;
    }
    return sum / samples;
  };
  const base = mean(0);
  const curve = { base, slope: Math.max(0.1, (mean(20) - base) / 20) };
  ratingCurveCache.set(key, curve);
  return curve;
}

/** Posun úrovně, se kterým hráč daného věku vyjde v průměru na `rating`. */
export function shiftForRating(level: string, position: PlayerPositionCode, age: number, rating: number): number {
  const { base, slope } = ratingCurve(level, position, age);
  return Math.round((rating - base) / slope);
}

/**
 * Brankářovy ploché dovednosti, které nemá vlastní (střelba, standardky, výdrž, přehled),
 * dostanou strop dovednosti, ze které se skládají — stejně jako v `flattenGeneratedSkills`.
 * Bez toho by je trénink zvedal bez omezení.
 */
function withGoalkeeperFlatCaps(values: Record<string, SkillValue>): Record<string, SkillValue> {
  return {
    ...values,
    shooting: { ...values.technique },
    setPieces: { ...values.technique },
    stamina: { ...values.strength },
    vision: { ...values.defense },
  };
}

/**
 * Dovednosti, strop, talent a hodnocení nového hráče. JEDINÉ místo, kde se tohle počítá.
 *
 * Hráči dřív vznikali na deseti místech a každé si dovednosti skládalo po svém: vlastní
 * losování 3–30, vlastní vzorec v `generatePlayer`, vlastní stropy, šest různých pravidel
 * pro talent. Kluk z nabídky dorostu tak vyšel s hodnocením 12, zatímco dorost klubu měl
 * průměr 30. Místa, kde hráč vzniká, se teď liší jen parametry (věk, úroveň, posun, bonus
 * akademie), ne výpočtem.
 */
export function generatePlayerSkills(rng: Rng, opts: PlayerSkillsOptions): PlayerSkills {
  const { position, age, level } = opts;
  const isGK = position === "GK";
  const skillAge = opts.skillAge ?? age;
  const shift = opts.targetRating !== undefined
    ? shiftForRating(level, position, skillAge, opts.targetRating)
    : (opts.shift ?? 0);

  const generated = isGK
    ? generateGKSkills(rng, level, skillAge, shift)
    : generateFieldSkills(rng, position, level, skillAge, shift);
  const values = generated as unknown as Record<string, SkillValue>;
  // Zkušenost se počítá ze skutečného věku, i když dovednosti jsou z vrcholu kariéry.
  if (skillAge !== age) {
    values.experience = { current: Math.min(100, Math.max(0, (age - 16) * rng.int(3, 6))), maxPotential: 100 };
  }

  let hiddenTalent = talentForAge(rng, level, age);
  let capBonus = opts.capBonus ?? 0;
  let currentBonus = 0;
  if (opts.academy) {
    capBonus += opts.academy.cap;
    currentBonus = opts.academy.current;
    hiddenTalent = Math.min(100, hiddenTalent + rng.int(opts.academy.talent[0], opts.academy.talent[1]));
  }
  // Občas se urodí kluk, co vesnici přeroste: zpočátku vypadá stejně, ale trénink ho vytáhne výš.
  const gemChance = opts.academy?.gemChance ?? (age <= 21 ? GEM_CHANCE : 0);
  if (rng.random() < gemChance) {
    hiddenTalent = rng.int(GEM_TALENT[0], GEM_TALENT[1]);
    capBonus += rng.int(GEM_EXTRA_CAP[0], GEM_EXTRA_CAP[1]);
  }
  if (opts.hiddenTalent !== undefined) hiddenTalent = opts.hiddenTalent;

  for (const [key, value] of Object.entries(values)) {
    // Zkušenost dávají odehrané minuty, ne talent ani akademie
    if (key === "experience") continue;
    value.maxPotential = Math.min(100, value.maxPotential + capBonus);
    value.current = Math.min(value.maxPotential, value.current + currentBonus);
  }

  const skills = flattenGeneratedSkills(generated, isGK);
  const skillsMax = isGK ? withGoalkeeperFlatCaps(values) : { ...values };
  const rating = overallRatingFromFlat(position, skills, { stamina: skills.stamina, strength: skills.strength }, hiddenTalent) ?? 1;
  return { skills, skillsMax, hiddenTalent, rating: Math.max(1, rating), experience: skills.experience };
}
