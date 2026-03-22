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
import { generateSquad, type GeneratedPlayer } from "../generators/player";
import { generateNickname } from "../generators/nickname";
import { generateRelationships } from "../generators/relationships";
import { generateDescription } from "../generators/description-generator";
import { generateFieldSkills, generateGKSkills, generateHiddenTalent, calculateOverallRating } from "../skills/generator";
import { generateSeasonCalendar } from "../season/calendar";
import { pickOccupation } from "../generators/occupations";
import { totalRounds } from "../league/schedule";
import { generateLeague } from "../league/league-generator";
import { applyManagerModifiers } from "../generators/manager-effects";
import type { ManagerBackstory } from "@okresni-masina/shared";

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

  // Skin colors — white/European only
  const skinColors = ["#f2d6cb", "#ddb7a0", "#e8c4a0", "#f5d5c0", "#d4a882", "#eabd93", "#f0c8a8"];
  // Hair colors — European
  const hairColors = ["#1a1a1a", "#3b2214", "#5b3a1a", "#8b6e3e", "#d4a843", "#a0330a"];

  // Real facesjs IDs (verified from generate() output)
  const headIds = ["head1", "head3", "head6", "head8", "head9", "head10", "head11", "head13"];
  const eyeIds = ["eye1", "eye3", "eye6", "eye9", "eye11", "eye13", "eye16"];
  const noseIds = ["nose1", "nose2", "nose6", "nose9", "nose13", "nose14", "honker", "pinocchio"];
  const mouthIds = ["mouth", "mouth2", "mouth3", "mouth5", "smile3", "smile4", "straight", "closed"];
  const hairIds = ["short-fade", "tall-fade", "crop-fade2", "fauxhawk-fade", "spike4", "curly", "shaggy1", "emo", "short-bald"];
  const earIds = ["ear1", "ear2", "ear3"];
  const eyebrowIds = ["eyebrow2", "eyebrow3", "eyebrow4", "eyebrow7", "eyebrow10", "eyebrow13", "eyebrow14", "eyebrow16", "eyebrow20"];
  const facialHairIds = ["none", "none", "none", "goatee3", "goatee4", "goatee6", "goatee15", "fullgoatee2", "goatee-thin-stache"];

  // Fatness based on body type
  let fatness = 0.3 + r() * 0.4;
  if (player.bodyType === "obese") fatness = 0.7 + r() * 0.3;
  else if (player.bodyType === "stocky") fatness = 0.55 + r() * 0.25;
  else if (player.bodyType === "thin") fatness = 0.05 + r() * 0.2;
  else if (player.bodyType === "athletic") fatness = 0.15 + r() * 0.2;

  // Hair: older → bald/gray
  let hairId = pick(hairIds);
  let hairColor = pick(hairColors);
  if (player.age > 45 && r() < 0.6) hairId = "short-bald";
  else if (player.age > 38 && r() < 0.35) hairId = "short-bald";
  if (player.age > 42) hairColor = r() < 0.5 ? "#8e8e8e" : "#b0b0b0";
  if (player.age > 50) hairColor = "#c0c0c0";

  // Facial hair — more likely for older players
  let facialHairId = "none";
  if (player.age > 20 && r() < 0.35) facialHairId = pick(facialHairIds);

  const skinColor = pick(skinColors);

  return {
    fatness,
    teamColors: ["#2D5F2D", "#FFFFFF", "#1E4A1E"],
    hairBg: { id: "none" },
    body: { id: pick(["body", "body2", "body3", "body5"]), color: skinColor, size: 0.95 + r() * 0.1 },
    jersey: { id: "jersey" },
    ear: { id: pick(earIds), size: 0.6 + r() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness },
    eyeLine: { id: pick(["line1", "line2", "line3", "line4"]) },
    smileLine: { id: pick(["line1", "line2", "line3"]), size: 0.8 + r() * 0.4 },
    miscLine: { id: "none" },
    facialHair: { id: facialHairId },
    eye: { id: pick(eyeIds), angle: -4 + r() * 8 },
    eyebrow: { id: pick(eyebrowIds), angle: -4 + r() * 8 },
    hair: { id: hairId, color: hairColor, flip: r() < 0.5 },
    mouth: { id: pick(mouthIds), flip: r() < 0.5 },
    nose: { id: pick(noseIds), flip: r() < 0.5, size: 0.7 + r() * 0.6 },
    glasses: { id: r() < 0.08 ? "glasses1" : "none" },
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
    managerName?: string;
    managerBackstory?: ManagerBackstory;
    managerAvatar?: Record<string, unknown>;
    jerseyPattern?: string;
    badgePattern?: string;
    stadiumName?: string;
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
    "INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget, jersey_pattern, badge_pattern, stadium_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(teamId, userId, body.villageId, body.name,
    body.primaryColor ?? "#2D5F2D", body.secondaryColor ?? "#FFFFFF", budget,
    body.jerseyPattern ?? "solid", body.badgePattern ?? "shield", body.stadiumName ?? null).run();

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

  // Apply manager backstory effects to squad
  const managerMods = body.managerBackstory
    ? applyManagerModifiers(squad, body.managerBackstory, rng)
    : null;

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

    // Height & weight based on position + bodyType
    const baseHeight = player.position === "GK" ? 185 : player.position === "DEF" ? 180 : player.position === "FWD" ? 178 : 176;
    const height = baseHeight + rng.int(-8, 8);
    const baseWeight = player.bodyType === "obese" ? 100 : player.bodyType === "stocky" ? 88 : player.bodyType === "thin" ? 68 : player.bodyType === "athletic" ? 78 : 80;
    const weight = baseWeight + rng.int(-5, 8);

    const physical = {
      stamina: isGK ? (gkSkills!.strength.current) : fieldSkills!.stamina.current,
      strength: isGK ? gkSkills!.strength.current : fieldSkills!.strength.current,
      injuryProneness: rng.int(10, 80),
      height,
      weight,
    };
    const playerIndex = squad.indexOf(player);
    const pMod = managerMods?.personalityMods[playerIndex];
    const personality = {
      discipline: Math.min(100, rng.int(10, 90) + (pMod?.discipline ?? 0)),
      patriotism: Math.min(100, rng.int(20, 90) + (pMod?.patriotism ?? 0)),
      alcohol: rng.int(5, 85),
      temper: rng.int(10, 80),
    };
    // Pick occupation based on village size
    const occ = pickOccupation(rng, villageSize, player.age);
    const baseMorale = 50 + rng.int(-15, 15) + (managerMods?.moraleMods[playerIndex] ?? 0);
    const lifeContext = { occupation: occ.name, condition: 100, morale: Math.max(10, Math.min(90, baseMorale)) };
    const rating = calculateOverallRating(player.position, isGK ? gkSkills! : fieldSkills!, hiddenTalent);

    // Full skills JSON with maxPotential (stored in skills_max)
    const skillsMax = isGK ? gkSkills : fieldSkills;

    const description = generateDescription(rng, {
      firstName: player.firstName, lastName: player.lastName, nickname,
      age: player.age, position: player.position, occupation: occ.name,
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
  // Add manager backstory extra relationships
  if (managerMods?.extraRelationships) {
    rels.push(...managerMods.extraRelationships);
  }
  for (const rel of rels) {
    await c.env.DB.prepare(
      "INSERT INTO relationships (id, player_a_id, player_b_id, type) VALUES (?, ?, ?, ?)"
    ).bind(uuid(), playerIds[rel.playerAIndex], playerIds[rel.playerBIndex], rel.type).run();
  }

  // Create manager profile (graceful — table may not exist before migration 0006)
  if (body.managerName && body.managerBackstory) {
    await c.env.DB.prepare(
      "INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(uuid(), userId, teamId, body.managerName, body.managerBackstory,
      JSON.stringify(body.managerAvatar ?? {})).run().catch(() => {});
  }

  // ── Generate league with AI teams ──
  const leagueId = uuid();
  const district = village.district as string;

  // Get all villages in same district for AI teams
  const districtVillages = await c.env.DB.prepare(
    "SELECT id as code, name, district, region as region_code, population, size as category FROM villages WHERE district = ? AND id != ?"
  ).bind(district, body.villageId).all();

  const playerVillage = {
    name: village.name as string,
    code: body.villageId,
    region_code: village.region as string || "CZ020",
    category: villageInfo.category,
    population: village.population as number,
  };

  const leagueSetup = generateLeague(
    rng,
    body.name,
    playerVillage,
    districtVillages.results.map((v) => ({
      name: v.name as string,
      code: v.code as string,
      region_code: v.region_code as string || "CZ020",
      category: (v.category as string) === "hamlet" ? "vesnice"
        : (v.category as string) === "village" ? "obec"
        : (v.category as string) === "town" ? "mestys" : "mesto",
      population: v.population as number,
    })),
    surnameData.surnames,
    { male: firstnameData.male },
    district,
  );

  // Set league on player team
  await c.env.DB.prepare(
    "UPDATE teams SET league_id = ? WHERE id = ?"
  ).bind(leagueId, teamId).run();

  // Insert AI teams + their players into DB
  for (const lt of leagueSetup.teams) {
    if (lt.isPlayer) continue; // Skip player team — already inserted

    const aiTeamId = uuid();
    const aiVillage = districtVillages.results.find((v) => v.code === lt.villageCode);
    const aiVillageId = aiVillage?.code as string ?? body.villageId;
    const aiBudget = (aiVillage?.population as number ?? 500) > 5000 ? 80000
      : (aiVillage?.population as number ?? 500) > 1000 ? 40000 : 20000;

    await c.env.DB.prepare(
      "INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget, league_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(aiTeamId, "ai", aiVillageId, lt.teamName, lt.primaryColor, lt.secondaryColor, aiBudget, leagueId).run();

    // Insert AI players
    if (lt.aiTeam?.squad) {
      const aiPlayerIds: string[] = [];
      for (const ap of lt.aiTeam.squad) {
        const apId = uuid();
        aiPlayerIds.push(apId);
        const apNickname = (ap as GeneratedPlayer & { nickname?: string | null }).nickname ?? "";
        const isGK = ap.position === "GK";
        const apFieldSkills = !isGK ? generateFieldSkills(rng, ap.position as "DEF" | "MID" | "FWD", villageSize, ap.age) : null;
        const apGkSkills = isGK ? generateGKSkills(rng, villageSize, ap.age) : null;
        const apHiddenTalent = generateHiddenTalent(rng, villageSize);

        const apSkills = isGK
          ? { speed: 0, technique: 0, shooting: 0, passing: apGkSkills!.distribution.current, heading: 0, defense: 0, goalkeeping: apGkSkills!.reflexes.current }
          : { speed: apFieldSkills!.speed.current, technique: apFieldSkills!.technique.current, shooting: apFieldSkills!.shooting.current, passing: apFieldSkills!.passing.current, heading: apFieldSkills!.heading.current, defense: apFieldSkills!.defense.current, goalkeeping: 0 };

        const apHeight = (ap.position === "GK" ? 185 : ap.position === "DEF" ? 180 : ap.position === "FWD" ? 178 : 176) + rng.int(-8, 8);
        const apBaseWeight = ap.bodyType === "obese" ? 100 : ap.bodyType === "stocky" ? 88 : ap.bodyType === "thin" ? 68 : ap.bodyType === "athletic" ? 78 : 80;
        const apWeight = apBaseWeight + rng.int(-5, 8);

        const apPhysical = {
          stamina: isGK ? apGkSkills!.strength.current : apFieldSkills!.stamina.current,
          strength: isGK ? apGkSkills!.strength.current : apFieldSkills!.strength.current,
          injuryProneness: rng.int(10, 80), height: apHeight, weight: apWeight,
        };
        const apPersonality = { discipline: rng.int(10, 90), patriotism: rng.int(20, 90), alcohol: rng.int(5, 85), temper: rng.int(10, 80) };
        const apOcc = pickOccupation(rng, villageSize, ap.age);
        const apLifeContext = { occupation: apOcc.name, condition: 100, morale: 50 + rng.int(-15, 15) };
        const apRating = calculateOverallRating(ap.position, isGK ? apGkSkills! : apFieldSkills!, apHiddenTalent);
        const apDescription = generateDescription(rng, {
          firstName: ap.firstName, lastName: ap.lastName, nickname: apNickname,
          age: ap.age, position: ap.position, occupation: apOcc.name,
          bodyType: ap.bodyType, alcohol: apPersonality.alcohol, discipline: apPersonality.discipline,
          speed: apSkills.speed, shooting: apSkills.shooting, technique: apSkills.technique,
          patriotism: apPersonality.patriotism,
        });

        await c.env.DB.prepare(
          "INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(apId, aiTeamId, ap.firstName, ap.lastName, apNickname, ap.age, ap.position, apRating,
          JSON.stringify(apSkills), JSON.stringify(apPhysical), JSON.stringify(apPersonality),
          JSON.stringify(apLifeContext), JSON.stringify(generatePlayerFace(ap)), apDescription,
          JSON.stringify(isGK ? apGkSkills : apFieldSkills), apHiddenTalent,
          isGK ? apGkSkills!.experience.current : apFieldSkills!.experience.current,
        ).run();
      }

      // AI team relationships
      if (lt.aiTeam.relationships) {
        for (const rel of lt.aiTeam.relationships) {
          if (rel.playerAIndex < aiPlayerIds.length && rel.playerBIndex < aiPlayerIds.length) {
            await c.env.DB.prepare(
              "INSERT INTO relationships (id, player_a_id, player_b_id, type) VALUES (?, ?, ?, ?)"
            ).bind(uuid(), aiPlayerIds[rel.playerAIndex], aiPlayerIds[rel.playerBIndex], rel.type).run();
          }
        }
      }
    }
  }

  return c.json({
    id: teamId,
    name: body.name,
    village: village.name,
    playersCount: squad.length,
    leagueId,
    leagueName: leagueSetup.name,
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

// GET /api/teams/:id/league-teams — all teams in same league
teamsRouter.get("/:id/league-teams", async (c) => {
  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(c.req.param("id")).first<{ league_id: string }>();
  if (!team?.league_id) return c.json([]);

  const result = await c.env.DB.prepare(
    "SELECT t.id, t.name, t.primary_color, t.secondary_color, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? ORDER BY t.name"
  ).bind(team.league_id).all();
  return c.json(result.results);
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
