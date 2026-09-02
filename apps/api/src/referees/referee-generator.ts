/**
 * Generátor okresních rozhodčích — 24 osob na okres, deterministicky.
 *
 * Pool je per OKRES, ne per liga: rozhodčí je člen okresní komise, ne jedné soutěže.
 * Senior i U21 tedy sdílí tytéž lidi a pool přežije rollover sezóny (`leagues` se
 * sice recykluje, ale `district` je stabilní).
 *
 * Zakládá se líně při první delegaci — stejný vzor jako `ensureRedakce`
 * (news/journalists.ts). Při existujícím poolu je to jediný SELECT.
 */

import { createRng, type Rng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import { getDistrictDataFromDB } from "../data/districts";
import { feminizeSurname, generateStaffFace } from "../staff/staff-generator";
import {
  REFEREE_ARCHETYPES, REFEREE_POOL_MIX, REFEREE_POOL_EXTRA,
  type RefereeArchetype, type RefereeProfile,
} from "../engine/referee";

/**
 * Kolik rozhodčích má okresní komise.
 *
 * Musí být znatelně víc než kolik se v okrese hraje zápasů v jednom dni (7 senior
 * + 7 U21), jinak nemá komisař rozhodčích z čeho sestavovat obsazovací listinu.
 */
export const REFEREES_PER_DISTRICT = REFEREE_POOL_MIX.length + REFEREE_POOL_EXTRA.length;

/** Podíl žen mezi okresními rozhodčími. */
const FEMALE_SHARE = 0.08;

const MALE_FIRST_NAMES = [
  "Jan", "Petr", "Martin", "Tomáš", "Josef", "Miroslav", "Karel", "Pavel", "Jiří",
  "Zdeněk", "Jaroslav", "Milan", "Vladimír", "František", "Václav", "Aleš", "Roman",
  "David", "Marek", "Michal", "Radek", "Lukáš", "Ondřej", "Ladislav", "Robert",
  "Filip", "Adam", "Jakub", "Vojtěch", "Bohumil", "Stanislav", "Antonín", "Oldřich",
];

const FEMALE_FIRST_NAMES = [
  "Marie", "Jana", "Eva", "Hana", "Lenka", "Kateřina", "Věra", "Alena", "Petra",
  "Martina", "Markéta", "Veronika", "Michaela", "Monika", "Ivana", "Renata",
];

/** Přezdívky z kabin. Zhruba polovina sudích nějakou má. */
const NICKNAMES = [
  "Píšťala", "Metr", "Sokol", "Kapesník", "Bulldog", "Šerif", "Paragraf",
  "Krtek", "Sova", "Doktor", "Kanón", "Kompas", "Rys", "Blesk", "Fantom",
];

export interface GeneratedReferee {
  id: string;
  district: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  gender: "m" | "f";
  age: number;
  occupation: string;
  archetype: RefereeArchetype;
  strictness: number;
  cardHappiness: number;
  experience: number;
  homeBias: number;
  advantage: number;
  fitness: number;
  avatar: Record<string, unknown>;
  bio: string;
  hlaska: string;
}

/**
 * Okres bez sufixu " U21". U21 liga si ho přilepuje jen proto, aby obešla
 * UNIQUE(season_id, district, level) — `district_surnames` ho nezná a komise
 * rozhodčích je pro seniory i dorost jedna.
 */
export function normalizeDistrict(district: string): string {
  return district.replace(/\s+U21$/i, "").trim();
}

const inRange = (rng: Rng, range: readonly [number, number]) => rng.int(range[0], range[1]);

/**
 * Čistá funkce — vygeneruje celý pool bez DB. Stejný okres a stejná data dají vždy
 * stejnou partu lidí, takže se dá reprodukovat i testovat.
 *
 * Generuje se ve DVOU vlnách, a to je zásadní: základní patnáctka běží přesně
 * tak, jak běžela vždycky (týž seed, týž mix, tytéž indexy), takže má nezměněná
 * ID. Devítka navíc má vlastní seed a indexy od 15 výš. Kdyby se doplněk jen
 * přilepil do jednoho `mix`, shuffle by přeskládal všech 24 a přejmenoval by
 * sudí, kterým už běží odpískané zápasy, známky a vztahy ke klubům.
 */
export function generateRefereePool(
  district: string,
  surnames: Record<string, number>,
): GeneratedReferee[] {
  const base = normalizeDistrict(district);

  const zaklad = generateWave(base, surnames, {
    mix: [...REFEREE_POOL_MIX], seedKey: "v1", offset: 0, usedNames: new Set(), ustvanySwap: true,
  });

  const doplnek = generateWave(base, surnames, {
    mix: [...REFEREE_POOL_EXTRA], seedKey: "v2", offset: REFEREE_POOL_MIX.length,
    // Jména základní patnáctky musí druhá vlna znát, jinak by okres měl dva Nováky.
    usedNames: new Set(zaklad.map((r) => `${r.firstName} ${r.lastName}`)),
    ustvanySwap: false,
  });

  return [...zaklad, ...doplnek];
}

interface WaveOpts {
  mix: RefereeArchetype[];
  /** Rozlišuje seed vln — „v1" nesmí nikdy změnit hodnotu. */
  seedKey: string;
  /** Od jakého indexu vlna čísluje. Index je součástí ID. */
  offset: number;
  usedNames: Set<string>;
  /** Jen první vlna může jednoho veterána vyměnit za uštvaného. */
  ustvanySwap: boolean;
}

function generateWave(
  base: string,
  surnames: Record<string, number>,
  { mix, seedKey, offset, usedNames, ustvanySwap }: WaveOpts,
): GeneratedReferee[] {
  const rng = createRng(seedFromString(`referees|${base}|${seedKey}`) + 4241);

  // Starý sudí, co už nestíhá, nahradí jednoho veterána — ne v každém okrese.
  if (ustvanySwap && rng.random() < 0.6) {
    const idx = mix.indexOf("klidny_veteran");
    if (idx >= 0) mix[idx] = "ustvany";
  }
  rng.shuffle(mix);

  const pool: GeneratedReferee[] = [];

  for (let i = 0; i < mix.length; i++) {
    const archetype = mix[i];
    const def = REFEREE_ARCHETYPES[archetype];
    const isFemale = rng.random() < FEMALE_SHARE;
    const age = inRange(rng, def.ageRange);

    // Jméno musí být v okrese jedinečné, jinak by hráč viděl dva Nováky a nevěděl, který píská.
    let firstName = rng.pick(isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES);
    let lastName = rng.weighted(surnames);
    if (isFemale) lastName = feminizeSurname(lastName);
    let guard = 0;
    while (usedNames.has(`${firstName} ${lastName}`) && guard < 30) {
      firstName = rng.pick(isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES);
      lastName = rng.weighted(surnames);
      if (isFemale) lastName = feminizeSurname(lastName);
      guard++;
    }
    usedNames.add(`${firstName} ${lastName}`);

    const avatar = generateStaffFace(rng, isFemale, age);
    // Rozhodčí nosí černou se žlutými prvky, ne klubové barvy.
    avatar.teamColors = ["#1A1A1A", "#F5C542", "#FFFFFF"];

    // Index je globální přes obě vlny — jinak by devátý muž doplňku dostal ID
    // devátého muže základní patnáctky, pokud sdílí archetyp.
    const idx = offset + i;

    pool.push({
      id: `ref-${seedFromString(`${base}|${archetype}|${idx}`)}-${idx}`,
      district: base,
      firstName,
      lastName,
      nickname: rng.random() < 0.55 ? rng.pick(NICKNAMES) : null,
      gender: isFemale ? "f" : "m",
      age,
      // Povolání, bio i hláška v rodě podle pohlaví — jinak by ženská sudí byla
      // „klidný veterán, mistr odborného výcviku, hráči ho poslouchají".
      occupation: rng.pick([...(isFemale ? def.occupationsF : def.occupations)]),
      archetype,
      strictness: inRange(rng, def.strictness),
      cardHappiness: inRange(rng, def.cardHappiness),
      experience: inRange(rng, def.experience),
      homeBias: inRange(rng, def.homeBias),
      advantage: inRange(rng, def.advantage),
      fitness: inRange(rng, def.fitness),
      avatar,
      bio: isFemale ? def.bioF : def.bio,
      hlaska: isFemale ? def.hlaskaF : def.hlaska,
    });
  }

  return pool;
}

/** Řádek tabulky `referees` tak, jak ho vrací D1. */
export interface RefereeRow {
  id: string;
  district: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  gender: string;
  age: number;
  occupation: string;
  archetype: string;
  strictness: number;
  card_happiness: number;
  experience: number;
  home_bias: number;
  advantage: number;
  fitness: number;
  avatar: string;
  bio: string;
  hlaska: string;
  status: string;
}

/** Celé jméno včetně přezdívky, tak jak se má zobrazit. */
export function refereeFullName(r: Pick<RefereeRow, "first_name" | "last_name" | "nickname">): string {
  return r.nickname
    ? `${r.first_name} „${r.nickname}" ${r.last_name}`
    : `${r.first_name} ${r.last_name}`;
}

/** DB řádek → profil pro engine. */
export function rowToProfile(r: RefereeRow): RefereeProfile {
  return {
    id: r.id,
    name: refereeFullName(r),
    archetype: r.archetype,
    strictness: r.strictness,
    cardHappiness: r.card_happiness,
    experience: r.experience,
    homeBias: r.home_bias,
    advantage: r.advantage,
    fitness: r.fitness,
  };
}

/**
 * Zajistí, že okres má celou listinu, a vrátí ji.
 *
 * Idempotentní: `INSERT OR IGNORE` na stabilní ID, takže souběžné volání z delegace
 * i z API endpointu nevytvoří duplicity.
 */
export async function ensureReferees(db: D1Database, district: string): Promise<RefereeRow[]> {
  const base = normalizeDistrict(district);

  // O tom, jestli je potřeba pool zakládat, rozhoduje počet ŘÁDKŮ, ne počet aktivních
  // sudích. Kdyby se počítali jen aktivní, stačilo by jednoho vyškrtnout a podmínka níž
  // by byla trvale nesplněná: spustila by se plná generace poolu + batch patnácti
  // statementů při KAŽDÉ delegaci, `INSERT OR IGNORE` na deterministická ID by nic
  // nevložilo a listina by se stejně nikdy nedoplnila.
  const existing = await db.prepare(
    "SELECT * FROM referees WHERE district = ? ORDER BY id"
  ).bind(base).all<RefereeRow>()
    .catch((e) => { logger.warn({ module: "referees" }, `načtení poolu okresu ${base}`, e); return null; });

  if (existing && existing.results.length >= REFEREES_PER_DISTRICT) {
    return existing.results.filter((r) => r.status === "active");
  }

  const districtData = await getDistrictDataFromDB(db, base);
  const pool = generateRefereePool(base, districtData.surnames);

  const stmts = pool.map((r) => db.prepare(
    `INSERT OR IGNORE INTO referees
      (id, district, first_name, last_name, nickname, gender, age, occupation, archetype,
       strictness, card_happiness, experience, home_bias, advantage, fitness, avatar, bio, hlaska)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    r.id, r.district, r.firstName, r.lastName, r.nickname, r.gender, r.age, r.occupation, r.archetype,
    r.strictness, r.cardHappiness, r.experience, r.homeBias, r.advantage, r.fitness,
    JSON.stringify(r.avatar), r.bio, r.hlaska,
  ));

  await db.batch(stmts)
    .catch((e) => { logger.error({ module: "referees" }, `založení poolu okresu ${base}`, e); });

  logger.info({ module: "referees" }, `okres ${base}: založeno ${pool.length} rozhodčích`);

  const fresh = await db.prepare(
    "SELECT * FROM referees WHERE district = ? AND status = 'active' ORDER BY id"
  ).bind(base).all<RefereeRow>()
    .catch((e) => { logger.warn({ module: "referees" }, `načtení nového poolu okresu ${base}`, e); return null; });

  return fresh?.results ?? [];
}
