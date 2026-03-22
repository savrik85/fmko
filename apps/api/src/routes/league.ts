/**
 * League API routes — standings from real DB data.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";

const leagueRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/teams/:teamId/standings — real standings from DB
leagueRouter.get("/teams/:teamId/standings", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const leagueId = team.league_id as string | null;
  if (!leagueId) return c.json({ leagueName: "", standings: [] });

  // Get all teams in league
  const leagueTeams = await c.env.DB.prepare(
    "SELECT t.id, t.name, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? ORDER BY t.name"
  ).bind(leagueId).all();

  const teamIds = leagueTeams.results.map((t) => t.id as string);
  const teamNames = Object.fromEntries(leagueTeams.results.map((t) => [t.id, t.name as string]));

  // Get all simulated matches in this league
  const placeholders = teamIds.map(() => "?").join(",");
  const matches = await c.env.DB.prepare(
    `SELECT * FROM matches WHERE status = 'simulated' AND (home_team_id IN (${placeholders}) OR away_team_id IN (${placeholders}))`
  ).bind(...teamIds, ...teamIds).all().catch(() => ({ results: [] }));

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
    const played = s.wins + s.draws + s.losses;
    return {
      teamId: tid,
      team: teamNames[tid],
      played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      gf: s.gf,
      ga: s.ga,
      points: s.wins * 3 + s.draws,
      form: s.form.slice(-5).reverse(),
      isPlayer: tid === teamId,
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
    leagueName: `Okresní přebor ${team.district}`,
    standings,
  });
});

export { leagueRouter };
