/**
 * Sprint 1: Teams API — raw SQL on D1.
 * POST /api/teams — vytvoří tým + generuje kádr
 * GET /api/teams/:id — detail
 * GET /api/teams/:id/players — seznam hráčů
 * GET /api/teams/:id/players/:playerId — detail hráče
 * GET /api/teams/:id/relationships — vazby
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { generateSquad } from "../generators/player";
import { generateNickname } from "../generators/nickname";
import { generateRelationships } from "../generators/relationships";
import { generateDescription } from "../generators/description-generator";

const teamsRouter = new Hono<{ Bindings: Bindings }>();

function uuid(): string {
  return crypto.randomUUID();
}

function overallRating(position: string, skills: Record<string, number>): number {
  if (position === "GK") return Math.round((skills.goalkeeping * 2 + skills.defense + skills.passing) / 4);
  if (position === "DEF") return Math.round((skills.defense * 2 + skills.heading + skills.speed) / 4);
  if (position === "MID") return Math.round((skills.technique + skills.passing * 2 + skills.speed) / 4);
  return Math.round((skills.shooting * 2 + skills.speed + skills.technique) / 4);
}

// POST /api/teams
teamsRouter.post("/", async (c) => {
  const body = await c.req.json<{
    villageId: string;
    name: string;
    primaryColor?: string;
    secondaryColor?: string;
  }>();

  if (!body.villageId || !body.name) {
    return c.json({ error: "Missing villageId or name" }, 400);
  }

  const village = await c.env.DB.prepare("SELECT * FROM villages WHERE id = ?")
    .bind(body.villageId).first<Record<string, unknown>>();
  if (!village) return c.json({ error: "Village not found" }, 404);

  const teamId = uuid();
  const userId = uuid();

  // Temp user (no auth in Sprint 1)
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  ).bind(userId, `user-${teamId}@temp.local`, "no-auth-sprint1").run();

  const budget = (village.population as number) > 5000 ? 80000
    : (village.population as number) > 1000 ? 40000 : 20000;

  await c.env.DB.prepare(
    "INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(teamId, userId, body.villageId, body.name,
    body.primaryColor ?? "#2D5F2D", body.secondaryColor ?? "#FFFFFF", budget).run();

  // Generate squad
  const rng = createRng(Date.now());
  const villageInfo = {
    region_code: "CZ020",
    category: (village.size as string) === "hamlet" ? "vesnice" as const
      : (village.size as string) === "village" ? "obec" as const
      : (village.size as string) === "town" ? "mestys" as const
      : "mesto" as const,
    population: village.population as number,
  };

  const surnameData = {
    surnames: {
      "Novák": 0.045, "Svoboda": 0.038, "Novotný": 0.036, "Dvořák": 0.035,
      "Černý": 0.032, "Procházka": 0.030, "Kučera": 0.028, "Veselý": 0.026,
      "Horák": 0.024, "Němec": 0.023, "Pokorný": 0.022, "Marek": 0.021,
      "Hájek": 0.019, "Jelínek": 0.018, "Král": 0.017, "Fiala": 0.015,
      "Sedláček": 0.015, "Kolář": 0.013, "Bartoš": 0.012, "Kovář": 0.011,
    },
    female_forms: {} as Record<string, string>,
  };

  const firstnameData = {
    male: {
      "1960s": { "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06, "Jaroslav": 0.05, "Milan": 0.05, "Zdeněk": 0.04 },
      "1970s": { "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Jiří": 0.06, "Pavel": 0.05, "Tomáš": 0.04, "Roman": 0.03 },
      "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05, "David": 0.05, "Lukáš": 0.04 },
      "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05, "Ondřej": 0.05, "Filip": 0.04 },
      "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05, "Filip": 0.05, "Vojtěch": 0.04 },
      "2010s": { "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05, "Filip": 0.05, "Tomáš": 0.05, "Šimon": 0.04 },
    },
    female: {} as Record<string, Record<string, number>>,
  };

  const squad = generateSquad(rng, villageInfo, surnameData, firstnameData);
  const usedNicknames = new Set<string>();
  const playerIds: string[] = [];

  for (const player of squad) {
    const nickname = generateNickname(rng, player, usedNicknames) ?? "";
    const pid = uuid();
    playerIds.push(pid);

    const skills = { speed: player.speed, technique: player.technique, shooting: player.shooting, passing: player.passing, heading: player.heading, defense: player.defense, goalkeeping: player.goalkeeping };
    const physical = { stamina: player.stamina, strength: player.strength, injuryProneness: player.injuryProneness };
    const personality = { discipline: player.discipline, patriotism: player.patriotism, alcohol: player.alcohol, temper: player.temper };
    const lifeContext = { occupation: player.occupation, condition: player.condition, morale: player.morale };
    const rating = overallRating(player.position, skills);

    const description = generateDescription(rng, {
      firstName: player.firstName, lastName: player.lastName, nickname,
      age: player.age, position: player.position, occupation: player.occupation,
      bodyType: player.bodyType, alcohol: player.alcohol, discipline: player.discipline,
      speed: player.speed, shooting: player.shooting, technique: player.technique,
      patriotism: player.patriotism,
    });

    await c.env.DB.prepare(
      "INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(pid, teamId, player.firstName, player.lastName, nickname, player.age, player.position, rating,
      JSON.stringify(skills), JSON.stringify(physical), JSON.stringify(personality),
      JSON.stringify(lifeContext), JSON.stringify(player.avatarConfig), description).run();
  }

  // Relationships
  const rels = generateRelationships(rng, squad, villageInfo);
  for (const rel of rels) {
    await c.env.DB.prepare(
      "INSERT INTO relationships (id, player_a_id, player_b_id, type) VALUES (?, ?, ?, ?)"
    ).bind(uuid(), playerIds[rel.playerAIndex], playerIds[rel.playerBIndex], rel.type).run();
  }

  return c.json({ id: teamId, name: body.name, village: village.name, playersCount: squad.length }, 201);
});

// GET /api/teams/:id
teamsRouter.get("/:id", async (c) => {
  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.population, v.size, v.district, v.region FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(c.req.param("id")).first();
  if (!team) return c.json({ error: "Team not found" }, 404);
  return c.json(team);
});

// GET /api/teams/:id/players
teamsRouter.get("/:id/players", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT * FROM players WHERE team_id = ? ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 WHEN 'FWD' THEN 3 END, overall_rating DESC"
  ).bind(c.req.param("id")).all();

  const players = result.results.map((row) => ({
    ...row,
    skills: JSON.parse(row.skills as string),
    physical: JSON.parse(row.physical as string),
    personality: JSON.parse(row.personality as string),
    lifeContext: JSON.parse(row.life_context as string),
    avatar: JSON.parse(row.avatar as string),
  }));
  return c.json(players);
});

// GET /api/teams/:id/players/:playerId
teamsRouter.get("/:id/players/:playerId", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM players WHERE id = ?")
    .bind(c.req.param("playerId")).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "Player not found" }, 404);
  return c.json({
    ...row,
    skills: JSON.parse(row.skills as string),
    physical: JSON.parse(row.physical as string),
    personality: JSON.parse(row.personality as string),
    lifeContext: JSON.parse(row.life_context as string),
    avatar: JSON.parse(row.avatar as string),
  });
});

// GET /api/teams/:id/relationships
teamsRouter.get("/:id/relationships", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT r.*, pa.first_name || ' ' || pa.last_name as player_a_name, pb.first_name || ' ' || pb.last_name as player_b_name
    FROM relationships r JOIN players pa ON r.player_a_id = pa.id JOIN players pb ON r.player_b_id = pb.id WHERE pa.team_id = ?`
  ).bind(c.req.param("id")).all();
  return c.json(result.results);
});

export { teamsRouter };
