/**
 * Narovnání AI klubů: jednorázové srovnání podmínek (spec 3.8 a část 1).
 *
 * Kluby, které vede AI, se zvednou na úroveň vzoru. Vzorem jsou aktivní lidské kluby
 * (přihlášení do 30 dní, `users.last_activity_at`) a podle režimu:
 *  - `league-humans` (Praha): lidské kluby téže ligy. Každý narovnávaný klub dostane
 *    percentil mezi 15 a 85 % a cílem každé veličiny je hodnota vzoru na tomto percentilu,
 *    takže se kluby rozprostřou středem tabulky.
 *  - `below-league` (III. třída): aktivní lidské kluby přeboru téhož okresu. Nejlepší
 *    jedenáctka mezi nejslabším klubem přeboru minus 12 a nejslabším klubem přeboru,
 *    zázemí a kádr z dolní třetiny přeboru (percentil 0–35 %). Rozpočet = startovní
 *    rozpočet nového klubu v obci × (1 + percentil), ne z přeboru: lidé peníze proinvestují.
 *  - `newcomer` (ČB): jako `below-league`, vzorem jsou aktivní lidské kluby všech přeborů
 *    a spodní hranice síly je nově založený lidský klub v obci AI klubu.
 *
 * Hráči, stadion, vybavení, zaměstnanci a sehranost se jen zvedají, nikdy nesnižují.
 * Rozpočet a reputace jdou na cíl i dolů, ale jen původním AI klubům; klubu převzatému
 * od člověka (`ai_former_user_id`) se nic nebere, vlastník se k němu může vrátit.
 *
 * Strop dovedností (`skills_max.maxPotential`) jde s dovedností nahoru, aby hráč mohl dál
 * růst. V lize s lidmi ale ne celý: lidé mají hráče vytrénované blízko stropu (Praha 10/2026:
 * rezerva 8–21 bodů na dovednost, nejsilnější kluby nejmenší), AI hráč by s rezervou
 * z generátoru (20–25) rostl rychleji a za pár měsíců lidem utekl. Rezerva klubu proto míří
 * na rezervu lidských klubů podobné síly (opačný percentil). Strop nikdy neklesne pod původní.
 *
 * U21 tým se narovnává stejným voláním s id U21 ligy (vzorem jsou lidské U21 týmy).
 * U rezervy se zvedají jen hráči a sehranost: zázemí, rozpočet i reputaci nese áčko.
 *
 * Plán (`planLeveling`) nic nezapisuje, je to tabulka před a po pro každý klub.
 * Provedení (`applyLeveling`) stav znovu načte a změny spočítá stejně (stejné cíle,
 * stejné semínko). Zápisy jdou v dávkách po 80, aby se liga se 14 kluby vešla do jednoho
 * požadavku Workeru.
 */

import { maxScoutsForLicence, ratingWeightsFor, staffRequiredLicence, type StaffRole } from "@okresni-masina/shared";
import { ensureAiProfile, generateAiProfile, parseAiProfile } from "../ai-coach/profile";
import { FIRSTNAMES } from "../data/czech-names";
import { getDistrictDataFromDB } from "../data/districts";
import { CATEGORIES as EQUIPMENT_CATEGORIES, MAX_LEVEL as EQUIPMENT_MAX_LEVEL, generateEquipment } from "../equipment/equipment-generator";
import { ensureEquipmentRow } from "../equipment/equipment-service";
import { categoryFromVillageSize, createPlayer, levelFromVillageSize, type CreatedPlayer } from "../generators/create-player";
import { generateDescription } from "../generators/description-generator";
import { generateAiManager } from "../generators/manager-generator";
import { generateNickname } from "../generators/nickname";
import type { VillageInfo } from "../generators/player";
import { generateRelationsForNewcomer, type RelationCandidate } from "../generators/relationships";
import { generateResidence } from "../generators/residence";
import { createRng, type Rng } from "../generators/rng";
import { logger } from "../lib/logger";
import { planSquadNumbers } from "../players/squad-numbers";
import { overallRatingFromFlat, type PlayerPositionCode } from "../skills/generator";
import { PRALES_MAX_RATING } from "../skills/limits";
import { generateStadium } from "../stadium/stadium-generator";
import { ensureStadiumRow } from "../stadium/stadium-service";
import { legacyStandsToSides } from "../stadium/stands-model";
import { generateStaffCandidate, STAFF_ROLES } from "../staff/staff-generator";

const M = "ai-leveling";

export type LevelingMode = "league-humans" | "below-league" | "newcomer";
export const LEVELING_MODES: readonly LevelingMode[] = ["league-humans", "below-league", "newcomer"];

/** Vzorem jsou kluby, jejichž vlastník se přihlásil za posledních 30 dní. */
export const REFERENCE_ACTIVE_DAYS = 30;

/** Rozsah percentilu v Praze: kluby se rozprostřou středem tabulky. */
const LEAGUE_HUMANS_RANGE: [number, number] = [0.15, 0.85];
/** Nižší soutěž a nováčci: zázemí a kádr z dolní třetiny vzoru. */
const MODEST_MAX_PERCENTILE = 0.35;
/** III. třída: nejlepší jedenáctka až o tolik pod nejslabším klubem přeboru. */
const BELOW_LEAGUE_TOP11_GAP = 12;
/** AI klub v Praze nezačíná prakticky bez peněz, i kdyby vzor měl rozpočty v minusu. */
export const MIN_LEVELED_BUDGET = 10_000;
/** Kádr se nenafukuje přes míru (mzdy). */
const MAX_SQUAD_SIZE = 32;
/** Posun dovedností se hledá do tolika bodů; víc nedává smysl ani u nejslabšího kádru. */
const MAX_SHIFT = 60;
/** Cíl nejlepší jedenáctky se trefuje s touto přesností. */
export const TOP11_TOLERANCE = 0.5;
/** Zápisy po dávkách, ať se 14 klubů vejde do jednoho požadavku Workeru. */
const BATCH_SIZE = 80;
const MAX_SKILL = 100;
/** Strop zvednutý narovnáním nejvýš sem (vyšší strop, který hráč už měl, zůstává). */
const MAX_POTENTIAL = 99;
const FAMILIARITY_FLOOR = 15;
const STAFF_ATTRS = ["coaching", "medicine", "maintenance", "judgement", "communication", "work_rate", "charm"] as const;
/** Vlastnosti trenéra, které se srovnají se vzorem. Reputaci trenéra dělají výsledky, licenci kurzy. */
const MANAGER_ATTRS = ["coaching", "motivation", "tactics", "discipline", "youth_development"] as const;
const LEVELING_REPUTATION_TEXT = "Srovnání podmínek v soutěži";

/** Části stadionu, které se narovnávají (úrovně 0–3). `stands` je odvozené maximum stran. */
export const STADIUM_LEVEL_KEYS = [
  "changing_rooms", "showers", "refreshments", "lighting",
  "stand_main", "stand_opposite", "stand_goal_west", "stand_goal_east",
  "roof", "ultras_stand", "toilets", "parking", "fence", "entrance_gate", "security", "cage", "vip_box",
  "scoreboard_level", "flag_size",
] as const;
const STADIUM_MAX_LEVEL: Record<string, number> = { cage: 2 };
const STAND_KEYS = ["stand_main", "stand_opposite", "stand_goal_west", "stand_goal_east"] as const;

const PITCH_TYPES = ["natural", "hybrid", "artificial"] as const;

type Position = PlayerPositionCode;
const POSITIONS: readonly Position[] = ["GK", "DEF", "MID", "FWD"];
/** Skladba kádru jako u generátoru (`generateSquad`, U21 `U21_POSITION_COUNTS`). */
const OUTFIELD_WEIGHTS: Record<"senior" | "u21", Record<Exclude<Position, "GK">, number>> = {
  senior: { DEF: 7, MID: 6, FWD: 5 },
  u21: { DEF: 5, MID: 5, FWD: 2 },
};

type TeamType = "senior" | "u21";

interface NameData {
  surnameData: { surnames: Record<string, number>; female_forms: Record<string, string> };
  firstnameData: { male: Record<string, Record<string, number>>; female: Record<string, Record<string, number>> };
}

// ── Veřejné typy ──────────────────────────────────────────────────────────

export interface LevelingTargets {
  /** Průměr nejlepší jedenáctky. */
  top11: number;
  /** Průměr nejlepší osmnáctky (orientačně, posun se řídí jedenáctkou). */
  top18: number;
  squadSize: number;
  /** Úrovně částí stadionu (sloupce `stadiums`). U21 prázdné. */
  stadium: Record<string, number>;
  pitchCondition: number;
  pitchType: string;
  /** Úrovně vybavení a jejich stav (`balls`, `balls_condition`, …). U21 prázdné. */
  equipment: Record<string, number>;
  /** Cílové složení zaměstnanců (skaut může být víckrát). U21 prázdné. */
  staffRoles: string[];
  budget: number;
  reputation: number;
  /** Sehranost oblíbené a druhé formace. */
  formationFamiliarity: number[];
  /** Na jaké hodnocení vzniknou chybějící hráči (úroveň hloubky kádru). */
  newPlayerRating: number;
  /**
   * Průměrná rezerva stávajících hráčů do stropu dovedností po narovnání (jen liga s lidmi).
   * null = strop jde s dovedností celý (nižší soutěž a nováčci soupeří s čerstvými kádry).
   */
  headroom?: number | null;
  /** Vlastnosti AI trenéra (koučování, motivace, …). U21 prázdné: rezerva hraje pod trenérem áčka. */
  manager?: Record<string, number>;
}

export interface ClubSummary {
  top11: number;
  top18: number;
  squadSize: number;
  stadium: Record<string, number>;
  pitchCondition: number;
  pitchType: string;
  equipment: Record<string, number>;
  staffRoles: string[];
  budget: number;
  reputation: number;
  formationFamiliarity: Record<string, number>;
  /** Průměrná rezerva hráčů do stropu dovedností (bod na dovednost); po narovnání jen stávající hráči. */
  headroom: number;
  /** Vlastnosti trenéra áčka. U21 prázdné. */
  manager: Record<string, number>;
}

export interface LevelingPlanClub {
  teamId: string;
  name: string;
  teamType: TeamType;
  /** Klub převzatý od člověka: nic se mu nebere. */
  takenOver: boolean;
  percentile: number;
  /** Posun plochých dovedností stávajících hráčů v bodech. */
  skillShift: number;
  /** Kolik z posunu dovedností dostane i strop (1 = celý posun, 0 = strop zůstane). */
  capShare: number;
  newPlayers: number;
  before: ClubSummary;
  target: LevelingTargets;
  after: ClubSummary;
}

export interface LevelingPlan {
  leagueId: string;
  mode: LevelingMode;
  seed: number;
  reference: {
    teams: number;
    activeDays: typeof REFERENCE_ACTIVE_DAYS;
    leagueIds: string[];
    top11: { min: number; median: number; max: number } | null;
    /** Rezerva hráčů vzoru do stropu dovedností (průměr klubu). */
    headroom: { min: number; median: number; max: number } | null;
    /** Věková skladba vzoru (věk → počet hráčů), z ní se losuje věk nových hráčů. */
    ageProfile: Record<string, number>;
  };
  clubs: LevelingPlanClub[];
  warnings: string[];
}

export interface LevelingResult {
  clubs: number;
  playersRaised: number;
  playersCreated: number;
  staffHired: number;
  managersRaised: number;
  failedStatements: number;
}

// ── Čisté výpočty ─────────────────────────────────────────────────────────

/** Kvantil s lineární interpolací (p = 0 minimum, p = 1 maximum). Prázdný vstup = NaN. */
export function quantile(values: readonly number[], p: number): number {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const pos = Math.max(0, Math.min(1, p)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Kvantil bez interpolace (pro kategorie, kde mezihodnota nemá smysl). */
function nearestRank(values: readonly number[], p: number): number {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.round(Math.max(0, Math.min(1, p)) * (sorted.length - 1))];
}

function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** Průměr `count` nejlepších hodnocení (síla jako v betting/board.ts: nejlepší jedenáctka). */
export function topAverage(ratings: readonly number[], count: number): number {
  if (ratings.length === 0) return 0;
  const top = [...ratings].sort((a, b) => b - a).slice(0, count);
  return top.reduce((sum, r) => sum + r, 0) / top.length;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Rovnoměrně rozprostřené náhodné body v [0, 1): každý klub dostane jiný pás, pořadí se losuje. */
export function stratifiedUnits(rng: Rng, n: number): number[] {
  const strata = Array.from({ length: n }, (_, i) => i);
  rng.shuffle(strata);
  return strata.map((s) => (s + rng.random()) / Math.max(1, n));
}

/** Stejný hash z textu jako `ensureStadiumRow`, `ensureAiManager` a další (semínko z id týmu). */
function seedFromText(text: string): number {
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
  return Math.abs(seed);
}

/** Pevné číslo v [0, 1) pro dvojici hráč a dovednost (rozložení zlomku posunu). */
function ditherUnit(playerId: string, key: string): number {
  let h = 0x811c9dc5;
  const text = `${playerId}:${key}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

export interface SquadMember {
  id: string;
  position: string;
  age: number;
  /** Ploché dovednosti, jak jsou v `players.skills`. */
  skills: Record<string, unknown>;
  physical: Record<string, unknown>;
  skillsMax: Record<string, unknown>;
  hiddenTalent: number;
  rating: number;
}

export interface ShiftedMember {
  skills: Record<string, unknown>;
  physical: Record<string, unknown>;
  skillsMax: Record<string, unknown>;
  rating: number;
}

/** Zkušenost dávají odehrané minuty, ne narovnání; hráč v poli nechytá. */
function isShiftable(key: string, position: string): boolean {
  if (key === "experience") return false;
  if (key === "goalkeeping" && position !== "GK") return false;
  return true;
}

/**
 * Průměrná rezerva hráče do stropu (bodů na dovednost) přes dovednosti, které trénink zvedá.
 * Hodnota z plochého `skills` (trénink píše tam), jinak `skills_max.current`. null = bez stropů.
 */
export function memberHeadroom(m: Pick<SquadMember, "position" | "skills" | "skillsMax">): number | null {
  let sum = 0;
  let n = 0;
  for (const [key, entry] of Object.entries(m.skillsMax)) {
    if (!isShiftable(key, m.position) || !entry || typeof entry !== "object") continue;
    const e = entry as { current?: unknown; maxPotential?: unknown };
    if (typeof e.maxPotential !== "number") continue;
    const flat = m.skills[key];
    const value = typeof flat === "number" ? flat : typeof e.current === "number" ? e.current : null;
    if (value === null) continue;
    sum += Math.max(0, e.maxPotential - value);
    n++;
  }
  return n > 0 ? sum / n : null;
}

/** Průměrná rezerva kádru (průměr hráčů, kteří stropy mají). Prázdný kádr = NaN. */
export function squadHeadroom(members: ReadonlyArray<Pick<SquadMember, "position" | "skills" | "skillsMax">>): number {
  const values = members.map(memberHeadroom).filter((v): v is number => v !== null);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

/**
 * Hodnota dovednosti po posunu. Celá část posunu jde všem, zlomek jen části dovedností
 * (podle pevného čísla hráče a dovednosti), takže síla kádru roste plynule, ne po skocích
 * o celý bod u všech najednou.
 */
function shiftValue(value: number, shift: number, unit: number): number {
  if (shift <= 0) return value;
  const whole = Math.floor(shift);
  const extra = shift - whole > unit ? 1 : 0;
  return Math.min(MAX_SKILL, Math.round(value) + whole + extra);
}

/**
 * Stropy zvednuté narovnáním stáhne tak, aby nejvyšší možné hodnocení (vážený průměr stropů
 * podle postu) nepřesáhlo `PRALES_MAX_RATING`, stejně jako generátor u nového hráče
 * (`capToPralesMax`). Strop nikdy neklesne pod dnešní hodnotu ani pod strop před narovnáním.
 */
function capRaisedPotential(position: string, skillsMax: Record<string, unknown>, floors: ReadonlyMap<string, number>): void {
  const weights = ratingWeightsFor(position);
  let sum = 0;
  let weight = 0;
  let movable = 0;
  for (const [key, w] of Object.entries(weights)) {
    const cap = (skillsMax[key] as { maxPotential?: unknown } | undefined)?.maxPotential;
    if (typeof cap !== "number") continue;
    sum += cap * w;
    weight += w;
    if (floors.has(key)) movable += w;
  }
  if (weight === 0 || movable === 0) return;
  const excess = sum / weight - PRALES_MAX_RATING;
  if (excess <= 0) return;
  const cut = Math.ceil((excess * weight) / movable);
  for (const [key, floor] of floors) {
    if (!(key in weights)) continue;
    const e = skillsMax[key] as { maxPotential: number };
    skillsMax[key] = { ...e, maxPotential: Math.max(floor, e.maxPotential - cut) };
  }
}

/**
 * Hráč po aditivním posunu plochých dovedností. Výdrž a síla jdou i do `physical`.
 * `skills_max.current` se dorovná na novou plochou hodnotu (trénink píše jen do `skills`,
 * takže se před narovnáním liší) a strop se posune o `capShare` z přírůstku dovednosti
 * (1 = o stejný kus, nejvýš na 99), aby hráči zůstal prostor k růstu: AI klub se pak
 * tréninkem dál zlepšuje. Strop nikdy nezůstane pod dnešní hodnotou ani neklesne pod původní.
 * Hodnocení jen přes `overallRatingFromFlat` a nikdy nižší než dosavadní.
 */
export function shiftMember(m: SquadMember, shift: number, capShare = 1): ShiftedMember {
  if (shift <= 0) return { skills: m.skills, physical: m.physical, skillsMax: m.skillsMax, rating: m.rating };

  const skills: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(m.skills)) {
    skills[key] = typeof value === "number" && isShiftable(key, m.position)
      ? shiftValue(value, shift, ditherUnit(m.id, key))
      : value;
  }

  const physical: Record<string, unknown> = { ...m.physical };
  for (const key of ["stamina", "strength"]) {
    if (typeof skills[key] === "number") physical[key] = skills[key];
    else if (typeof physical[key] === "number") physical[key] = shiftValue(physical[key] as number, shift, ditherUnit(m.id, key));
  }

  const skillsMax: Record<string, unknown> = {};
  // Klíč → nejnižší strop, na který ho smí stáhnout `capRaisedPotential`.
  const raisedFloors = new Map<string, number>();
  for (const [key, entry] of Object.entries(m.skillsMax)) {
    const before = typeof m.skills[key] === "number" ? m.skills[key] as number : null;
    const after = typeof skills[key] === "number" ? skills[key] as number : null;
    const shiftable = isShiftable(key, m.position);
    if (entry && typeof entry === "object" && typeof (entry as { current?: unknown }).current === "number") {
      const e = entry as { current: number; maxPotential?: unknown };
      let current: number;
      let increase: number;
      if (after !== null && before !== null) {
        current = after;
        increase = after - before;
      } else if (shiftable) {
        current = shiftValue(e.current, shift, ditherUnit(m.id, key));
        increase = current - e.current;
      } else {
        current = e.current;
        increase = 0;
      }
      const oldCap = typeof e.maxPotential === "number" ? e.maxPotential : current;
      const shiftedCap = increase > 0 ? Math.min(MAX_POTENTIAL, oldCap + Math.round(increase * capShare)) : oldCap;
      const cap = Math.max(oldCap, current, shiftedCap);
      skillsMax[key] = { ...e, current, maxPotential: cap };
      if (cap > oldCap) raisedFloors.set(key, Math.max(oldCap, current));
    } else if (typeof entry === "number") {
      skillsMax[key] = after !== null ? Math.max(entry, after) : shiftable ? shiftValue(entry, shift, ditherUnit(m.id, key)) : entry;
    } else {
      skillsMax[key] = entry;
    }
  }
  capRaisedPotential(m.position, skillsMax, raisedFloors);

  const computed = overallRatingFromFlat(m.position, skills, physical, m.hiddenTalent, skillsMax);
  return { skills, physical, skillsMax, rating: Math.max(m.rating, computed ?? m.rating) };
}

/**
 * Jeden posun dovedností pro celý kádr, aby průměr nejlepší jedenáctky trefil cíl
 * (±`TOP11_TOLERANCE`). Binární hledání, síla s posunem neklesá. Klub, který už na cíli
 * je, dostane 0 (narovnání nikdy nesnižuje). `fixedRatings` = noví hráči, ti se neposouvají.
 */
export function findSkillShift(members: readonly SquadMember[], target: number, fixedRatings: readonly number[] = []): number {
  const at = (shift: number) => topAverage([...members.map((m) => shiftMember(m, shift).rating), ...fixedRatings], 11);
  if (members.length === 0 || at(0) >= target - TOP11_TOLERANCE) return 0;
  let lo = 0;
  let hi = MAX_SHIFT;
  if (at(hi) < target) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  const best = Math.abs(at(lo) - target) < Math.abs(at(hi) - target) ? lo : hi;
  return Math.round(best * 10_000) / 10_000;
}

/**
 * Jaký díl posunu dovedností dostane i strop, aby průměrná rezerva kádru po narovnání
 * trefila `targetHeadroom`. Rezervu jen ubírá (kádr s menší rezervou dostane celý posun, 1)
 * a strop nikdy nestáhne pod původní (víc než 0 nejde). Hodnocení na stropu nezávisí,
 * takže posun dovedností z `findSkillShift` platí dál. Bez cíle = 1.
 */
export function findCapShare(members: readonly SquadMember[], shift: number, targetHeadroom: number | null | undefined): number {
  if (shift <= 0 || members.length === 0 || targetHeadroom === null || targetHeadroom === undefined || !Number.isFinite(targetHeadroom)) return 1;
  const at = (share: number) => squadHeadroom(members.map((m) => ({ position: m.position, ...shiftMember(m, shift, share) })));
  if (!(at(1) > targetHeadroom)) return 1;
  if (at(0) >= targetHeadroom) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < targetHeadroom) lo = mid;
    else hi = mid;
  }
  const best = Math.abs(at(lo) - targetHeadroom) < Math.abs(at(hi) - targetHeadroom) ? lo : hi;
  return Math.round(best * 1000) / 1000;
}

/**
 * Posty chybějících hráčů: vždy ten, kterého je proti skladbě generátoru nejmíň.
 * Brankáři dva, u velkého kádru áčka tři.
 */
export function newPlayerPositions(current: Partial<Record<Position, number>>, count: number, teamType: TeamType): Position[] {
  const counts: Record<Position, number> = { GK: current.GK ?? 0, DEF: current.DEF ?? 0, MID: current.MID ?? 0, FWD: current.FWD ?? 0 };
  const total = counts.GK + counts.DEF + counts.MID + counts.FWD + count;
  const weights = OUTFIELD_WEIGHTS[teamType];
  const goalkeepers = teamType === "senior" && total >= 22 ? 3 : 2;
  const weightSum = weights.DEF + weights.MID + weights.FWD;
  const desired: Record<Position, number> = {
    GK: goalkeepers,
    DEF: ((total - goalkeepers) * weights.DEF) / weightSum,
    MID: ((total - goalkeepers) * weights.MID) / weightSum,
    FWD: ((total - goalkeepers) * weights.FWD) / weightSum,
  };
  const out: Position[] = [];
  for (let i = 0; i < count; i++) {
    let pick: Position = "MID";
    let bestGap = -Infinity;
    for (const pos of POSITIONS) {
      const gap = desired[pos] - counts[pos];
      if (gap > bestGap + 1e-9) { bestGap = gap; pick = pos; }
    }
    counts[pick]++;
    out.push(pick);
  }
  return out;
}

const NEWCOMER_POSITIONS: Record<TeamType, Position[]> = {
  senior: [...Array(2).fill("GK"), ...Array(7).fill("DEF"), ...Array(6).fill("MID"), ...Array(5).fill("FWD")] as Position[],
  u21: [...Array(2).fill("GK"), ...Array(5).fill("DEF"), ...Array(5).fill("MID"), ...Array(2).fill("FWD")] as Position[],
};

const MEASURE_NAMES: NameData = {
  surnameData: { surnames: { Novák: 1 }, female_forms: {} },
  firstnameData: { male: FIRSTNAMES, female: {} },
};

/**
 * Síla nově založeného lidského klubu v obci dané velikosti: kádr z jediného generátoru
 * bez posunu (20 hráčů, U21 14 dorostenců), průměr nejlepší jedenáctky přes několik vzorků.
 */
export function measureNewcomerTop11(villageSize: string, seed: number, teamType: TeamType = "senior", samples = 6): number {
  const rng = createRng(seed);
  const level = levelFromVillageSize(villageSize);
  const village: VillageInfo = { region_code: "CZ", category: categoryFromVillageSize(villageSize), population: 500 };
  let sum = 0;
  for (let s = 0; s < samples; s++) {
    const ratings = NEWCOMER_POSITIONS[teamType].map((position) => createPlayer(rng, {
      position, village, names: MEASURE_NAMES, level,
      ...(teamType === "u21" ? { age: rng.int(16, 21) } : {}),
    }).rating);
    sum += topAverage(ratings, 11);
  }
  return round1(sum / samples);
}

function ageProfileOf(ages: readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of ages) out[String(a)] = (out[String(a)] ?? 0) + 1;
  return out;
}

/** Věky z profilu jako seřazený seznam (stejné pořadí v plánu i při provedení). */
function agesFromProfile(profile: Record<string, number>): number[] {
  return Object.entries(profile)
    .map(([age, n]) => [Number(age), n] as const)
    .filter(([age, n]) => Number.isFinite(age) && n > 0)
    .sort((a, b) => a[0] - b[0])
    .flatMap(([age, n]) => Array<number>(n).fill(age));
}

// ── Načtení stavu ─────────────────────────────────────────────────────────

interface LeagueRow {
  id: string;
  name: string;
  district: string;
  level: string;
  league_type: string;
  parent_league_id: string | null;
  season_id: string;
  status: string;
}

interface TeamRow {
  id: string;
  name: string;
  user_id: string;
  team_type: string;
  budget: number;
  reputation: number;
  formation_familiarity: string | null;
  ai_former_user_id: string | null;
  game_date: string | null;
  village_name: string | null;
  village_size: string | null;
  village_district: string | null;
  village_population: number | null;
  village_region: string | null;
}

interface PlayerRow {
  id: string;
  team_id: string;
  last_name: string;
  nickname: string | null;
  age: number;
  position: string;
  overall_rating: number;
  skills: string | null;
  physical: string | null;
  skills_max: string | null;
  hidden_talent: number | null;
  weekly_wage: number | null;
  squad_number: number | null;
  residence: string | null;
  personality: string | null;
  life_context: string | null;
}

interface MemberMeta {
  wage: number;
  squadNumber: number | null;
  lastName: string;
  nickname: string | null;
  residence: string | null;
  personality: string | null;
  lifeContext: string | null;
}

interface ClubState {
  teamId: string;
  name: string;
  userId: string;
  teamType: TeamType;
  takenOver: boolean;
  villageName: string;
  villageSize: string;
  villageDistrict: string;
  villagePopulation: number;
  villageRegion: string;
  budget: number;
  reputation: number;
  gameDate: string | null;
  familiarity: Record<string, number>;
  members: SquadMember[];
  meta: Map<string, MemberMeta>;
  /** Úrovně částí stadionu a `pitch_condition`. Bez řádku je to stadion, jaký by vznikl. */
  stadium: Record<string, number>;
  pitchType: string;
  hasStadiumRow: boolean;
  equipment: Record<string, number>;
  hasEquipmentRow: boolean;
  staffRoles: string[];
  /** Formace, jejichž sehranost se zvedá (oblíbené AI trenéra, u U21 nejsehranější). */
  formations: string[];
  coachLicence: number;
  /** Trenér klubu (přednostně lidský). Převzatý klub má lidského trenéra odpojeného, vede ho AI. */
  managerId: string | null;
  managerIsAi: boolean;
  managerAttrs: Record<string, number>;
}

function parseJson<T extends object>(raw: string | null | undefined, what: string): T {
  if (!raw) return {} as T;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : ({} as T);
  } catch (e) {
    logger.warn({ module: M }, `neplatný JSON (${what})`, e);
    return {} as T;
  }
}

function numericRecord(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

async function selectByTeams<T>(db: D1Database, sql: (ph: string) => string, teamIds: readonly string[], what: string): Promise<T[]> {
  if (teamIds.length === 0) return [];
  const out: T[] = [];
  // D1 bere nejvýš 100 parametrů na dotaz.
  for (let i = 0; i < teamIds.length; i += 90) {
    const chunk = teamIds.slice(i, i + 90);
    const res = await db.prepare(sql(placeholders(chunk.length))).bind(...chunk).all<T>()
      .catch((e) => { logger.error({ module: M }, `načtení ${what}`, e); return { results: [] as T[] }; });
    out.push(...(res.results ?? []));
  }
  return out;
}

function stadiumLevels(row: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of STADIUM_LEVEL_KEYS) {
    const v = row?.[key];
    out[key] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  const pc = row?.pitch_condition;
  out.pitch_condition = typeof pc === "number" && Number.isFinite(pc) ? pc : 50;
  return out;
}

/** Řádek stadionu, jaký by klubu založil `ensureStadiumRow` (stejné semínko z id týmu). */
function predictedStadium(teamId: string, villageSize: string): { levels: Record<string, number>; pitchType: string } {
  const config = generateStadium(createRng(seedFromText(teamId)), villageSize);
  const sides = config.stands > 0
    ? legacyStandsToSides(config.stands)
    : { stand_main: 0, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 0 };
  return {
    levels: stadiumLevels({
      changing_rooms: config.changingRooms, showers: config.showers, refreshments: config.refreshments,
      lighting: config.lighting, parking: config.parking, fence: config.fence, ...sides,
      pitch_condition: config.pitchCondition,
    }),
    pitchType: config.pitchType,
  };
}

function equipmentLevels(row: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cat of EQUIPMENT_CATEGORIES) {
    const lv = row?.[cat];
    const cond = row?.[`${cat}_condition`];
    out[cat] = typeof lv === "number" && Number.isFinite(lv) ? lv : 0;
    out[`${cat}_condition`] = typeof cond === "number" && Number.isFinite(cond) ? cond : 50;
  }
  return out;
}

/** Vybavení, jaké by klubu založil `ensureEquipmentRow` (stejné semínko z id týmu). */
function predictedEquipment(teamId: string, villageSize: string): Record<string, number> {
  return equipmentLevels(generateEquipment(createRng(seedFromText(teamId) + 99), villageSize || "obec"));
}

/** Formace AI trenéra; když povaha ještě není uložená, spočítá ji stejně jako `ensureAiProfile`. */
function predictedFormations(teamId: string, manager: Record<string, unknown> | undefined): string[] {
  const stored = parseAiProfile(manager?.ai_profile);
  if (stored) return [...stored.favouriteFormations];
  if (manager) {
    return [...generateAiProfile(teamId, {
      tactics: manager.tactics as number | null, youth_development: manager.youth_development as number | null,
      discipline: manager.discipline as number | null, motivation: manager.motivation as number | null,
    }).favouriteFormations];
  }
  const ai = generateAiManager(createRng(seedFromText(teamId)));
  return [...generateAiProfile(teamId, {
    tactics: ai.tactics, youth_development: ai.youthDevelopment, discipline: ai.discipline, motivation: ai.motivation,
  }).favouriteFormations];
}

function groupByTeam<T extends { team_id?: unknown }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const id = String(r.team_id);
    const list = map.get(id);
    if (list) list.push(r);
    else map.set(id, [r]);
  }
  return map;
}

async function loadClubStates(db: D1Database, teamIds: readonly string[]): Promise<ClubState[]> {
  const teams = await selectByTeams<TeamRow>(db, (ph) =>
    `SELECT t.id, t.name, t.user_id, COALESCE(t.team_type, 'senior') AS team_type, t.budget, t.reputation,
            t.formation_familiarity, t.ai_former_user_id, t.game_date,
            v.name AS village_name, v.size AS village_size, v.district AS village_district,
            v.population AS village_population, v.region AS village_region
       FROM teams t LEFT JOIN villages v ON v.id = t.village_id
      WHERE t.id IN (${ph})`, teamIds, "týmy");
  const players = groupByTeam(await selectByTeams<PlayerRow>(db, (ph) =>
    `SELECT id, team_id, last_name, nickname, age, position, overall_rating, skills, physical, skills_max,
            hidden_talent, weekly_wage, squad_number, residence, personality, life_context
       FROM players WHERE team_id IN (${ph}) AND (status IS NULL OR status = 'active') ORDER BY id`, teamIds, "hráči"));
  const stadiums = groupByTeam(await selectByTeams<Record<string, unknown>>(db, (ph) =>
    `SELECT * FROM stadiums WHERE team_id IN (${ph})`, teamIds, "stadiony"));
  const equipment = groupByTeam(await selectByTeams<Record<string, unknown>>(db, (ph) =>
    `SELECT * FROM equipment WHERE team_id IN (${ph})`, teamIds, "vybavení"));
  const staff = groupByTeam(await selectByTeams<{ team_id: string; role: string }>(db, (ph) =>
    `SELECT team_id, role FROM staff_members WHERE team_id IN (${ph}) AND role IS NOT NULL`, teamIds, "zaměstnanci"));
  // Přednostně lidský trenér, stejně jako `loadManagerRow`.
  const managers = groupByTeam(await selectByTeams<Record<string, unknown>>(db, (ph) =>
    `SELECT id, team_id, user_id, ai_profile, coaching, tactics, youth_development, discipline, motivation, licence_level
       FROM managers WHERE team_id IN (${ph})
      ORDER BY CASE WHEN user_id = 'ai' THEN 1 ELSE 0 END, created_at DESC`, teamIds, "trenéři"));

  const states: ClubState[] = [];
  for (const t of teams) {
    const teamType: TeamType = t.team_type === "u21" ? "u21" : "senior";
    const villageSize = t.village_size ?? "village";
    const members: SquadMember[] = [];
    const meta = new Map<string, MemberMeta>();
    for (const p of players.get(t.id) ?? []) {
      members.push({
        id: p.id, position: p.position, age: p.age,
        skills: parseJson<Record<string, unknown>>(p.skills, `skills ${p.id}`),
        physical: parseJson<Record<string, unknown>>(p.physical, `physical ${p.id}`),
        skillsMax: parseJson<Record<string, unknown>>(p.skills_max, `skills_max ${p.id}`),
        hiddenTalent: p.hidden_talent ?? 0,
        rating: p.overall_rating ?? 0,
      });
      meta.set(p.id, {
        wage: p.weekly_wage ?? 0, squadNumber: p.squad_number, lastName: p.last_name, nickname: p.nickname,
        residence: p.residence, personality: p.personality, lifeContext: p.life_context,
      });
    }
    const stadiumRow = stadiums.get(t.id)?.[0];
    const predicted = stadiumRow ? null : predictedStadium(t.id, villageSize);
    const equipmentRow = equipment.get(t.id)?.[0];
    const familiarity = numericRecord(parseJson<Record<string, unknown>>(t.formation_familiarity, `formation_familiarity ${t.id}`));
    const manager = managers.get(t.id)?.[0];
    const bestFormation = Object.entries(familiarity).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "4-4-2";
    states.push({
      teamId: t.id, name: t.name, userId: t.user_id, teamType,
      takenOver: !!t.ai_former_user_id,
      villageName: t.village_name ?? "", villageSize,
      villageDistrict: t.village_district ?? "", villagePopulation: t.village_population ?? 500,
      villageRegion: t.village_region ?? "CZ031",
      budget: t.budget ?? 0, reputation: t.reputation ?? 50, gameDate: t.game_date,
      familiarity, members, meta,
      stadium: stadiumRow ? stadiumLevels(stadiumRow) : predicted!.levels,
      pitchType: stadiumRow ? String(stadiumRow.pitch_type ?? "natural") : predicted!.pitchType,
      hasStadiumRow: !!stadiumRow,
      equipment: equipmentRow ? equipmentLevels(equipmentRow) : predictedEquipment(t.id, villageSize),
      hasEquipmentRow: !!equipmentRow,
      staffRoles: (staff.get(t.id) ?? []).map((s) => String(s.role)).sort(),
      formations: teamType === "senior" && t.user_id === "ai" ? predictedFormations(t.id, manager) : [bestFormation],
      coachLicence: typeof manager?.licence_level === "number" ? manager.licence_level : 0,
      managerId: typeof manager?.id === "string" ? manager.id : null,
      managerIsAi: manager?.user_id === "ai",
      managerAttrs: Object.fromEntries(MANAGER_ATTRS
        .filter((attr) => typeof manager?.[attr] === "number")
        .map((attr) => [attr, manager![attr] as number])),
    });
  }
  return states.sort((a, b) => a.teamId.localeCompare(b.teamId));
}

function summarize(state: ClubState): ClubSummary {
  const ratings = state.members.map((m) => m.rating);
  const isU21 = state.teamType === "u21";
  const { pitch_condition: pitchCondition, ...stadium } = state.stadium;
  return {
    top11: round1(topAverage(ratings, 11)),
    top18: round1(topAverage(ratings, 18)),
    squadSize: state.members.length,
    stadium: isU21 ? {} : stadium,
    pitchCondition: isU21 ? 0 : pitchCondition ?? 50,
    pitchType: isU21 ? "" : state.pitchType,
    equipment: isU21 ? {} : { ...state.equipment },
    staffRoles: isU21 ? [] : [...state.staffRoles],
    budget: state.budget,
    reputation: state.reputation,
    formationFamiliarity: { ...state.familiarity },
    headroom: headroomOrZero(squadHeadroom(state.members)),
    manager: isU21 ? {} : { ...state.managerAttrs },
  };
}

function headroomOrZero(value: number): number {
  return Number.isFinite(value) ? round1(value) : 0;
}

// ── Vzor ──────────────────────────────────────────────────────────────────

interface ReferenceStats {
  teams: number;
  top11: number[];
  top18: number[];
  squadSize: number[];
  /** O kolik je průměr hráčů mimo jedenáctku pod jedenáctkou (medián vzoru). */
  depthGap: number;
  top18Gap: number;
  /** Věky hráčů vzoru, seřazené. */
  ages: number[];
  stadium: Record<string, number[]>;
  pitchCondition: number[];
  pitchType: number[];
  equipment: Record<string, number[]>;
  staffCount: number[];
  /** Místa v realizačním týmu seřazená podle toho, kolik klubů vzoru je má obsazená. */
  staffSlots: string[];
  budget: number[];
  reputation: number[];
  familiarity: [number[], number[]];
  /** Průměrná rezerva hráčů do stropu dovedností po klubech vzoru. */
  headroom: number[];
  /** Vlastnosti lidských trenérů áček vzoru. */
  manager: Record<string, number[]>;
}

function activeSince(now: Date): string {
  return new Date(now.getTime() - REFERENCE_ACTIVE_DAYS * 86_400_000).toISOString().slice(0, 19) + "Z";
}

async function loadLeague(db: D1Database, leagueId: string): Promise<LeagueRow | null> {
  return db.prepare(
    "SELECT id, name, district, level, COALESCE(league_type, 'senior') AS league_type, parent_league_id, season_id, status FROM leagues WHERE id = ?",
  ).bind(leagueId).first<LeagueRow>();
}

/**
 * Ligy, jejichž aktivní lidské kluby tvoří vzor. `referenceLeagueId` u režimu league-humans bere
 * lidi z jiné ligy: v lize s jediným lidským klubem by všechny AI kluby vyšly stejně silné
 * (ČB s Řeznictvím), se vzorem z Prahy dostanou stejný rozptyl jako lidé tam.
 */
async function referenceLeagueIds(db: D1Database, league: LeagueRow, mode: LevelingMode, referenceLeagueId?: string): Promise<string[]> {
  if (mode === "league-humans") return [referenceLeagueId ?? league.id];
  if (mode === "newcomer") {
    const rows = await db.prepare(
      `SELECT id FROM leagues WHERE COALESCE(league_type, 'senior') = ? AND level = 'okresni_prebor'
          AND season_id = ? AND status = 'active' ORDER BY id`,
    ).bind(league.league_type, league.season_id).all<{ id: string }>();
    return rows.results.map((r) => r.id);
  }
  // below-league: přebor téhož okresu (U21 liga bere U21 ligu přeboru).
  const senior = league.league_type === "u21" && league.parent_league_id
    ? await loadLeague(db, league.parent_league_id)
    : league;
  if (!senior) return [];
  const prebor = await db.prepare(
    `SELECT id FROM leagues WHERE district = ? AND COALESCE(league_type, 'senior') = 'senior' AND level = 'okresni_prebor'
        AND season_id = ? AND status = 'active' AND id <> ? LIMIT 1`,
  ).bind(senior.district, senior.season_id, senior.id).first<{ id: string }>();
  if (!prebor) return [];
  if (league.league_type !== "u21") return [prebor.id];
  const u21 = await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21' LIMIT 1")
    .bind(prebor.id).first<{ id: string }>();
  return u21 ? [u21.id] : [];
}

async function loadReference(db: D1Database, leagueIds: readonly string[], now: Date): Promise<ReferenceStats> {
  const teamRows = leagueIds.length === 0 ? [] : (await db.prepare(
    `SELECT t.id FROM teams t JOIN users u ON u.id = t.user_id
      WHERE t.league_id IN (${placeholders(leagueIds.length)}) AND t.user_id <> 'ai'
        AND u.last_activity_at IS NOT NULL AND u.last_activity_at >= ?
      ORDER BY t.id`,
  ).bind(...leagueIds, activeSince(now)).all<{ id: string }>()).results;
  const states = await loadClubStates(db, teamRows.map((r) => r.id));

  const stats: ReferenceStats = {
    teams: states.length, top11: [], top18: [], squadSize: [], depthGap: 0, top18Gap: 0, ages: [],
    stadium: {}, pitchCondition: [], pitchType: [], equipment: {}, staffCount: [], staffSlots: [],
    budget: [], reputation: [], familiarity: [[], []], headroom: [], manager: {},
  };
  const depthGaps: number[] = [];
  const top18Gaps: number[] = [];
  const slotCounts = new Map<string, number>();

  for (const s of states) {
    const ratings = s.members.map((m) => m.rating).sort((a, b) => b - a);
    const top11 = topAverage(ratings, 11);
    const top18 = topAverage(ratings, 18);
    stats.top11.push(top11);
    stats.top18.push(top18);
    stats.squadSize.push(ratings.length);
    top18Gaps.push(top11 - top18);
    if (ratings.length > 11) depthGaps.push(top11 - topAverage(ratings.slice(11), ratings.length));
    stats.ages.push(...s.members.map((m) => m.age));
    const headroom = squadHeadroom(s.members);
    if (Number.isFinite(headroom)) stats.headroom.push(headroom);
    stats.budget.push(s.budget);
    stats.reputation.push(s.reputation);
    const fam = Object.values(s.familiarity).sort((a, b) => b - a);
    stats.familiarity[0].push(fam[0] ?? FAMILIARITY_FLOOR);
    stats.familiarity[1].push(fam[1] ?? FAMILIARITY_FLOOR);
    // Vzor bez řádku stadionu nebo vybavení (typicky U21) se do zázemí nepočítá.
    if (s.hasStadiumRow) {
      for (const key of STADIUM_LEVEL_KEYS) (stats.stadium[key] ??= []).push(s.stadium[key] ?? 0);
      stats.pitchCondition.push(s.stadium.pitch_condition ?? 50);
      stats.pitchType.push(Math.max(0, PITCH_TYPES.indexOf(s.pitchType as typeof PITCH_TYPES[number])));
    }
    if (s.hasEquipmentRow) {
      for (const [key, value] of Object.entries(s.equipment)) (stats.equipment[key] ??= []).push(value);
    }
    if (s.teamType === "senior" && s.managerId && !s.managerIsAi) {
      for (const [attr, value] of Object.entries(s.managerAttrs)) (stats.manager[attr] ??= []).push(value);
    }
    if (s.teamType === "senior") {
      stats.staffCount.push(s.staffRoles.length);
      for (const role of new Set(s.staffRoles)) {
        if (role !== "skaut") slotCounts.set(role, (slotCounts.get(role) ?? 0) + 1);
      }
      const scouts = s.staffRoles.filter((r) => r === "skaut").length;
      for (let n = 1; n <= scouts; n++) {
        const slot = n === 1 ? "skaut" : `skaut#${n}`;
        slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
      }
    }
  }
  stats.ages.sort((a, b) => a - b);
  stats.depthGap = depthGaps.length > 0 ? median(depthGaps) : 8;
  stats.top18Gap = top18Gaps.length > 0 ? median(top18Gaps) : 3;
  const slotOrder = (slot: string) => {
    const [base, nth] = slot.split("#");
    const idx = (STAFF_ROLES as readonly string[]).indexOf(base);
    return (idx < 0 ? 99 : idx) * 10 + (nth ? Number(nth) : 0);
  };
  stats.staffSlots = [...slotCounts.entries()]
    .sort((a, b) => b[1] - a[1] || slotOrder(a[0]) - slotOrder(b[0]))
    .map(([slot]) => slot);
  return stats;
}

// ── Cíle ──────────────────────────────────────────────────────────────────

function targetsFor(
  ref: ReferenceStats, mode: LevelingMode, unit: number, club: ClubState, newcomerTop11: number | null,
): { percentile: number; targets: LevelingTargets } {
  const isU21 = club.teamType === "u21";
  const before = summarize(club);
  let percentile: number;
  let top11: number;
  let top18: number;
  if (mode === "league-humans") {
    percentile = LEAGUE_HUMANS_RANGE[0] + unit * (LEAGUE_HUMANS_RANGE[1] - LEAGUE_HUMANS_RANGE[0]);
    top11 = quantile(ref.top11, percentile);
    top18 = quantile(ref.top18, percentile);
  } else {
    percentile = unit * MODEST_MAX_PERCENTILE;
    const hi = Math.min(...ref.top11);
    const lo = mode === "below-league" ? hi - BELOW_LEAGUE_TOP11_GAP : Math.min(newcomerTop11 ?? hi, hi);
    top11 = lo + unit * (hi - lo);
    top18 = top11 - ref.top18Gap;
  }

  const stadium: Record<string, number> = {};
  const equipment: Record<string, number> = {};
  const manager: Record<string, number> = {};
  let staffRoles: string[] = [];
  let pitchCondition = before.pitchCondition;
  let pitchType = before.pitchType;
  let budget = club.budget;
  let reputation = club.reputation;
  if (!isU21) {
    for (const key of STADIUM_LEVEL_KEYS) {
      const q = quantile(ref.stadium[key] ?? [], percentile);
      if (Number.isFinite(q)) stadium[key] = clampInt(q, 0, STADIUM_MAX_LEVEL[key] ?? 3);
    }
    const pc = quantile(ref.pitchCondition, percentile);
    if (Number.isFinite(pc)) pitchCondition = clampInt(pc, 0, 100);
    const pt = nearestRank(ref.pitchType, percentile);
    if (Number.isFinite(pt)) pitchType = PITCH_TYPES[clampInt(pt, 0, PITCH_TYPES.length - 1)];
    for (const cat of EQUIPMENT_CATEGORIES) {
      const lv = quantile(ref.equipment[cat] ?? [], percentile);
      if (Number.isFinite(lv)) equipment[cat] = clampInt(lv, 0, EQUIPMENT_MAX_LEVEL);
      const cond = quantile(ref.equipment[`${cat}_condition`] ?? [], percentile);
      if (Number.isFinite(cond)) equipment[`${cat}_condition`] = clampInt(cond, 0, 100);
    }
    const staffCount = quantile(ref.staffCount, percentile);
    if (Number.isFinite(staffCount)) {
      staffRoles = ref.staffSlots.slice(0, clampInt(staffCount, 0, ref.staffSlots.length)).map((s) => s.split("#")[0]).sort();
    }
    if (mode === "league-humans") {
      const rawBudget = quantile(ref.budget, percentile);
      if (Number.isFinite(rawBudget)) budget = Math.max(MIN_LEVELED_BUDGET, Math.round(rawBudget / 100) * 100);
    } else {
      budget = modestBudgetTarget(club.villagePopulation, percentile);
    }
    const rep = quantile(ref.reputation, percentile);
    if (Number.isFinite(rep)) reputation = clampInt(rep, 0, 100);
    for (const attr of MANAGER_ATTRS) {
      const q = quantile(ref.manager[attr] ?? [], percentile);
      if (Number.isFinite(q)) manager[attr] = clampInt(q, 1, 99);
    }
  }

  const squad = quantile(ref.squadSize, percentile);
  const familiarity = [quantile(ref.familiarity[0], percentile), quantile(ref.familiarity[1], percentile)]
    .map((v) => (Number.isFinite(v) ? round1(v) : FAMILIARITY_FLOOR));
  // Silnější lidský klub má hráče vytrénované blíž stropu: rezerva z opačného percentilu.
  const headroom = mode === "league-humans" ? quantile(ref.headroom, 1 - percentile) : NaN;
  return {
    percentile: Math.round(percentile * 1000) / 1000,
    targets: {
      top11: round1(top11),
      top18: round1(top18),
      squadSize: Number.isFinite(squad) ? clampInt(squad, 0, MAX_SQUAD_SIZE) : before.squadSize,
      stadium, pitchCondition, pitchType, equipment, staffRoles, budget, reputation,
      formationFamiliarity: familiarity,
      newPlayerRating: round1(Math.max(1, top11 - ref.depthGap)),
      headroom: Number.isFinite(headroom) ? round1(headroom) : null,
      manager,
    },
  };
}

// ── Změny jednoho klubu ───────────────────────────────────────────────────

interface NewPlayerDraft {
  position: Position;
  created: CreatedPlayer;
  wage: number;
}

interface ClubChanges {
  shift: number;
  capShare: number;
  raised: Array<{ id: string; shifted: ShiftedMember; wage: number }>;
  newPlayers: NewPlayerDraft[];
  /** Změněné sloupce `stadiums` (úrovně, `pitch_condition`). */
  stadium: Record<string, number>;
  pitchType: string | null;
  /** Změněné sloupce `equipment` (úrovně a stavy). */
  equipment: Record<string, number>;
  hireRoles: string[];
  budget: number | null;
  reputation: number | null;
  familiarity: Record<string, number> | null;
  /** Zvednuté vlastnosti AI trenéra. */
  manager: Record<string, number> | null;
  after: ClubSummary;
}

/** Startovní rozpočet nového lidského klubu podle počtu obyvatel obce (jako `POST /api/teams`). */
export function newClubBudget(population: number): number {
  return population > 5000 ? 80_000 : population > 1000 ? 40_000 : 20_000;
}

/**
 * Rozpočet AI klubu nižší soutěže a nováčků: startovní rozpočet nového klubu v jeho obci
 * × (1 + percentil). Lidé v přeborech peníze proinvestují, takže kvartil jejich rozpočtů
 * je tak malý, že by z něj AI klub nezaplatil ani dva týdny mezd.
 */
export function modestBudgetTarget(population: number, percentile: number): number {
  return Math.round((newClubBudget(population) * (1 + percentile)) / 100) * 100;
}

/**
 * Rozpočet nebo reputace po narovnání: původní AI klub jde na cíl i dolů, klubu převzatému
 * od člověka se nikdy nic nebere (vlastník se k němu může vrátit).
 */
export function leveledFinance(current: number, target: number, takenOver: boolean): number {
  return takenOver ? Math.max(current, target) : target;
}

function wageFor(rating: number, teamType: TeamType): number {
  // Stejně jako při vzniku hráče: áčko 10 + 4 × hodnocení, U21 5 + 2 × hodnocení.
  return teamType === "u21" ? Math.round(5 + rating * 2) : Math.round(10 + rating * 4);
}

function clubVillage(club: ClubState): VillageInfo {
  return {
    region_code: club.villageRegion, category: categoryFromVillageSize(club.villageSize),
    population: club.villagePopulation, district: club.villageDistrict,
  };
}

/** Semínko nových hráčů klubu: plán i provedení vygenerují tytéž hráče. */
function playerSeed(seed: number, teamId: string): number {
  return (seed ^ seedFromText(`players:${teamId}`)) >>> 0;
}

/** Spočítá všechno, co narovnání klubu změní. Nic nezapisuje; stejné vstupy = stejný výsledek. */
function computeClubChanges(club: ClubState, targets: LevelingTargets, seed: number, ages: readonly number[], names: NameData): ClubChanges {
  const isU21 = club.teamType === "u21";

  // 1. Chybějící hráči do cílové velikosti kádru, jediným generátorem na úroveň hloubky kádru.
  const rng = createRng(playerSeed(seed, club.teamId));
  const missing = Math.max(0, targets.squadSize - club.members.length);
  const counts: Partial<Record<Position, number>> = {};
  for (const m of club.members) {
    const pos = (POSITIONS as readonly string[]).includes(m.position) ? m.position as Position : "MID";
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  const skillLevel = levelFromVillageSize(club.villageSize);
  const newPlayers: NewPlayerDraft[] = newPlayerPositions(counts, missing, club.teamType).map((position) => {
    const sampled = ages.length > 0 ? ages[rng.int(0, ages.length - 1)] : null;
    const age = isU21
      ? clampInt(sampled ?? rng.int(16, 21), 16, 21)
      : sampled !== null ? clampInt(sampled, 16, 45) : undefined;
    const created = createPlayer(rng, {
      position, village: clubVillage(club), names, level: skillLevel, targetRating: targets.newPlayerRating,
      ...(age !== undefined ? { age } : {}),
    });
    return { position, created, wage: wageFor(created.rating, club.teamType) };
  });

  // 2. Jeden posun dovedností stávajících hráčů, aby nejlepší jedenáctka trefila cíl.
  const shift = findSkillShift(club.members, targets.top11, newPlayers.map((p) => p.created.rating));
  const capShare = findCapShare(club.members, shift, targets.headroom);
  const raised: ClubChanges["raised"] = [];
  const ratingsAfter: number[] = newPlayers.map((p) => p.created.rating);
  const membersAfter: Array<Pick<SquadMember, "position" | "skills" | "skillsMax">> = [];
  for (const m of club.members) {
    const shifted = shiftMember(m, shift, capShare);
    ratingsAfter.push(shifted.rating);
    membersAfter.push({ position: m.position, skills: shifted.skills, skillsMax: shifted.skillsMax });
    if (shift > 0) {
      const oldWage = club.meta.get(m.id)?.wage ?? 0;
      raised.push({ id: m.id, shifted, wage: Math.max(oldWage, wageFor(shifted.rating, club.teamType)) });
    }
  }

  // 3. Stadion a trávník jen nahoru. Střecha a lóže jen na tribunu, pořadatelé jen k plotu.
  const nextStadium = { ...club.stadium };
  if (!isU21) {
    for (const [key, value] of Object.entries(targets.stadium)) {
      if (value > (nextStadium[key] ?? 0)) nextStadium[key] = value;
    }
    const anyStand = STAND_KEYS.some((k) => (nextStadium[k] ?? 0) >= 1);
    if (!anyStand) {
      nextStadium.roof = club.stadium.roof ?? 0;
      nextStadium.vip_box = club.stadium.vip_box ?? 0;
    }
    if ((nextStadium.fence ?? 0) < 1) nextStadium.security = club.stadium.security ?? 0;
    if (targets.pitchCondition > (nextStadium.pitch_condition ?? 0)) nextStadium.pitch_condition = targets.pitchCondition;
  }
  const stadium: Record<string, number> = {};
  for (const [key, value] of Object.entries(nextStadium)) {
    if (value !== club.stadium[key]) stadium[key] = value;
  }
  const pitchRank = (t: string) => Math.max(0, PITCH_TYPES.indexOf(t as typeof PITCH_TYPES[number]));
  const pitchType = !isU21 && targets.pitchType && pitchRank(targets.pitchType) > pitchRank(club.pitchType) ? targets.pitchType : null;

  // 4. Vybavení jen nahoru; stav se dorovná u kategorií, které klub po narovnání má.
  const equipment: Record<string, number> = {};
  if (!isU21) {
    for (const cat of EQUIPMENT_CATEGORIES) {
      const equipmentLevel = Math.max(club.equipment[cat] ?? 0, targets.equipment[cat] ?? 0);
      if (equipmentLevel !== (club.equipment[cat] ?? 0)) equipment[cat] = equipmentLevel;
      const condKey = `${cat}_condition`;
      const cond = targets.equipment[condKey];
      if (equipmentLevel > 0 && cond !== undefined && cond > (club.equipment[condKey] ?? 0)) equipment[condKey] = cond;
    }
  }

  // 5. Zaměstnanci: jen chybějící místa z cílového složení.
  const have = new Map<string, number>();
  for (const r of club.staffRoles) have.set(r, (have.get(r) ?? 0) + 1);
  const hireRoles: string[] = [];
  if (!isU21) {
    for (const role of targets.staffRoles) {
      const n = have.get(role) ?? 0;
      if (n > 0) have.set(role, n - 1);
      else hireRoles.push(role);
    }
  }

  // 6. Rozpočet a reputace: původní AI klub na cíl, převzatému klubu nic nebrat. U21 nic.
  const budget = isU21 ? null : leveledFinance(club.budget, targets.budget, club.takenOver);
  const reputation = isU21 ? null : leveledFinance(club.reputation, targets.reputation, club.takenOver);

  // 7. Sehranost formací jen nahoru.
  const familiarity = { ...club.familiarity };
  club.formations.forEach((f, i) => {
    const target = targets.formationFamiliarity[i] ?? targets.formationFamiliarity[targets.formationFamiliarity.length - 1];
    if (target !== undefined && target > (familiarity[f] ?? 0)) familiarity[f] = target;
  });
  const familiarityChanged = Object.entries(familiarity).some(([f, v]) => v !== club.familiarity[f]);

  // 8. AI trenér jen nahoru. Lidský trenér převzatého klubu je odpojený a čeká na návrat vlastníka.
  const manager: Record<string, number> = {};
  if (!isU21 && club.managerId && club.managerIsAi) {
    for (const [attr, target] of Object.entries(targets.manager ?? {})) {
      if (target > (club.managerAttrs[attr] ?? 0)) manager[attr] = target;
    }
  }

  const { pitch_condition: pitchCondition, ...stadiumAfter } = nextStadium;
  const after: ClubSummary = {
    top11: round1(topAverage(ratingsAfter, 11)),
    top18: round1(topAverage(ratingsAfter, 18)),
    squadSize: club.members.length + newPlayers.length,
    stadium: isU21 ? {} : stadiumAfter,
    pitchCondition: isU21 ? 0 : pitchCondition ?? 50,
    pitchType: isU21 ? "" : pitchType ?? club.pitchType,
    equipment: isU21 ? {} : { ...club.equipment, ...equipment },
    staffRoles: isU21 ? [] : [...club.staffRoles, ...hireRoles].sort(),
    budget: budget ?? club.budget,
    reputation: reputation ?? club.reputation,
    formationFamiliarity: familiarity,
    headroom: headroomOrZero(squadHeadroom(membersAfter)),
    manager: isU21 ? {} : { ...club.managerAttrs, ...manager },
  };

  return {
    shift, capShare, raised, newPlayers, stadium, pitchType, equipment, hireRoles,
    budget: budget !== null && budget !== club.budget ? budget : null,
    reputation: reputation !== null && reputation !== club.reputation ? reputation : null,
    familiarity: familiarityChanged ? familiarity : null,
    manager: Object.keys(manager).length > 0 ? manager : null,
    after,
  };
}

async function namesForDistricts(db: D1Database, districts: Iterable<string>): Promise<Map<string, NameData>> {
  const out = new Map<string, NameData>();
  for (const d of new Set(districts)) {
    const data = await getDistrictDataFromDB(db, d);
    out.set(d, {
      surnameData: { surnames: data.surnames, female_forms: {} },
      firstnameData: { male: FIRSTNAMES, female: {} },
    });
  }
  return out;
}

// ── Plán ──────────────────────────────────────────────────────────────────

export interface PlanLevelingOptions {
  leagueId: string;
  mode: LevelingMode;
  seed: number;
  /** Jen tyto kluby ligy; bez nich všechny kluby ligy, které vede AI. */
  teamIds?: string[];
  /** Od kdy se počítá 30 dní aktivity vzoru (testy). */
  now?: Date;
  /** Režim league-humans: vzorem jsou lidé z této ligy místo narovnávané (viz referenceLeagueIds). */
  referenceLeagueId?: string;
}

/** Tabulka před a po pro každý narovnávaný klub. Nic nezapisuje. */
export async function planLeveling(db: D1Database, opts: PlanLevelingOptions): Promise<LevelingPlan> {
  const warnings: string[] = [];
  const league = await loadLeague(db, opts.leagueId);
  if (!league) throw new Error(`Liga ${opts.leagueId} neexistuje`);

  if (opts.referenceLeagueId && !(await loadLeague(db, opts.referenceLeagueId))) {
    throw new Error(`Vzorová liga ${opts.referenceLeagueId} neexistuje`);
  }
  const leagueIds = await referenceLeagueIds(db, league, opts.mode, opts.referenceLeagueId);
  const ref = await loadReference(db, leagueIds, opts.now ?? new Date());
  const plan: LevelingPlan = {
    leagueId: league.id, mode: opts.mode, seed: opts.seed,
    reference: {
      teams: ref.teams, activeDays: REFERENCE_ACTIVE_DAYS, leagueIds,
      top11: ref.top11.length > 0
        ? { min: round1(Math.min(...ref.top11)), median: round1(median(ref.top11)), max: round1(Math.max(...ref.top11)) }
        : null,
      headroom: ref.headroom.length > 0
        ? { min: round1(Math.min(...ref.headroom)), median: round1(median(ref.headroom)), max: round1(Math.max(...ref.headroom)) }
        : null,
      ageProfile: ageProfileOf(ref.ages),
    },
    clubs: [],
    warnings,
  };
  if (ref.teams === 0) {
    warnings.push("Vzor nemá žádný aktivní lidský klub, narovnání nemá podle čeho jít.");
    return plan;
  }

  const leagueTeams = (await db.prepare("SELECT id, user_id FROM teams WHERE league_id = ? ORDER BY id")
    .bind(league.id).all<{ id: string; user_id: string }>()).results;
  const ownerById = new Map(leagueTeams.map((t) => [t.id, t.user_id]));
  let teamIds: string[];
  if (opts.teamIds && opts.teamIds.length > 0) {
    teamIds = opts.teamIds.filter((id) => ownerById.has(id));
    for (const id of opts.teamIds) {
      if (!ownerById.has(id)) warnings.push(`Klub ${id} v lize není, přeskakuji ho.`);
      else if (ownerById.get(id) !== "ai") warnings.push(`Klub ${id} nevede AI, narovná se jen proto, že je výslovně v seznamu.`);
    }
  } else {
    teamIds = leagueTeams.filter((t) => t.user_id === "ai").map((t) => t.id);
  }

  const clubs = await loadClubStates(db, teamIds);
  const units = stratifiedUnits(createRng(opts.seed), clubs.length);
  const names = await namesForDistricts(db, clubs.map((c) => c.villageDistrict));
  clubs.forEach((club, i) => {
    const newcomerTop11 = opts.mode === "newcomer"
      ? measureNewcomerTop11(club.villageSize, (opts.seed ^ seedFromText(`newcomer:${club.villageSize}`)) >>> 0, club.teamType)
      : null;
    const { percentile, targets } = targetsFor(ref, opts.mode, units[i], club, newcomerTop11);
    const changes = computeClubChanges(club, targets, opts.seed, ref.ages, names.get(club.villageDistrict)!);
    plan.clubs.push({
      teamId: club.teamId, name: club.name, teamType: club.teamType, takenOver: club.takenOver,
      percentile, skillShift: changes.shift, capShare: changes.capShare, newPlayers: changes.newPlayers.length,
      before: summarize(club), target: targets, after: changes.after,
    });
  });
  return plan;
}

// ── Provedení ─────────────────────────────────────────────────────────────

async function runInBatches(db: D1Database, stmts: D1PreparedStatement[], label: string): Promise<number> {
  let failed = 0;
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const chunk = stmts.slice(i, i + BATCH_SIZE);
    try {
      await db.batch(chunk);
    } catch (e) {
      failed += chunk.length;
      logger.error({ module: M }, `${label}: dávka ${i}–${i + chunk.length} selhala`, e);
    }
  }
  return failed;
}

function staffCandidate(rng: Rng, surnames: Record<string, number>, role: StaffRole, licence: number) {
  // Špičkoví lidé nejdou pod trenéra bez papírů (stejné pravidlo jako nábor v routes/staff.ts).
  for (let attempt = 0; attempt < 30; attempt++) {
    const c = generateStaffCandidate(rng, surnames, role);
    const best = Math.max(...STAFF_ATTRS.map((a) => c[a]));
    if (staffRequiredLicence(best) <= licence) return c;
  }
  return null;
}

type Bindable = string | number | null;

/**
 * Provede plán: stav klubů znovu načte a změny spočítá stejně jako plán (stejné cíle,
 * stejné semínko). Áčka bez stadionu nebo vybavení je nejdřív dostanou, AI trenér áčka
 * povahu. Zápisy jdou v dávkách po 80. Hráč, stadion, vybavení ani zaměstnanci se nesníží,
 * takže opakované provedení nic nezhorší.
 */
export async function applyLeveling(db: D1Database, plan: LevelingPlan): Promise<LevelingResult> {
  const result: LevelingResult = { clubs: 0, playersRaised: 0, playersCreated: 0, staffHired: 0, managersRaised: 0, failedStatements: 0 };
  if (plan.clubs.length === 0) return result;

  const targetsById = new Map(plan.clubs.map((c) => [c.teamId, c.target]));
  for (const c of plan.clubs) {
    if (c.teamType !== "senior") continue;
    await ensureStadiumRow(db, c.teamId);
    await ensureEquipmentRow(db, c.teamId);
    await ensureAiProfile(db, c.teamId);
  }
  const clubs = await loadClubStates(db, plan.clubs.map((c) => c.teamId));
  const ages = agesFromProfile(plan.reference.ageProfile);
  const names = await namesForDistricts(db, clubs.map((c) => c.villageDistrict));
  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "aktivní sezóna pro smlouvy", e); return null; });
  if (!season) logger.warn({ module: M }, `liga ${plan.leagueId}: bez aktivní sezóny, noví hráči budou bez smlouvy`);

  const playerStmts: D1PreparedStatement[] = [];
  const linkStmts: D1PreparedStatement[] = [];
  const facilityStmts: D1PreparedStatement[] = [];
  const staffStmts: D1PreparedStatement[] = [];
  const teamStmts: D1PreparedStatement[] = [];

  for (const club of clubs) {
    const targets = targetsById.get(club.teamId);
    if (!targets) continue;
    const clubNames = names.get(club.villageDistrict)!;
    const changes = computeClubChanges(club, targets, plan.seed, ages, clubNames);
    // Bydliště, přezdívky, popisy a zaměstnanci z vlastního semínka, ať neposunou losování hráčů.
    const extras = createRng((plan.seed ^ seedFromText(`extras:${club.teamId}`)) >>> 0);
    result.clubs++;

    for (const r of changes.raised) {
      playerStmts.push(db.prepare(
        "UPDATE players SET skills = ?, physical = ?, skills_max = ?, overall_rating = ?, weekly_wage = ? WHERE id = ?",
      ).bind(JSON.stringify(r.shifted.skills), JSON.stringify(r.shifted.physical), JSON.stringify(r.shifted.skillsMax),
        r.shifted.rating, r.wage, r.id));
    }
    result.playersRaised += changes.raised.length;

    // Noví hráči: čísla dresů, bydliště, přezdívka a vazby v kabině jako u ostatních příchodů.
    const usedNicknames = new Set([...club.meta.values()].map((m) => m.nickname).filter((n): n is string => !!n));
    const newIds: string[] = changes.newPlayers.map(() => crypto.randomUUID());
    const newIdSet = new Set(newIds);
    const numbering = planSquadNumbers([
      ...club.members.map((m) => ({ id: m.id, position: m.position, squad_number: club.meta.get(m.id)?.squadNumber ?? null })),
      ...changes.newPlayers.map((p, i) => ({ id: newIds[i], position: p.position, squad_number: null })),
    ]);
    const numberById = new Map(numbering.map((n) => [n.id, n.number]));
    const squad: RelationCandidate[] = club.members.map((m) => {
      const meta = club.meta.get(m.id);
      const pers = parseJson<{ alcohol?: number; leadership?: number }>(meta?.personality, `personality ${m.id}`);
      const life = parseJson<{ occupation?: string }>(meta?.lifeContext, `life_context ${m.id}`);
      return {
        id: m.id, lastName: meta?.lastName ?? "", age: m.age, residence: meta?.residence ?? null,
        occupation: life.occupation ?? null, alcohol: pers.alcohol ?? null, leadership: pers.leadership ?? null,
      };
    });
    changes.newPlayers.forEach((p, i) => {
      const id = newIds[i];
      const c = p.created;
      const nickname = generateNickname(extras, { ...c.identity, ...c.skills }, usedNicknames) ?? "";
      if (nickname) usedNicknames.add(nickname);
      const residence = generateResidence(extras, club.villageName, club.villageSize, club.villageDistrict);
      const description = generateDescription(extras, {
        firstName: c.firstName, lastName: c.lastName, nickname, age: c.age, position: p.position,
        occupation: c.lifeContext.occupation, bodyType: c.identity.bodyType, alcohol: c.personality.alcohol,
        discipline: c.personality.discipline, speed: c.skills.speed, shooting: c.skills.shooting,
        technique: c.skills.technique, patriotism: c.personality.patriotism,
      });
      playerStmts.push(db.prepare(
        `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical,
           personality, life_context, avatar, description, skills_max, hidden_talent, experience, residence, commute_km,
           weekly_wage, nationality, squad_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, club.teamId, c.firstName, c.lastName, nickname, c.age, p.position, c.rating,
        JSON.stringify(c.skills), JSON.stringify(c.physical), JSON.stringify(c.personality), JSON.stringify(c.lifeContext),
        JSON.stringify(c.avatar), description, JSON.stringify(c.skillsMax), c.hiddenTalent, c.experience,
        residence.residence, residence.commuteKm, p.wage, c.nationality, numberById.get(id) ?? null));
      if (season) {
        linkStmts.push(db.prepare(
          "INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'generated', 0, 1)",
        ).bind(crypto.randomUUID(), id, club.teamId, season.id));
      }
      const candidate: RelationCandidate = {
        id, lastName: c.lastName, age: c.age, residence: residence.residence,
        occupation: c.lifeContext.occupation, alcohol: c.personality.alcohol, leadership: c.personality.leadership,
      };
      for (const rel of generateRelationsForNewcomer(extras, candidate, squad, 1, club.villageName)) {
        linkStmts.push(db.prepare(
          "INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES (?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), id, rel.otherPlayerId, rel.type, rel.strength));
      }
      squad.push(candidate);
    });
    for (const n of numbering) {
      if (!newIdSet.has(n.id)) linkStmts.push(db.prepare("UPDATE players SET squad_number = ? WHERE id = ?").bind(n.number, n.id));
    }
    result.playersCreated += changes.newPlayers.length;

    // Sloupce jen z pevných seznamů (STADIUM_LEVEL_KEYS, CATEGORIES), nikdy z venku.
    const stadiumCols: Array<[string, Bindable]> = Object.entries(changes.stadium)
      .filter(([k]) => (STADIUM_LEVEL_KEYS as readonly string[]).includes(k) || k === "pitch_condition");
    if (changes.pitchType) stadiumCols.push(["pitch_type", changes.pitchType]);
    if (stadiumCols.length > 0) {
      facilityStmts.push(db.prepare(`UPDATE stadiums SET ${stadiumCols.map(([k]) => `${k} = ?`).join(", ")} WHERE team_id = ?`)
        .bind(...stadiumCols.map(([, v]) => v), club.teamId));
    }
    const equipmentCols = Object.entries(changes.equipment)
      .filter(([k]) => (EQUIPMENT_CATEGORIES as readonly string[]).includes(k.replace(/_condition$/, "")));
    if (equipmentCols.length > 0) {
      facilityStmts.push(db.prepare(`UPDATE equipment SET ${equipmentCols.map(([k]) => `${k} = ?`).join(", ")} WHERE team_id = ?`)
        .bind(...equipmentCols.map(([, v]) => v), club.teamId));
    }

    const hiredAt = club.gameDate ?? new Date().toISOString();
    const maxScouts = maxScoutsForLicence(club.coachLicence);
    let scouts = club.staffRoles.filter((r) => r === "skaut").length;
    for (const role of changes.hireRoles) {
      if (role === "skaut" && scouts >= maxScouts) continue;
      const c = staffCandidate(extras, clubNames.surnameData.surnames, role as StaffRole, club.coachLicence);
      if (!c) {
        logger.warn({ module: M, teamId: club.teamId }, `pro roli ${role} se nenašel kandidát, kterého by trenér s licencí ${club.coachLicence} směl vést`);
        continue;
      }
      if (role === "skaut") scouts++;
      // OR IGNORE: místo mezitím obsadil běžný nábor (unikátní index týmu a role), dávka nesmí spadnout celá.
      staffStmts.push(db.prepare(
        `INSERT OR IGNORE INTO staff_members
           (id, district, team_id, role, profession, first_name, last_name, gender, age,
            coaching, medicine, maintenance, judgement, communication, work_rate, charm,
            weekly_wage, signing_fee, avatar, description, hired_at, listed_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).bind(crypto.randomUUID(), club.villageDistrict, club.teamId, role, c.profession, c.firstName, c.lastName, c.gender, c.age,
        c.coaching, c.medicine, c.maintenance, c.judgement, c.communication, c.work_rate, c.charm,
        c.weeklyWage, c.signingFee, JSON.stringify(c.avatar), c.description, hiredAt));
      result.staffHired++;
    }

    if (changes.budget !== null) {
      teamStmts.push(db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(changes.budget - club.budget, club.teamId));
    }
    if (changes.reputation !== null) {
      const delta = changes.reputation - club.reputation;
      // Reputace se mění jen s auditem (lib/reputation.ts); narovnání zapisuje přesný rozdíl.
      teamStmts.push(db.prepare(
        `INSERT INTO reputation_log (team_id, old_value, new_value, delta, raw_delta, source, description, reference_id, game_date)
         VALUES (?, ?, ?, ?, ?, 'admin', ?, NULL, ?)`,
      ).bind(club.teamId, club.reputation, changes.reputation, delta, delta, LEVELING_REPUTATION_TEXT, club.gameDate));
      teamStmts.push(db.prepare("UPDATE teams SET reputation = MAX(0, MIN(100, reputation + ?)) WHERE id = ?").bind(delta, club.teamId));
    }
    if (changes.familiarity) {
      teamStmts.push(db.prepare("UPDATE teams SET formation_familiarity = ? WHERE id = ?").bind(JSON.stringify(changes.familiarity), club.teamId));
    }
    if (changes.manager && club.managerId) {
      // MAX: jen nahoru, i kdyby se trenér mezi plánem a provedením zlepšil sám.
      const cols = Object.entries(changes.manager).filter(([attr]) => (MANAGER_ATTRS as readonly string[]).includes(attr));
      teamStmts.push(db.prepare(
        `UPDATE managers SET ${cols.map(([attr]) => `${attr} = MAX(${attr}, ?)`).join(", ")} WHERE id = ? AND user_id = 'ai'`,
      ).bind(...cols.map(([, value]) => value), club.managerId));
      result.managersRaised++;
    }
  }

  // Pořadí kvůli cizím klíčům: hráči před smlouvami a vazbami.
  result.failedStatements += await runInBatches(db, playerStmts, "hráči");
  result.failedStatements += await runInBatches(db, linkStmts, "smlouvy, vazby a čísla dresů");
  result.failedStatements += await runInBatches(db, facilityStmts, "stadion a vybavení");
  result.failedStatements += await runInBatches(db, staffStmts, "zaměstnanci");
  result.failedStatements += await runInBatches(db, teamStmts, "rozpočet, reputace a sehranost");
  logger.info({ module: M }, `liga ${plan.leagueId} (${plan.mode}): ${result.clubs} klubů, zvednuto ${result.playersRaised} hráčů, nových ${result.playersCreated}, zaměstnanců ${result.staffHired}, chyb ${result.failedStatements}`);
  return result;
}
