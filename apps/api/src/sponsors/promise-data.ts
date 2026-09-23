/**
 * Sliby sponzorům: data pro vyhodnocení, jen čtení. Co klub za sezónu dokázal (tabulka,
 * pohár, návštěva, mladí v sestavě, reputace, výtržnosti) a v jakém stavu je teď
 * (licence trenéra, stadion, logo na rukávu).
 */
import { logger } from "../lib/logger";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import {
  averagePerMatch, cupRoundReached, cupStillRunning, positionFromStandings, rankTable,
  type CupEntryRow, type DeadlineState, type MatchResultRow, type SeasonStats,
} from "./promise-eval";

const CUP_SQL = `
  SELECT cc.status, cc.total_rounds, cc.current_round, ct.eliminated_round, ct.id AS cup_team_id,
         CASE WHEN cc.winner_team_id IS NOT NULL AND cc.winner_team_id = ct.id THEN 1 ELSE 0 END AS is_winner
  FROM cup_competitions cc
  LEFT JOIN cup_teams ct ON ct.cup_id = cc.id AND ct.team_id = ?2
  WHERE cc.season_number = ?1
  ORDER BY cc.rowid DESC
  LIMIT 1`;

const ATTENDANCE_SQL = `
  SELECT AVG(m.attendance) AS avg
  FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
  WHERE m.home_team_id = ?1 AND sc.season_number = ?2 AND m.status = 'simulated' AND m.attendance IS NOT NULL`;

// ?3 = o kolik let hráči od sezóny zestárli (rollover běží po bumpAges ve fázi departures).
const YOUTH_SQL = `
  SELECT COUNT(DISTINCT m.id) AS matches,
         SUM(CASE WHEN p.age - ?3 <= 21 THEN 1 ELSE 0 END) AS young
  FROM matches m
  JOIN season_calendar sc ON sc.id = m.calendar_id
  JOIN match_player_stats mps ON mps.match_id = m.id AND mps.team_id = ?1 AND mps.started = 1
  LEFT JOIN players p ON p.id = mps.player_id
  WHERE sc.season_number = ?2 AND m.status = 'simulated' AND (m.home_team_id = ?1 OR m.away_team_id = ?1)`;

// fan_incidents.match_id nese id ligového zápasu (matches) i pohárového (cup_matches).
const RIOTS_SQL = `
  SELECT COUNT(*) AS n FROM fan_incidents fi
  WHERE fi.team_id = ?1 AND (
    fi.match_id IN (SELECT m.id FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
                    WHERE sc.season_number = ?2 AND (m.home_team_id = ?1 OR m.away_team_id = ?1))
    OR fi.match_id IN (SELECT cm.id FROM cup_matches cm JOIN cup_competitions cc ON cc.id = cm.cup_id
                       WHERE cc.season_number = ?2))`;

/**
 * Konečné místo v lize. Přednost má archiv (`league_history`, fáze archive běží před
 * rolloverem); `calculateStandings` tu nejde, v rolloveru už existuje kalendář nové sezóny.
 * Bez archivu (ruční vyhodnocení během sezóny) se tabulka spočítá ze zápasů té sezóny.
 */
async function loadFinalPosition(db: D1Database, teamId: string, season: number): Promise<{ position: number; teams: number } | null> {
  const hist = await db.prepare(
    `SELECT lh.final_standings FROM league_history lh
     WHERE lh.season_number = ?1 AND lh.league_id = (SELECT league_id FROM teams WHERE id = ?2)
     LIMIT 1`,
  ).bind(season, teamId).first<{ final_standings: string }>();
  if (hist) {
    const p = positionFromStandings(hist.final_standings, teamId);
    if (p) return p;
  }
  const [teams, matches] = await Promise.all([
    db.prepare("SELECT id FROM teams WHERE league_id = (SELECT league_id FROM teams WHERE id = ?)")
      .bind(teamId).all<{ id: string }>(),
    db.prepare(
      `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       WHERE m.league_id = (SELECT league_id FROM teams WHERE id = ?1) AND sc.season_number = ?2 AND m.status = 'simulated'`,
    ).bind(teamId, season).all<MatchResultRow>(),
  ]);
  if (matches.results.length === 0) return null;
  const ranks = rankTable(teams.results.map((t) => t.id), matches.results);
  const position = ranks.get(teamId);
  return position === undefined ? null : { position, teams: ranks.size };
}

/** Sezóna klubu pro sezónní sliby. `agedSinceSeason` = hráči už zestárli (rollover). */
export async function loadSeasonStats(
  db: D1Database, teamId: string, season: number, opts: { agedSinceSeason: boolean },
): Promise<SeasonStats> {
  const [position, cup, attendance, youth, team, riots] = await Promise.all([
    loadFinalPosition(db, teamId, season),
    db.prepare(CUP_SQL).bind(season, teamId).first<CupEntryRow>(),
    db.prepare(ATTENDANCE_SQL).bind(teamId, season).first<{ avg: number | null }>(),
    db.prepare(YOUTH_SQL).bind(teamId, season, opts.agedSinceSeason ? 1 : 0).first<{ matches: number; young: number | null }>(),
    db.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId).first<{ reputation: number }>(),
    db.prepare(RIOTS_SQL).bind(teamId, season).first<{ n: number }>(),
  ]);
  if (cupStillRunning(cup)) {
    logger.warn({ module: "sponsor-promises", teamId }, `pohár sezóny ${season} ještě běží a klub v něm je, slib pohárového kola se nevyhodnotí`);
  }
  return {
    position: position?.position ?? null,
    teamsInLeague: position?.teams ?? null,
    cupReached: cupRoundReached(cup),
    avgHomeAttendance: attendance?.avg ?? null,
    avgYouthStarters: averagePerMatch(youth?.young ?? 0, youth?.matches ?? 0),
    reputation: team?.reputation ?? null,
    riots: riots?.n ?? null,
  };
}

/**
 * Stav klubu pro termínové sliby: licence trenéra, zařízení stadionu, logo na rukávu.
 * Licence se čte stejně jako při jednání (etapa 2, negotiation-db.ts): trenér klubu, bez licence 0.
 */
export async function loadDeadlineState(db: D1Database, teamId: string): Promise<DeadlineState> {
  const [manager, stadium, team] = await Promise.all([
    db.prepare("SELECT COALESCE(licence_level, 0) AS licence_level FROM managers WHERE team_id = ? LIMIT 1")
      .bind(teamId).first<{ licence_level: number }>(),
    db.prepare("SELECT * FROM stadiums WHERE team_id = ? LIMIT 1").bind(teamId).first<Record<string, unknown>>(),
    db.prepare("SELECT sleeve_sponsor_id FROM teams WHERE id = ?").bind(teamId).first<{ sleeve_sponsor_id: number | null }>(),
  ]);
  const facilities: Record<string, number> = {};
  for (const key of Object.keys(FACILITY_LABELS)) {
    const v = stadium?.[key];
    facilities[key] = typeof v === "number" ? v : 0;
  }
  return {
    licenceLevel: manager?.licence_level ?? 0,
    facilities,
    sleeveSponsorId: team?.sleeve_sponsor_id ?? null,
  };
}
