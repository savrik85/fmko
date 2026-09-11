/**
 * Sběrnice dění kolem klubu.
 *
 * Projekt nemá centrální log událostí — každý efekt se hákuje do svého call site.
 * Fanoušci ale potřebují vědět o přestupech, cenách, sponzorech, poháru i sérii
 * proher naráz. Místo dvaceti zásahů do cizích modulů sem každý zapíše řádek
 * a denní tick ho jednou promítne do nálady part.
 *
 * Zapisovač je schválně hloupý: nezná party, nepočítá dopady. Jen zaznamená,
 * že se něco stalo. Tím zůstane volání z cizích modulů jednořádkové a levné.
 */

import { logger } from "../lib/logger";
import type { ClubEventKind } from "../engine/fan-reactions";

const M = "club-events";

export interface ClubEventRow {
  id: string;
  team_id: string;
  kind: string;
  payload: string | null;
  severity: number;
  game_date: string;
}

/**
 * Zaznamená, že se klubu něco stalo.
 *
 * `referenceId` je stabilní klíč: tentýž přestup ani tentáž změna ceny se nesmí
 * zapsat dvakrát, i kdyby call site proběhl znovu. Bez něj se událost zapíše
 * vždycky — to je v pořádku u věcí, které se opravdu staly vícekrát.
 *
 * Nikdy nehází. Fanoušci jsou koření, ne důvod, proč by měl selhat přestup.
 */
export async function recordClubEvent(
  db: D1Database,
  opts: {
    teamId: string;
    kind: ClubEventKind;
    /** 0–1, jak velká ta věc je. */
    severity?: number;
    /** Detaily do textu zprávy — `{co}` v šablonách. */
    payload?: Record<string, unknown>;
    gameDate?: string;
    referenceId?: string | null;
  },
): Promise<void> {
  try {
    const gameDate = opts.gameDate ?? await teamGameDate(db, opts.teamId);
    await db
      .prepare(
        `INSERT OR IGNORE INTO club_events
          (id, reference_id, team_id, kind, payload, severity, game_date)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        opts.referenceId ?? null,
        opts.teamId,
        opts.kind,
        opts.payload ? JSON.stringify(opts.payload) : null,
        Math.max(0, Math.min(1, opts.severity ?? 0.5)),
        gameDate,
      )
      .run();
  } catch (e) {
    logger.warn({ module: M }, `zápis události ${opts.kind} pro ${opts.teamId}`, e);
  }
}

async function teamGameDate(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum týmu", e); return null; });
  return row?.game_date ?? new Date().toISOString().slice(0, 10);
}

/** Nezpracované události klubu, nejstarší první. */
export async function loadUnprocessed(
  db: D1Database,
  teamId: string,
  limit = 20,
): Promise<ClubEventRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, team_id, kind, payload, severity, game_date FROM club_events
       WHERE team_id = ? AND processed_at IS NULL ORDER BY created_at ASC LIMIT ?`,
    )
    .bind(teamId, limit)
    .all<ClubEventRow>()
    .catch((e) => { logger.warn({ module: M }, `načtení událostí ${teamId}`, e); return null; });
  return rows?.results ?? [];
}

/** Označí události za vstřebané. */
export async function markProcessed(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const q = ids.map(() => "?").join(",");
  await db
    .prepare(
      `UPDATE club_events SET processed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id IN (${q})`,
    )
    .bind(...ids)
    .run()
    .catch((e) => { logger.warn({ module: M }, "označení zpracovaných událostí", e); });
}
