/**
 * Hodinová pojistka telefonu: odpovědi, které nikdo nedokončil.
 *
 * Když trenér napíše hráči, vlákno se přepne na „čeká na hráče“ a telefon ukazuje „píše…“,
 * dokud odpověď nedoběhne. Odpověď běží ve `waitUntil`, který worker po ~30 s ukončí bez
 * chyby (pomalý model, restart). Stav „čeká na hráče“ pak nikdo nevrátil a hráč „psal“ celý
 * týden (David Kotrc, 11/2026). Tady se takové vlákno vrátí trenérovi. Čerstvě zaseklé
 * dostane i opožděnou odpověď (`retry_reply`), u starších by odpověď na dávno zapomenutou
 * zprávu jen mátla.
 *
 * Stejně se uvolní psaní majitele firmy (`sponsors/owner-typing.ts`), které skončilo uprostřed.
 */
import { logger } from "../lib/logger";
import { scheduleRetryReply } from "./ai-player-spawn";
import { releaseStuckOwnerTyping } from "../sponsors/owner-typing";

const M = "stuck-replies";

/** Odpověď trvá nejvýš desítky sekund (psaní do 14 s + model do 25 s), 15 minut je jistě zaseknuté. */
export const STUCK_AFTER_MIN = 15;
/** Jak dlouho po zaseknutí má ještě smysl, aby hráč odepsal opožděně. */
const LATE_REPLY_MAX_HOURS = 12;

interface StuckRow {
  id: string;
  team_id: string;
  player_id: string | null;
  /** 1 = zaseklé nedávno, hráč ještě odpoví. */
  fresh: number;
}

export async function releaseStuckReplies(db: D1Database): Promise<{ players: number; retries: number; owners: number }> {
  // `awaiting_since` mají jen vlákna přepnutá po zavedení pojistky, u starších rozhoduje
  // poslední zpráva (zpráva trenéra, na kterou hráč neodpověděl).
  const since = "COALESCE(json_extract(ai_thread_state, '$.awaiting_since'), last_message_at)";
  const rows = await db.prepare(
    `SELECT id, team_id, json_extract(ai_thread_state, '$.player_id') AS player_id,
            julianday(${since}) > julianday('now', ?) AS fresh
       FROM conversations
      WHERE ai_thread_active = 1
        AND json_extract(ai_thread_state, '$.awaiting') = 'player'
        AND json_extract(ai_thread_state, '$.kind') IS NULL
        AND julianday(${since}) < julianday('now', ?)`,
  ).bind(`-${LATE_REPLY_MAX_HOURS} hours`, `-${STUCK_AFTER_MIN} minutes`).all<StuckRow>();

  let players = 0;
  let retries = 0;
  for (const row of rows.results) {
    try {
      const res = await db.prepare(
        `UPDATE conversations SET ai_thread_state = json_set(ai_thread_state, '$.awaiting', 'coach')
          WHERE id = ? AND ai_thread_active = 1 AND json_extract(ai_thread_state, '$.awaiting') = 'player'`,
      ).bind(row.id).run();
      if ((res.meta?.changes ?? 0) === 0) continue;
      players++;
      if (row.fresh === 1 && row.player_id) {
        await scheduleRetryReply(db, { teamId: row.team_id, playerId: row.player_id, convId: row.id });
        retries++;
      }
    } catch (e) {
      logger.warn({ module: M }, `uvolnění zaseklé odpovědi ${row.id}`, e);
    }
  }

  const owners = await releaseStuckOwnerTyping(db, STUCK_AFTER_MIN * 60)
    .catch((e) => { logger.warn({ module: M }, "uvolnění zaseklého psaní majitele", e); return 0; });

  if (players > 0 || owners > 0) {
    logger.info({ module: M }, `zaseklé odpovědi: ${players} vláken vráceno trenérovi (${retries} odpoví později), ${owners} psaní majitele`);
  }
  return { players, retries, owners };
}
