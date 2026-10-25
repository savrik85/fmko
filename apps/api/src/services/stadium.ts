/**
 * Stavby na stadionu a péče o trávník: jedna služba pro manažera (routy v routes/game.ts)
 * i AI trenéra. Ceny, zámky postupu a atomický zámek stavby jsou jen tady.
 */

import { mustSeason } from "../lib/season";
import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";
import type { UpgradeOption } from "../stadium/stadium-generator";
import type { ServiceError } from "./lineup";

/** Sloupce stadionu, ze kterých se počítají nabídky staveb. */
const FACILITY_COLUMNS = [
  "changing_rooms", "showers", "refreshments", "lighting", "stands", "stand_main", "stand_opposite", "stand_goal_west",
  "stand_goal_east", "stand_ext_capacity", "roof", "ultras_stand", "toilets", "parking", "fence", "entrance_gate",
  "security", "cage", "vip_box",
] as const;

function facilityLevels(stadium: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of FACILITY_COLUMNS) out[key] = (stadium[key] as number) ?? 0;
  return out;
}

async function matchesPlayed(db: D1Database, teamId: string, what: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'"
  ).bind(teamId, teamId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, `count matches for ${what}`, e); return null; });
  return row?.cnt ?? 0;
}

async function activeSeasonNumber(db: D1Database, what: string): Promise<number> {
  const row = await db.prepare(
    "SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, `fetch season for ${what}`, e); return null; });
  return mustSeason(row?.number);
}

/** Nabídka staveb stadionu (stejná jako v GET /teams/:teamId/stadium). Null = tým bez stadionu. */
export async function getStadiumUpgradeOptions(db: D1Database, teamId: string): Promise<UpgradeOption[] | null> {
  const stadium = await db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "stadium-service" }, `stadion ${teamId}`, e); return null; });
  if (!stadium) return null;
  const team = await db.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId).first<{ reputation: number }>()
    .catch((e) => { logger.warn({ module: "stadium-service" }, `reputace ${teamId}`, e); return null; });
  const { getUpgradeOptions } = await import("../stadium/stadium-generator");
  return getUpgradeOptions(
    facilityLevels(stadium),
    team?.reputation ?? 0,
    await matchesPlayed(db, teamId, "stadium options"),
    await activeSeasonNumber(db, "stadium options"),
    false,
  );
}

/**
 * Postaví další úroveň zařízení stadionu. `ignoreProgressLocks` = lokální přepínač
 * pro ruční testování (jen routa z localhostu), AI trenér ho nikdy nepoužívá.
 */
export async function upgradeStadiumFacility(
  db: D1Database,
  teamId: string,
  facility: string,
  opts: { ignoreProgressLocks?: boolean } = {},
): Promise<{ ok: true; cost: number; newLevel: number } | ServiceError> {
  const stadium = await db.prepare(
    "SELECT * FROM stadiums WHERE team_id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!stadium) return { ok: false, status: 404, error: "Stadium not found" };

  const team = await db.prepare(
    "SELECT budget, reputation FROM teams WHERE id = ?"
  ).bind(teamId).first<{ budget: number; reputation: number }>();
  if (!team) return { ok: false, status: 404, error: "Team not found" };

  const matchCount = await matchesPlayed(db, teamId, "stadium upgrade");
  const seasonNum = await activeSeasonNumber(db, "stadium upgrade");

  const { getUpgradeOptions } = await import("../stadium/stadium-generator");
  const upgrades = getUpgradeOptions(
    facilityLevels(stadium),
    team.reputation,
    matchCount,
    seasonNum,
    opts.ignoreProgressLocks ?? false,
  );
  const upgrade = upgrades.find((u) => u.facility === facility);
  if (!upgrade) return { ok: false, status: 400, error: "No upgrade available" };
  if (upgrade.locked) return { ok: false, status: 400, error: upgrade.lockReason ?? "Zamčeno" };
  if (team.budget < upgrade.cost) return { ok: false, status: 400, error: "Nedostatek peněz" };

  // Atomický zámek proti dvojímu odeslání: podmíněný UPDATE sedne, jen když sloupec
  // ještě drží currentLevel. `facility` je tu bezpečné interpolovat — `upgrade`
  // výš se najde jen pro klíč, který skutečně vyšel z FACILITY_LABELS (whitelist).
  // Dřív se nejdřív strhly peníze a teprve pak zapsala úroveň (dvě oddělené
  // operace): dvojklik/dvojitý submit tak stihl zaúčtovat cenu dvakrát a zapsat
  // level jen jednou. Teď zámek prohraje druhý běh BEZ účtování.
  const { claimStadiumUpgrade } = await import("../stadium/upgrade-claim");
  if (!(await claimStadiumUpgrade(db, teamId, facility, upgrade.currentLevel, upgrade.nextLevel))) {
    return { ok: false, status: 409, error: "Stavba už probíhá, načti stránku znovu" };
  }

  // Teprve po úspěšném zámku strhnout peníze. Do popisu jde český název zařízení,
  // ne klíč sloupce — v historii transakcí to čte hráč, ne databáze.
  const { FACILITY_LABELS } = await import("../stadium/stadium-generator");
  try {
    await recordTransaction(db, teamId, "stadium_upgrade", -upgrade.cost,
      `Vylepšení stadionu: ${FACILITY_LABELS[facility] ?? facility}`, new Date().toISOString());
  } catch (e) {
    // Level je už zapsaný (zámek prošel) — klub by jinak dostal upgrade zadarmo
    // a nikdo by se to nedozvěděl. Nesmí to zmizet v prázdném catchi.
    logger.error({ module: "game", teamId }, `stadium upgrade ${facility}: level zapsán, ale strhnutí ${upgrade.cost} Kč selhalo`, e);
  }

  // Kotel si všimne, když dostane lepší sektor. Ostatní vybavení ho nezajímá.
  if (facility === "ultras_stand") {
    const { recordClubEvent } = await import("../fans/club-events");
    await recordClubEvent(db, {
      teamId, kind: "vylepseni_kotle", severity: Math.min(1, 0.5 + upgrade.nextLevel * 0.2),
      payload: { co: upgrade.effect },
      referenceId: `fan-ultras-${teamId}-l${upgrade.nextLevel}`,
    });
  }

  // Kapacita se do sloupce capacity NEZAPISUJE — sloupec drží základ stadionu a bonus
  // tribun se přičítá při čtení (match-runner, cup, GET /stadium) z úrovně stands.

  return { ok: true, cost: upgrade.cost, newLevel: upgrade.nextLevel };
}

/** Ceny údržby trávníku. Musí sedět s nabídkou v GET /stadium. */
export const PITCH_MAINTENANCE: Record<"basic" | "thorough" | "renovation", { cost: number; improvement: number; label: string }> = {
  basic: { cost: 1600, improvement: 10, label: "Základní údržba (+10%)" },
  thorough: { cost: 3000, improvement: 25, label: "Důkladná údržba (+25%)" },
  renovation: { cost: 5000, improvement: 50, label: "Renovace trávníku (+50%)" },
};

export type PitchMaintenanceLevel = keyof typeof PITCH_MAINTENANCE;

/** Jednorázová údržba trávníku. */
export async function maintainPitch(db: D1Database, teamId: string, level: string): Promise<{ ok: true; cost: number; improvement: number } | ServiceError> {
  const action = PITCH_MAINTENANCE[level as PitchMaintenanceLevel];
  if (!action) return { ok: false, status: 400, error: "Invalid level" };

  const team = await db.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>();
  if (!team || team.budget < action.cost) return { ok: false, status: 400, error: "Nedostatek peněz" };

  await recordTransaction(db, teamId, "pitch_repair", -action.cost,
    `Údržba hřiště: +${action.improvement}% kondice`, new Date().toISOString());
  await db.prepare(
    "UPDATE stadiums SET pitch_condition = MIN(100, pitch_condition + ?) WHERE team_id = ?"
  ).bind(action.improvement, teamId).run();

  return { ok: true, cost: action.cost, improvement: action.improvement };
}

/** Jak se má péče o trávník (vyhřívání, zavlažování) zapínat. */
export async function setPitchCareMode(db: D1Database, teamId: string, mode: string): Promise<{ ok: true; mode: string; label: string } | ServiceError> {
  const { PITCH_CARE_MODES, PITCH_CARE_MODE_LABEL } = await import("../stadium/pitch-care");
  if (!PITCH_CARE_MODES.includes(mode as never)) {
    return { ok: false, status: 400, error: "Neznámý režim péče o hřiště." };
  }

  await db.prepare("UPDATE stadiums SET pitch_care_mode = ? WHERE team_id = ?")
    .bind(mode, teamId).run();

  return { ok: true, mode, label: PITCH_CARE_MODE_LABEL[mode as never] };
}
