/**
 * Modifikátory vybavení a zaměstnanců pro simulaci zápasu.
 *
 * Tenhle výpočet byl původně napsaný přímo v match-runner.ts, takže ho měla jen
 * liga. Pohár (cup/cup.ts) i přáteláky (multiplayer/friendly-runner.ts) volaly
 * simulateMatch úplně bez něj — všechny bonusy z vybavení tam byly na nule.
 * Hráč tedy v poháru nastupoval s horším týmem, než jaký si zaplatil, a nikde
 * to nebylo vidět.
 *
 * Teď je to jedno místo pro všechny tři druhy zápasů.
 */

import type { EquipmentMods } from "../engine/types";
import { disciplineCardMul, disciplineFoulMul } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { calculateEffects } from "./equipment-generator";

const MODULE = "match-mods";

export function zeroMatchMods(): EquipmentMods & { crowdMod: number; injuryDaysReduction: number } {
  return {
    techniqueMod: 0, gkBonus: 0, injurySeverityMod: 0, conditionDrainMod: 0, moraleMod: 0,
    setPiecesMod: 0, weatherResistMod: 0, lateFatigueMod: 0,
    crowdMod: 0, injuryDaysReduction: 0,
  };
}

export type MatchMods = ReturnType<typeof zeroMatchMods>;

/** Efekty vybavení týmu přepočtené na modifikátory, kterým rozumí engine. */
export async function loadEquipmentMatchMods(db: D1Database, teamId: string): Promise<MatchMods | undefined> {
  const row = await db.prepare("SELECT * FROM equipment WHERE team_id = ?")
    .bind(teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: MODULE }, "load equipment", e); return null; });
  if (!row) return undefined;

  const levels: Record<string, number> = {};
  const conditions: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "id" || k === "team_id") continue;
    if (k.endsWith("_condition")) conditions[k] = v as number;
    else if (typeof v === "number") levels[k] = v;
  }

  const eff = calculateEffects(levels, conditions);
  return {
    techniqueMod: eff.matchTechniqueMod,
    gkBonus: eff.gkBonus,
    injurySeverityMod: eff.injurySeverityMod,
    conditionDrainMod: eff.conditionDrainMod,
    moraleMod: eff.moraleMod,
    setPiecesMod: eff.setPiecesMod,
    weatherResistMod: eff.weatherResistMod,
    lateFatigueMod: eff.lateFatigueMod,
    crowdMod: eff.crowdMod,
    injuryDaysReduction: eff.injuryDaysReduction,
  };
}

/** Efekty zaměstnanců se k modům vybavení přičítají (trenér brankářů, kondiční, lékař, šéf fanklubu). */
export async function mergeStaffMatchMods(
  db: D1Database,
  teamId: string,
  mods: MatchMods | undefined,
  isHome: boolean,
): Promise<MatchMods> {
  const merged = mods ?? zeroMatchMods();
  const { calculateStaffEffects } = await import("../staff/staff-effects");
  const rows = await db.prepare(
    "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?"
  ).bind(teamId).all<{ role: string; coaching: number; medicine: number; maintenance: number; judgement: number; communication: number; work_rate: number; charm: number }>()
    .catch((e) => { logger.warn({ module: MODULE }, "load staff", e); return { results: [] as never[] }; });

  const fx = calculateStaffEffects(rows.results);
  merged.gkBonus += fx.gkBonus;
  merged.conditionDrainMod += fx.conditionDrainReduction;
  merged.injurySeverityMod += fx.injurySeverityReduction;
  if (isHome) merged.crowdMod += fx.crowdMod + fx.crowdAttendanceBonus; // šéf fanklubu jen doma
  return merged;
}

/**
 * Disciplína trenéra: méně faulů a karet. Rezerva hraje pod trenérem áčka.
 * Bez trenéra (AI klub, kterému ho nikdo neuložil) zůstane neutrální 1.
 */
export async function mergeCoachMatchMods(db: D1Database, teamId: string, mods: MatchMods): Promise<MatchMods> {
  const row = await db.prepare(
    `SELECT m.discipline FROM teams t
       JOIN managers m ON m.team_id = COALESCE(t.parent_team_id, t.id)
      WHERE t.id = ? LIMIT 1`,
  ).bind(teamId).first<{ discipline: number }>()
    .catch((e) => { logger.warn({ module: MODULE }, `load coach discipline ${teamId}`, e); return null; });
  if (row) {
    mods.coachFoulMod = disciplineFoulMul(row.discipline);
    mods.coachCardMod = disciplineCardMul(row.discipline);
  }
  return mods;
}

/** Vybavení + zaměstnanci + trenér naráz — to, co potřebuje simulateMatch. */
export async function loadMatchMods(db: D1Database, teamId: string, isHome: boolean): Promise<MatchMods> {
  const mods = await mergeStaffMatchMods(db, teamId, await loadEquipmentMatchMods(db, teamId), isHome);
  return mergeCoachMatchMods(db, teamId, mods);
}
