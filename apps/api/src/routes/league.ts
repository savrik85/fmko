/**
 * League API routes — standings from real DB data.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { mustSeason } from "../lib/season";

const leagueRouter = new Hono<{ Bindings: Bindings }>();

function deriveInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const cleaned = String(name).replace(/^FK\s+/i, "").replace(/^SK\s+/i, "").replace(/^TJ\s+/i, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0] ?? "").join("").toUpperCase();
}

// GET /api/teams/:teamId/standings — real standings from DB
leagueRouter.get("/teams/:teamId/standings", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const leagueId = team.league_id as string | null;
  if (!leagueId) return c.json({ leagueName: "", standings: [], season: null });

  // Get league + season info
  const leagueInfo = await c.env.DB.prepare(
    "SELECT l.name, l.level, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(leagueId).first<{ name: string; level: string; season_number: number }>().catch((e) => { logger.warn({ module: "league" }, "fetch league info", e); return null; });

  // Get all teams in league
  const leagueTeams = await c.env.DB.prepare(
    "SELECT t.id, t.name, t.user_id, t.primary_color, t.secondary_color, t.badge_pattern, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? ORDER BY t.name"
  ).bind(leagueId).all();

  const teamIds = leagueTeams.results.map((t) => t.id as string);
  const teamMeta = Object.fromEntries(leagueTeams.results.map((t) => [t.id as string, {
    name: t.name as string,
    isAi: t.user_id === "ai",
    primaryColor: t.primary_color as string || "#2D5F2D",
    secondaryColor: t.secondary_color as string || "#FFFFFF",
    badgePattern: t.badge_pattern as string || "shield",
  }]));

  // Get simulated matches — JEN aktuální (nejvyšší) sezóny ligy (season-aware)
  const placeholders = teamIds.map(() => "?").join(",");
  const matches = await c.env.DB.prepare(
    `SELECT m.* FROM matches m
     JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.status = 'simulated'
       AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)
       AND (m.home_team_id IN (${placeholders}) OR m.away_team_id IN (${placeholders}))`
  ).bind(leagueId, ...teamIds, ...teamIds).all().catch((e) => { logger.warn({ module: "league" }, "fetch simulated matches", e); return { results: [] }; });

  // Calculate standings
  const stats: Record<string, { wins: number; draws: number; losses: number; gf: number; ga: number; form: string[] }> = {};
  for (const tid of teamIds) {
    stats[tid] = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, form: [] };
  }

  for (const m of matches.results) {
    const homeId = m.home_team_id as string;
    const awayId = m.away_team_id as string;
    const hs = m.home_score as number;
    const as_ = m.away_score as number;

    if (!stats[homeId] || !stats[awayId]) continue;

    stats[homeId].gf += hs;
    stats[homeId].ga += as_;
    stats[awayId].gf += as_;
    stats[awayId].ga += hs;

    if (hs > as_) {
      stats[homeId].wins++;
      stats[homeId].form.push("W");
      stats[awayId].losses++;
      stats[awayId].form.push("L");
    } else if (hs < as_) {
      stats[awayId].wins++;
      stats[awayId].form.push("W");
      stats[homeId].losses++;
      stats[homeId].form.push("L");
    } else {
      stats[homeId].draws++;
      stats[homeId].form.push("D");
      stats[awayId].draws++;
      stats[awayId].form.push("D");
    }
  }

  // Build standings array
  const standings = teamIds.map((tid) => {
    const s = stats[tid];
    const m = teamMeta[tid];
    const played = s.wins + s.draws + s.losses;
    return {
      teamId: tid,
      team: m.name,
      played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      gf: s.gf,
      ga: s.ga,
      points: s.wins * 3 + s.draws,
      form: s.form.slice(-5).reverse(),
      isPlayer: tid === teamId,
      isAi: m.isAi,
      primaryColor: m.primaryColor,
      secondaryColor: m.secondaryColor,
      badgePattern: m.badgePattern,
    };
  });

  // Sort: points DESC, goal diff DESC, goals for DESC
  standings.sort((a, b) => {
    const pd = b.points - a.points;
    if (pd !== 0) return pd;
    const gd = (b.gf - b.ga) - (a.gf - a.ga);
    if (gd !== 0) return gd;
    return b.gf - a.gf;
  });

  // Assign positions
  standings.forEach((s, i) => { (s as Record<string, unknown>).pos = i + 1; });

  return c.json({
    leagueName: leagueInfo?.name ?? `Okresní přebor ${team.district}`,
    leagueLevel: leagueInfo?.level ?? "okresni_prebor",
    season: mustSeason(leagueInfo?.season_number),
    standings,
  });
});

/**
 * Kuriozity sezóny z odehraných zápasů ligy. Počítá se z uložených sloupců (minuta prvního
 * gólu, karty), ne z událostí — ty by se musely parsovat u všech zápasů při každém načtení.
 */
function buildCuriosities(matches: Record<string, unknown>[]) {
  const label = (m: Record<string, unknown>) => ({
    matchId: m.id as string,
    homeName: m.home_name as string, awayName: m.away_name as string,
    homeScore: (m.home_score as number) ?? 0, awayScore: (m.away_score as number) ?? 0,
  });
  const best = <T,>(pick: (m: Record<string, unknown>) => T | null, better: (a: T, b: T) => boolean) => {
    let bestMatch: Record<string, unknown> | null = null, bestVal: T | null = null;
    for (const m of matches) {
      const v = pick(m);
      if (v == null) continue;
      if (bestVal == null || better(v, bestVal)) { bestVal = v; bestMatch = m; }
    }
    return bestMatch && bestVal != null ? { ...label(bestMatch), value: bestVal } : null;
  };

  return {
    fastestGoal: best((m) => m.fastest_goal_minute as number | null, (a, b) => a < b),
    wildestMatch: best((m) => (m.total_cards as number | null) || null, (a, b) => a > b),
    biggestWin: best(
      (m) => Math.abs(((m.home_score as number) ?? 0) - ((m.away_score as number) ?? 0)) || null,
      (a, b) => a > b,
    ),
    mostGoals: best(
      (m) => (((m.home_score as number) ?? 0) + ((m.away_score as number) ?? 0)) || null,
      (a, b) => a > b,
    ),
    biggestAttendance: best((m) => (m.attendance as number | null) || null, (a, b) => a > b),
  };
}

// GET /api/teams/:teamId/league-stats — top scorers + assists across the league
leagueRouter.get("/teams/:teamId/league-stats", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>();
  if (!team?.league_id) return c.json({ topScorers: [], topAssists: [] });

  // Get active season
  const season = await c.env.DB.prepare(
    "SELECT id, number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string; number: number }>().catch((e) => { logger.warn({ module: "league" }, "fetch active season for stats", e); return null; });
  const seasonId = mustSeason(season?.id);

  const stats = await c.env.DB.prepare(
    `SELECT ps.goals, ps.assists, ps.appearances, ps.man_of_match as motm,
       ps.yellow_cards, ps.red_cards, ps.avg_rating, ps.clean_sheets,
       ps.penalty_goals, ps.penalty_misses, ps.setpiece_goals,
       ps.saves, ps.penalty_saves, ps.goals_conceded, ps.keeper_matches,
       ps.fouls, ps.chances, ps.injuries, ps.minutes_played,
       p.id as player_id, p.first_name, p.last_name, p.position, ps.team_id,
       t.name as team_name, t.primary_color, t.secondary_color, t.badge_pattern
     FROM player_stats ps
     JOIN players p ON ps.player_id = p.id
     JOIN teams t ON ps.team_id = t.id
     WHERE ps.season_id = ? AND t.league_id = ?
     ORDER BY ps.goals DESC, ps.assists DESC`
  ).bind(seasonId, team.league_id).all().catch((e) => { logger.error({ module: "league" }, "fetch league stats", e); return { results: [] }; });

  const rows = stats.results.map((r) => ({
    playerId: r.player_id as string,
    name: `${r.first_name} ${r.last_name}`,
    position: r.position as string,
    teamId: r.team_id as string,
    teamName: r.team_name as string,
    teamColor: (r.primary_color as string) || "#2D5F2D",
    teamSecondary: (r.secondary_color as string) || "#FFFFFF",
    teamBadge: (r.badge_pattern as string) || "shield",
    goals: (r.goals as number) ?? 0,
    assists: (r.assists as number) ?? 0,
    appearances: (r.appearances as number) ?? 0,
    motm: (r.motm as number) ?? 0,
    yellowCards: (r.yellow_cards as number) ?? 0,
    redCards: (r.red_cards as number) ?? 0,
    avgRating: (r.avg_rating as number) ?? 0,
    cleanSheets: (r.clean_sheets as number) ?? 0,
    penaltyGoals: (r.penalty_goals as number) ?? 0,
    penaltyMisses: (r.penalty_misses as number) ?? 0,
    penaltyAttempts: ((r.penalty_goals as number) ?? 0) + ((r.penalty_misses as number) ?? 0),
    setPieceGoals: (r.setpiece_goals as number) ?? 0,
    saves: (r.saves as number) ?? 0,
    penaltySaves: (r.penalty_saves as number) ?? 0,
    goalsConceded: (r.goals_conceded as number) ?? 0,
    keeperMatches: (r.keeper_matches as number) ?? 0,
    fouls: (r.fouls as number) ?? 0,
    chances: (r.chances as number) ?? 0,
    injuries: (r.injuries as number) ?? 0,
    minutesPlayed: (r.minutes_played as number) ?? 0,
    // Úspěšnost zakončení: gól z každé zahozené šance + gólu. Šance bez gólu = 0 %.
    shotAccuracy: (((r.goals as number) ?? 0) + ((r.chances as number) ?? 0)) > 0
      ? Math.round((((r.goals as number) ?? 0) / (((r.goals as number) ?? 0) + ((r.chances as number) ?? 0))) * 100) : 0,
    // Góly na 90 minut — férovější k náhradníkům než absolutní počet.
    goalsPer90: ((r.minutes_played as number) ?? 0) > 0
      ? Math.round((((r.goals as number) ?? 0) / (r.minutes_played as number)) * 90 * 100) / 100 : 0,
    // Gólmanský průměr — obdržené góly na ODCHYTANÝ zápas, ne na start v sestavě.
    concededPerMatch: ((r.keeper_matches as number) ?? 0) > 0
      ? Math.round((((r.goals_conceded as number) ?? 0) / (r.keeper_matches as number)) * 100) / 100 : 0,
    isMyTeam: r.team_id === teamId,
  }));

  // ── Týmové součty ─────────────────────────────────────────────────────────
  // Skládají se z hráčských řádků, takže sedí na to, co je vidět v žebříčcích výš.
  const teams = new Map<string, {
    teamId: string; teamName: string; teamColor: string; teamSecondary: string; teamBadge: string;
    penaltyGoals: number; penaltyAttempts: number; setPieceGoals: number;
    yellowCards: number; redCards: number; fouls: number; isMyTeam: boolean;
    goalsFor: number; goalsAgainst: number; played: number;
    homeWins: number; homeDraws: number; homeLosses: number;
    awayWins: number; awayDraws: number; awayLosses: number;
    attendanceSum: number; attendanceCount: number; possessionSum: number; possessionCount: number;
    longestUnbeaten: number; longestWinStreak: number;
  }>();
  for (const r of rows) {
    const t = teams.get(r.teamId) ?? {
      teamId: r.teamId, teamName: r.teamName, teamColor: r.teamColor, teamSecondary: r.teamSecondary,
      teamBadge: r.teamBadge, penaltyGoals: 0, penaltyAttempts: 0, setPieceGoals: 0,
      yellowCards: 0, redCards: 0, fouls: 0, isMyTeam: r.isMyTeam,
      goalsFor: 0, goalsAgainst: 0, played: 0,
      homeWins: 0, homeDraws: 0, homeLosses: 0, awayWins: 0, awayDraws: 0, awayLosses: 0,
      attendanceSum: 0, attendanceCount: 0, possessionSum: 0, possessionCount: 0,
      longestUnbeaten: 0, longestWinStreak: 0,
    };
    t.penaltyGoals += r.penaltyGoals;
    t.penaltyAttempts += r.penaltyAttempts;
    t.setPieceGoals += r.setPieceGoals;
    t.yellowCards += r.yellowCards;
    t.redCards += r.redCards;
    t.fouls += r.fouls;
    teams.set(r.teamId, t);
  }

  // ── Zápasy ligy ───────────────────────────────────────────────────────────
  // Bez sloupce events — ten je velký a nic z něj tady není potřeba, minuta prvního gólu
  // se ukládá zvlášť při simulaci.
  const matchesRes = await c.env.DB.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
            m.attendance, m.possession_home, m.fastest_goal_minute, m.simulated_at,
            ht.name AS home_name, at.name AS away_name
     FROM matches m
     JOIN season_calendar sc ON sc.id = m.calendar_id
     JOIN teams ht ON ht.id = m.home_team_id
     JOIN teams at ON at.id = m.away_team_id
     WHERE sc.league_id = ? AND m.status = 'simulated' AND sc.season_number = ?
     ORDER BY m.simulated_at`
  ).bind(team.league_id, season?.number ?? 0).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: "league" }, "fetch league matches for stats", e); return { results: [] as Record<string, unknown>[] }; });

  // Série se počítají per tým v chronologickém pořadí, proto zvlášť od součtů výš.
  const streaks = new Map<string, { unbeaten: number; wins: number }>();
  for (const m of matchesRes.results) {
    const hs = (m.home_score as number) ?? 0, as = (m.away_score as number) ?? 0;
    for (const isHome of [true, false]) {
      const id = (isHome ? m.home_team_id : m.away_team_id) as string;
      const t = teams.get(id);
      if (!t) continue;
      const mine = isHome ? hs : as, opp = isHome ? as : hs;
      t.played++;
      t.goalsFor += mine;
      t.goalsAgainst += opp;
      if (isHome) {
        if (mine > opp) t.homeWins++; else if (mine === opp) t.homeDraws++; else t.homeLosses++;
        if (m.attendance != null) { t.attendanceSum += m.attendance as number; t.attendanceCount++; }
        if (m.possession_home != null) { t.possessionSum += m.possession_home as number; t.possessionCount++; }
      } else {
        if (mine > opp) t.awayWins++; else if (mine === opp) t.awayDraws++; else t.awayLosses++;
        if (m.possession_home != null) { t.possessionSum += 100 - (m.possession_home as number); t.possessionCount++; }
      }
      const s = streaks.get(id) ?? { unbeaten: 0, wins: 0 };
      s.unbeaten = mine >= opp ? s.unbeaten + 1 : 0;
      s.wins = mine > opp ? s.wins + 1 : 0;
      streaks.set(id, s);
      if (s.unbeaten > t.longestUnbeaten) t.longestUnbeaten = s.unbeaten;
      if (s.wins > t.longestWinStreak) t.longestWinStreak = s.wins;
    }
  }

  const teamRows = [...teams.values()].map((t) => ({
    ...t,
    avgAttendance: t.attendanceCount > 0 ? Math.round(t.attendanceSum / t.attendanceCount) : 0,
    avgPossession: t.possessionCount > 0 ? Math.round(t.possessionSum / t.possessionCount) : 0,
  }));

  return c.json({
    topScorers: [...rows].sort((a, b) => b.goals - a.goals || b.assists - a.assists).filter((r) => r.goals > 0).slice(0, 15),
    topAssists: [...rows].sort((a, b) => b.assists - a.assists || b.goals - a.goals).filter((r) => r.assists > 0).slice(0, 15),
    topRated: [...rows].filter((r) => r.appearances >= 3 && r.avgRating > 0).sort((a, b) => b.avgRating - a.avgRating).slice(0, 10),
    mostCards: [...rows].filter((r) => r.yellowCards + r.redCards > 0).sort((a, b) => (b.yellowCards + b.redCards * 3) - (a.yellowCards + a.redCards * 3)).slice(0, 10),
    mostAppearances: [...rows].sort((a, b) => b.appearances - a.appearances).filter((r) => r.appearances > 0).slice(0, 10),
    // Exekutoři penalt: řadí proměněné, při shodě míň zahozených (lepší úspěšnost napřed).
    topPenalties: [...rows].filter((r) => r.penaltyAttempts > 0)
      .sort((a, b) => b.penaltyGoals - a.penaltyGoals || a.penaltyMisses - b.penaltyMisses).slice(0, 10),
    topSetPieces: [...rows].filter((r) => r.setPieceGoals > 0)
      .sort((a, b) => b.setPieceGoals - a.setPieceGoals || b.goals - a.goals).slice(0, 10),
    // Gólmanský průměr — od tří odchytaných zápasů, aby jedno čisté konto nevyhrálo tabulku.
    topKeepers: [...rows].filter((r) => r.position === "GK" && r.keeperMatches >= 3)
      .sort((a, b) => a.concededPerMatch - b.concededPerMatch || b.cleanSheets - a.cleanSheets).slice(0, 10),
    topCleanSheets: [...rows].filter((r) => r.position === "GK" && r.cleanSheets > 0)
      .sort((a, b) => b.cleanSheets - a.cleanSheets || a.concededPerMatch - b.concededPerMatch).slice(0, 10),
    topSaves: [...rows].filter((r) => r.saves + r.penaltySaves > 0)
      .sort((a, b) => (b.saves + b.penaltySaves * 3) - (a.saves + a.penaltySaves * 3)).slice(0, 10),
    teamPenalties: teamRows.filter((t) => t.penaltyAttempts > 0)
      .sort((a, b) => b.penaltyAttempts - a.penaltyAttempts || b.penaltyGoals - a.penaltyGoals).slice(0, 14),
    teamSetPieces: teamRows.filter((t) => t.setPieceGoals > 0)
      .sort((a, b) => b.setPieceGoals - a.setPieceGoals).slice(0, 14),
    teamCards: teamRows.filter((t) => t.yellowCards + t.redCards > 0)
      .sort((a, b) => (b.yellowCards + b.redCards * 3) - (a.yellowCards + a.redCards * 3)).slice(0, 14),
    mostFouls: [...rows].filter((r) => r.fouls > 0).sort((a, b) => b.fouls - a.fouls).slice(0, 10),
    mostMinutes: [...rows].filter((r) => r.minutesPlayed > 0).sort((a, b) => b.minutesPlayed - a.minutesPlayed).slice(0, 10),
    mostInjuries: [...rows].filter((r) => r.injuries > 0).sort((a, b) => b.injuries - a.injuries).slice(0, 10),
    // Zakončení a góly/90 mají práh, jinak by vedl někdo s jedinou trefou z jediné šance.
    topAccuracy: [...rows].filter((r) => r.goals + r.chances >= 5 && r.goals > 0)
      .sort((a, b) => b.shotAccuracy - a.shotAccuracy || b.goals - a.goals).slice(0, 10),
    topGoalsPer90: [...rows].filter((r) => r.minutesPlayed >= 270 && r.goals > 0)
      .sort((a, b) => b.goalsPer90 - a.goalsPer90).slice(0, 10),
    teamAttack: [...teamRows].filter((t) => t.played > 0).sort((a, b) => b.goalsFor - a.goalsFor).slice(0, 14),
    teamDefense: [...teamRows].filter((t) => t.played > 0).sort((a, b) => a.goalsAgainst - b.goalsAgainst).slice(0, 14),
    teamAttendance: [...teamRows].filter((t) => t.avgAttendance > 0).sort((a, b) => b.avgAttendance - a.avgAttendance).slice(0, 14),
    teamPossession: [...teamRows].filter((t) => t.avgPossession > 0).sort((a, b) => b.avgPossession - a.avgPossession).slice(0, 14),
    // Nejčistší tým — nejmíň faulů; karty rozhodují při shodě.
    teamCleanest: [...teamRows].filter((t) => t.played > 0)
      .sort((a, b) => a.fouls - b.fouls || (a.yellowCards + a.redCards * 3) - (b.yellowCards + b.redCards * 3)).slice(0, 14),
    teamUnbeaten: [...teamRows].filter((t) => t.longestUnbeaten > 1).sort((a, b) => b.longestUnbeaten - a.longestUnbeaten).slice(0, 14),
    teamWinStreak: [...teamRows].filter((t) => t.longestWinStreak > 1).sort((a, b) => b.longestWinStreak - a.longestWinStreak).slice(0, 14),
    teamHomeAway: [...teamRows].filter((t) => t.played > 0)
      .sort((a, b) => (b.homeWins * 3 + b.homeDraws) - (a.homeWins * 3 + a.homeDraws)).slice(0, 14),
    curiosities: buildCuriosities(matchesRes.results),
  });
});

// GET /api/teams/:teamId/players/:playerId/league-rank — pozice hráče v žebříčcích ligy
leagueRouter.get("/teams/:teamId/players/:playerId/league-rank", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>();
  if (!team?.league_id) return c.json({ ranks: null });

  const season = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "league" }, "fetch active season for rank", e); return null; });
  if (!season) return c.json({ ranks: null });

  // Načteme všechny hráče v lize s jejich season-stats
  const stats = await c.env.DB.prepare(
    `SELECT ps.player_id, ps.goals, ps.assists, ps.avg_rating, ps.appearances
     FROM player_stats ps
     JOIN players p ON ps.player_id = p.id
     JOIN teams t ON ps.team_id = t.id
     WHERE ps.season_id = ? AND t.league_id = ?`
  ).bind(season.id, team.league_id).all<{ player_id: string; goals: number; assists: number; avg_rating: number; appearances: number }>()
    .catch((e) => { logger.warn({ module: "league" }, "fetch league rank stats", e); return { results: [] }; });

  const rows = stats.results;
  if (rows.length === 0) return c.json({ ranks: null });

  const me = rows.find((r) => r.player_id === playerId);
  if (!me) return c.json({ ranks: null });

  // Rank = 1 + count of players strictly better
  const goalsBetter = rows.filter((r) => r.goals > me.goals).length;
  const assistsBetter = rows.filter((r) => r.assists > me.assists).length;
  // Rating: min 3 appearances pro ranking
  const ratingPool = rows.filter((r) => r.appearances >= 3);
  const ratingBetter = ratingPool.filter((r) => r.avg_rating > me.avg_rating).length;
  const ratingTotal = ratingPool.length;
  const ratingEligible = me.appearances >= 3;

  return c.json({
    ranks: {
      goals: { rank: goalsBetter + 1, total: rows.length, value: me.goals },
      assists: { rank: assistsBetter + 1, total: rows.length, value: me.assists },
      rating: ratingEligible
        ? { rank: ratingBetter + 1, total: ratingTotal, value: Number(me.avg_rating?.toFixed(2) ?? 0) }
        : null,
    },
  });
});

// GET /api/leagues — seznam všech aktivních lig (pro league picker v UI)
leagueRouter.get("/leagues", async (c) => {
  const leagues = await c.env.DB.prepare(
    "SELECT l.id, l.name, l.level, l.district, l.season_id, s.number as season_number, (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id) as team_count FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.status = 'active' AND l.district IN ('Prachatice', 'Praha') ORDER BY l.name"
  ).all().catch((e) => { logger.error({ module: "league" }, "fetch leagues", e); return { results: [] }; });

  return c.json({ leagues: leagues.results });
});

// GET /api/leagues/:leagueId/standings — tabulka libovolné ligy
leagueRouter.get("/leagues/:leagueId/standings", async (c) => {
  const leagueId = c.req.param("leagueId");

  const leagueInfo = await c.env.DB.prepare(
    "SELECT l.name, l.level, l.district, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(leagueId).first<{ name: string; level: string; district: string; season_number: number }>();
  if (!leagueInfo) return c.json({ error: "League not found" }, 404);

  const leagueTeams = await c.env.DB.prepare(
    "SELECT t.id, t.name, t.user_id, t.primary_color, t.secondary_color, t.badge_pattern, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? ORDER BY t.name"
  ).bind(leagueId).all();

  const teamIds = leagueTeams.results.map((t) => t.id as string);
  if (teamIds.length === 0) return c.json({ leagueName: leagueInfo.name, standings: [], season: leagueInfo.season_number });

  const matches = await c.env.DB.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score FROM matches m
     JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.league_id = ? AND m.status = 'simulated'
       AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)`
  ).bind(leagueId, leagueId).all();

  const stats: Record<string, { wins: number; draws: number; losses: number; gf: number; ga: number; form: string[] }> = {};
  for (const tid of teamIds) stats[tid] = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, form: [] };

  for (const m of matches.results) {
    const homeId = m.home_team_id as string;
    const awayId = m.away_team_id as string;
    const hs = m.home_score as number;
    const as_ = m.away_score as number;
    if (!stats[homeId] || !stats[awayId]) continue;
    stats[homeId].gf += hs; stats[homeId].ga += as_;
    stats[awayId].gf += as_; stats[awayId].ga += hs;
    if (hs > as_) { stats[homeId].wins++; stats[homeId].form.push("W"); stats[awayId].losses++; stats[awayId].form.push("L"); }
    else if (hs < as_) { stats[awayId].wins++; stats[awayId].form.push("W"); stats[homeId].losses++; stats[homeId].form.push("L"); }
    else { stats[homeId].draws++; stats[homeId].form.push("D"); stats[awayId].draws++; stats[awayId].form.push("D"); }
  }

  const standings = teamIds.map((tid) => {
    const s = stats[tid];
    const t = leagueTeams.results.find(r => r.id === tid)!;
    return {
      teamId: tid, team: t.name as string,
      played: s.wins + s.draws + s.losses, wins: s.wins, draws: s.draws, losses: s.losses,
      gf: s.gf, ga: s.ga, points: s.wins * 3 + s.draws,
      form: s.form.slice(-5).reverse(),
      isAi: t.user_id === "ai",
      primaryColor: (t.primary_color as string) || "#2D5F2D",
      secondaryColor: (t.secondary_color as string) || "#FFFFFF",
      badgePattern: (t.badge_pattern as string) || "shield",
    };
  });

  standings.sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
  standings.forEach((s, i) => { (s as Record<string, unknown>).pos = i + 1; });

  return c.json({ leagueName: leagueInfo.name, leagueLevel: leagueInfo.level, season: leagueInfo.season_number, standings });
});

// GET /api/leagues/:leagueId/results — výsledky zápasů
leagueRouter.get("/leagues/:leagueId/results", async (c) => {
  const leagueId = c.req.param("leagueId");
  const gameWeek = c.req.query("gameWeek");

  // Id týmů jsou v odpovědi kvůli dashboardu — bez nich nejde z výsledků
  // přehrát tabulku po kolech a poznat v ní vlastní tým jinak než podle jména.
  let query = "SELECT m.id, m.round, m.home_score, m.away_score, m.status, m.attendance, m.weather, sc.game_week, sc.scheduled_at, m.home_team_id, m.away_team_id, t1.name as home_name, t1.primary_color as home_color, t2.name as away_name, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id JOIN season_calendar sc ON m.calendar_id = sc.id WHERE m.league_id = ? AND m.status = 'simulated' AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)";
  const binds: unknown[] = [leagueId, leagueId];
  if (gameWeek) { query += " AND sc.game_week = ?"; binds.push(parseInt(gameWeek)); }
  query += " ORDER BY sc.game_week DESC, m.round";

  const results = await c.env.DB.prepare(query).bind(...binds).all()
    .catch((e) => { logger.error({ module: "league" }, "fetch results", e); return { results: [] }; });

  return c.json({ results: results.results });
});

// GET /api/leagues/:leagueId/news — zpravodaj cizí ligy
leagueRouter.get("/leagues/:leagueId/news", async (c) => {
  const leagueId = c.req.param("leagueId");

  // Stejný výběr po rubrikách jako u vlastního okresu — jinak by i tady
  // přestupy vytlačily Hráče kola, Kotel a rozhovory mimo výpis.
  const { loadFeedArticles, newsIcon } = await import("../news/feed");
  const newsRows = await loadFeedArticles(c.env.DB, leagueId)
    .catch((e) => { logger.error({ module: "league" }, "fetch league news", e); return []; });

  const articles = newsRows.map((n) => ({
    id: n.id, type: n.type,
    headline: n.headline ?? n.type, body: n.body ?? "",
    icon: newsIcon(n.type),
        journalist: n.journalist_id ? {
          id: n.journalist_id,
          name: n.journalist_nick
            ? `${n.journalist_first} „${n.journalist_nick}" ${n.journalist_last}`
            : `${n.journalist_first} ${n.journalist_last}`,
          style: n.journalist_style,
        } : undefined,
    date: n.created_at, gameWeek: n.game_week,
    photos: n.photos_json ? JSON.parse(n.photos_json) : undefined,
  }));

  const seasonRow = await c.env.DB.prepare("SELECT MAX(season_number) as s FROM season_calendar WHERE league_id = ?")
    .bind(leagueId).first<{ s: number | null }>()
    .catch((e) => { logger.error({ module: "league" }, "fetch season for news", e); return null; });

  return c.json({ articles, season: seasonRow?.s ?? 1 });
});

// GET /api/leagues/:leagueId/journalists — redakce okresního zpravodaje
leagueRouter.get("/leagues/:leagueId/journalists", async (c) => {
  const leagueId = c.req.param("leagueId");
  const { ensureRedakce } = await import("../news/journalists");
  const redakce = await ensureRedakce(c.env.DB, leagueId)
    .catch((e) => { logger.error({ module: "league" }, "load redakce", e); return []; });

  return c.json({
    journalists: redakce.map((j) => ({
      id: j.id,
      firstName: j.first_name,
      lastName: j.last_name,
      nickname: j.nickname,
      age: j.age,
      style: j.style,
      bulvarnost: j.bulvarnost,
      zlomyslnost: j.zlomyslnost,
      odbornost: j.odbornost,
      bio: j.bio,
      hlaska: j.hlaska,
      avatar: (() => { try { return JSON.parse(j.avatar); } catch { return null; } })(),
    })),
  });
});

// GET /api/journalists/:id — profil redaktora včetně vztahů ke klubům a jeho článků
leagueRouter.get("/journalists/:journalistId", async (c) => {
  const id = c.req.param("journalistId");

  const j = await c.env.DB.prepare("SELECT * FROM journalists WHERE id = ?")
    .bind(id).first<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: "league" }, "load journalist", e); return null; });
  if (!j) return c.json({ error: "Redaktor nenalezen" }, 404);

  const vztahy = await c.env.DB.prepare(
    `SELECT jr.team_id, jr.sentiment, jr.duvod, t.name AS team_name
     FROM journalist_relations jr JOIN teams t ON t.id = jr.team_id
     WHERE jr.journalist_id = ? ORDER BY ABS(jr.sentiment) DESC LIMIT 12`
  ).bind(id).all().catch((e) => { logger.warn({ module: "league" }, "load vztahy", e); return { results: [] }; });

  const clanky = await c.env.DB.prepare(
    `SELECT id, type, headline, game_week, created_at FROM news
     WHERE journalist_id = ? ORDER BY created_at DESC LIMIT 12`
  ).bind(id).all().catch((e) => { logger.warn({ module: "league" }, "load clanky", e); return { results: [] }; });

  return c.json({
    journalist: {
      id: j.id,
      firstName: j.first_name,
      lastName: j.last_name,
      nickname: j.nickname,
      age: j.age,
      style: j.style,
      bulvarnost: j.bulvarnost,
      zlomyslnost: j.zlomyslnost,
      odbornost: j.odbornost,
      bio: j.bio,
      hlaska: j.hlaska,
      leagueId: j.league_id,
      avatar: (() => { try { return JSON.parse(j.avatar as string); } catch { return null; } })(),
    },
    relations: vztahy.results.map((r: Record<string, unknown>) => ({
      teamId: r.team_id, teamName: r.team_name, sentiment: r.sentiment, duvod: r.duvod,
    })),
    articles: clanky.results,
  });
});

// GET /api/leagues/:leagueId/transfers-overview — přehled přestupů v lize
leagueRouter.get("/leagues/:leagueId/transfers-overview", async (c) => {
  const leagueId = c.req.param("leagueId");

  // All completed transfers in this league (either buyer or seller is in league)
  // Get new contracts (join_type='transfer') and resolve the "from team" from previous contract
  const transfersRes = await c.env.DB.prepare(
    `SELECT
       pc.player_id, pc.team_id as to_team_id, pc.fee, pc.joined_at, pc.join_type,
       p.first_name, p.last_name, p.avatar as player_avatar, p.age, p.position,
       t_to.name as to_team_name, t_to.league_id as to_league_id,
       t_to.badge_primary_color as to_badge_primary, t_to.badge_secondary_color as to_badge_secondary,
       t_to.badge_pattern as to_badge_pattern, t_to.badge_initials as to_badge_initials, t_to.badge_symbol as to_badge_symbol,
       t_to.primary_color as to_primary_color, t_to.secondary_color as to_secondary_color,
       (SELECT pc2.team_id FROM player_contracts pc2
        WHERE pc2.player_id = pc.player_id
        AND pc2.is_active = 0
        AND pc2.leave_type IN ('transfer', 'released')
        AND pc2.left_at <= pc.joined_at
        ORDER BY pc2.left_at DESC LIMIT 1) as from_team_id
     FROM player_contracts pc
     JOIN players p ON pc.player_id = p.id
     JOIN teams t_to ON pc.team_id = t_to.id
     WHERE pc.join_type IN ('transfer', 'free_agent')
     ORDER BY pc.joined_at DESC`
  ).all().catch((e) => { logger.error({ module: "league" }, "fetch transfers", e); return { results: [] }; });

  // Get team names + league_ids for from teams (batch)
  const fromTeamIds = Array.from(new Set(
    (transfersRes.results as any[]).map((r) => r.from_team_id).filter(Boolean)
  ));
  let fromTeamsMap: Record<string, { name: string; leagueId: string | null; badgePrimary: string | null; badgeSecondary: string | null; badgePattern: string | null; badgeInitials: string | null; badgeSymbol: string | null }> = {};
  if (fromTeamIds.length > 0) {
    const placeholders = fromTeamIds.map(() => "?").join(",");
    const fromTeamsRows = await c.env.DB.prepare(
      `SELECT id, name, league_id, badge_primary_color, badge_secondary_color, badge_pattern, badge_initials, badge_symbol, primary_color, secondary_color FROM teams WHERE id IN (${placeholders})`
    ).bind(...fromTeamIds).all().catch(() => ({ results: [] }));
    for (const r of fromTeamsRows.results as any[]) {
      fromTeamsMap[r.id] = {
        name: r.name, leagueId: r.league_id,
        badgePrimary: r.badge_primary_color ?? r.primary_color,
        badgeSecondary: r.badge_secondary_color ?? r.secondary_color,
        badgePattern: r.badge_pattern,
        badgeInitials: r.badge_initials ?? deriveInitials(r.name),
        badgeSymbol: r.badge_symbol,
      };
    }
  }

  // Filter: transfers where either buyer or seller is in this league
  const leagueTransfers = (transfersRes.results as any[])
    .filter((r) => {
      const toInLeague = r.to_league_id === leagueId;
      const fromInLeague = r.from_team_id && fromTeamsMap[r.from_team_id]?.leagueId === leagueId;
      return toInLeague || fromInLeague;
    })
    .map((r) => {
      const fromTeam = r.from_team_id ? fromTeamsMap[r.from_team_id] : null;
      const isCrossLeague = fromTeam && fromTeam.leagueId !== r.to_league_id;
      const avatar = (() => { try { return JSON.parse(r.player_avatar as string); } catch (e) { logger.warn({ module: "league" }, `parse player avatar: ${e}`); return {}; } })();
      const fromBadge = fromTeam ? {
        primary: fromTeam.badgePrimary ?? "#374151",
        secondary: fromTeam.badgeSecondary ?? "#9ca3af",
        pattern: fromTeam.badgePattern ?? "shield",
        initials: fromTeam.badgeInitials ?? "?",
        symbol: fromTeam.badgeSymbol ?? null,
      } : null;
      const toBadge = {
        primary: (r.to_badge_primary as string | null) ?? (r.to_primary_color as string | null) ?? "#374151",
        secondary: (r.to_badge_secondary as string | null) ?? (r.to_secondary_color as string | null) ?? "#9ca3af",
        pattern: (r.to_badge_pattern as string | null) ?? "shield",
        initials: (r.to_badge_initials as string | null) ?? deriveInitials(r.to_team_name as string),
        symbol: (r.to_badge_symbol as string | null) ?? null,
      };
      return {
        playerId: r.player_id as string,
        playerName: `${r.first_name} ${r.last_name}`,
        playerAvatar: avatar,
        age: (r.age as number) ?? 0,
        position: (r.position as string) ?? "",
        fromTeamId: r.from_team_id as string | null,
        fromTeam: fromTeam?.name ?? null,
        fromTeamBadge: fromBadge,
        toTeamId: r.to_team_id as string,
        toTeam: r.to_team_name as string,
        toTeamBadge: toBadge,
        fee: (r.fee as number) ?? 0,
        date: r.joined_at as string,
        isCrossLeague: !!isCrossLeague,
        joinType: (r.join_type as string) ?? "transfer",
        toVirtual: false,
      };
    });

  // Prodeje do CPU (virtuálních) klubů — hráč odešel ze hry (departed_players), takže v contracts
  // není žádný "příchod". Doplníme je jako odchozí přestupy z pohledu prodávajícího týmu v lize.
  const virtualSalesRes = await c.env.DB.prepare(
    `SELECT o.player_id, o.offer_amount as fee, o.resolved_at as joined_at,
            dp.first_name, dp.last_name, dp.age, dp.position, dp.overall_rating, dp.avatar as player_avatar,
            json_extract(o.virtual_team_data, '$.name') as virtual_club,
            t.id as from_team_id, t.name as from_team_name,
            t.badge_primary_color, t.badge_secondary_color, t.badge_pattern, t.badge_initials, t.badge_symbol,
            t.primary_color, t.secondary_color
     FROM transfer_offers o
     JOIN departed_players dp ON dp.id = o.player_id
     JOIN teams t ON t.id = o.to_team_id
     WHERE o.from_team_id = 'virtual_ai' AND o.status = 'accepted' AND t.league_id = ?
     ORDER BY o.resolved_at DESC`
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "league" }, "fetch virtual sales", e); return { results: [] }; });

  const virtualSales = (virtualSalesRes.results as any[]).map((r) => {
    const fromBadge = {
      primary: (r.badge_primary_color as string | null) ?? (r.primary_color as string | null) ?? "#374151",
      secondary: (r.badge_secondary_color as string | null) ?? (r.secondary_color as string | null) ?? "#9ca3af",
      pattern: (r.badge_pattern as string | null) ?? "shield",
      initials: (r.badge_initials as string | null) ?? deriveInitials(r.from_team_name as string),
      symbol: (r.badge_symbol as string | null) ?? null,
    };
    const avatar = (() => { try { return r.player_avatar ? JSON.parse(r.player_avatar as string) : {}; } catch { return {}; } })();
    return {
      playerId: r.player_id as string,
      playerName: `${r.first_name} ${r.last_name}`,
      playerAvatar: avatar,
      age: (r.age as number) ?? 0,
      position: (r.position as string) ?? "",
      fromTeamId: r.from_team_id as string | null,
      fromTeam: r.from_team_name as string | null,
      fromTeamBadge: fromBadge,
      toTeamId: "virtual_ai",
      toTeam: (r.virtual_club as string | null) ?? "Cizí klub",
      toTeamBadge: { primary: "#4a5d43", secondary: "#e8e4d8", pattern: "shield", initials: "?", symbol: null },
      fee: (r.fee as number) ?? 0,
      date: r.joined_at as string,
      isCrossLeague: false,
      joinType: "transfer",
      toVirtual: true,
    };
  });

  // Sloučit a seřadit podle data (nejnovější první) — virtuální prodeje se propletou mezi ostatní.
  leagueTransfers.push(...virtualSales);
  leagueTransfers.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  // Placené přestupy (bez free agentů) — pro stats, biggest, sellers, buyers
  const paidTransfers = leagueTransfers.filter((t) => t.joinType === "transfer");

  const totalTransfers = paidTransfers.length;
  const totalValue = paidTransfers.reduce((s, t) => s + t.fee, 0);
  const avgFee = totalTransfers > 0 ? Math.round(totalValue / totalTransfers) : 0;
  const crossLeagueCount = paidTransfers.filter((t) => t.isCrossLeague).length;

  // Free agent signings in this league
  const faRes = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM player_contracts pc
     JOIN teams t ON pc.team_id = t.id
     WHERE pc.join_type = 'free_agent' AND t.league_id = ?`
  ).bind(leagueId).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));

  // Cross-league admin fee total (from transactions)
  const adminFeeRes = await c.env.DB.prepare(
    `SELECT SUM(ABS(amount)) as total FROM transactions tx
     JOIN teams t ON tx.team_id = t.id
     WHERE tx.type = 'transfer_admin_fee' AND t.league_id = ?`
  ).bind(leagueId).first<{ total: number }>().catch(() => ({ total: 0 }));

  // Top 10 biggest transfers (jen placené)
  const biggest = [...paidTransfers].sort((a, b) => b.fee - a.fee).slice(0, 10);

  // Top sellers (most earned) — aggregate by fromTeamId, jen placené
  type TeamBadge = { primary: string; secondary: string; pattern: string; initials: string; symbol: string | null };
  const sellersMap = new Map<string, { teamId: string; teamName: string; badge: TeamBadge | null; earned: number; count: number }>();
  for (const t of paidTransfers) {
    if (!t.fromTeamId || !t.fromTeam) continue;
    const existing = sellersMap.get(t.fromTeamId);
    if (existing) { existing.earned += t.fee; existing.count++; }
    else sellersMap.set(t.fromTeamId, { teamId: t.fromTeamId, teamName: t.fromTeam, badge: t.fromTeamBadge, earned: t.fee, count: 1 });
  }
  const topSellers = [...sellersMap.values()].sort((a, b) => b.earned - a.earned).slice(0, 5);

  // Top buyers (most spent) — aggregate by toTeamId, jen placené. Virtuální klub (odchod ze hry)
  // do kupujících nepatří — je to fiktivní tým bez profilu.
  const buyersMap = new Map<string, { teamId: string; teamName: string; badge: TeamBadge | null; spent: number; count: number }>();
  for (const t of paidTransfers) {
    if (t.toVirtual) continue;
    const existing = buyersMap.get(t.toTeamId);
    if (existing) { existing.spent += t.fee; existing.count++; }
    else buyersMap.set(t.toTeamId, { teamId: t.toTeamId, teamName: t.toTeam, badge: t.toTeamBadge, spent: t.fee, count: 1 });
  }
  const topBuyers = [...buyersMap.values()].sort((a, b) => b.spent - a.spent).slice(0, 5);

  // Most active (in + out combined)
  const activeMap = new Map<string, { teamId: string; teamName: string; badge: TeamBadge | null; in: number; out: number; total: number }>();
  for (const t of leagueTransfers) {
    if (!t.toVirtual) {
      const buyer = activeMap.get(t.toTeamId) ?? { teamId: t.toTeamId, teamName: t.toTeam, badge: t.toTeamBadge, in: 0, out: 0, total: 0 };
      buyer.in++; buyer.total++;
      activeMap.set(t.toTeamId, buyer);
    }
    if (t.fromTeamId && t.fromTeam) {
      const seller = activeMap.get(t.fromTeamId) ?? { teamId: t.fromTeamId, teamName: t.fromTeam, badge: t.fromTeamBadge, in: 0, out: 0, total: 0 };
      seller.out++; seller.total++;
      activeMap.set(t.fromTeamId, seller);
    }
  }
  const mostActive = [...activeMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  // Recent 20
  const recent = leagueTransfers.slice(0, 20);

  // Spekulace — 5 nejnověji watched hráčů z týmů v této lize (sledování od jiných týmů)
  const speculationsRes = await c.env.DB.prepare(
    `SELECT
       pw.player_id,
       p.first_name, p.last_name, p.avatar as player_avatar, p.position, p.overall_rating,
       pc.team_id as current_team_id,
       t.name as current_team_name,
       t.badge_primary_color as cur_badge_primary, t.badge_secondary_color as cur_badge_secondary,
       t.badge_pattern as cur_badge_pattern, t.badge_initials as cur_badge_initials, t.badge_symbol as cur_badge_symbol,
       t.primary_color as cur_primary_color, t.secondary_color as cur_secondary_color,
       COUNT(DISTINCT pw.team_id) as watcher_count,
       MAX(pw.created_at) as latest_watched_at
     FROM player_watchlist pw
     JOIN players p ON pw.player_id = p.id
     JOIN player_contracts pc ON pc.player_id = p.id AND pc.is_active = 1
     JOIN teams t ON pc.team_id = t.id
     WHERE t.league_id = ?
       AND pw.team_id != pc.team_id
     GROUP BY pw.player_id
     ORDER BY latest_watched_at DESC
     LIMIT 5`
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "league" }, "fetch speculations", e); return { results: [] }; });

  // Pro spekulace: dotáhnout watchery (klubové znaky bez jmen — uchování mystery)
  const specPlayerIds = (speculationsRes.results as any[]).map((r) => r.player_id as string);
  const watcherBadgesMap: Record<string, TeamBadge[]> = {};
  if (specPlayerIds.length > 0) {
    const placeholders = specPlayerIds.map(() => "?").join(",");
    const watcherRes = await c.env.DB.prepare(
      `SELECT DISTINCT pw.player_id,
         t.id as team_id,
         t.badge_primary_color as bp, t.badge_secondary_color as bs, t.badge_pattern as pat,
         t.badge_initials as ini, t.badge_symbol as sym, t.primary_color as pc, t.secondary_color as sc, t.name as tname
       FROM player_watchlist pw
       JOIN teams t ON pw.team_id = t.id
       WHERE pw.player_id IN (${placeholders})`
    ).bind(...specPlayerIds).all().catch((e) => { logger.warn({ module: "league" }, "fetch watchers", e); return { results: [] }; });
    for (const w of watcherRes.results as any[]) {
      const badge: TeamBadge = {
        primary: (w.bp as string | null) ?? (w.pc as string | null) ?? "#374151",
        secondary: (w.bs as string | null) ?? (w.sc as string | null) ?? "#9ca3af",
        pattern: (w.pat as string | null) ?? "shield",
        initials: (w.ini as string | null) ?? deriveInitials(w.tname as string),
        symbol: (w.sym as string | null) ?? null,
      };
      const pid = w.player_id as string;
      if (!watcherBadgesMap[pid]) watcherBadgesMap[pid] = [];
      watcherBadgesMap[pid].push(badge);
    }
  }

  const speculations = (speculationsRes.results as any[]).map((r) => ({
    playerId: r.player_id as string,
    playerName: `${r.first_name} ${r.last_name}`,
    playerAvatar: (() => { try { return JSON.parse(r.player_avatar as string); } catch (e) { logger.warn({ module: "league" }, `parse spec avatar: ${e}`); return {}; } })(),
    position: r.position as string,
    overallRating: (r.overall_rating as number) ?? 0,
    currentTeamId: r.current_team_id as string,
    currentTeamName: r.current_team_name as string,
    currentTeamBadge: {
      primary: (r.cur_badge_primary as string | null) ?? (r.cur_primary_color as string | null) ?? "#374151",
      secondary: (r.cur_badge_secondary as string | null) ?? (r.cur_secondary_color as string | null) ?? "#9ca3af",
      pattern: (r.cur_badge_pattern as string | null) ?? "shield",
      initials: (r.cur_badge_initials as string | null) ?? deriveInitials(r.current_team_name as string),
      symbol: (r.cur_badge_symbol as string | null) ?? null,
    },
    watcherCount: (r.watcher_count as number) ?? 0,
    watcherBadges: watcherBadgesMap[r.player_id as string] ?? [],
    latestWatchedAt: r.latest_watched_at as string,
  }));

  return c.json({
    stats: {
      totalTransfers,
      totalValue,
      avgFee,
      freeAgentSignings: faRes?.cnt ?? 0,
      crossLeagueCount,
      crossLeagueAdminTotal: adminFeeRes?.total ?? 0,
    },
    biggest,
    topSellers,
    topBuyers,
    mostActive,
    recent,
    speculations,
  });
});

export { leagueRouter };
