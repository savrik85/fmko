/**
 * Rozvoj hráče z odehraných minut.
 *
 * Odehrané minuty mají mladíka posouvat víc než trénink — právě tak se hráč vypiplává.
 * Dřív byla šance jen 0,08 za celý zápas, bez ohledu na talent i trenéra mládeže, takže
 * dát klukovi minuty se na jeho rozvoji prakticky neprojevilo.
 *
 * Sdílené ligou (`multiplayer/match-runner.ts`), pohárem (`cup/cup.ts`) i přáteláky
 * (`multiplayer/friendly-runner.ts`) — všechny tři to dřív měly zkopírované zvlášť
 * a stačilo změnit jedno místo, aby se pravidla rozešla.
 */

import type { Rng } from "../generators/rng";
import { logger } from "../lib/logger";

/** Dovednosti, které se dají zlepšit odehranými minutami, podle pozice. */
const POSITION_SKILLS: Record<string, string[]> = {
  GK: ["goalkeeping"],
  DEF: ["defense", "heading", "strength"],
  MID: ["passing", "vision", "technique"],
  FWD: ["shooting", "speed", "technique"],
};

/**
 * Strop pro hráče, který nemá vyplněný `skills_max`. Většina starých záznamů ho nemá
 * a bez něj by minuty tlačily dovednost donekonečna.
 */
const STROP_BEZ_POTENCIALU = 85;

export interface MatchGrowthInput {
  age: number;
  position: string;
  /** Odehrané minuty v tomto zápase. */
  minutes: number;
  /** Skrytý talent (sloupec `hidden_talent`) — zrychluje růst stejně jako v tréninku. */
  hiddenTalent?: number;
  /** Stropy z `skills_max` ({ atribut: maxPotential }). Týž strop, jaký respektuje trénink. */
  skillCaps?: Record<string, number>;
  /** `youthTrainingMod` z realizačního týmu a vybavení (trenér mládeže, videokamera). */
  youthMod?: number;
  /**
   * Váha soutěže. Liga i pohár 1,0; přátelák 0,5 — v nezávazném zápase se hráč naučí míň.
   * Dřív měl přátelák navíc vlastní strop 80 (liga 85); s reálným potenciálem ze `skills_max`
   * ten rozdíl ztratil smysl, drží ho tenhle násobitel.
   */
  nasobitel?: number;
}

/**
 * Šance, že hráč z odehraných minut povyskočí o bod.
 *
 * Mladík na celý zápas s trenérem mládeže a slušným talentem se dostane přes 30 %,
 * takže pravidelná sestava mu za sezónu dá víc než tréninkový dril. Třicátník se
 * z minut nezlepší skoro nikdy — na jeho posun je pozdě.
 */
export function matchGrowthChance(input: MatchGrowthInput): number {
  const { age, minutes, hiddenTalent = 0, youthMod = 0, nasobitel = 1 } = input;
  const vekovyMod = age < 22 ? 0.20 : age < 26 ? 0.10 : age < 30 ? 0.05 : 0.02;
  const talentMod = 1 + Math.max(0, hiddenTalent) / 200;
  const mladeznickyMod = age < 22 ? 1 + Math.max(0, youthMod) : 1;
  return vekovyMod * (minutes / 90) * talentMod * mladeznickyMod * nasobitel;
}

/**
 * Vybere dovednost ke zlepšení a vrátí novou hodnotu, nebo `null`, když se nic nezmění
 * (hod kostkou neprošel, nebo je hráč v té dovednosti na svém stropu).
 *
 * `skills` se nemodifikuje — zápis si řeší volající, ať může do stejné transakce
 * přibalit i zkušenost.
 */
export function tryMatchGrowth(
  rng: Rng,
  skills: Record<string, unknown>,
  input: MatchGrowthInput,
): { attribute: string; oldValue: number; newValue: number } | null {
  if (rng.random() >= matchGrowthChance(input)) return null;

  const kandidati = POSITION_SKILLS[input.position] ?? ["technique"];
  const attribute = rng.pick(kandidati);
  const oldValue = typeof skills[attribute] === "number" ? (skills[attribute] as number) : 50;

  const strop = Math.min(100, input.skillCaps?.[attribute] ?? STROP_BEZ_POTENCIALU);
  if (oldValue >= strop) return null;

  return { attribute, oldValue, newValue: oldValue + 1 };
}

/**
 * Rozparsuje sloupec `skills_max` na ploché stropy ({ atribut: maxPotential }).
 * Stejný převod dělá i daily-tick před tréninkem.
 */
export function parseSkillCaps(skillsMax: string | null | undefined): Record<string, number> | undefined {
  if (!skillsMax) return undefined;
  try {
    const sm = JSON.parse(skillsMax) as Record<string, { maxPotential?: number }>;
    const caps: Record<string, number> = {};
    for (const [attr, v] of Object.entries(sm)) {
      if (v && typeof v.maxPotential === "number") caps[attr] = v.maxPotential;
    }
    return caps;
  } catch (e) {
    // Rozbitý JSON znamená jen "neznáme strop" — volající spadne na STROP_BEZ_POTENCIALU.
    logger.warn({ module: "match-growth" }, "parse skills_max", e);
    return undefined;
  }
}

/**
 * `youthTrainingMod` klubu — trenér mládeže z realizačního týmu plus videokamera.
 * U21 tým vlastní zázemí nemá, proto se čte z A-týmu (`parent_team_id`).
 */
export async function loadYouthMod(db: D1Database, teamId: string): Promise<number> {
  const clubRow = await db.prepare("SELECT COALESCE(parent_team_id, id) AS club_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ club_id: string }>()
    .catch((e) => { logger.warn({ module: "match-growth", teamId }, "load club id", e); return null; });
  const clubId = clubRow?.club_id ?? teamId;

  let mod = 0;

  const staff = await db.prepare(
    "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?",
  ).bind(clubId).all<{ role: string; coaching: number; medicine: number; maintenance: number; judgement: number; communication: number; work_rate: number; charm: number }>()
    .catch((e) => { logger.warn({ module: "match-growth", teamId: clubId }, "load staff", e); return { results: [] as never[] }; });
  if (staff.results.length > 0) {
    const { calculateStaffEffects } = await import("../staff/staff-effects");
    mod += calculateStaffEffects(staff.results).youthTrainingMod;
  }

  const equip = await db.prepare("SELECT * FROM equipment WHERE team_id = ?")
    .bind(clubId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "match-growth", teamId: clubId }, "load equipment", e); return null; });
  if (equip) {
    const { calculateEffects } = await import("../equipment/equipment-generator");
    const levels: Record<string, number> = {};
    const conditions: Record<string, number> = {};
    for (const [k, v] of Object.entries(equip)) {
      if (k.endsWith("_condition")) conditions[k] = v as number;
      else if (typeof v === "number" && k !== "id") levels[k] = v;
    }
    mod += calculateEffects(levels, conditions).youthTrainingMod;
  }

  return mod;
}

/**
 * Výdrž a síla žijí ve dvou kopiích: v `skills` a v `physical`. Pravdu drží `physical` —
 * čte z něj profil hráče i zápasový engine.
 *
 * Růst ze zápasu si toho dřív nevšímal: načetl `skills`, zlepšil sílu a uložil zase jen
 * `skills`. Následující trénink pak vyšel z `physical`, kde ten bod nebyl, a při zápisu
 * do obou kopií zápasový přírůstek přemazal. Naměřeno skutečným tickem: po opravě
 * ukládání v tréninku zbývalo 31 ztracených bodů a 26 z nich byla právě výdrž a síla.
 */
export const FYZICKE_DOVEDNOSTI = ["stamina", "strength"];

/**
 * Ploché dovednosti a fyzično pro výpočet růstu — výdrž a síla se doplní z `physical`,
 * aby se nerostlo ze zastaralé hodnoty.
 */
export function sjednoceneDovednosti(
  skillsJson: string | null | undefined,
  physicalJson: string | null | undefined,
): { skills: Record<string, unknown>; physical: Record<string, unknown> } {
  const rozparsuj = (s: string | null | undefined): Record<string, unknown> => {
    if (!s) return {};
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch (e) {
      logger.warn({ module: "match-growth" }, "parse dovednosti", e);
      return {};
    }
  };
  const skills = rozparsuj(skillsJson);
  const physical = rozparsuj(physicalJson);
  for (const attr of FYZICKE_DOVEDNOSTI) {
    if (typeof physical[attr] === "number") skills[attr] = physical[attr];
  }
  return { skills, physical };
}

/** Zapíše zlepšení do obou kopií naráz, ať se zase nerozejdou. */
export function zapisDovednost(
  skills: Record<string, unknown>,
  physical: Record<string, unknown>,
  attribute: string,
  newValue: number,
): void {
  skills[attribute] = newValue;
  if (FYZICKE_DOVEDNOSTI.includes(attribute)) physical[attribute] = newValue;
}
