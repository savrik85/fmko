import { newcomerCoachRelationship } from "@okresni-masina/shared";
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

/**
 * Výchozí vztah hráče, který právě přišel do klubu. Dřív si hráč nesl číslo z minulého
 * klubu, takže nový trenér zdědil cizí zášť i cizí oblibu. Teď začíná podle jména
 * trenéra: licence a reputace (viz `newcomerCoachRelationship`).
 *
 * Hráč, který se do klubu vrací (konec hostování), dostane zpět poslední vztah, který
 * tu k trenérovi měl — sloupec mezitím držel vztah k trenérovi hostitelského klubu.
 * Nikdy nevyhazuje: je to doplněk přestupu, ne blokující krok.
 */
export async function initNewcomerCoachRelation(db: D1Database, teamId: string, playerId: string): Promise<void> {
  try {
    const known = await db.prepare(
      "SELECT new_value FROM coach_relation_log WHERE player_id = ? AND team_id = ? ORDER BY id DESC LIMIT 1",
    ).bind(playerId, teamId).first<{ new_value: number }>();
    const current = await db.prepare("SELECT coach_relationship FROM players WHERE id = ?")
      .bind(playerId).first<{ coach_relationship: number | null }>();
    if (!current) return;

    if (known) {
      const back = known.new_value - (current.coach_relationship ?? 50);
      if (back !== 0) {
        await db.batch(coachRelationStmts(db, { playerId, delta: back, source: "arrival", description: "Návrat do klubu" }));
      }
      return;
    }

    const coach = await db.prepare(
      `SELECT m.reputation, m.licence_level
         FROM teams t
         JOIN managers m ON m.team_id = COALESCE(t.parent_team_id, t.id)
        WHERE t.id = ?`,
    ).bind(teamId).first<{ reputation: number | null; licence_level: number | null }>();

    const target = newcomerCoachRelationship({ reputation: coach?.reputation ?? 30, licence: coach?.licence_level ?? 0 });
    const delta = target - (current.coach_relationship ?? 50);
    if (delta === 0) {
      // I bez změny čísla chceme řádek v logu: podle něj se pozná návrat z hostování.
      await db.prepare(
        `INSERT INTO coach_relation_log (player_id, team_id, old_value, new_value, delta, raw_delta, source, description)
         VALUES (?, ?, ?, ?, 0, 0, 'arrival', 'Příchod do klubu')`,
      ).bind(playerId, teamId, target, target).run();
      return;
    }
    await db.batch(coachRelationStmts(db, { playerId, delta, source: "arrival", description: "Příchod do klubu" }));
  } catch (e) {
    logger.warn({ module: "coach-relation" }, `newcomer coach relation ${playerId} → ${teamId}`, e);
  }
}
