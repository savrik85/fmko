/**
 * Kdy tým hraje (liga, přátelák, pohár): v den zápasu se netrénuje. Jediné místo, odkud to bere
 * denní tick (trénink odpadá) i slib docházky (messaging/attendance-pledge.ts). Slib se dřív díval
 * jen na ligu: Procházka (přetest 3) slíbil sobotní trénink v den poháru, trénink se nekonal
 * a slib vypršel bez dopadu.
 *
 * Liga a přátelák žijí v `matches` (přátelák má den v `created_at`), pohár v `cup_matches` přes
 * `cup_teams`. Dvě části se čtou zvlášť: když jedna spadne, druhá platí dál.
 */

import { logger } from "../lib/logger";

const M = "match-days";

/** Herní dny YYYY-MM-DD od `from` do `to` (včetně), kdy týmy hrají. Bez `teamId` všechny týmy. */
export async function loadTeamMatchDays(
  db: D1Database, o: { from: string; to: string; teamId?: string },
): Promise<Array<{ teamId: string; day: string }>> {
  const from = o.from.slice(0, 10);
  const to = o.to.slice(0, 10);
  const team = o.teamId ?? null;
  const [league, cup] = await Promise.all([
    db.prepare(
      `SELECT m.home_team_id AS team_id, substr(COALESCE(sc.scheduled_at, m.created_at), 1, 10) AS day
         FROM matches m LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE substr(COALESCE(sc.scheduled_at, m.created_at), 1, 10) BETWEEN ?1 AND ?2 AND (?3 IS NULL OR m.home_team_id = ?3)
       UNION
       SELECT m.away_team_id, substr(COALESCE(sc.scheduled_at, m.created_at), 1, 10)
         FROM matches m LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE substr(COALESCE(sc.scheduled_at, m.created_at), 1, 10) BETWEEN ?1 AND ?2 AND (?3 IS NULL OR m.away_team_id = ?3)`,
    ).bind(from, to, team).all<{ team_id: string | null; day: string }>()
      .catch((e) => { logger.warn({ module: M }, "ligové zápasy a přáteláky", e); return { results: [] as Array<{ team_id: string | null; day: string }> }; }),
    db.prepare(
      `SELECT DISTINCT ct.team_id, substr(cm.scheduled_at, 1, 10) AS day FROM cup_matches cm
         JOIN cup_teams ct ON ct.id IN (cm.home_cup_team_id, cm.away_cup_team_id)
        WHERE ct.team_id IS NOT NULL AND substr(cm.scheduled_at, 1, 10) BETWEEN ?1 AND ?2 AND (?3 IS NULL OR ct.team_id = ?3)`,
    ).bind(from, to, team).all<{ team_id: string | null; day: string }>()
      .catch((e) => { logger.warn({ module: M }, "pohárové zápasy", e); return { results: [] as Array<{ team_id: string | null; day: string }> }; }),
  ]);
  return [...league.results, ...cup.results].flatMap((r) => (r.team_id ? [{ teamId: r.team_id, day: r.day }] : []));
}
