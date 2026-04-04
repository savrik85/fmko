/**
 * League API routes — standings from real DB data.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";

const leagueRouter = new Hono<{ Bindings: Bindings }>();

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

  // Get all simulated matches in this league
  const placeholders = teamIds.map(() => "?").join(",");
  const matches = await c.env.DB.prepare(
    `SELECT * FROM matches WHERE status = 'simulated' AND calendar_id IS NOT NULL AND (home_team_id IN (${placeholders}) OR away_team_id IN (${placeholders}))`
  ).bind(...teamIds, ...teamIds).all().catch((e) => { logger.warn({ module: "league" }, "fetch simulated matches", e); return { results: [] }; });

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
    season: leagueInfo?.season_number ?? 1,
    standings,
  });
});

// GET /api/teams/:teamId/league-stats — top scorers + assists across the league
leagueRouter.get("/teams/:teamId/league-stats", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>();
  if (!team?.league_id) return c.json({ topScorers: [], topAssists: [] });

  // Get active season
  const season = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "league" }, "fetch active season for stats", e); return null; });
  const seasonId = season?.id ?? "season-1";

  const stats = await c.env.DB.prepare(
    `SELECT ps.goals, ps.assists, ps.appearances, ps.man_of_match as motm,
       ps.yellow_cards, ps.red_cards, ps.avg_rating, ps.clean_sheets,
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
    isMyTeam: r.team_id === teamId,
  }));

  return c.json({
    topScorers: [...rows].sort((a, b) => b.goals - a.goals || b.assists - a.assists).filter((r) => r.goals > 0).slice(0, 15),
    topAssists: [...rows].sort((a, b) => b.assists - a.assists || b.goals - a.goals).filter((r) => r.assists > 0).slice(0, 15),
    topRated: [...rows].filter((r) => r.appearances >= 3 && r.avgRating > 0).sort((a, b) => b.avgRating - a.avgRating).slice(0, 10),
    mostCards: [...rows].filter((r) => r.yellowCards + r.redCards > 0).sort((a, b) => (b.yellowCards + b.redCards * 3) - (a.yellowCards + a.redCards * 3)).slice(0, 10),
    mostAppearances: [...rows].sort((a, b) => b.appearances - a.appearances).filter((r) => r.appearances > 0).slice(0, 10),
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
    "SELECT home_team_id, away_team_id, home_score, away_score FROM matches WHERE league_id = ? AND status = 'simulated' AND calendar_id IS NOT NULL"
  ).bind(leagueId).all();

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

  let query = "SELECT m.id, m.round, m.home_score, m.away_score, m.status, m.attendance, m.weather, sc.game_week, sc.scheduled_at, t1.name as home_name, t1.primary_color as home_color, t2.name as away_name, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id LEFT JOIN season_calendar sc ON m.calendar_id = sc.id WHERE m.league_id = ? AND m.status = 'simulated'";
  const binds: unknown[] = [leagueId];
  if (gameWeek) { query += " AND sc.game_week = ?"; binds.push(parseInt(gameWeek)); }
  query += " ORDER BY sc.game_week DESC, m.round";

  const results = await c.env.DB.prepare(query).bind(...binds).all()
    .catch((e) => { logger.error({ module: "league" }, "fetch results", e); return { results: [] }; });

  return c.json({ results: results.results });
});

// GET /api/leagues/:leagueId/news — zpravodaj cizí ligy
leagueRouter.get("/leagues/:leagueId/news", async (c) => {
  const leagueId = c.req.param("leagueId");

  const newsRows = await c.env.DB.prepare(
    "SELECT id, type, headline, body, game_week, created_at FROM news WHERE league_id = ? ORDER BY created_at DESC LIMIT 30"
  ).bind(leagueId).all().catch((e) => { logger.error({ module: "league" }, "fetch league news", e); return { results: [] }; });

  const iconMap: Record<string, string> = {
    round_results: "\u26BD", ai_report: "\u270D\uFE0F", transfer: "\u{1F91D}",
    seasonal: "\u{1F389}", manager_arrival: "\u{1F4CB}",
  };

  const articles = newsRows.results.map((n) => ({
    id: n.id as string, type: n.type as string,
    headline: (n.headline ?? n.type) as string, body: (n.body ?? "") as string,
    icon: iconMap[n.type as string] ?? "\u{1F4F0}",
    date: n.created_at as string, gameWeek: n.game_week as number | null,
  }));

  return c.json({ articles });
});

export { leagueRouter };
