import type { Rng } from "./rng";
import type {
  PlayerPosition,
  BodyType,
  AvatarConfig,
} from "@okresni-masina/shared";

// Seed data types
interface SurnameData {
  surnames: Record<string, number>;
  female_forms: Record<string, string>;
}

interface FirstnameData {
  male: Record<string, Record<string, number>>;
  female: Record<string, Record<string, number>>;
}

export interface VillageInfo {
  region_code: string;
  category: "vesnice" | "obec" | "mestys" | "mesto";
  population: number;
}

export interface GeneratedPlayer {
  firstName: string;
  lastName: string;
  age: number;
  position: PlayerPosition;
  speed: number;
  technique: number;
  shooting: number;
  passing: number;
  heading: number;
  defense: number;
  goalkeeping: number;
  stamina: number;
  strength: number;
  injuryProneness: number;
  discipline: number;
  patriotism: number;
  alcohol: number;
  temper: number;
  occupation: string;
  bodyType: BodyType;
  avatarConfig: AvatarConfig;
  condition: number;
  morale: number;
}

// Průměrná kvalita hráčů dle kategorie obce
const QUALITY_BY_CATEGORY: Record<string, number> = {
  vesnice: 6,
  obec: 8,
  mestys: 10,
  mesto: 12,
};

const POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

// Rozložení pozic v kádru (pro ~20 hráčů)
const POSITION_DISTRIBUTION: Record<PlayerPosition, number> = {
  GK: 2,
  DEF: 7,
  MID: 6,
  FWD: 5,
};

const OCCUPATIONS = [
  "Řidič kamionu", "Zedník", "Tesař", "Instalatér", "Elektrikář",
  "Mechanik", "Řezník", "Pekař", "Hospodský", "Prodavač",
  "Zemědělec", "Traktorista", "Lesní dělník", "Skladník",
  "Hasič", "Policista", "Učitel", "Účetní", "Programátor",
  "Úředník", "Poštovní doručovatel", "Svářeč", "Malíř pokojů",
  "Automechanik", "Student", "Nezaměstnaný", "Podnikatel",
  "Kuchař", "Číšník", "Truhlář", "Pokrývač", "Strojní inženýr",
  "Záchranář", "Správce hřiště", "Důchodce",
];

const BODY_TYPES: BodyType[] = ["thin", "athletic", "normal", "stocky", "obese"];

const HAIR_STYLES = [
  "short_classic", "buzz_cut", "bald", "receding", "bald_top",
  "medium", "long", "dreads", "sideburns", "fringe",
  "mohawk", "mullet", "combover", "curly", "spiky",
];

const HAIR_COLORS = [
  "brown", "dark_brown", "black", "blonde", "light_brown",
  "red", "gray", "white",
];

const SKIN_TONES = ["light", "medium_light", "medium", "medium_dark", "dark"];

const FACIAL_HAIR = [
  "none", "none", "none", "stubble_1day", "stubble_3day",
  "mustache", "mustache_goatee", "full_short", "full_long",
  "goatee", "sideburns", "unkempt",
];

const GLASSES = ["none", "none", "none", "none", "classic", "sport", "thick", "round", "square"];

/**
 * Determine decade string from player age (in 2024 game year).
 */
function ageToDecade(age: number): string {
  const birthYear = 2024 - age;
  if (birthYear < 1970) return "1960s";
  if (birthYear < 1980) return "1970s";
  if (birthYear < 1990) return "1980s";
  if (birthYear < 2000) return "1990s";
  if (birthYear < 2010) return "2000s";
  return "2010s";
}

/**
 * Generate football attributes with position bias and age curve.
 */
function generateAttributes(
  rng: Rng,
  position: PlayerPosition,
  age: number,
  qualityBase: number,
): Record<string, number> {
  // Age curve: peak at 27, decline after 32
  let ageMod = 0;
  if (age < 20) ageMod = -2;
  else if (age < 24) ageMod = -1;
  else if (age <= 30) ageMod = 0;
  else if (age <= 34) ageMod = -1;
  else if (age <= 38) ageMod = -2;
  else ageMod = -4;

  const base = qualityBase + ageMod;

  function attr(posBonus: number): number {
    const val = base + posBonus + rng.int(-3, 3);
    return Math.max(1, Math.min(20, val));
  }

  // Position-specific biases
  const biases: Record<PlayerPosition, Record<string, number>> = {
    GK: {
      speed: -2, technique: -2, shooting: -4, passing: -2,
      heading: -2, defense: 1, goalkeeping: 6,
    },
    DEF: {
      speed: 0, technique: -1, shooting: -2, passing: 0,
      heading: 2, defense: 3, goalkeeping: -6,
    },
    MID: {
      speed: 0, technique: 2, shooting: 0, passing: 3,
      heading: 0, defense: 0, goalkeeping: -6,
    },
    FWD: {
      speed: 2, technique: 1, shooting: 3, passing: 0,
      heading: 1, defense: -2, goalkeeping: -6,
    },
  };

  const b = biases[position];

  return {
    speed: attr(b.speed),
    technique: attr(b.technique),
    shooting: attr(b.shooting),
    passing: attr(b.passing),
    heading: attr(b.heading),
    defense: attr(b.defense),
    goalkeeping: attr(b.goalkeeping),
  };
}

/**
 * Generate a single player.
 */
export function generatePlayer(
  rng: Rng,
  village: VillageInfo,
  position: PlayerPosition,
  surnameData: SurnameData,
  firstnameData: FirstnameData,
): GeneratedPlayer {
  // Age: mostly 18–38, some outliers
  const age = rng.int(0, 100) < 5
    ? rng.int(39, 52) // Occasional old-timer
    : rng.int(0, 100) < 10
      ? rng.int(16, 18) // Young talent
      : rng.int(19, 37);

  const decade = ageToDecade(age);
  const firstName = rng.weighted(firstnameData.male[decade] ?? firstnameData.male["1980s"]);
  const lastName = rng.weighted(surnameData.surnames);

  const qualityBase = QUALITY_BY_CATEGORY[village.category] + rng.int(-2, 2);
  const attrs = generateAttributes(rng, position, age, qualityBase);

  // Body type correlates with age and position
  const bodyWeights: Record<BodyType, number> = {
    thin: position === "FWD" ? 20 : 10,
    athletic: age < 30 ? 30 : 15,
    normal: 30,
    stocky: age > 30 ? 25 : 15,
    obese: age > 35 ? 15 : 5,
  };
  const bodyType = rng.weighted(bodyWeights) as BodyType;

  // Physical attributes
  const stamina = Math.max(1, Math.min(20,
    qualityBase + (age < 30 ? 2 : age < 35 ? 0 : -3) + rng.int(-3, 3)));
  const strength = Math.max(1, Math.min(20,
    qualityBase + (bodyType === "athletic" ? 2 : bodyType === "stocky" ? 1 : 0) + rng.int(-2, 2)));
  const injuryProneness = rng.int(1, 20);

  // Personality
  const discipline = rng.int(1, 20);
  const patriotism = Math.max(1, Math.min(20,
    10 + (village.category === "vesnice" ? 4 : village.category === "obec" ? 2 : 0) + rng.int(-5, 5)));
  const alcohol = rng.int(1, 20);
  const temper = rng.int(1, 20);

  // Hair: older players more likely bald/gray
  let hairStyle = rng.pick(HAIR_STYLES);
  if (age > 40 && rng.random() < 0.4) hairStyle = "bald";
  else if (age > 35 && rng.random() < 0.3) hairStyle = "receding";

  let hairColor = rng.pick(HAIR_COLORS);
  if (age > 45) hairColor = rng.random() < 0.6 ? "gray" : "white";
  else if (age > 38) hairColor = rng.random() < 0.3 ? "gray" : hairColor;

  const avatarConfig: AvatarConfig = {
    bodyType,
    head: rng.int(1, 6),
    eyes: rng.int(1, 8),
    nose: rng.int(1, 6),
    mouth: rng.int(1, 5),
    ears: rng.int(1, 4),
    hair: hairStyle,
    hairColor,
    skinTone: rng.weighted({ light: 0.45, medium_light: 0.40, medium: 0.12, medium_dark: 0.02, dark: 0.01 }),
    facialHair: rng.pick(FACIAL_HAIR),
    glasses: rng.pick(GLASSES),
    accessories: [],
  };

  const occupation = age < 18 ? "Student" : age > 60 ? "Důchodce" : rng.pick(OCCUPATIONS);

  return {
    firstName,
    lastName,
    age,
    position,
    speed: attrs.speed,
    technique: attrs.technique,
    shooting: attrs.shooting,
    passing: attrs.passing,
    heading: attrs.heading,
    defense: attrs.defense,
    goalkeeping: attrs.goalkeeping,
    stamina,
    strength,
    injuryProneness,
    discipline,
    patriotism,
    alcohol,
    temper,
    occupation,
    bodyType,
    avatarConfig,
    condition: 100,
    morale: 50 + rng.int(-10, 10),
  };
}

/**
 * Generate a full squad for a village.
 */
export function generateSquad(
  rng: Rng,
  village: VillageInfo,
  surnameData: SurnameData,
  firstnameData: FirstnameData,
  squadSize?: number,
): GeneratedPlayer[] {
  const size = squadSize ?? village.category === "vesnice" ? 18 : village.category === "obec" ? 20 : 22;

  // Build position list
  const positions: PlayerPosition[] = [];
  const ratio = size / 20;
  for (const [pos, count] of Object.entries(POSITION_DISTRIBUTION)) {
    const n = Math.max(1, Math.round(count * ratio));
    for (let i = 0; i < n; i++) {
      positions.push(pos as PlayerPosition);
    }
  }
  // Pad or trim to exact squad size
  while (positions.length < size) positions.push(rng.pick(POSITIONS));
  while (positions.length > size) positions.pop();
  rng.shuffle(positions);

  return positions.map((pos) =>
    generatePlayer(rng, village, pos, surnameData, firstnameData)
  );
}
