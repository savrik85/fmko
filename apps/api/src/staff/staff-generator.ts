/**
 * Generátor zaměstnanců (realizační tým) + údržba sdíleného poolu per okres.
 * Vzor: `apps/api/src/transfers/free-agent-pool.ts` (pool) + `villages/officials-generator.ts` (facesjs avatar, ženská jména).
 *
 * Kandidát má profesi (co umí nejlíp) — podle ní se generují atributy — ale lze ho najmout na libovolnou roli.
 * Ženy: obsluha ~70 %, ostatní role ~15 %.
 */

import { logger } from "../lib/logger";
import { ROLE_DEFS, type StaffRole } from "@okresni-masina/shared";
import type { Rng } from "../generators/rng";
import { getDistrictDataFromDB } from "../data/districts";

const ROLES: StaffRole[] = [
  "asistent", "trener_mladeze", "trener_brankaru", "kondicni_trener",
  "maser", "lekar", "psycholog", "spravce_hriste",
  "skaut", "obsluha", "sef_fanklubu", "ekonom",
];

// Váhy generování profesí v poolu — časté běžné role, vzácnější specialisté.
const PROFESSION_WEIGHTS: Record<StaffRole, number> = {
  asistent: 12,
  trener_mladeze: 8,
  trener_brankaru: 6,
  kondicni_trener: 7,
  maser: 10,
  lekar: 6,
  psycholog: 5,
  spravce_hriste: 10,
  skaut: 6,
  obsluha: 12,
  sef_fanklubu: 7,
  ekonom: 5,
};

const MALE_FIRST_NAMES = [
  "Jan", "Petr", "Martin", "Tomáš", "Josef", "Miroslav", "Karel", "Pavel", "Jiří",
  "Zdeněk", "Jaroslav", "Milan", "Vladimír", "František", "Václav", "Aleš", "Roman",
  "David", "Marek", "Michal", "Radek", "Lukáš", "Ondřej", "Ladislav", "Robert",
  "Filip", "Adam", "Jakub", "Vojtěch", "Matěj", "Daniel", "Richard", "Štěpán",
  "Libor", "Patrik", "Viktor", "Vilém", "Zbyněk", "Dušan", "Ivan", "Luboš",
];

const FEMALE_FIRST_NAMES = [
  "Marie", "Jana", "Eva", "Hana", "Anna", "Lenka", "Kateřina", "Lucie", "Věra",
  "Alena", "Helena", "Daniela", "Petra", "Martina", "Markéta", "Veronika", "Tereza",
  "Barbora", "Klára", "Adéla", "Karolína", "Natálie", "Šárka", "Simona", "Zuzana",
  "Dana", "Michaela", "Nikola", "Kristýna", "Denisa", "Pavla", "Iveta", "Monika",
];

/** Přechýlení příjmení do ženského tvaru (spolehlivá pravidla; okrajové -ec ap. řeší prosté +ová). */
export function feminizeSurname(surname: string): string {
  if (surname.endsWith("á") || surname.endsWith("ová")) return surname; // už ženské
  if (surname.endsWith("ý")) return surname.slice(0, -1) + "á";          // Veselý → Veselá
  if (surname.endsWith("a")) return surname.slice(0, -1) + "ová";        // Vávra → Vávrová, Svoboda → Svobodová
  if (surname.endsWith("ek")) return surname.slice(0, -2) + "ková";      // Marek → Marková, Pešek → Pešková
  return surname + "ová";                                                 // Novák → Nováková, Švec → Švecová
}

// ── Flavor popisy (vesnický humor) ──

const DESC_BY_PROFESSION: Record<StaffRole, string[]> = {
  asistent: ["hvízdá na píšťalku i ve spánku", "nosí termosku s kafem na každý trénink", "věčně počítá kužely"],
  trener_mladeze: ["zná každého kluka v obci jménem", "trénuje žáky už dvacet let", "má v garáži víc míčů než auto"],
  trener_brankaru: ["bývalý gólman okresního přeboru", "chytal i s zlomeným prstem", "sbírá staré rukavice"],
  kondicni_trener: ["fanatik do běhání, ráno deset kilometrů", "má doma činky místo nábytku", "nikdy se nezadýchá"],
  maser: ["ruce jako lopaty, ale jemné", "bývalý řezník, teď léčí svaly", "vypráví historky u masážního stolu"],
  lekar: ["obvodní doktor na penzi", "sešije koleno rychleji než sudí zapíská", "u sebe má vždy lékárničku"],
  psycholog: ["vystudoval dálkově, ale rozumí lidem", "poslouchá víc, než mluví", "uklidní i rozzuřeného útočníka"],
  spravce_hriste: ["seká trávu, jako by šlo o zlato", "zná každý flek na hřišti", "spí v kabině vedle sekačky"],
  skaut: ["objede tři zápasy za sobotu", "má oko na talenty", "zapisuje si poznámky do sešitu"],
  obsluha: ["úsměv od ucha k uchu, pivo teče proudem", "napočítá kasu poslepu", "zná, kdo si dá klobásu i bez ptaní"],
  sef_fanklubu: ["hlas jako trumpeta, buben nikdy nepustí", "vede kotel od nepaměti", "vyrábí choreo v garáži"],
  ekonom: ["účetní, co ušetří na každé faktuře", "excel má radši než fotbal", "vyjedná slevu i u sponzora"],
};

/** Generuje facesjs faceConfig (kompat. s <FaceAvatar>). Ženy dostanou ženské hlavy/oči/obočí/vlasy. */
export function generateStaffFace(rng: Rng, isFemale: boolean, age: number): Record<string, unknown> {
  const pick = <T,>(arr: T[]): T => arr[rng.int(0, arr.length - 1)];
  const r01 = () => rng.int(0, 100) / 100;

  const skinColors = ["#f2d6cb", "#ddb7a0", "#e8c4a0", "#f5d5c0", "#d4a882"];
  const young = age < 45;
  const hairColors = young
    ? ["#3b2214", "#5b3a1a", "#8b6e3e", "#2a1a0e", "#6b4a2a"]
    : ["#8e8e8e", "#b0b0b0", "#5b3a1a", "#9c9c9c", "#c8c8c8"];

  const noseIds = ["nose1", "nose2", "nose6", "nose9", "nose13"];
  const mouthIds = ["mouth", "mouth2", "mouth3", "smile3", "straight"];
  const earIds = ["ear1", "ear2", "ear3"];

  // Ženské vs mužské části (dle facesjs gender palety)
  const headIds = isFemale ? ["female1", "female2", "female3"] : ["head1", "head3", "head6", "head8", "head9", "head11", "head13"];
  const eyeIds = isFemale
    ? ["female1", "female2", "female5", "female6", "female8", "female9", "female11", "female12"]
    : ["eye1", "eye3", "eye6", "eye9", "eye11"];
  const eyebrowIds = isFemale
    ? ["female1", "female2", "female3", "female5", "female7", "female8"]
    : ["eyebrow2", "eyebrow3", "eyebrow7", "eyebrow10", "eyebrow14"];
  const femaleHair = ["female1", "female2", "female3", "female4", "female6", "female7", "female8", "female10", "female12", "longHair", "curly", "curly2", "shaggy1"];
  const maleHair = young
    ? ["short-fade", "crop-fade2", "spike4", "short3", "messy-short"]
    : ["short-fade", "crop-fade2", "short-bald", "short3"];

  const skinColor = pick(skinColors);
  const maleBald = !isFemale && !young && r01() < 0.35;

  return {
    fatness: isFemale ? 0.25 + r01() * 0.3 : 0.3 + r01() * 0.4,
    teamColors: ["#555555", "#FFFFFF", "#333333"],
    hairBg: { id: "none" },
    body: { id: isFemale ? pick(["body2", "body4"]) : pick(["body", "body2", "body3"]), color: skinColor, size: (isFemale ? 0.85 : 0.95) + r01() * 0.1 },
    jersey: { id: "jersey" },
    ear: { id: pick(earIds), size: 0.6 + r01() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness: 0.3 + r01() * 0.35 },
    eyeLine: { id: "none" },
    smileLine: { id: pick(["line1", "line2"]), size: 0.9 + r01() * 0.3 },
    miscLine: { id: "none" },
    facialHair: { id: !isFemale && r01() < 0.4 ? pick(["goatee3", "goatee4", "fullgoatee2", "mustache"]) : "none" },
    eye: { id: pick(eyeIds), angle: -3 + r01() * 6 },
    eyebrow: { id: pick(eyebrowIds), angle: -3 + r01() * 6 },
    hair: { id: isFemale ? pick(femaleHair) : (maleBald ? "short-bald" : pick(maleHair)), color: pick(hairColors), flip: r01() < 0.5 },
    mouth: { id: pick(mouthIds), flip: r01() < 0.5 },
    nose: { id: pick(noseIds), flip: r01() < 0.5, size: 0.7 + r01() * 0.4 },
    glasses: { id: r01() < 0.15 ? "glasses1" : "none" },
    accessories: { id: "none" },
  };
}

export interface GeneratedStaff {
  profession: StaffRole;
  firstName: string;
  lastName: string;
  gender: "m" | "f";
  age: number;
  coaching: number;
  medicine: number;
  maintenance: number;
  judgement: number;
  communication: number;
  work_rate: number;
  charm: number;
  weeklyWage: number;
  signingFee: number;
  avatar: Record<string, unknown>;
  description: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Vygeneruje jednoho kandidáta. `surnames` = weighted mapa příjmení z okresu.
 * Pokud `profession` není zadané, vybere se váženě náhodně.
 */
export function generateStaffCandidate(
  rng: Rng,
  surnames: Record<string, number>,
  profession?: StaffRole,
): GeneratedStaff {
  const prof = profession ?? (rng.weighted(PROFESSION_WEIGHTS as unknown as Record<string, number>) as StaffRole);

  // Gender: obsluha 70 % žena, ostatní 15 %.
  const femaleChance = prof === "obsluha" ? 70 : 15;
  const isFemale = rng.int(0, 100) < femaleChance;
  const gender: "m" | "f" = isFemale ? "f" : "m";

  const firstName = isFemale ? rng.pick(FEMALE_FIRST_NAMES) : rng.pick(MALE_FIRST_NAMES);
  const rawSurname = Object.keys(surnames).length > 0 ? rng.weighted(surnames) : "Novák";
  const lastName = isFemale ? feminizeSurname(rawSurname) : rawSurname;

  // Věk: obsluha spíš mladší, ostatní široké pásmo.
  const age = prof === "obsluha" ? rng.int(19, 40)
    : prof === "sef_fanklubu" ? rng.int(24, 58)
    : rng.int(24, 63);

  // Atributy: okresní úroveň — většina průměrných, špička vzácně.
  // Baseline (ostatní atributy) nízké.
  const attrs: Record<string, number> = {
    coaching: rng.int(2, 9),
    medicine: rng.int(2, 9),
    maintenance: rng.int(2, 9),
    judgement: rng.int(2, 9),
    communication: rng.int(2, 9),
    work_rate: rng.int(3, 10),
    charm: rng.int(2, 10),
  };
  const def = ROLE_DEFS[prof];

  // Kvalita v profesi — tier roll (většina slabší, málokdo špička).
  const q = rng.int(0, 100);
  const [pLo, pHi] = q < 50 ? [6, 10]   // 50 % průměrní
    : q < 80 ? [9, 13]                    // 30 % slušní
    : q < 95 ? [12, 15]                   // 15 % dobří
    : [15, 19];                           // 5 % špička
  attrs[def.primary] = rng.int(pLo, pHi);
  // Sekundární o kus níž než primární (realistické), ale ne pod baseline.
  attrs[def.secondary] = clamp(
    Math.max(attrs[def.secondary], attrs[def.primary] - rng.int(2, 6)),
    2, 20,
  );

  // Efektivita v profesi (best-role) pro nacenění mzdy.
  const bestEff = (2 * attrs[def.primary] + attrs[def.secondary]) / 3;
  const avgAttr =
    (attrs.coaching + attrs.medicine + attrs.maintenance + attrs.judgement +
      attrs.communication + attrs.work_rate + attrs.charm) / 7;

  // Škála srovnatelná s hráčskými mzdami (10 + rating/100*400 ≈ 170–410 Kč/týd).
  const weeklyWage = Math.round(30 + bestEff * 14 + avgAttr * 6);
  const signingFee = weeklyWage * 4;

  const descPool = DESC_BY_PROFESSION[prof];
  const description = descPool[rng.int(0, descPool.length - 1)];

  return {
    profession: prof,
    firstName,
    lastName,
    gender,
    age,
    coaching: attrs.coaching,
    medicine: attrs.medicine,
    maintenance: attrs.maintenance,
    judgement: attrs.judgement,
    communication: attrs.communication,
    work_rate: attrs.work_rate,
    charm: attrs.charm,
    weeklyWage,
    signingFee,
    avatar: generateStaffFace(rng, isFemale, age),
    description,
  };
}

// Cíl volných kandidátů škáluje s počtem lidských týmů v okrese (sdílený trh — víc týmů = víc lidí).
const POOL_PER_TEAM = 5;   // kandidátů na lidský tým v okrese
const POOL_MIN = 24;       // minimum i pro malý okres
const POOL_MAX = 200;      // strop
const LISTED_WEEKS = 3;    // za jak dlouho kandidát z poolu zmizí

function poolTargetFor(humanTeams: number): number {
  return Math.max(POOL_MIN, Math.min(POOL_MAX, humanTeams * POOL_PER_TEAM));
}

/**
 * Údržba poolu zaměstnanců: expirace starých, doplnění nových — per okres s lidským týmem.
 * Voláno z pondělního bloku daily-ticku. Vrací počet nově vygenerovaných.
 */
export async function maintainStaffPool(db: D1Database, rng: Rng, gameDate: Date): Promise<number> {
  // 1. Expirace volných kandidátů (najatí nemají listed_until)
  await db.prepare("DELETE FROM staff_members WHERE team_id IS NULL AND listed_until IS NOT NULL AND listed_until < ?")
    .bind(gameDate.toISOString()).run()
    .catch((e) => logger.warn({ module: "staff-pool" }, "expire", e));

  // 2. Okresy s lidským týmem + počet lidských týmů (pro škálování cíle)
  const districts = await db.prepare(
    "SELECT v.district, COUNT(*) as teams FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.user_id != 'ai' GROUP BY v.district"
  ).all<{ district: string; teams: number }>()
    .catch((e) => { logger.warn({ module: "staff-pool" }, "districts", e); return { results: [] as { district: string; teams: number }[] }; });

  const listedUntil = new Date(gameDate.getTime() + LISTED_WEEKS * 7 * 24 * 3600 * 1000).toISOString();
  let generated = 0;

  for (const row of districts.results) {
    const district = row.district;
    const target = poolTargetFor(row.teams ?? 1);

    const poolCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM staff_members WHERE district = ? AND team_id IS NULL"
    ).bind(district).first<{ cnt: number }>()
      .catch((e) => { logger.warn({ module: "staff-pool" }, "count", e); return { cnt: 0 }; });

    const missing = target - (poolCount?.cnt ?? 0);
    if (missing <= 0) continue;

    // Doplnit postupně (nárazově ne celý pool), ale svižně — nahradit najaté + růst k cíli.
    const count = Math.min(missing, rng.int(4, 10));
    const districtData = await getDistrictDataFromDB(db, district);

    for (let i = 0; i < count; i++) {
      const c = generateStaffCandidate(rng, districtData.surnames);
      await db.prepare(
        `INSERT INTO staff_members
          (id, district, team_id, role, profession, first_name, last_name, gender, age,
           coaching, medicine, maintenance, judgement, communication, work_rate, charm,
           weekly_wage, signing_fee, avatar, description, listed_until)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), district, c.profession, c.firstName, c.lastName, c.gender, c.age,
        c.coaching, c.medicine, c.maintenance, c.judgement, c.communication, c.work_rate, c.charm,
        c.weeklyWage, c.signingFee, JSON.stringify(c.avatar), c.description, listedUntil,
      ).run().catch((e) => logger.warn({ module: "staff-pool" }, "insert candidate", e));
      generated++;
    }
  }

  return generated;
}

export { ROLES as STAFF_ROLES };
