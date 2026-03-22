/**
 * League API routes — standings, results.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";

const leagueRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/teams/:teamId/standings — mock standings for team's league
leagueRouter.get("/teams/:teamId/standings", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  // Get matches for this team
  const matches = await c.env.DB.prepare(
    "SELECT * FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated' ORDER BY simulated_at DESC"
  ).bind(teamId, teamId).all();

  // Calculate player team stats from real matches
  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
  const form: string[] = [];

  for (const m of matches.results) {
    const isHome = m.home_team_id === teamId;
    const hs = m.home_score as number;
    const as_ = m.away_score as number;
    const myScore = isHome ? hs : as_;
    const theirScore = isHome ? as_ : hs;

    gf += myScore;
    ga += theirScore;
    if (myScore > theirScore) { wins++; form.push("W"); }
    else if (myScore < theirScore) { losses++; form.push("L"); }
    else { draws++; form.push("D"); }
  }

  const played = wins + draws + losses;
  const points = wins * 3 + draws;

  // Generate fake standings with player team included
  const fakeTeams = [
    { teamId: null as string | null, team: "SK Lhenice", played: played + 1, wins: wins + 1, draws, losses, gf: gf + 3, ga, points: points + 3, form: ["W", ...form.slice(0, 4)] },
    { teamId: teamId, team: team.name as string, played, wins, draws, losses, gf, ga, points, form: form.slice(0, 5), isPlayer: true },
    { teamId: null as string | null, team: "Sokol Netolice", played: Math.max(played, 1), wins: Math.max(wins - 1, 0), draws: draws + 1, losses: losses + 1, gf: gf - 1, ga: ga + 2, points: Math.max(points - 3, 0), form: ["D", "L", "W", "W", "L"] },
    { teamId: null as string | null, team: "TJ Husinec", played: Math.max(played, 1), wins: Math.max(wins - 1, 0), draws, losses: losses + 1, gf: gf - 2, ga: ga + 1, points: Math.max(points - 4, 0), form: ["L", "W", "L", "W", "D"] },
    { teamId: null as string | null, team: "FK Čkyně", played: Math.max(played, 1), wins: Math.max(wins - 2, 0), draws: draws + 1, losses: losses + 1, gf: gf - 3, ga: ga + 3, points: Math.max(points - 6, 0), form: ["L", "D", "L", "W", "L"] },
  ];

  // Sort by points
  fakeTeams.sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga));

  const standings = fakeTeams.map((t, i) => ({
    pos: i + 1,
    ...t,
  }));

  return c.json({
    leagueName: `Okresní přebor ${team.district}`,
    standings,
  });
});

export { leagueRouter };
