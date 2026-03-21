/**
 * Match API routes — absence, lineup, simulace, výsledky.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { generateAbsences } from "../events/absence";
import { simulateMatch } from "../engine/simulation";
import { generateMatchCommentary } from "../engine/commentary";
import type { GeneratedPlayer } from "../generators/player";
import type { TeamSetup, Tactic, Weather } from "../engine/types";

const matchesRouter = new Hono<{ Bindings: Bindings }>();

function uuid(): string { return crypto.randomUUID(); }

// POST /api/teams/:teamId/simulate-match — simuluje zápas (Sprint 1: okamžitá simulace)
matchesRouter.post("/teams/:teamId/simulate-match", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ tactic?: string }>().catch(() => ({ tactic: "balanced" }));

  const rng = createRng(Date.now());

  // Load team + players
  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const playersResult = await c.env.DB.prepare(
    "SELECT * FROM players WHERE team_id = ? ORDER BY overall_rating DESC"
  ).bind(teamId).all();

  const players = playersResult.results.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      first_name: r.first_name as string,
      last_name: r.last_name as string,
      nickname: r.nickname as string,
      age: r.age as number,
      position: r.position as string,
      overall_rating: r.overall_rating as number,
      skills: JSON.parse(r.skills as string),
      personality: JSON.parse(r.personality as string),
      lifeContext: JSON.parse(r.life_context as string),
    };
  });

  // Generate absences
  const generatedPlayers: GeneratedPlayer[] = players.map((p) => ({
    firstName: p.first_name,
    lastName: p.last_name,
    age: p.age,
    position: p.position as "GK" | "DEF" | "MID" | "FWD",
    speed: p.skills.speed, technique: p.skills.technique,
    shooting: p.skills.shooting, passing: p.skills.passing,
    heading: p.skills.heading, defense: p.skills.defense,
    goalkeeping: p.skills.goalkeeping,
    stamina: p.skills.speed, strength: p.skills.defense,
    injuryProneness: 10, discipline: p.personality.discipline,
    patriotism: p.personality.patriotism, alcohol: p.personality.alcohol,
    temper: p.personality.temper, occupation: p.lifeContext.occupation,
    bodyType: "normal" as const, avatarConfig: {} as any,
    condition: p.lifeContext.condition ?? 100, morale: p.lifeContext.morale ?? 50,
  }));

  const absences = generateAbsences(rng, generatedPlayers);
  const absentIndices = new Set(absences.map((a) => a.playerIndex));

  // Build available lineup (exclude absent players)
  const availablePlayers = players.filter((_, i) => !absentIndices.has(i));

  // Build match players
  const buildMatchPlayers = (source: typeof players, limit: number): TeamSetup["lineup"] =>
    source.slice(0, limit).map((p) => ({
      id: p.id as number,
      firstName: p.first_name as string,
      lastName: p.last_name as string,
      nickname: (p.nickname as string) || null,
      position: p.position as "GK" | "DEF" | "MID" | "FWD",
      speed: p.skills.speed, technique: p.skills.technique,
      shooting: p.skills.shooting, passing: p.skills.passing,
      heading: p.skills.heading, defense: p.skills.defense,
      goalkeeping: p.skills.goalkeeping,
      stamina: p.skills.speed, strength: p.skills.defense,
      discipline: p.personality.discipline, alcohol: p.personality.alcohol,
      temper: p.personality.temper,
      condition: 100, morale: 60,
    }));

  const homeLineup = buildMatchPlayers(availablePlayers, 11);
  const homeSubs = buildMatchPlayers(availablePlayers.slice(11), 5);

  // Generate fake opponent
  const opponentNames = ["Sokol Netolice", "TJ Husinec", "SK Lhenice", "Jiskra Stachy", "FK Čkyně", "Slavoj Vlachovo Březí"];
  const opponentName = rng.pick(opponentNames);

  // Simple opponent: clone home players with slight randomization
  const awayLineup = homeLineup.map((p) => ({
    ...p,
    id: rng.int(1000, 9999),
    firstName: rng.pick(["Jan", "Petr", "Martin", "Tomáš", "David", "Jakub", "Ondřej", "Filip", "Adam", "Lukáš"]),
    lastName: rng.pick(["Novák", "Dvořák", "Svoboda", "Černý", "Veselý", "Horák", "Marek", "Kučera"]),
    nickname: null,
    speed: Math.max(1, p.speed + rng.int(-5, 5)),
    shooting: Math.max(1, p.shooting + rng.int(-5, 5)),
    technique: Math.max(1, p.technique + rng.int(-5, 5)),
  }));

  const tactic = (body.tactic ?? "balanced") as Tactic;

  // Simulate
  const result = simulateMatch(rng, {
    home: { teamId: 1, teamName: team.name as string, lineup: homeLineup, subs: homeSubs, tactic },
    away: { teamId: 2, teamName: opponentName, lineup: awayLineup, subs: [], tactic: rng.pick(["balanced", "defensive", "offensive"] as Tactic[]) },
    weather: rng.pick(["sunny", "cloudy", "rain"] as Weather[]),
    isHomeAdvantage: true,
  });

  // Generate commentary
  const commentary = generateMatchCommentary(rng, result.events, team.name as string, opponentName);

  // Save match
  const matchId = uuid();
  await c.env.DB.prepare(
    "INSERT INTO matches (id, home_team_id, away_team_id, home_score, away_score, status, events, commentary, simulated_at) VALUES (?, ?, ?, ?, ?, 'simulated', ?, ?, datetime('now'))"
  ).bind(matchId, teamId, "ai-opponent", result.homeScore, result.awayScore,
    JSON.stringify(result.events), JSON.stringify(commentary)).run();

  return c.json({
    matchId,
    homeTeam: team.name,
    awayTeam: opponentName,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    events: result.events,
    commentary,
    absences: absences.map((a) => ({
      playerName: generatedPlayers[a.playerIndex].firstName + " " + generatedPlayers[a.playerIndex].lastName,
      reason: a.reason,
      emoji: a.emoji,
      smsText: a.smsText,
    })),
  });
});

// GET /api/teams/:teamId/absences — generovat absence pro příští zápas
matchesRouter.get("/teams/:teamId/absences", async (c) => {
  const teamId = c.req.param("teamId");
  const rng = createRng(Date.now());

  const playersResult = await c.env.DB.prepare(
    "SELECT * FROM players WHERE team_id = ?"
  ).bind(teamId).all();

  const generatedPlayers: GeneratedPlayer[] = playersResult.results.map((row) => {
    const skills = JSON.parse(row.skills as string);
    const personality = JSON.parse(row.personality as string);
    const lifeContext = JSON.parse(row.life_context as string);
    return {
      firstName: row.first_name as string, lastName: row.last_name as string,
      age: row.age as number, position: row.position as any,
      speed: skills.speed, technique: skills.technique, shooting: skills.shooting,
      passing: skills.passing, heading: skills.heading, defense: skills.defense,
      goalkeeping: skills.goalkeeping, stamina: skills.speed, strength: skills.defense,
      injuryProneness: 10, discipline: personality.discipline,
      patriotism: personality.patriotism, alcohol: personality.alcohol,
      temper: personality.temper, occupation: lifeContext.occupation,
      bodyType: "normal" as const, avatarConfig: {} as any,
      condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
    };
  });

  const absences = generateAbsences(rng, generatedPlayers);

  return c.json(playersResult.results.map((row, i) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    position: row.position,
    available: !absences.find((a) => a.playerIndex === i),
    absence: absences.find((a) => a.playerIndex === i) ?? null,
  })));
});

// GET /api/matches/:id — detail zápasu
matchesRouter.get("/matches/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM matches WHERE id = ?")
    .bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "Match not found" }, 404);
  return c.json({
    ...row,
    events: JSON.parse((row.events as string) ?? "[]"),
    commentary: JSON.parse((row.commentary as string) ?? "[]"),
  });
});

export { matchesRouter };
