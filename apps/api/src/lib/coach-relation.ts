import { logger } from "./logger";

/**
 * Vztah hráče k trenérovi (`players.coach_relationship`, 0–100) — jediné místo, kudy se mění.
 *
 * Každá změna nechá řádek v `coach_relation_log` s důvodem. Z něj Kabina na profilu
 * trenéra ukazuje, proč se kdo zlobí. Dřív to měnilo deset míst vlastním UPDATE
 * a důvod se nikam nezapisoval.
 */

export type CoachRelationSource =
  | "sms_thread"
  | "sms_ignored"
  | "transfer_rejected"
  | "interview"
  | "pub"
  | "incident"
  | "left_out"
  | "arrival"
  | "admin";

export interface CoachRelationChange {
  playerId: string;
  delta: number;
  source: CoachRelationSource;
  /** Důvod pro hráče, česky, bez čísel („Nepustil jsi ho do Vimperka"). */
  description: string;
  gameDate?: string | null;
}

/** Hodnota po změně, oříznutá na 0–100. Chybějící vztah je neutrálních 50. */
const NEW_VALUE = "MAX(0, MIN(100, COALESCE(coach_relationship, 50) + ?))";

/**
 * Dva příkazy do cizího `db.batch()`: zápis do logu a změna vztahu.
 *
 * Log jde první a čte hodnotu ještě před změnou — batch běží v jedné transakci,
 * takže oba příkazy vidí stejný výchozí stav. Hráč bez klubu (volný) se nezaloguje,
 * ale vztah se mu změní stejně jako dřív.
 *
 * `referenceId` sem posílá jen `applyCoachRelationDelta`: porušení unikátního indexu
 * by v cizím batchi shodilo i všechno ostatní, co volající zapisuje.
 */
export function coachRelationStmts(
  db: D1Database,
  change: CoachRelationChange,
  referenceId: string | null = null,
): D1PreparedStatement[] {
  const delta = Math.round(change.delta);
  if (delta === 0) return [];
  return [
    db.prepare(
      `INSERT INTO coach_relation_log (player_id, team_id, old_value, new_value, delta, raw_delta, source, description, reference_id, game_date)
       SELECT id, team_id, COALESCE(coach_relationship, 50), ${NEW_VALUE},
              ${NEW_VALUE} - COALESCE(coach_relationship, 50), ?, ?, ?, ?, ?
         FROM players WHERE id = ? AND team_id IS NOT NULL`,
    ).bind(delta, delta, delta, change.source, change.description.slice(0, 200), referenceId, change.gameDate ?? null, change.playerId),
    db.prepare(`UPDATE players SET coach_relationship = ${NEW_VALUE} WHERE id = ?`)
      .bind(delta, change.playerId),
  ];
}

export interface CoachRelationResult {
  applied: boolean;
  skipped: "duplicate" | "zero" | "error" | null;
}

/**
 * Samostatná změna vztahu. S `referenceId` se tatáž událost nezapíše dvakrát
 * (přesimulovaný zápas, opakovaný požadavek).
 */
export async function applyCoachRelationDelta(
  db: D1Database,
  change: CoachRelationChange & { referenceId?: string | null },
): Promise<CoachRelationResult> {
  const referenceId = change.referenceId ?? null;
  const stmts = coachRelationStmts(db, change, referenceId);
  if (stmts.length === 0) return { applied: false, skipped: "zero" };

  if (referenceId) {
    const exists = await db.prepare("SELECT 1 FROM coach_relation_log WHERE reference_id = ?")
      .bind(referenceId).first()
      .catch((e) => {
        logger.warn({ module: "coach-relation" }, "check coach relation reference", e);
        return null;
      });
    // Souběžný zápis mezi kontrolou a batchem zachytí unikátní index a shodí celý batch.
    if (exists) return { applied: false, skipped: "duplicate" };
  }

  try {
    await db.batch(stmts);
    return { applied: true, skipped: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/UNIQUE constraint failed: coach_relation_log\.reference_id/i.test(message)) {
      return { applied: false, skipped: "duplicate" };
    }
    logger.error({ module: "coach-relation" }, `apply coach relation ${change.source} for ${change.playerId}`, e);
    return { applied: false, skipped: "error" };
  }
}
