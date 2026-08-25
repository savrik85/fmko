/**
 * Nejbližší domácí zápas týmu.
 *
 * Vzniklo poté, co bufet radil naskladnit na zápas ze **staré sezóny**: dotaz
 * postavený jen nad `season_calendar` bez filtru na sezónu vytáhl zbytek ze
 * sezóny 2, zatímco tým hrál sezónu 4. Navíc míjel pohár, který má vlastní
 * tabulky (`cup_matches` / `cup_teams`).
 *
 * `GET /teams/:teamId/schedule` (`routes/matches.ts`) si staví celý rozpis
 * po svém a oba zdroje slučuje tamtéž. Když se bude měnit filtrování sezóny
 * nebo poháru, musí se to srovnat na obou místech — jinak bude hra na dvou
 * stránkách ukazovat jiný „další zápas".
 */

import { logger } from "../lib/logger";

export interface HomeMatchRef {
  id: string;
  scheduledAt: string;
  opponent: string;
  isCup: boolean;
}

function time(m: HomeMatchRef | null): number {
  if (!m) return Number.POSITIVE_INFINITY;
  const t = new Date(m.scheduledAt).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Dřívější ze dvou zápasů. Při shodě vyhrává liga — tam se hraje o body.
 * Zápas s nečitelným termínem prohrává s čímkoli platným; když jsou nečitelné
 * oba, vrací null, aby se dál nepracovalo s nesmyslem.
 */
export function pickEarlier(league: HomeMatchRef | null, cup: HomeMatchRef | null): HomeMatchRef | null {
  const tl = time(league);
  const tc = time(cup);
  if (tl === Number.POSITIVE_INFINITY && tc === Number.POSITIVE_INFINITY) return null;
  return tc < tl ? cup : league;
}

/** Nejbližší neodehraný domácí zápas — liga v aktuální sezóně, nebo pohár. */
export async function findNextHomeMatch(db: D1Database, teamId: string): Promise<HomeMatchRef | null> {
  const leagueRow = await db.prepare(
    `SELECT m.id, sc.scheduled_at, t.name AS opponent
       FROM matches m
       JOIN season_calendar sc ON m.calendar_id = sc.id
       JOIN teams t ON m.away_team_id = t.id
      WHERE m.home_team_id = ? AND m.status != 'simulated'
        AND sc.season_number = (
          SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = m.league_id
        )
      ORDER BY sc.scheduled_at ASC LIMIT 1`,
  ).bind(teamId).first<{ id: string; scheduled_at: string; opponent: string }>()
    .catch((e) => { logger.warn({ module: "next-home-match" }, "ligovy zapas", e); return null; });

  const cupRow = await db.prepare(
    `SELECT cm.id, cm.scheduled_at, at.name AS opponent
       FROM cup_matches cm
       JOIN cup_competitions cc ON cc.id = cm.cup_id
         AND cc.season_number = (SELECT MAX(season_number) FROM cup_competitions)
       JOIN cup_teams myct ON myct.cup_id = cm.cup_id AND myct.team_id = ?
         AND myct.id = cm.home_cup_team_id
       JOIN cup_teams at ON at.id = cm.away_cup_team_id
      WHERE cm.status != 'simulated' AND cm.scheduled_at IS NOT NULL
      ORDER BY cm.scheduled_at ASC LIMIT 1`,
  ).bind(teamId).first<{ id: string; scheduled_at: string; opponent: string }>()
    .catch((e) => { logger.warn({ module: "next-home-match" }, "poharovy zapas", e); return null; });

  return pickEarlier(
    leagueRow ? { id: leagueRow.id, scheduledAt: leagueRow.scheduled_at, opponent: leagueRow.opponent, isCup: false } : null,
    cupRow ? { id: cupRow.id, scheduledAt: cupRow.scheduled_at, opponent: cupRow.opponent, isCup: true } : null,
  );
}
