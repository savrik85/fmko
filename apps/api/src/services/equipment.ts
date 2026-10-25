/**
 * Nákup a oprava vybavení: jedna služba pro manažera (POST /teams/:teamId/equipment/*)
 * i AI trenéra. Ceny, zámky a kontroly jsou jen tady.
 */

import { mustSeason } from "../lib/season";
import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";
import type { RepairOption, UpgradeOption } from "../equipment/equipment-generator";
import type { ServiceError } from "./lineup";

export interface EquipmentOptions {
  levels: Record<string, number>;
  conditions: Record<string, number>;
  upgrades: UpgradeOption[];
  repairs: RepairOption[];
}

async function matchesPlayed(db: D1Database, teamId: string, what: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'"
  ).bind(teamId, teamId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, `count matches for ${what}`, e); return null; });
  return row?.cnt ?? 0;
}

async function activeSeasonNumber(db: D1Database, what: string): Promise<number> {
  const row = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, `fetch season for ${what}`, e); return null; });
  return mustSeason(row?.number);
}

/** Co jde právě koupit a opravit (stejné nabídky, jaké vidí manažer). Null = tým bez vybavení. */
export async function getEquipmentOptions(db: D1Database, teamId: string): Promise<EquipmentOptions | null> {
  const { getUpgradeOptions, getRepairOptions, CATEGORIES } = await import("../equipment/equipment-generator");
  const equip = await db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "equipment-service" }, `vybavení ${teamId}`, e); return null; });
  if (!equip) return null;
  const team = await db.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId).first<{ reputation: number }>()
    .catch((e) => { logger.warn({ module: "equipment-service" }, `reputace ${teamId}`, e); return null; });
  const levels: Record<string, number> = {};
  const conditions: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    levels[cat] = (equip[cat] as number) ?? 0;
    conditions[`${cat}_condition`] = (equip[`${cat}_condition`] as number) ?? 50;
  }
  return {
    levels,
    conditions,
    upgrades: getUpgradeOptions(levels, team?.reputation ?? 0, await matchesPlayed(db, teamId, "equipment options"), await activeSeasonNumber(db, "equipment options")),
    repairs: getRepairOptions(levels, conditions),
  };
}

/** Vylepší kategorii vybavení o úroveň. */
export async function upgradeEquipment(db: D1Database, teamId: string, category: string): Promise<{ ok: true; cost: number; newLevel: number } | ServiceError> {
  const { getUpgradeOptions, CATEGORIES, CATEGORY_LABELS } = await import("../equipment/equipment-generator");

  // Whitelist PŘED jakýmkoli SQL — název kategorie se níž interpoluje do stringu.
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) return { ok: false, status: 400, error: "Invalid category" };

  const equip = await db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>();
  if (!equip) return { ok: false, status: 404, error: "Equipment not found" };

  const team = await db.prepare("SELECT budget, reputation FROM teams WHERE id = ?").bind(teamId).first<{ budget: number; reputation: number }>();
  if (!team) return { ok: false, status: 404, error: "Team not found" };

  const matchCount = await matchesPlayed(db, teamId, "equipment upgrade");

  const levels: Record<string, number> = {};
  for (const cat of CATEGORIES) levels[cat] = (equip[cat] as number) ?? 0;

  // Aktuální sezóna — bez ní by season-gate pro Lv3 (season 2+) padal i v pozdějších sezónách.
  const upgrades = getUpgradeOptions(levels, team.reputation, matchCount, await activeSeasonNumber(db, "equip upgrade"));
  const upgrade = upgrades.find((u) => u.category === category);
  if (!upgrade) return { ok: false, status: 400, error: "No upgrade available" };
  if (upgrade.locked) return { ok: false, status: 400, error: upgrade.lockReason ?? "Zamčeno" };
  if (team.budget < upgrade.cost) return { ok: false, status: 400, error: "Nedostatek peněz" };

  await recordTransaction(db, teamId, "equipment_upgrade", -upgrade.cost,
    `Vylepšení vybavení: ${CATEGORY_LABELS[category] ?? category} → úroveň ${upgrade.nextLevel}`, new Date().toISOString());
  await db.prepare(
    `UPDATE equipment SET ${category} = ?, ${category}_condition = 100 WHERE team_id = ?`
  ).bind(upgrade.nextLevel, teamId).run();

  // Inzerát v bazaru se váže na konkrétní level — po upgradu už nesedí, takže padá.
  // Kupující by jinak zaplatil za starou úroveň a guard v nákupu by ho stejně odmítl.
  await db.prepare(
    "UPDATE equipment_listings SET status = 'withdrawn', resolved_at = ? WHERE team_id = ? AND category = ? AND status = 'active'"
  ).bind(new Date().toISOString(), teamId, category).run()
    .catch((e) => logger.warn({ module: "game" }, "withdraw equipment listing after upgrade", e));

  return { ok: true, cost: upgrade.cost, newLevel: upgrade.nextLevel };
}

/** Opraví kategorii vybavení na 100 %. */
export async function repairEquipment(db: D1Database, teamId: string, category: string): Promise<{ ok: true; cost: number } | ServiceError> {
  const { CATEGORIES, CATEGORY_LABELS, getRepairCost, REPAIR_THRESHOLD } = await import("../equipment/equipment-generator");

  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) return { ok: false, status: 400, error: "Invalid category" };

  const equip = await db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>();
  if (!equip) return { ok: false, status: 404, error: "Equipment not found" };

  const level = (equip[category] as number) ?? 0;
  if (level === 0) return { ok: false, status: 400, error: "Nothing to repair" };

  const condition = (equip[`${category}_condition`] as number) ?? 50;
  // Práh hlídal jen getRepairOptions, endpoint ne — přes API šlo „opravit" stav 99 %.
  if (condition >= REPAIR_THRESHOLD) {
    return { ok: false, status: 400, error: `${CATEGORY_LABELS[category]} je ve stavu ${condition} %, opravovat není co` };
  }

  // Cena podle hodnoty kusu a toho, jak je sešlý — ne plochých level × 500.
  const cost = getRepairCost(category, level, condition);
  const team = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
  if (!team || team.budget < cost) return { ok: false, status: 400, error: "Nedostatek peněz" };

  // Guard na stav: mezi zobrazenou cenou a zápisem mohla zasáhnout noční degradace.
  const repaired = await db.prepare(
    `UPDATE equipment SET ${category}_condition = 100 WHERE team_id = ? AND ${category}_condition = ?`
  ).bind(teamId, condition).run();
  if (repaired.meta.changes === 0) {
    return { ok: false, status: 409, error: "Stav vybavení se mezitím změnil, načti stránku znovu" };
  }

  await recordTransaction(db, teamId, "equipment_expense", -cost,
    `Oprava vybavení: ${CATEGORY_LABELS[category]} (ze stavu ${condition} %)`, new Date().toISOString());

  return { ok: true, cost };
}
