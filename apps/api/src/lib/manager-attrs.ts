import { MANAGER_FANS } from "@okresni-masina/shared";
import { logger } from "./logger";

/**
 * Atributy a reputace TRENÉRA (`managers.*`) — jediné místo, kudy se mění.
 *
 * Pozor na záměnu: `teams.reputation` je reputace KLUBU a řeší ji `lib/reputation.ts`.
 * Tenhle modul je o trenérovi.
 *
 * Dřív to měnilo pět nezávislých míst, každé vlastním UPDATE, s trojími různými
 * mezemi a bez auditu. Sezónní recap navíc deltu reputace jen přepočítával
 * z pořadí, takže ukazoval i změnu, která se kvůli stropu nestala.
 */

export type ManagerAttr =
  | "reputation"
  | "motivation"
  | "coaching"
  | "tactics"
  | "discipline"
  | "youth_development";

export type ManagerAttrSource =
  | "match_win"
  | "match_draw"
  | "match_loss"
  | "season_position"
  | "cup"
  | "party"
  | "season_dev"
  // Funkce ve vedení soutěže — odsloužený mandát, odvolání, demise.
  | "competition_office"
  | "admin";

/** České názvy do popisků a UI. */
export const MANAGER_ATTR_LABELS: Record<ManagerAttr, string> = {
  reputation: "Reputace",
  motivation: "Motivace",
  coaching: "Koučink",
  tactics: "Taktika",
  discipline: "Disciplína",
  youth_development: "Práce s mládeží",
};

/** Meze konkrétního atributu. Reputace má vlastní, ostatní sdílené. */
export function attrBounds(attr: ManagerAttr): { min: number; max: number } {
  return attr === "reputation"
    ? { min: MANAGER_FANS.REP_MIN, max: MANAGER_FANS.REP_MAX }
    : { min: MANAGER_FANS.ATTR_MIN, max: MANAGER_FANS.ATTR_MAX };
}

export interface ManagerAttrChange {
  applied: number;
  oldValue: number;
  newValue: number;
  skipped: "duplicate" | "capped" | "no_manager" | "error" | null;
}

/**
 * Změní atribut trenéra a zapíše důvod do auditu.
 *
 * Zápis logu a UPDATE jdou v jednom `db.batch()` — duplicitní `referenceId`
 * shodí obojí na unikátním indexu, takže přesimulovaný zápas nepřipíše nic
 * podruhé. UPDATE je self-referenční, aby souběžná změna nepřepsala cizí zápis.
 */
export async function applyManagerAttrDelta(
  db: D1Database,
  teamId: string,
  attr: ManagerAttr,
  rawDelta: number,
  source: ManagerAttrSource,
  description: string,
  opts?: { referenceId?: string; gameDate?: string },
): Promise<ManagerAttrChange> {
  if (rawDelta === 0) {
    return { applied: 0, oldValue: 0, newValue: 0, skipped: null };
  }

  const referenceId = opts?.referenceId ?? null;
  const gameDate = opts?.gameDate ?? null;
  const { min, max } = attrBounds(attr);

  if (referenceId) {
    const exists = await db.prepare("SELECT 1 FROM manager_attr_log WHERE reference_id = ?")
      .bind(referenceId).first()
      .catch((e) => {
        logger.warn({ module: "manager-attrs" }, "check manager attr reference", e);
        return null;
      });
    if (exists) {
      return { applied: 0, oldValue: 0, newValue: 0, skipped: "duplicate" };
    }
  }

  const row = await db.prepare(`SELECT ${attr} AS value FROM managers WHERE team_id = ? LIMIT 1`)
    .bind(teamId).first<{ value: number }>()
    .catch((e) => {
      logger.warn({ module: "manager-attrs" }, `load ${attr} for ${teamId}`, e);
      return null;
    });
  if (!row) {
    return { applied: 0, oldValue: 0, newValue: 0, skipped: "no_manager" };
  }

  const oldValue = row.value;
  const newValue = Math.max(min, Math.min(max, oldValue + rawDelta));
  const applied = newValue - oldValue;

  // Změna sežraná stropem se loguje taky — jinak by hráč nechápal, proč se nic nestalo.
  if (applied === 0) {
    await db.prepare(
      `INSERT INTO manager_attr_log (team_id, attr, old_value, new_value, delta, raw_delta, source, description, reference_id, game_date)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    ).bind(teamId, attr, oldValue, oldValue, rawDelta, source, description, referenceId, gameDate)
      .run()
      .catch((e) => logger.warn({ module: "manager-attrs" }, "log capped manager attr", e));
    return { applied: 0, oldValue, newValue: oldValue, skipped: "capped" };
  }

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO manager_attr_log (team_id, attr, old_value, new_value, delta, raw_delta, source, description, reference_id, game_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(teamId, attr, oldValue, newValue, applied, rawDelta, source, description, referenceId, gameDate),
      db.prepare(
        `UPDATE managers SET ${attr} = MAX(?, MIN(?, ${attr} + ?)) WHERE team_id = ?`,
      ).bind(min, max, applied, teamId),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isDuplicate = /UNIQUE constraint failed: manager_attr_log\.reference_id/i.test(message);
    if (!isDuplicate) {
      logger.error({ module: "manager-attrs" }, `apply ${attr} ${source} for ${teamId}`, e);
      return { applied: 0, oldValue, newValue: oldValue, skipped: "error" };
    }
    return { applied: 0, oldValue, newValue: oldValue, skipped: "duplicate" };
  }

  return { applied, oldValue, newValue, skipped: null };
}
