/**
 * Profil soupeře: načtení z D1. Všechno z pohledu týmu `teamId` (majitel, který se dívá).
 *
 * Vzájemné zápasy jsou ve třech tabulkách: liga a přáteláky v `matches` (přátelák nemá kolo
 * v kalendáři), pohár v `cup_matches` přes `cup_teams` a turnaj v `tournament_matches`.
 * Sezóna, góly po čtvrthodinách a karty jsou jen z aktuálního ročníku ligy.
 */

import { PLAN_TACTIC_LABELS } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { calculateStandings } from "../stats/standings";
import { roundName } from "../cup/cup";
import { STAGE_LABEL } from "../tournament/advance";
import { OPPONENT_ANALYSIS_BONUS_DAYS } from "../scouting/opponent-analysis";
import {
  PERIOD_COUNT, goalPeriods, lineAverages, lineupTactics, outcome, recordFor, summarizeHeadToHead,
  type LineAverages, type Outcome, type RecordLine, type SeasonRecord,
} from "./rival-profile";

const MODULE = { module: "rival-profile" };

export type Competition = "league" | "cup" | "friendly" | "tournament";

export interface HeadToHeadMatch {
  id: string;
  competition: Competition;
  /** „3. kolo“, „Čtvrtfinále“, „Turnaj P-Mobile, finále“; přátelák null. */
  label: string | null;
  date: string | null;
  isHome: boolean;
  myScore: number;
  rivalScore: number;
  myPens: number | null;
  rivalPens: number | null;
  result: Outcome;
}

export interface Scorer {
  /** null = hráč už ve hře není (odešel), proklik nevede nikam. */
  playerId: string | null;
  name: string;
  goals: number;
}

export interface SeasonSide extends SeasonRecord {
  position: number;
  points: number;
}

export interface RivalProfile {
  me: { id: string; name: string };
  rival: { id: string; name: string };
  headToHead: { summary: RecordLine; matches: HeadToHeadMatch[] };
  scorers: { rival: Scorer[]; mine: Scorer[] };
  season: { leagueName: string | null; sameLeague: boolean; me: SeasonSide | null; rival: SeasonSide | null };
  rivalGoals: { matches: number; scored: number[]; conceded: number[] };
  rivalCards: { matches: number; yellow: number; red: number };
  lines: { me: LineAverages; rival: LineAverages };
  keyPlayers: Array<{ id: string; name: string; position: string; rating: number; age: number; goals: number; assists: number }>;
  formations: Array<{ matchId: string; date: string | null; competition: Competition; formation: string; tactic: string | null; opponentName: string }>;
  scoutReport: {
    formation: string | null; tactic: string | null; keyPlayer: string | null; weakPlayer: string | null;
    finishedAt: string; bonusUntil: string | null; bonusActive: boolean;
  } | null;
}

/** D1 snese nanejvýš 100 parametrů v dotazu; delší seznamy po dávkách. */
async function inChunks<T>(ids: readonly string[], run: (chunk: string[], placeholders: string) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    out.push(...await run(chunk, chunk.map(() => "?").join(",")));
  }
  return out;
}

const FORMATION_COUNT = 5;
const KEY_PLAYER_COUNT = 5;

export async function loadRivalProfile(db: D1Database, teamId: string, rivalId: string): Promise<RivalProfile | null> {
  const teams = await db.prepare("SELECT id, name, league_id FROM teams WHERE id IN (?, ?)")
    .bind(teamId, rivalId).all<{ id: string; name: string; league_id: string | null }>();
  const me = teams.results.find((t) => t.id === teamId);
  const rival = teams.results.find((t) => t.id === rivalId);
  if (!me || !rival) return null;

  const cupTeams = (await db.prepare("SELECT id, cup_id, team_id, name FROM cup_teams WHERE team_id IN (?, ?)")
    .bind(teamId, rivalId).all<{ id: string; cup_id: string; team_id: string; name: string }>()
    .catch((e) => { logger.warn(MODULE, "pohárové týmy", e); return { results: [] as Array<{ id: string; cup_id: string; team_id: string; name: string }> }; })).results;
  const realTeamOfCupTeam = new Map(cupTeams.map((ct) => [ct.id, ct.team_id]));

  const [headToHead, season, players, formations, scoutReport] = await Promise.all([
    loadHeadToHead(db, teamId, rivalId, cupTeams),
    loadSeason(db, me, rival),
    db.prepare(
      `SELECT id, team_id, first_name, last_name, position, overall_rating, age FROM players
        WHERE team_id IN (?, ?) AND (status IS NULL OR status != 'released')`,
    ).bind(teamId, rivalId).all<{ id: string; team_id: string; first_name: string; last_name: string; position: string; overall_rating: number; age: number }>(),
    loadFormations(db, rivalId, cupTeams.filter((ct) => ct.team_id === rivalId)),
    loadScoutReport(db, teamId, rivalId),
  ]);

  const scorers = await loadScorers(db, teamId, headToHead.map((m) => m.id), realTeamOfCupTeam);

  // Sezóna soupeře: góly po čtvrthodinách, karty a góly hráčů jen z ligových zápasů ročníku.
  const rivalSeasonIds = season.rivalMatches.map((m) => m.id);
  const periods = { scored: new Array<number>(PERIOD_COUNT).fill(0), conceded: new Array<number>(PERIOD_COUNT).fill(0) };
  for (const m of season.rivalMatches) {
    const one = goalPeriods(parseEvents(m.events), m.home_team_id === rivalId ? 1 : 2);
    for (let i = 0; i < PERIOD_COUNT; i++) { periods.scored[i] += one.scored[i]; periods.conceded[i] += one.conceded[i]; }
  }
  const rivalStats = await inChunks(rivalSeasonIds, (chunk, ph) => db.prepare(
    `SELECT player_id, SUM(goals) AS goals, SUM(assists) AS assists, SUM(yellow_cards) AS yellow, SUM(red_cards) AS red
       FROM match_player_stats WHERE team_id = ? AND match_id IN (${ph}) GROUP BY player_id`,
  ).bind(rivalId, ...chunk).all<{ player_id: string; goals: number; assists: number; yellow: number; red: number }>().then((r) => r.results))
    .catch((e) => { logger.warn(MODULE, "statistiky hráčů soupeře v sezóně", e); return []; });
  const statOf = new Map(rivalStats.map((s) => [s.player_id, s]));

  const squad = (team: string) => players.results.filter((p) => p.team_id === team);
  const keyPlayers = squad(rivalId)
    .sort((a, b) => b.overall_rating - a.overall_rating || a.last_name.localeCompare(b.last_name, "cs"))
    .slice(0, KEY_PLAYER_COUNT)
    .map((p) => ({
      id: p.id, name: `${p.first_name} ${p.last_name}`, position: p.position, rating: p.overall_rating, age: p.age,
      goals: statOf.get(p.id)?.goals ?? 0, assists: statOf.get(p.id)?.assists ?? 0,
    }));

  return {
    me: { id: me.id, name: me.name },
    rival: { id: rival.id, name: rival.name },
    headToHead: { summary: summarizeHeadToHead(headToHead), matches: headToHead },
    scorers,
    season: { leagueName: season.leagueName, sameLeague: !!me.league_id && me.league_id === rival.league_id, me: season.me, rival: season.rival },
    rivalGoals: { matches: season.rivalMatches.length, ...periods },
    rivalCards: {
      matches: season.rivalMatches.length,
      yellow: rivalStats.reduce((s, r) => s + (r.yellow ?? 0), 0),
      red: rivalStats.reduce((s, r) => s + (r.red ?? 0), 0),
    },
    lines: {
      me: lineAverages(squad(teamId).map((p) => ({ position: p.position, rating: p.overall_rating }))),
      rival: lineAverages(squad(rivalId).map((p) => ({ position: p.position, rating: p.overall_rating }))),
    },
    keyPlayers,
    formations,
    scoutReport,
  };
}

function parseEvents(raw: string | null): Array<{ minute?: number; type?: string; teamId?: number }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    logger.warn(MODULE, "rozbité události zápasu", e);
    return [];
  }
}

async function loadHeadToHead(
  db: D1Database, teamId: string, rivalId: string,
  cupTeams: ReadonlyArray<{ id: string; cup_id: string; team_id: string }>,
): Promise<HeadToHeadMatch[]> {
  const pair = [teamId, rivalId, rivalId, teamId];
  const toMatch = (row: {
    id: string; home_id: string; home_score: number; away_score: number; home_pens?: number | null; away_pens?: number | null; date: string | null;
  }, competition: Competition, label: string | null): HeadToHeadMatch => {
    const isHome = row.home_id === teamId;
    const myScore = isHome ? row.home_score : row.away_score;
    const rivalScore = isHome ? row.away_score : row.home_score;
    return {
      id: row.id, competition, label, date: row.date, isHome, myScore, rivalScore,
      myPens: (isHome ? row.home_pens : row.away_pens) ?? null,
      rivalPens: (isHome ? row.away_pens : row.home_pens) ?? null,
      result: outcome(myScore, rivalScore),
    };
  };

  const league = db.prepare(
    `SELECT m.id, m.calendar_id, m.round, m.home_team_id AS home_id, m.home_score, m.away_score,
            COALESCE(m.simulated_at, sc.scheduled_at) AS date
       FROM matches m LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.status = 'simulated' AND ((m.home_team_id = ? AND m.away_team_id = ?) OR (m.home_team_id = ? AND m.away_team_id = ?))`,
  ).bind(...pair).all<{ id: string; calendar_id: string | null; round: number | null; home_id: string; home_score: number; away_score: number; date: string | null }>()
    .then((r) => r.results.map((row) => row.calendar_id == null
      ? toMatch(row, "friendly", null)
      : toMatch(row, "league", row.round != null ? `${row.round}. kolo` : null)));

  // Pohár: jen ročníky, kde hrály oba týmy (index na cup_id), dvojici dohledat podle cup_teams.
  const mineCup = new Set(cupTeams.filter((ct) => ct.team_id === teamId).map((ct) => ct.id));
  const rivalCup = new Set(cupTeams.filter((ct) => ct.team_id === rivalId).map((ct) => ct.id));
  const sharedCups = [...new Set(cupTeams.filter((ct) => ct.team_id === teamId).map((ct) => ct.cup_id))]
    .filter((cup) => cupTeams.some((ct) => ct.team_id === rivalId && ct.cup_id === cup));
  const cup = inChunks(sharedCups, (chunk, ph) => db.prepare(
    `SELECT cm.id, cm.round, cc.total_rounds, cm.home_cup_team_id, cm.away_cup_team_id, cm.home_score, cm.away_score,
            cm.home_pens, cm.away_pens, COALESCE(cm.simulated_at, cm.scheduled_at) AS date
       FROM cup_matches cm LEFT JOIN cup_competitions cc ON cc.id = cm.cup_id
      WHERE cm.cup_id IN (${ph}) AND cm.status = 'simulated'`,
  ).bind(...chunk).all<{
    id: string; round: number; total_rounds: number | null; home_cup_team_id: string; away_cup_team_id: string;
    home_score: number; away_score: number; home_pens: number | null; away_pens: number | null; date: string | null;
  }>().then((r) => r.results))
    .then((rows) => rows
      .filter((r) => (mineCup.has(r.home_cup_team_id) && rivalCup.has(r.away_cup_team_id))
        || (rivalCup.has(r.home_cup_team_id) && mineCup.has(r.away_cup_team_id)))
      .map((r) => toMatch(
        { ...r, home_id: mineCup.has(r.home_cup_team_id) ? teamId : rivalId },
        "cup", r.total_rounds ? roundName(r.round, r.total_rounds) : `${r.round}. kolo`,
      )));

  const tournament = db.prepare(
    `SELECT tm.id, tm.stage, tm.day, tm.home_team_id AS home_id, tm.home_score, tm.away_score, tm.home_pens, tm.away_pens,
            COALESCE(tm.simulated_at, tm.scheduled_at) AS date, t.name AS tournament_name
       FROM tournament_matches tm JOIN tournaments t ON t.id = tm.tournament_id
      WHERE tm.status = 'simulated' AND ((tm.home_team_id = ? AND tm.away_team_id = ?) OR (tm.home_team_id = ? AND tm.away_team_id = ?))`,
  ).bind(...pair).all<{
    id: string; stage: string; day: number; home_id: string; home_score: number; away_score: number;
    home_pens: number | null; away_pens: number | null; date: string | null; tournament_name: string;
  }>().then((r) => r.results.map((row) => toMatch(row, "tournament",
    `${row.tournament_name}, ${row.stage === "league" ? `${row.day}. den` : STAGE_LABEL[row.stage] ?? row.stage}`)));

  const parts = await Promise.all([league, cup, tournament].map((p) => p.catch((e) => {
    logger.warn(MODULE, "vzájemné zápasy", e);
    return [] as HeadToHeadMatch[];
  })));
  return parts.flat().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

async function loadScorers(
  db: D1Database, teamId: string, matchIds: readonly string[], realTeamOfCupTeam: ReadonlyMap<string, string>,
): Promise<{ rival: Scorer[]; mine: Scorer[] }> {
  const rows = await inChunks(matchIds, (chunk, ph) => db.prepare(
    `SELECT mps.player_id, mps.team_id, SUM(mps.goals) AS goals, p.id AS present_id,
            COALESCE(p.first_name, dp.first_name) AS first_name, COALESCE(p.last_name, dp.last_name) AS last_name
       FROM match_player_stats mps
       LEFT JOIN players p ON p.id = mps.player_id
       LEFT JOIN departed_players dp ON dp.id = mps.player_id
      WHERE mps.match_id IN (${ph}) AND mps.goals > 0
      GROUP BY mps.player_id, mps.team_id`,
  ).bind(...chunk).all<{ player_id: string; team_id: string; goals: number; present_id: string | null; first_name: string | null; last_name: string | null }>()
    .then((r) => r.results))
    .catch((e) => { logger.warn(MODULE, "střelci vzájemných zápasů", e); return []; });

  const mine = new Map<string, Scorer>();
  const rival = new Map<string, Scorer>();
  for (const r of rows) {
    // V poháru je ve statistikách pohárový tým, ne klub.
    const team = realTeamOfCupTeam.get(r.team_id) ?? r.team_id;
    const into = team === teamId ? mine : rival;
    const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Bývalý hráč";
    const prev = into.get(r.player_id);
    if (prev) prev.goals += r.goals;
    else into.set(r.player_id, { playerId: r.present_id, name, goals: r.goals });
  }
  const sorted = (m: Map<string, Scorer>) => [...m.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, "cs"));
  return { rival: sorted(rival), mine: sorted(mine) };
}

interface SeasonMatchRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  events: string | null;
}

async function loadSeason(
  db: D1Database,
  me: { id: string; league_id: string | null },
  rival: { id: string; league_id: string | null },
): Promise<{ leagueName: string | null; me: SeasonSide | null; rival: SeasonSide | null; rivalMatches: SeasonMatchRow[] }> {
  const side = async (team: { id: string; league_id: string | null }, withEvents: boolean) => {
    if (!team.league_id) return { side: null, matches: [] as SeasonMatchRow[] };
    const [table, matches] = await Promise.all([
      calculateStandings(db, team.league_id),
      db.prepare(
        `SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score, ${withEvents ? "m.events" : "NULL AS events"}
           FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
          WHERE m.league_id = ? AND m.status = 'simulated' AND (m.home_team_id = ? OR m.away_team_id = ?)
            AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)
          ORDER BY sc.scheduled_at ASC, m.id ASC`,
      ).bind(team.league_id, team.id, team.id, team.league_id).all<SeasonMatchRow>().then((r) => r.results),
    ]);
    const row = table.find((s) => s.teamId === team.id);
    return {
      side: { position: row?.pos ?? 0, points: row?.points ?? 0, ...recordFor(matches.map((m) => ({
        homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: m.home_score, awayScore: m.away_score,
      })), team.id) },
      matches,
    };
  };
  const empty = { side: null, matches: [] as SeasonMatchRow[] };
  const [mine, theirs, league] = await Promise.all([
    side(me, false).catch((e) => { logger.warn(MODULE, "sezóna mého týmu", e); return empty; }),
    side(rival, true).catch((e) => { logger.warn(MODULE, "sezóna soupeře", e); return empty; }),
    rival.league_id
      ? db.prepare("SELECT name FROM leagues WHERE id = ?").bind(rival.league_id).first<{ name: string }>()
        .catch((e) => { logger.warn(MODULE, "název ligy soupeře", e); return null; })
      : Promise.resolve(null),
  ]);
  return { leagueName: league?.name ?? null, me: mine.side, rival: theirs.side, rivalMatches: theirs.matches };
}

async function loadFormations(
  db: D1Database, rivalId: string, rivalCupTeams: ReadonlyArray<{ id: string; cup_id: string }>,
): Promise<RivalProfile["formations"]> {
  type Row = { id: string; is_home: number; lineup: string | null; date: string | null; opponent_name: string; competition: Competition };

  const league = db.prepare(
    `SELECT m.id, (m.home_team_id = ?1) AS is_home,
            CASE WHEN m.home_team_id = ?1 THEN m.home_lineup_data ELSE m.away_lineup_data END AS lineup,
            m.simulated_at AS date,
            CASE WHEN m.home_team_id = ?1 THEN at.name ELSE ht.name END AS opponent_name,
            CASE WHEN m.calendar_id IS NULL THEN 'friendly' ELSE 'league' END AS competition
       FROM matches m JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
      WHERE m.status = 'simulated' AND (m.home_team_id = ?1 OR m.away_team_id = ?1)
        AND (CASE WHEN m.home_team_id = ?1 THEN m.home_lineup_data ELSE m.away_lineup_data END) IS NOT NULL
      ORDER BY m.simulated_at DESC LIMIT ?2`,
  ).bind(rivalId, FORMATION_COUNT).all<Row>().then((r) => r.results);

  const cupIds = [...new Set(rivalCupTeams.map((ct) => ct.cup_id))];
  const cupTeamIds = new Set(rivalCupTeams.map((ct) => ct.id));
  const cup = inChunks(cupIds, (chunk, ph) => db.prepare(
    `SELECT cm.id, cm.home_cup_team_id, cm.away_cup_team_id, cm.home_lineup_data, cm.away_lineup_data, cm.simulated_at AS date,
            ht.name AS home_name, at.name AS away_name
       FROM cup_matches cm JOIN cup_teams ht ON ht.id = cm.home_cup_team_id JOIN cup_teams at ON at.id = cm.away_cup_team_id
      WHERE cm.cup_id IN (${ph}) AND cm.status = 'simulated'`,
  ).bind(...chunk).all<{
    id: string; home_cup_team_id: string; away_cup_team_id: string; home_lineup_data: string | null; away_lineup_data: string | null;
    date: string | null; home_name: string; away_name: string;
  }>().then((r) => r.results))
    .then((rows) => rows
      .filter((r) => cupTeamIds.has(r.home_cup_team_id) || cupTeamIds.has(r.away_cup_team_id))
      .map((r): Row => {
        const home = cupTeamIds.has(r.home_cup_team_id);
        return {
          id: r.id, is_home: home ? 1 : 0, lineup: home ? r.home_lineup_data : r.away_lineup_data, date: r.date,
          opponent_name: home ? r.away_name : r.home_name, competition: "cup",
        };
      }));

  const tournament = db.prepare(
    `SELECT tm.id, (tm.home_team_id = ?1) AS is_home,
            CASE WHEN tm.home_team_id = ?1 THEN tm.home_lineup_data ELSE tm.away_lineup_data END AS lineup,
            tm.simulated_at AS date,
            CASE WHEN tm.home_team_id = ?1 THEN at.name ELSE ht.name END AS opponent_name,
            'tournament' AS competition
       FROM tournament_matches tm JOIN teams ht ON ht.id = tm.home_team_id JOIN teams at ON at.id = tm.away_team_id
      WHERE tm.status = 'simulated' AND (tm.home_team_id = ?1 OR tm.away_team_id = ?1)
        AND (CASE WHEN tm.home_team_id = ?1 THEN tm.home_lineup_data ELSE tm.away_lineup_data END) IS NOT NULL
      ORDER BY tm.simulated_at DESC LIMIT ?2`,
  ).bind(rivalId, FORMATION_COUNT).all<Row>().then((r) => r.results);

  const parts = await Promise.all([league, cup, tournament].map((p) => p.catch((e) => {
    logger.warn(MODULE, "rozestavení soupeře", e);
    return [] as Row[];
  })));
  const out: RivalProfile["formations"] = [];
  for (const row of parts.flat().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    const t = lineupTactics(row.lineup);
    if (!t) continue;
    // Taktika česky, stejně jako ji píše skaut a ukazuje záznam.
    const tactic = t.tactic ? PLAN_TACTIC_LABELS[t.tactic as keyof typeof PLAN_TACTIC_LABELS] ?? t.tactic : null;
    out.push({ matchId: row.id, date: row.date, competition: row.competition, formation: t.formation, tactic, opponentName: row.opponent_name });
    if (out.length === FORMATION_COUNT) break;
  }
  return out;
}

async function loadScoutReport(db: D1Database, teamId: string, rivalId: string): Promise<RivalProfile["scoutReport"]> {
  const row = await db.prepare(
    `SELECT result_data, closed_at, (julianday(closed_at) > julianday('now', ?)) AS active
       FROM scout_assignments
      WHERE team_id = ? AND target_team_id = ? AND assignment_type = 'match' AND status = 'finished'
      ORDER BY closed_at DESC LIMIT 1`,
  ).bind(`-${OPPONENT_ANALYSIS_BONUS_DAYS} days`, teamId, rivalId)
    .first<{ result_data: string | null; closed_at: string; active: number }>()
    .catch((e) => { logger.warn(MODULE, "skautský rozbor soupeře", e); return null; });
  if (!row) return null;
  let data: Record<string, unknown> = {};
  try {
    data = row.result_data ? JSON.parse(row.result_data) : {};
  } catch (e) {
    logger.warn(MODULE, "rozbitý skautský rozbor", e);
  }
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    formation: text(data.formation), tactic: text(data.tactic), keyPlayer: text(data.keyPlayer), weakPlayer: text(data.weakPlayer),
    finishedAt: row.closed_at, bonusUntil: text(data.bonusUntil), bonusActive: row.active === 1,
  };
}
