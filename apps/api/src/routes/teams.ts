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
import { generateFieldSkills, generateGKSkills, generateHiddenTalent, calculateOverallRating } from "../skills/generator";
import { generateSeasonCalendar } from "../season/calendar";
import { generateSchedule, totalRounds } from "../league/schedule";

const teamsRouter = new Hono<{ Bindings: Bindings }>();

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Generate a facesjs-compatible config on the server.
 * No DOM needed — just a JSON object that facesjs display() can render on the client.
 */
function generatePlayerFace(player: { age: number; bodyType: string }): Record<string, unknown> {
  const r = () => Math.random();
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];

  // Skin colors — white/European range
  const skinColors = ["#f2d6cb", "#ddb7a0", "#c89583", "#e8c4a0", "#f5d5c0", "#d4a882", "#eabd93"];
  // Hair colors
  const hairColors = ["#1a1a1a", "#3b2214", "#5b3a1a", "#8b6e3e", "#d4a843", "#a0330a", "#8e8e8e"];

  const headIds = ["head1", "head2", "head3", "head4", "head5", "head6", "head7", "head8", "head9", "head10"];
  const eyeIds = ["eye1", "eye2", "eye3", "eye4", "eye5", "eye6", "eye7", "eye8"];
  const noseIds = ["nose1", "nose2", "nose3", "nose4", "nose5", "nose6", "nose7", "nose8"];
  const mouthIds = ["mouth1", "mouth2", "mouth3", "mouth4", "mouth5", "mouth6"];
  const hairIds = ["hair1", "hair2", "hair3", "hair4", "hair5", "hair6", "hair7", "hair8", "hair9", "hair10", "hair11", "hair12"];
  const earIds = ["ear1", "ear2", "ear3", "ear4"];

  // Fatness based on body type
  let fatness = 0.3 + r() * 0.4;
  if (player.bodyType === "obese") fatness = 0.7 + r() * 0.3;
  else if (player.bodyType === "stocky") fatness = 0.55 + r() * 0.25;
  else if (player.bodyType === "thin") fatness = 0.05 + r() * 0.2;
  else if (player.bodyType === "athletic") fatness = 0.2 + r() * 0.2;

  // Hair: older → bald/gray
  let hairId = pick(hairIds);
  let hairColor = pick(hairColors);
  const hasBaldChance = player.age > 45 ? 0.7 : player.age > 38 ? 0.4 : player.age > 32 ? 0.15 : 0;
  if (r() < hasBaldChance) hairId = "none";
  if (player.age > 42) hairColor = r() < 0.5 ? "#8e8e8e" : "#b0b0b0";
  if (player.age > 50) hairColor = "#c0c0c0";

  const skinColor = pick(skinColors);

  return {
    fatness,
    teamColors: ["#2D5F2D", "#FFFFFF", "#1E4A1E"],
    hairBg: { id: hairId === "none" ? "none" : "hairBg1" },
    body: { id: pick(["body1", "body2", "body3"]), color: skinColor, size: 0.95 + r() * 0.1 },
    jersey: { id: "jersey" },
    ear: { id: pick(earIds), size: 0.6 + r() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness },
    eyeLine: { id: pick(["line1", "line2", "line3", "line4"]) },
    smileLine: { id: pick(["line1", "line2", "line3"]), size: 0.8 + r() * 0.4 },
    miscLine: { id: "none" },
    facialHair: { id: player.age > 20 && r() < 0.4 ? pick(["beard1", "beard2", "beard3", "beard4"]) : "none" },
    eye: { id: pick(eyeIds), angle: -5 + r() * 10 },
    eyebrow: { id: pick(["eyebrow1", "eyebrow2", "eyebrow3", "eyebrow4"]), angle: -5 + r() * 10 },
    hair: { id: hairId, color: hairColor, flip: r() < 0.5 },
    mouth: { id: pick(mouthIds), flip: r() < 0.5 },
    nose: { id: pick(noseIds), flip: r() < 0.5, size: 0.7 + r() * 0.6 },
    glasses: { id: r() < 0.08 ? pick(["glasses1", "glasses2"]) : "none" },
    accessories: { id: "none" },
  };
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

  // Get userId from auth token (or allow anonymous for now)
  let userId: string | null = null;
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { getSession } = await import("../auth/session");
    const session = await getSession(c.env.SESSION_KV, token);
    if (session) userId = String(session.userId);
  }

  if (!userId) {
    // Fallback: create anonymous user
    userId = uuid();
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
    ).bind(userId, `anon-${teamId}@temp.local`, "anonymous").run();
  }

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
  const villageSize = village.size as string;

  for (const player of squad) {
    const nickname = generateNickname(rng, player, usedNicknames) ?? "";
    const pid = uuid();
    playerIds.push(pid);

    // Skill v2: 0-100 s talent capem
    const isGK = player.position === "GK";
    const fieldSkills = !isGK ? generateFieldSkills(rng, player.position as "DEF" | "MID" | "FWD", villageSize, player.age) : null;
    const gkSkills = isGK ? generateGKSkills(rng, villageSize, player.age) : null;
    const hiddenTalent = generateHiddenTalent(rng, villageSize);

    // Skills JSON — current values for display (backward compatible)
    const skillsCurrent = isGK
      ? { speed: 0, technique: 0, shooting: 0, passing: gkSkills!.distribution.current, heading: 0, defense: 0, goalkeeping: gkSkills!.reflexes.current }
      : { speed: fieldSkills!.speed.current, technique: fieldSkills!.technique.current, shooting: fieldSkills!.shooting.current, passing: fieldSkills!.passing.current, heading: fieldSkills!.heading.current, defense: fieldSkills!.defense.current, goalkeeping: 0 };

    const physical = { stamina: isGK ? (gkSkills!.strength.current) : fieldSkills!.stamina.current, strength: isGK ? gkSkills!.strength.current : fieldSkills!.strength.current, injuryProneness: rng.int(10, 80) };
    const personality = { discipline: rng.int(10, 90), patriotism: rng.int(20, 90), alcohol: rng.int(5, 85), temper: rng.int(10, 80) };
    const lifeContext = { occupation: player.occupation, condition: 100, morale: 50 + rng.int(-15, 15) };
    const rating = calculateOverallRating(player.position, isGK ? gkSkills! : fieldSkills!, hiddenTalent);

    // Full skills JSON with maxPotential (stored in skills_max)
    const skillsMax = isGK ? gkSkills : fieldSkills;

    const description = generateDescription(rng, {
      firstName: player.firstName, lastName: player.lastName, nickname,
      age: player.age, position: player.position, occupation: player.occupation,
      bodyType: player.bodyType, alcohol: personality.alcohol, discipline: personality.discipline,
      speed: skillsCurrent.speed, shooting: skillsCurrent.shooting, technique: skillsCurrent.technique,
      patriotism: personality.patriotism,
    });

    await c.env.DB.prepare(
      "INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(pid, teamId, player.firstName, player.lastName, nickname, player.age, player.position, rating,
      JSON.stringify(skillsCurrent), JSON.stringify(physical), JSON.stringify(personality),
      JSON.stringify(lifeContext), JSON.stringify(generatePlayerFace(player)), description,
      JSON.stringify(skillsMax), hiddenTalent, isGK ? (gkSkills!.experience.current) : (fieldSkills!.experience.current),
    ).run();
  }

  // Relationships
  const rels = generateRelationships(rng, squad, villageInfo);
  for (const rel of rels) {
    await c.env.DB.prepare(
      "INSERT INTO relationships (id, player_a_id, player_b_id, type) VALUES (?, ?, ?, ?)"
    ).bind(uuid(), playerIds[rel.playerAIndex], playerIds[rel.playerBIndex], rel.type).run();
  }

  // Generate league + AI teams
  const leagueId = uuid();
  const leagueName = `Okresní přebor ${village.district as string}`;

  await c.env.DB.prepare(
    "INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget, league_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind("__update__", "", "", "", "", "", 0, "").run().catch(() => {});

  // Update player team with league
  // Create league (reuse matches table for schedule later)
  const numTeams = 14;
  const rounds = totalRounds(numTeams);

  // For now: store league info as simple metadata
  // Full league generation (AI teams + calendar) happens when first match is requested
  await c.env.DB.prepare(
    "UPDATE teams SET league_id = ? WHERE id = ?"
  ).bind(leagueId, teamId).run();

  return c.json({
    id: teamId,
    name: body.name,
    village: village.name,
    playersCount: squad.length,
    leagueId,
    leagueName,
  }, 201);
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
