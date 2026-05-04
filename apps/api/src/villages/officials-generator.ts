/**
 * Deterministic generator pro představitele obce (starosta + 3 zastupitelé).
 * Seed = village_id + role + term_start_season → stejné postavy se vygenerují
 * znovu při replay/multiplayer. Avatary přes facesjs JSON config (kompatibilní
 * s `<FaceAvatar>` na FE).
 */

import { createRng, type Rng } from "../generators/rng";

export type OfficialRole = "starosta" | "mistostarosta" | "zastupitel_1" | "zastupitel_2";
export type Personality = "podnikatel" | "aktivista" | "sportovec" | "tradicionalista" | "populista";

export interface GeneratedOfficial {
  role: OfficialRole;
  firstName: string;
  lastName: string;
  age: number;
  occupation: string;
  faceConfig: Record<string, unknown>;
  personality: Personality;
  portfolio: string[];
  preferences: Record<string, number>;
}

const MALE_FIRST_NAMES = [
  "Jan", "Petr", "Martin", "Tomáš", "Josef", "Miroslav", "Karel", "Pavel",
  "Jiří", "Zdeněk", "Jaroslav", "Stanislav", "Milan", "Vladimír", "František",
  "Václav", "Oldřich", "Aleš", "Roman", "David", "Marek", "Michal", "Antonín",
  "Bohumil", "Radek", "Lukáš", "Ondřej",
];

const FEMALE_FIRST_NAMES = [
  "Marie", "Jana", "Eva", "Hana", "Anna", "Lenka", "Kateřina", "Lucie",
  "Jaroslava", "Věra", "Alena", "Helena", "Iva", "Daniela", "Petra",
  "Martina", "Zdeňka", "Ludmila",
];

const LAST_NAMES_M = [
  "Novák", "Svoboda", "Novotný", "Dvořák", "Černý", "Procházka", "Kučera",
  "Veselý", "Horák", "Němec", "Pokorný", "Pospíšil", "Hájek", "Jelínek",
  "Král", "Růžička", "Beneš", "Fiala", "Sedláček", "Doležal", "Zeman",
  "Kolář", "Navrátil", "Čermák", "Vaněk", "Urban", "Blažek", "Kříž",
  "Kopecký", "Šimek", "Marek",
];

const LAST_NAMES_F = LAST_NAMES_M.map((n) =>
  n.endsWith("ý")
    ? n.slice(0, -1) + "á"
    : n.endsWith("ek") || n.endsWith("ík") || n === "Beneš" || n === "Kříž"
      ? n + "ová"
      : n + "ová",
);

const OCCUPATIONS_BY_PERSONA: Record<Personality, string[]> = {
  podnikatel: [
    "majitel pily", "živnostník", "majitel autodílny", "obchodník se zemědělskou technikou",
    "majitel stavební firmy", "stavební podnikatel", "ředitel místní firmy",
  ],
  aktivista: [
    "učitel ZŠ", "knihovník", "ochránce přírody",
    "vedoucí turistického oddílu", "ředitel kulturního domu",
    "kronikář", "ředitel knihovny",
  ],
  sportovec: [
    "bývalý fotbalista", "trenér mládeže", "vedoucí sportovní komise",
    "fyzioterapeut", "učitel tělocviku", "rozhodčí",
  ],
  tradicionalista: [
    "zemědělec", "myslivec", "hasič", "kostelník", "důchodce — bývalý starosta",
    "vedoucí dechovky", "předseda spolku zahrádkářů",
  ],
  populista: [
    "hostinský", "majitel obchodu se smíšeným zbožím", "řezník",
    "taxikář", "majitel benzinky", "holič",
  ],
};

const PERSONALITY_AGE_RANGE: Record<Personality, [number, number]> = {
  podnikatel: [50, 70],
  aktivista: [45, 65],
  sportovec: [55, 75],
  tradicionalista: [60, 80],
  populista: [50, 70],
};

const PERSONALITY_PORTFOLIO: Record<Personality, string[]> = {
  podnikatel: ["finance", "infrastruktura"],
  aktivista: ["skolstvi", "kultura"],
  sportovec: ["sport", "mladez"],
  tradicionalista: ["kultura", "tradice"],
  populista: ["socialni_vec", "doprava"],
};

const PERSONALITY_PREFS: Record<Personality, Record<string, number>> = {
  podnikatel: { likes_local_players: 0.3, hates_loaning_out: 0.0, party_friendly: 0.2, sponsor_ties: 0.9 },
  aktivista: { likes_local_players: 0.7, hates_loaning_out: 0.5, party_friendly: 0.0, scandal_sensitive: 0.9 },
  sportovec: { likes_local_players: 0.6, hates_loaning_out: 0.4, party_friendly: 0.5, results_matter: 0.95 },
  tradicionalista: { likes_local_players: 0.95, hates_loaning_out: 0.8, party_friendly: 0.6, derby_friendly: 0.9 },
  populista: { likes_local_players: 0.4, hates_loaning_out: 0.2, party_friendly: 0.85, gift_friendly: 0.9 },
};

const PERSONA_PER_ROLE: Record<OfficialRole, Personality[]> = {
  // Starosta nejčastěji podnikatel/populista (volební motivace)
  starosta: ["podnikatel", "populista", "sportovec", "tradicionalista"],
  // Místostarosta často aktivista nebo tradicionalista
  mistostarosta: ["aktivista", "tradicionalista", "sportovec"],
  // Zastupitelé pestré
  zastupitel_1: ["aktivista", "podnikatel", "sportovec", "populista", "tradicionalista"],
  zastupitel_2: ["aktivista", "tradicionalista", "sportovec", "populista", "podnikatel"],
};

/** Stable string-to-32bit hash (cyrb53). */
function hashSeed(input: string): number {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ (h1 >>> 0);
}

function generateOfficialFace(rng: Rng, isFemale: boolean): Record<string, unknown> {
  const pick = <T,>(arr: T[]): T => arr[rng.int(0, arr.length - 1)];
  const r01 = () => rng.int(0, 100) / 100;

  const skinColors = ["#f2d6cb", "#ddb7a0", "#e8c4a0", "#f5d5c0", "#d4a882"];
  // Starší pánové: převažují šedé/bílé tóny
  // Pouze šedo-bílá paleta — žádné mladé tmavé tóny
  const hairColors = ["#9c9c9c", "#b0b0b0", "#c8c8c8", "#d8d8d0", "#e8e3d8", "#888080"];
  const headIds = ["head3", "head6", "head8", "head9", "head10", "head11", "head13"];
  const eyeIds = ["eye1", "eye3", "eye6", "eye9", "eye11"];
  const noseIds = ["nose2", "nose6", "nose9", "nose13", "honker"]; // honker = větší nos pro stáří
  // Bez úsměvů — vážné výrazy
  const mouthIds = ["mouth2", "straight", "closed", "straight", "closed"];
  // Krátké/řídnoucí účesy + víc plešek
  const hairIds = ["short-fade", "crop-fade2", "short-bald", "short-bald", "short-bald"];
  const earIds = ["ear1", "ear2", "ear3"];
  // Husté/zatažené obočí (víc šedivé)
  const eyebrowIds = ["eyebrow2", "eyebrow3", "eyebrow7", "eyebrow10", "eyebrow14"];

  const skinColor = pick(skinColors);
  const bald = r01() < 0.7; // 70% lysina

  return {
    fatness: 0.4 + r01() * 0.5, // víc baculatí
    teamColors: ["#555555", "#FFFFFF", "#333333"],
    hairBg: { id: "none" },
    body: { id: pick(["body", "body2", "body3"]), color: skinColor, size: 0.95 + r01() * 0.15 },
    jersey: { id: "suit" },
    ear: { id: pick(earIds), size: 0.7 + r01() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness: 0.4 + r01() * 0.4 },
    // Vrásky pod očima — vždy line2 nebo line3 (silnější)
    eyeLine: { id: pick(["line2", "line3", "line2"]) },
    // Vrásky úst — vždy line2 (větší)
    smileLine: { id: "line2", size: 1.0 + r01() * 0.3 },
    miscLine: { id: "none" },
    // 80% nějaký vous (knír / kozí brada / plnovous) — staří chlapi z vesnice
    facialHair: {
      id: r01() < 0.8
        ? pick(["mustache", "goatee3", "goatee4", "fullgoatee2", "mustache", "fullgoatee2"])
        : "none",
    },
    eye: { id: pick(eyeIds), angle: -3 + r01() * 6 },
    eyebrow: { id: pick(eyebrowIds), angle: -3 + r01() * 6 },
    hair: { id: bald ? "short-bald" : pick(hairIds), color: pick(hairColors), flip: r01() < 0.5 },
    mouth: { id: pick(mouthIds), flip: r01() < 0.5 },
    nose: { id: pick(noseIds), flip: r01() < 0.5, size: 0.85 + r01() * 0.4 }, // větší nosy
    glasses: { id: r01() < 0.55 ? "glasses1" : "none" }, // 55% brýle (dříve 35%)
    accessories: { id: "none" },
  };
}

/** Generuje deterministicky 4 představitele pro obec a daný term. */
export function generateOfficialsForVillage(
  villageId: string,
  termStartSeason: number,
): GeneratedOfficial[] {
  const roles: OfficialRole[] = ["starosta", "mistostarosta", "zastupitel_1", "zastupitel_2"];
  return roles.map((role) => generateOfficial(villageId, role, termStartSeason));
}

export function generateOfficial(
  villageId: string,
  role: OfficialRole,
  termStartSeason: number,
): GeneratedOfficial {
  const seed = hashSeed(`${villageId}|${role}|${termStartSeason}|v4-elderly-faces`);
  const rng = createRng(seed);

  const personalityPool = PERSONA_PER_ROLE[role];
  const personality = personalityPool[rng.int(0, personalityPool.length - 1)];

  // Vesnické zastupitelstvo na malých obcích: jen chlapi.
  const isFemale = false;

  const firstNames = isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;
  const lastNames = isFemale ? LAST_NAMES_F : LAST_NAMES_M;
  const firstName = firstNames[rng.int(0, firstNames.length - 1)];
  const lastName = lastNames[rng.int(0, lastNames.length - 1)];

  const [ageMin, ageMax] = PERSONALITY_AGE_RANGE[personality];
  const age = rng.int(ageMin, ageMax);

  const occupations = OCCUPATIONS_BY_PERSONA[personality];
  const occupation = occupations[rng.int(0, occupations.length - 1)];

  const portfolio = [...PERSONALITY_PORTFOLIO[personality]];
  const preferences = { ...PERSONALITY_PREFS[personality] };

  const faceConfig = generateOfficialFace(rng, isFemale);

  return { role, firstName, lastName, age, occupation, faceConfig, personality, portfolio, preferences };
}
