import type { Rng } from "./rng";
import type { GeneratedPlayer, VillageInfo } from "./player";
import type { RelationshipType } from "@okresni-masina/shared";

export interface GeneratedRelationship {
  playerAIndex: number;
  playerBIndex: number;
  type: RelationshipType;
  strength: number;
}

/** Od jaké hodnoty `alcohol` (škála 0–100) se z dvojice stanou parťáci od piva. */
export const DRINKING_BUDDY_ALCOHOL = 60;

/**
 * FMK-29: Generátor příbuzenských a sociálních vazeb v kádru.
 *
 * Pravidla:
 * - Na kádr 20 hráčů: 2–4 příbuzenské páry
 * - Menší obec = víc vazeb
 * - Bratři: stejné příjmení, podobný věk (±5)
 * - Otec-syn: stejné příjmení, věkový rozdíl 18–35
 * - Spolužáci: podobný věk (±2)
 * - Kolegové: stejné zaměstnání
 */
export function generateRelationships(
  rng: Rng,
  squad: GeneratedPlayer[],
  village: VillageInfo,
): GeneratedRelationship[] {
  const relationships: GeneratedRelationship[] = [];
  const usedPairs = new Set<string>();

  function pairKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  function addRelation(a: number, b: number, type: RelationshipType, strength: number) {
    const key = pairKey(a, b);
    if (usedPairs.has(key)) return;
    usedPairs.add(key);
    relationships.push({
      playerAIndex: a,
      playerBIndex: b,
      type,
      strength,
    });
  }

  // Determine target number of relationships based on village size
  const targetCount = village.category === "vesnice" ? rng.int(4, 6)
    : village.category === "obec" ? rng.int(3, 5)
    : rng.int(2, 4);

  // Step 1: Force some brothers by making players share surnames
  const brotherCount = Math.min(rng.int(1, 2), Math.floor(targetCount / 2));
  const availableIndices = Array.from({ length: squad.length }, (_, i) => i);
  rng.shuffle(availableIndices);

  let created = 0;
  for (let i = 0; i < brotherCount && availableIndices.length >= 2; i++) {
    const aIdx = availableIndices.pop()!;
    const bIdx = availableIndices.pop()!;
    const a = squad[aIdx];
    const b = squad[bIdx];

    // Make them share surname
    b.lastName = a.lastName;

    const ageDiff = Math.abs(a.age - b.age);
    if (ageDiff >= 18 && ageDiff <= 35) {
      // Father-son
      addRelation(aIdx, bIdx, "father_son", rng.int(60, 90));
    } else {
      // Brothers
      // Adjust age to be within ±5 years
      if (ageDiff > 5) {
        b.age = a.age + rng.int(-4, 4);
        if (b.age < 16) b.age = 16;
        if (b.age > 50) b.age = 50;
      }
      addRelation(aIdx, bIdx, "brothers", rng.int(70, 95));
    }
    created++;
  }

  // Step 2: Find natural father-son pairs (same surname, age diff 18-35)
  if (created < targetCount) {
    for (let a = 0; a < squad.length && created < targetCount; a++) {
      for (let b = a + 1; b < squad.length && created < targetCount; b++) {
        if (usedPairs.has(pairKey(a, b))) continue;
        if (squad[a].lastName !== squad[b].lastName) continue;
        const ageDiff = Math.abs(squad[a].age - squad[b].age);
        if (ageDiff >= 18 && ageDiff <= 35) {
          addRelation(a, b, "father_son", rng.int(60, 85));
          created++;
        }
      }
    }
  }

  // Step 3: In-laws (different surnames, random pairing)
  if (created < targetCount && rng.random() < 0.4) {
    const a = rng.int(0, squad.length - 1);
    let b = rng.int(0, squad.length - 1);
    if (a !== b && !usedPairs.has(pairKey(a, b)) && squad[a].lastName !== squad[b].lastName) {
      addRelation(a, b, "in_laws", rng.int(40, 70));
      created++;
    }
  }

  // Step 4: Classmates (similar age ±2)
  if (created < targetCount) {
    for (let a = 0; a < squad.length && created < targetCount; a++) {
      for (let b = a + 1; b < squad.length && created < targetCount; b++) {
        if (usedPairs.has(pairKey(a, b))) continue;
        const ageDiff = Math.abs(squad[a].age - squad[b].age);
        if (ageDiff <= 2 && rng.random() < 0.15) {
          addRelation(a, b, "classmates", rng.int(30, 60));
          created++;
        }
      }
    }
  }

  // Step 5: Coworkers (same occupation)
  if (created < targetCount) {
    for (let a = 0; a < squad.length && created < targetCount; a++) {
      for (let b = a + 1; b < squad.length && created < targetCount; b++) {
        if (usedPairs.has(pairKey(a, b))) continue;
        if (
          squad[a].occupation === squad[b].occupation &&
          squad[a].occupation !== "Student" &&
          squad[a].occupation !== "Nezaměstnaný" &&
          squad[a].occupation !== "Důchodce"
        ) {
          addRelation(a, b, "coworkers", rng.int(20, 50));
          created++;
        }
      }
    }
  }

  // Step 6: Neighbors (same residence — injected externally if available)
  // This is handled after relationship generation in teams.ts where residences are known

  // Step 7: Drinking buddies (both high alcohol)
  // Práh 60 je na dnešní škále 0–100 (generátor dává rng.int(5, 100)). Dřív tu bylo 12 —
  // práh ze staré škály 0–20, kterým prošlo ~93 % hráčů. Spolu s `break` jen ve vnitřní
  // smyčce (tedy bez ohledu na targetCount) z toho vycházelo ~12 párů na kádr a parťáci
  // od piva tvořili 69 % všech vazeb v databázi.
  if (created < targetCount) {
    for (let a = 0; a < squad.length && created < targetCount; a++) {
      for (let b = a + 1; b < squad.length && created < targetCount; b++) {
        if (usedPairs.has(pairKey(a, b))) continue;
        if (squad[a].alcohol >= DRINKING_BUDDY_ALCOHOL && squad[b].alcohol >= DRINKING_BUDDY_ALCOHOL && rng.random() < 0.25) {
          addRelation(a, b, "drinking_buddies", rng.int(35, 65));
          created++;
          break; // max 1 pár na hráče
        }
      }
    }
  }

  // Step 7: Mentor-pupil (old experienced + young talent)
  const mentors = squad.map((p, i) => ({ i, age: p.age })).filter((p) => p.age >= 32);
  const pupils = squad.map((p, i) => ({ i, age: p.age })).filter((p) => p.age <= 22);
  if (mentors.length > 0 && pupils.length > 0 && rng.random() < 0.4) {
    const m = mentors[rng.int(0, mentors.length - 1)];
    const p = pupils[rng.int(0, pupils.length - 1)];
    if (!usedPairs.has(pairKey(m.i, p.i))) {
      addRelation(m.i, p.i, "mentor_pupil", rng.int(40, 70));
    }
  }

  // Step 8: Rivals (random, rare — tension in dressing room)
  if (rng.random() < 0.20) {
    const a = rng.int(0, squad.length - 1);
    let b = rng.int(0, squad.length - 1);
    let tries = 0;
    while (b === a && tries < 5) { b = rng.int(0, squad.length - 1); tries++; }
    if (a !== b && !usedPairs.has(pairKey(a, b))) {
      addRelation(a, b, "rivals", rng.int(20, 50));
    }
  }

  return relationships;
}

/** Hráč tak, jak ho pro vazby potřebujeme — stačí pár polí, ne celý GeneratedPlayer. */
export interface RelationCandidate {
  id: string;
  lastName: string;
  age: number;
  occupation?: string | null;
  alcohol?: number | null;
  residence?: string | null;
  leadership?: number | null;
}

/** Vazba nově příchozího na konkrétního spoluhráče. */
export interface NewcomerRelationship {
  otherPlayerId: string;
  type: RelationshipType;
  strength: number;
}

/**
 * Vazby, které si nový hráč přinese do kabiny.
 *
 * Původně vztahy vznikaly VÝHRADNĚ při zakládání týmu a při každém odchodu hráče se mazaly
 * (remove-player.ts) — kabina se tak sezónu od sezóny vyprazdňovala a widget chemie
 * u starších týmů ukazoval napořád "žádné aktivní vztahy". Tahle funkce běží při každém
 * příchodu (přestup, volný hráč, dorostenec, doplnění kádru, U21) a používá stejná
 * pravidla jako generátor celého kádru, jen proti stávající soupisce.
 *
 * Držíme to střídmé — nováček dostane nanejvýš `maxRelations` vazeb, ať se kabina
 * nezaplní hned prvním přestupem.
 */
export function generateRelationsForNewcomer(
  rng: Rng,
  newcomer: RelationCandidate,
  squad: RelationCandidate[],
  maxRelations: number = 2,
): NewcomerRelationship[] {
  const out: NewcomerRelationship[] = [];
  const taken = new Set<string>();
  const add = (otherPlayerId: string, type: RelationshipType, strength: number) => {
    if (out.length >= maxRelations || taken.has(otherPlayerId)) return;
    taken.add(otherPlayerId);
    out.push({ otherPlayerId, type, strength });
  };

  const others = squad.filter((p) => p.id !== newcomer.id);
  if (others.length === 0) return out;

  // Pořadí kandidátů zamícháme, ať vazby nesedají pořád na stejné hráče ze začátku soupisky.
  const shuffled = [...others];
  rng.shuffle(shuffled);

  // 1) Rodina — stejné příjmení. Věkový rozdíl rozhodne otec/syn vs. bratři.
  for (const p of shuffled) {
    if (p.lastName !== newcomer.lastName) continue;
    const diff = Math.abs(p.age - newcomer.age);
    if (diff >= 18 && diff <= 35) add(p.id, "father_son", rng.int(60, 90));
    else if (diff <= 5) add(p.id, "brothers", rng.int(70, 95));
  }

  // 2) Soused — bydlí ve stejné obci (mimo tu domácí, tu má kdekdo).
  if (newcomer.residence) {
    for (const p of shuffled) {
      if (p.residence && p.residence === newcomer.residence && rng.random() < 0.35) {
        add(p.id, "neighbors", rng.int(35, 60));
      }
    }
  }

  // 3) Kolega z práce — stejné povolání (studenti, nezaměstnaní a důchodci nepočítají).
  const occ = newcomer.occupation;
  if (occ && occ !== "Student" && occ !== "Nezaměstnaný" && occ !== "Důchodce") {
    for (const p of shuffled) {
      if (p.occupation === occ && rng.random() < 0.4) add(p.id, "coworkers", rng.int(20, 50));
    }
  }

  // 4) Spolužák — vrstevník do dvou let.
  for (const p of shuffled) {
    if (Math.abs(p.age - newcomer.age) <= 2 && rng.random() < 0.2) {
      add(p.id, "classmates", rng.int(30, 60));
    }
  }

  // 5) Mentor a žák — zkušený matador se ujme mladíka (nebo naopak).
  for (const p of shuffled) {
    const older = p.age >= newcomer.age ? p : newcomer;
    const younger = p.age >= newcomer.age ? newcomer : p;
    if (older.age >= 32 && younger.age <= 22 && (older.leadership ?? 30) >= 55 && rng.random() < 0.3) {
      add(p.id, "mentor_pupil", rng.int(40, 70));
    }
  }

  // 6) Parťáci od piva — oba to s pivem myslí vážně.
  if ((newcomer.alcohol ?? 0) >= DRINKING_BUDDY_ALCOHOL) {
    for (const p of shuffled) {
      if ((p.alcohol ?? 0) >= DRINKING_BUDDY_ALCOHOL && rng.random() < 0.25) {
        add(p.id, "drinking_buddies", rng.int(35, 65));
      }
    }
  }

  // 7) Rivalita — vzácně, ať má kabina i jiskru.
  if (out.length < maxRelations && rng.random() < 0.12) {
    const p = shuffled[rng.int(0, shuffled.length - 1)];
    if (p) add(p.id, "rivals", rng.int(20, 50));
  }

  return out;
}
