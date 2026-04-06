import type { Rng } from "./rng";
import type {
  PlayerPosition,
  BodyType,
  AvatarConfig,
} from "@okresni-masina/shared";
import type { PreferredFoot, PreferredSide } from "../skills/types";
import { pickOccupation } from "./occupations";

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
  district?: string;
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
  // New attributes
  preferredFoot: PreferredFoot;
  preferredSide: PreferredSide;
  leadership: number;
  workRate: number;
  aggression: number;
  consistency: number;
  clutch: number;
}

// Průměrná kvalita hráčů dle kategorie obce (0-100 škála)
// Malý rozdíl — okresní fotbal, i malá vesnice má šanci
const QUALITY_BY_CATEGORY: Record<string, number> = {
  vesnice: 37,  // hamlet → sem, blízko obci
  obec: 39,     // village
  mestys: 41,
  mesto: 44,    // město má výhodu ale ne drtivou
};

const POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

// Rozložení pozic v kádru (pro ~20 hráčů)
const POSITION_DISTRIBUTION: Record<PlayerPosition, number> = {
  GK: 2,
  DEF: 7,
  MID: 6,
  FWD: 5,
};

// Occupations are now in occupations.ts — imported by teams route
// Kept as fallback only
const FALLBACK_OCCUPATIONS = [
  "Zedník", "Tesař", "Zemědělec", "Řezník", "Hospodský",
  "Automechanik", "Skladník", "Prodavač", "Nezaměstnaný",
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
 * Generate football attributes with position bias and age curve (0-100 škála).
 */
function generateAttributes(
  rng: Rng,
  position: PlayerPosition,
  age: number,
  qualityBase: number,
): Record<string, number> {
  // Age curve: peak at 27, decline after 32
  let ageMod = 0;
  if (age < 20) ageMod = -10;
  else if (age < 24) ageMod = -5;
  else if (age <= 30) ageMod = 0;
  else if (age <= 34) ageMod = -5;
  else if (age <= 38) ageMod = -10;
  else ageMod = -20;

  const base = qualityBase + ageMod;

  function attr(posBonus: number): number {
    const val = base + posBonus + rng.int(-15, 15);
    return Math.max(1, Math.min(100, val));
  }

  // Position-specific biases (0-100 škála)
  const biases: Record<PlayerPosition, Record<string, number>> = {
    GK: {
      speed: -10, technique: -10, shooting: -20, passing: -10,
      heading: -10, defense: 5, goalkeeping: 30,
    },
    DEF: {
      speed: 0, technique: -5, shooting: -10, passing: 0,
      heading: 10, defense: 15, goalkeeping: -30,
    },
    MID: {
      speed: 0, technique: 10, shooting: 0, passing: 15,
      heading: 0, defense: 0, goalkeeping: -30,
    },
    FWD: {
      speed: 10, technique: 5, shooting: 15, passing: 0,
      heading: 5, defense: -10, goalkeeping: -30,
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

  let qualityBase = QUALITY_BY_CATEGORY[village.category] + rng.int(-2, 2);
  // Wonderkid: 2% šance na výjimečný talent (+15-25 quality boost)
  const isWonderkid = age <= 21 && rng.random() < 0.02;
  if (isWonderkid) qualityBase += rng.int(15, 25);
  // Exceptional player: 1% šance na nadprůměrného hráče (+8-15)
  const isExceptional = !isWonderkid && rng.random() < 0.01;
  if (isExceptional) qualityBase += rng.int(8, 15);
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

  // Physical attributes (0-100 škála)
  const stamina = Math.max(1, Math.min(100,
    qualityBase + (age < 30 ? 10 : age < 35 ? 0 : -15) + rng.int(-15, 15)));
  const strength = Math.max(1, Math.min(100,
    qualityBase + (bodyType === "athletic" ? 10 : bodyType === "stocky" ? 5 : 0) + rng.int(-10, 10)));
  const injuryProneness = rng.int(5, 100);

  // Personality (0-100 škála)
  const discipline = rng.int(5, 100);
  const patriotism = Math.max(1, Math.min(100,
    50 + (village.category === "vesnice" ? 20 : village.category === "obec" ? 10 : 0) + rng.int(-25, 25)));
  const alcohol = rng.int(5, 100);
  const temper = rng.int(5, 100);

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

  // Map category back to villageSize for pickOccupation
  const villageSizeMap: Record<string, string> = { vesnice: "hamlet", obec: "village", mestys: "town", mesto: "small_city" };
  const occ = pickOccupation(rng, villageSizeMap[village.category] ?? "village", age, village.district);
  const occupation = occ.name;

  // ── New attributes ──

  // Preferred foot: right 70%, left 20%, both 10%
  const footRoll = rng.int(0, 100);
  const preferredFoot: PreferredFoot = footRoll < 70 ? "right" : footRoll < 90 ? "left" : "both";

  // Preferred side: depends on position + foot
  const preferredSide: PreferredSide = (() => {
    if (position === "GK") return "center" as PreferredSide;
    const leftBonus = preferredFoot === "left" ? 20 : 0;
    const rightBonus = preferredFoot === "right" ? 10 : 0;
    const weights: Record<string, Record<PreferredSide, number>> = {
      DEF: { left: 25 + leftBonus, center: 45, right: 25 + rightBonus, any: 5 },
      MID: { left: 25 + leftBonus, center: 25, right: 25 + rightBonus, any: 25 },
      FWD: { left: 20 + leftBonus, center: 40, right: 20 + rightBonus, any: 20 },
    };
    return rng.weighted(weights[position] ?? weights.MID) as PreferredSide;
  })();

  // Leadership: age + occupation + discipline
  const LEADERSHIP_OCCUPATIONS: Record<string, number> = {
    "Hospodský": 15, "Hasič": 10, "Policista": 10, "Učitel": 8, "Starosta": 12, "Trenér mládeže": 10,
  };
  const leadershipBase = rng.int(10, 50)
    + Math.max(0, (age - 25) * 2)
    + (LEADERSHIP_OCCUPATIONS[occupation] ?? 0)
    + Math.round(discipline * 0.3); // discipline is 0-100, *0.3 gives 0-30
  const leadership = Math.min(100, Math.max(1, leadershipBase));

  // Work rate: position + physical jobs + alcohol penalty
  const PHYSICAL_OCCUPATIONS = ["Zemědělec", "Zedník", "Dřevorubec", "Kovář", "Řezník", "Hasič", "Automechanik"];
  const workRateBase = rng.int(20, 70)
    + (position === "DEF" ? 10 : position === "MID" ? 5 : position === "FWD" ? -5 : 0)
    + (PHYSICAL_OCCUPATIONS.includes(occupation) ? 10 : 0)
    - (age > 35 ? (age - 35) * 3 : 0)
    - (alcohol > 70 ? Math.round((alcohol - 70) * 0.4) : 0); // alcohol 0-100
  const workRate = Math.min(100, Math.max(1, workRateBase));

  // Aggression: bodyType + occupation + temper
  const AGGRESSIVE_OCCUPATIONS: Record<string, number> = {
    "Řezník": 15, "Kovář": 15, "Dřevorubec": 10, "Zedník": 10, "Hasič": 8, "Zemědělec": 8,
  };
  const aggressionBase = rng.int(15, 65)
    + (bodyType === "stocky" ? 15 : bodyType === "athletic" ? 10 : bodyType === "thin" ? -10 : 0)
    + (AGGRESSIVE_OCCUPATIONS[occupation] ?? 0)
    + Math.round(temper * 0.2); // temper 0-100, *0.2 gives 0-20
    + (position === "DEF" ? 10 : position === "FWD" ? 5 : position === "GK" ? -10 : 0);
  const aggression = Math.min(100, Math.max(1, aggressionBase));

  // Consistency (hidden): experience-like, discipline helps
  const consistencyBase = rng.int(20, 80)
    + Math.round((age > 25 ? Math.min(30, (age - 20) * 2) : 0)) // experience proxy
    - Math.round(alcohol * 0.2) // alcohol 0-100
    + Math.round(discipline * 0.2); // discipline 0-100
  const consistency = Math.min(100, Math.max(1, consistencyBase));

  // Clutch (hidden): intentionally unpredictable
  const CLUTCH_OCCUPATIONS: Record<string, number> = {
    "Hasič": 10, "Záchranář": 10, "Policista": 8, "Chirurg": 12,
  };
  const clutch = Math.min(100, Math.max(1,
    rng.int(10, 90) + (CLUTCH_OCCUPATIONS[occupation] ?? 0)));

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
    preferredFoot,
    preferredSide,
    leadership,
    workRate,
    aggression,
    consistency,
    clutch,
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
  const size = squadSize ?? (village.category === "vesnice" ? 18 : village.category === "obec" ? 20 : 22);

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

// ═══════════════════════════════════════════════
// CELEBRITY / SPECIAL PLAYER GENERATORS
// ═══════════════════════════════════════════════

export type CelebrityType = "legend" | "fallen_star" | "glass_man";
export type CelebrityTier = "S" | "A" | "B" | "C";

const CELEBRITY_SURNAMES = [
  "Nedvěd", "Koller", "Poborský", "Šmicer", "Baroš", "Čech",
  "Rosický", "Berger", "Galásek", "Ujfaluši", "Jankulovski",
  "Grygera", "Kadlec", "Skuhravý", "Kuka", "Siegl",
  "Lička", "Nemec", "Johana", "Bejbl", "Horňák",
  "Řepka", "Lokvenc", "Jarolím", "Rada", "Vítek",
  "Lafata", "Hložek", "Souček", "Schick", "Coufal",
  "Krejčí", "Darida", "Dočkal", "Hubník", "Gebre Selassie",
];

const CELEBRITY_NICKNAMES: Record<CelebrityTier, string[]> = {
  S: ["Maestro", "Bombar", "Mašina", "Legenda", "Kanón", "Generál"],
  A: ["Profík", "Buldok", "Raketa", "Střelec"],
  B: ["Matador", "Veterán", "Borec"],
  C: ["Mazák", "Rutinér"],
};

const TIER_CONFIG: Record<CelebrityTier, {
  overallMin: number; overallMax: number;
  ageMin: number; ageMax: number;
  disciplineMin: number; disciplineMax: number;
  alcoholMin: number; alcoholMax: number;
  transportCost: number;
  absenceRate: number;
  attendanceBonus: number;
  reputationBonus: number;
  signingBonus: number;
  tierLabel: string;
}> = {
  S: { overallMin: 75, overallMax: 90, ageMin: 38, ageMax: 48, disciplineMin: 3, disciplineMax: 10, alcoholMin: 70, alcoholMax: 95, transportCost: 2000, absenceRate: 0.67, attendanceBonus: 3.0, reputationBonus: 15, signingBonus: 5000, tierLabel: "bývalý reprezentant" },
  A: { overallMin: 60, overallMax: 75, ageMin: 36, ageMax: 42, disciplineMin: 5, disciplineMax: 15, alcoholMin: 60, alcoholMax: 85, transportCost: 1000, absenceRate: 0.60, attendanceBonus: 2.0, reputationBonus: 10, signingBonus: 3000, tierLabel: "ex-ligista z 1. ligy" },
  B: { overallMin: 50, overallMax: 65, ageMin: 35, ageMax: 40, disciplineMin: 8, disciplineMax: 20, alcoholMin: 50, alcoholMax: 75, transportCost: 500, absenceRate: 0.50, attendanceBonus: 1.5, reputationBonus: 7, signingBonus: 1500, tierLabel: "hrál 2. ligu" },
  C: { overallMin: 45, overallMax: 55, ageMin: 34, ageMax: 38, disciplineMin: 12, disciplineMax: 30, alcoholMin: 40, alcoholMax: 65, transportCost: 200, absenceRate: 0.40, attendanceBonus: 1.25, reputationBonus: 4, signingBonus: 1000, tierLabel: "krajský přeborník" },
};

export { TIER_CONFIG };

interface CelebrityResult extends GeneratedPlayer {
  celebrityType: CelebrityType;
  celebrityTier?: CelebrityTier;
  transportCost: number;
  nickname: string | null;
  tierLabel: string;
  hiddenTalent?: number;
  skillsMax?: Record<string, number>;
}

export function generateCelebrityLegend(
  rng: Rng,
  tier: CelebrityTier,
  firstnameData: FirstnameData,
): CelebrityResult {
  const cfg = TIER_CONFIG[tier];
  const age = rng.int(cfg.ageMin, cfg.ageMax);
  const position = rng.pick(["DEF", "MID", "FWD"] as PlayerPosition[]);
  const decade = ageToDecade(age);
  const firstName = rng.weighted(firstnameData.male[decade] ?? firstnameData.male["1980s"]);
  const lastName = rng.pick(CELEBRITY_SURNAMES);
  const nickname = rng.random() < 0.6 ? rng.pick(CELEBRITY_NICKNAMES[tier]) : null;

  const qualityBase = rng.int(cfg.overallMin, cfg.overallMax);
  const attrs = generateAttributes(rng, position, Math.min(age, 32), qualityBase); // use peak-age for skill gen

  let hairStyle = rng.pick(HAIR_STYLES);
  if (age > 40 && rng.random() < 0.5) hairStyle = "bald";
  else if (age > 36 && rng.random() < 0.4) hairStyle = "receding";
  let hairColor = rng.pick(HAIR_COLORS);
  if (age > 44) hairColor = rng.random() < 0.6 ? "gray" : "white";

  const avatarConfig: AvatarConfig = {
    bodyType: rng.pick(["athletic", "normal", "stocky"] as BodyType[]),
    head: rng.int(1, 6), eyes: rng.int(1, 8), nose: rng.int(1, 6),
    mouth: rng.int(1, 5), ears: rng.int(1, 4),
    hair: hairStyle, hairColor,
    skinTone: rng.weighted({ light: 0.45, medium_light: 0.40, medium: 0.12, medium_dark: 0.02, dark: 0.01 }),
    facialHair: rng.pick(FACIAL_HAIR), glasses: rng.pick(GLASSES), accessories: [],
  };

  return {
    firstName, lastName, age, position,
    speed: attrs.speed, technique: attrs.technique, shooting: attrs.shooting,
    passing: attrs.passing, heading: attrs.heading, defense: attrs.defense,
    goalkeeping: attrs.goalkeeping,
    stamina: Math.max(15, rng.int(25, 45)),
    strength: Math.max(20, rng.int(35, 65)),
    injuryProneness: rng.int(30, 70),
    discipline: rng.int(cfg.disciplineMin, cfg.disciplineMax),
    patriotism: rng.int(0, 15),
    alcohol: rng.int(cfg.alcoholMin, cfg.alcoholMax),
    temper: rng.int(20, 70),
    occupation: "Fotbalový důchodce",
    bodyType: avatarConfig.bodyType as BodyType,
    avatarConfig,
    condition: rng.int(40, 65),
    morale: rng.int(55, 75),
    preferredFoot: rng.random() < 0.7 ? "right" : rng.random() < 0.7 ? "left" : "both",
    preferredSide: rng.pick(["left", "center", "right", "any"] as PreferredSide[]),
    leadership: rng.int(50, 85),
    workRate: rng.int(5, 20),
    aggression: rng.int(15, 50),
    consistency: rng.int(40, 75),
    clutch: rng.int(50, 90),
    celebrityType: "legend",
    celebrityTier: tier,
    transportCost: cfg.transportCost,
    nickname,
    tierLabel: cfg.tierLabel,
  };
}

export function generateFallenStar(
  rng: Rng,
  firstnameData: FirstnameData,
): CelebrityResult {
  const age = rng.int(22, 28);
  const position = rng.pick(["MID", "FWD"] as PlayerPosition[]);
  const decade = ageToDecade(age);
  const firstName = rng.weighted(firstnameData.male[decade] ?? firstnameData.male["1990s"]);
  const lastName = rng.pick(CELEBRITY_SURNAMES);

  const qualityBase = rng.int(40, 55);
  const attrs = generateAttributes(rng, position, age, qualityBase);

  const avatarConfig: AvatarConfig = {
    bodyType: rng.pick(["normal", "stocky"] as BodyType[]),
    head: rng.int(1, 6), eyes: rng.int(1, 8), nose: rng.int(1, 6),
    mouth: rng.int(1, 5), ears: rng.int(1, 4),
    hair: rng.pick(HAIR_STYLES), hairColor: rng.pick(HAIR_COLORS),
    skinTone: rng.weighted({ light: 0.45, medium_light: 0.40, medium: 0.12, medium_dark: 0.02, dark: 0.01 }),
    facialHair: rng.pick(FACIAL_HAIR), glasses: rng.pick(GLASSES), accessories: [],
  };

  return {
    firstName, lastName, age, position,
    speed: attrs.speed, technique: attrs.technique, shooting: attrs.shooting,
    passing: attrs.passing, heading: attrs.heading, defense: attrs.defense,
    goalkeeping: attrs.goalkeeping,
    stamina: rng.int(30, 50),
    strength: rng.int(40, 65),
    injuryProneness: rng.int(20, 55),
    discipline: rng.int(5, 20),
    patriotism: rng.int(5, 30),
    alcohol: rng.int(80, 100),
    temper: rng.int(40, 85),
    occupation: "Nezaměstnaný",
    bodyType: avatarConfig.bodyType as BodyType,
    avatarConfig,
    condition: rng.int(30, 55),
    morale: rng.int(15, 35),
    preferredFoot: rng.random() < 0.6 ? "right" : rng.random() < 0.6 ? "left" : "both",
    preferredSide: rng.pick(["left", "center", "right"] as PreferredSide[]),
    leadership: rng.int(5, 25),
    workRate: rng.int(10, 30),
    aggression: rng.int(30, 75),
    consistency: rng.int(10, 35),
    clutch: rng.int(20, 60),
    celebrityType: "fallen_star",
    transportCost: 300,
    nickname: null,
    tierLabel: "zkrachovalý talent z 1. ligy",
    hiddenTalent: rng.int(70, 90),
    skillsMax: {
      speed: rng.int(65, 85), technique: rng.int(65, 85), shooting: rng.int(65, 85),
      passing: rng.int(65, 85), heading: rng.int(55, 75), defense: rng.int(50, 70),
    },
  };
}

export function generateGlassMan(
  rng: Rng,
  firstnameData: FirstnameData,
): CelebrityResult {
  const age = rng.int(27, 33);
  const position = rng.pick(["DEF", "MID", "FWD"] as PlayerPosition[]);
  const decade = ageToDecade(age);
  const firstName = rng.weighted(firstnameData.male[decade] ?? firstnameData.male["1990s"]);
  const lastName = rng.pick(CELEBRITY_SURNAMES);

  const qualityBase = rng.int(55, 70);
  const attrs = generateAttributes(rng, position, age, qualityBase);

  const avatarConfig: AvatarConfig = {
    bodyType: rng.pick(["thin", "athletic", "normal"] as BodyType[]),
    head: rng.int(1, 6), eyes: rng.int(1, 8), nose: rng.int(1, 6),
    mouth: rng.int(1, 5), ears: rng.int(1, 4),
    hair: rng.pick(HAIR_STYLES), hairColor: rng.pick(HAIR_COLORS),
    skinTone: rng.weighted({ light: 0.45, medium_light: 0.40, medium: 0.12, medium_dark: 0.02, dark: 0.01 }),
    facialHair: rng.pick(FACIAL_HAIR), glasses: rng.pick(GLASSES), accessories: [],
  };

  return {
    firstName, lastName, age, position,
    speed: attrs.speed, technique: attrs.technique, shooting: attrs.shooting,
    passing: attrs.passing, heading: attrs.heading, defense: attrs.defense,
    goalkeeping: attrs.goalkeeping,
    stamina: rng.int(25, 40),
    strength: rng.int(35, 55),
    injuryProneness: rng.int(85, 100),
    discipline: rng.int(40, 70),
    patriotism: rng.int(15, 45),
    alcohol: rng.int(10, 40),
    temper: rng.int(15, 50),
    occupation: "Fyzioterapeut",
    bodyType: avatarConfig.bodyType as BodyType,
    avatarConfig,
    condition: rng.int(35, 55),
    morale: rng.int(40, 60),
    preferredFoot: rng.random() < 0.7 ? "right" : rng.random() < 0.6 ? "left" : "both",
    preferredSide: rng.pick(["left", "center", "right"] as PreferredSide[]),
    leadership: rng.int(30, 60),
    workRate: rng.int(50, 75),
    aggression: rng.int(15, 40),
    consistency: rng.int(45, 75),
    clutch: rng.int(40, 70),
    celebrityType: "glass_man",
    transportCost: 500,
    nickname: null,
    tierLabel: "věčně zraněný profík",
  };
}
