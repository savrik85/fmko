/**
 * Zpráva trenéra hráči: ptá se na incident? (spec 7a)
 *
 * Běží v POST zprávy DŘÍV, než se začne generovat odpověď: určí téma, uloží ho do
 * vlákna na zbytek herního dne a vyhodnotí výslech. Model pak dostane hotový pokyn.
 */

import { logger } from "../lib/logger";
import { nactiZtraty } from "./popis";
import { najdiIncidentVTextu, temaZeStavu } from "./tema";
import { vyslechni } from "./vyslech";
import type { VysledekVyslechu } from "./znalosti";

const M = "incidents-zprava";

/**
 * Uloží téma do `conversations.ai_thread_state`. Běží-li vlákno (`ai_thread_active = 1`),
 * ostatní klíče nechá být. Neběží-li, stav nahradí čistým, ať po „Zeptat se" nezůstane starý
 * `awaiting: "done"` nebo `resolution` z dřívějška - jinak by se ukázal banner „Konverzace
 * ukončena" i pro nové téma.
 */
export async function nastavTema(db: D1Database, convId: string, incidentId: string, den: string): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE conversations SET ai_thread_state = CASE WHEN ai_thread_active = 1 THEN json_set(
        CASE WHEN json_valid(ai_thread_state) THEN ai_thread_state ELSE '{}' END,
        '$.incidentId', ?, '$.incidentDen', ?)
      ELSE json_object('incidentId', ?, 'incidentDen', ?) END
      WHERE id = ?`,
  ).bind(incidentId, den, incidentId, den, convId).run()
    .catch((e) => { logger.warn({ module: M }, `téma konverzace ${convId}`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}

export async function zpracujZpravuTrenera(
  db: D1Database, opts: { teamId: string; convId: string; playerId: string; text: string },
): Promise<{ incidentId: string; vyslech: VysledekVyslechu | null } | null> {
  const zaklad = await db.prepare(
    `SELECT c.ai_thread_state, t.game_date,
            (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1) AS sezona
       FROM conversations c JOIN teams t ON t.id = c.team_id
      WHERE c.id = ? AND c.team_id = ?`,
  ).bind(opts.convId, opts.teamId).first<{ ai_thread_state: string | null; game_date: string | null; sezona: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `konverzace ${opts.convId}`, e); return null; });
  if (!zaklad?.game_date || zaklad.sezona == null) return null;
  const den = zaklad.game_date.slice(0, 10);

  let incidentId = temaZeStavu(zaklad.ai_thread_state, den)?.incidentId ?? null;
  if (!incidentId) {
    const kandidati = await db.prepare(
      `SELECT id, kind, loss FROM club_incidents
        WHERE team_id = ? AND season_number = ? AND status IN ('otevreny', 'policie') AND culprit_revealed = 0
          AND category IN ('kradez', 'poskozeni')
        ORDER BY game_date DESC LIMIT 10`,
    ).bind(opts.teamId, zaklad.sezona).all<{ id: string; kind: string; loss: string }>()
      .catch((e) => { logger.warn({ module: M }, `incidenty k otázce ${opts.teamId}`, e); return null; });
    incidentId = najdiIncidentVTextu(
      opts.text,
      (kandidati?.results ?? []).map((r) => ({ id: r.id, kind: r.kind, ztraty: nactiZtraty(r.loss) })),
    );
    if (!incidentId) return null;
    // Navazující otázka („a kde?") klíčová slova mít nemusí, téma proto platí do konce dne.
    await nastavTema(db, opts.convId, incidentId, den);
  }

  const vyslech = await vyslechni(db, { teamId: opts.teamId, incidentId, playerId: opts.playerId, gameDate: zaklad.game_date });
  return { incidentId, vyslech: vyslech?.vysledek ?? null };
}
