/**
 * Teams API routes: create team + trigger squad & league generation.
 */

import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { teams, players, users, villages, leagues, leagueStandings } from "@okresni-masina/db";
import type { Bindings } from "../index";
import { requireAuth } from "../auth";
import { createRng } from "../generators/rng";
import { generateSquad } from "../generators/player";
import { generateNickname } from "../generators/nickname";
import { generateRelationships } from "../generators/relationships";
import { generateLeague } from "../league";

const teamsRouter = new Hono<{ Bindings: Bindings }>();

teamsRouter.post("/", requireAuth, async (c) => {
  const session = c.get("session" as never) as { userId: number; teamId: number | null };
  if (session.teamId) {
    return c.json({ error: "Already has a team" }, 400);
  }

  const body = await c.req.json<{
    villageCode: string;
    teamName: string;
    primaryColor: string;
    secondaryColor: string;
  }>();

  if (!body.villageCode || !body.teamName) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // Load village data from R2
  const villagesObj = await c.env.SEED_DATA.get("villages.json");
  if (!villagesObj) return c.json({ error: "Seed data not found" }, 500);
  const allVillages = JSON.parse(await villagesObj.text()) as Array<Record<string, unknown>>;

  const village = allVillages.find((v) => v.code === body.villageCode) as
    { name: string; code: string; region_code: string; district: string; district_code: string; category: string; population: number; base_budget: number } | undefined;
  if (!village) return c.json({ error: "Village not found" }, 404);

  // Load name data
  const surnamesObj = await c.env.SEED_DATA.get("surnames_by_region.json");
  const firstnamesObj = await c.env.SEED_DATA.get("firstnames_by_decade.json");
  if (!surnamesObj || !firstnamesObj) return c.json({ error: "Name data not found" }, 500);

  const surnamesByRegion = JSON.parse(await surnamesObj.text());
  const firstnameData = JSON.parse(await firstnamesObj.text());
  const regionSurnames = surnamesByRegion[village.region_code] ?? surnamesByRegion["CZ020"];

  const db = drizzle(c.env.DB);
  const seed = Date.now() ^ session.userId;
  const rng = createRng(seed);

  // 1. Insert village if not exists
  let villageRow = await db.select().from(villages).where(eq(villages.code, village.code)).get();
  if (!villageRow) {
    const inserted = await db.insert(villages).values({
      name: village.name,
      code: village.code,
      district: village.district,
      region: village.region_code,
      population: village.population,
      category: village.category as "vesnice" | "obec" | "mestys" | "mesto",
      baseBudget: village.base_budget,
      playerPoolSize: 20,
      pitchType: "trava",
      createdAt: new Date().toISOString(),
    }).returning();
    villageRow = inserted[0];
  }

  // 2. Create team
  const teamResult = await db.insert(teams).values({
    villageId: villageRow.id,
    name: body.teamName,
    primaryColor: body.primaryColor || "#2D5F2D",
    secondaryColor: body.secondaryColor || "#FFFFFF",
    budget: village.base_budget,
    reputation: 50,
    isAi: false,
    createdAt: new Date().toISOString(),
  }).returning();
  const team = teamResult[0];

  // 3. Generate squad
  const villageInfo = {
    region_code: village.region_code,
    category: village.category as "vesnice" | "obec" | "mestys" | "mesto",
    population: village.population,
  };

  const squad = generateSquad(rng, villageInfo, regionSurnames, firstnameData);

  // Assign nicknames
  const usedNicknames = new Set<string>();
  for (const p of squad) {
    const nickname = generateNickname(rng, p, usedNicknames);
    (p as typeof p & { nickname: string | null }).nickname = nickname;
  }

  // 4. Insert players
  const playerIds: number[] = [];
  for (const p of squad) {
    const result = await db.insert(players).values({
      teamId: team.id,
      firstName: p.firstName,
      lastName: p.lastName,
      nickname: (p as typeof p & { nickname: string | null }).nickname,
      age: p.age,
      position: p.position,
      speed: p.speed,
      technique: p.technique,
      shooting: p.shooting,
      passing: p.passing,
      heading: p.heading,
      defense: p.defense,
      goalkeeping: p.goalkeeping,
      stamina: p.stamina,
      strength: p.strength,
      injury_proneness: p.injuryProneness,
      discipline: p.discipline,
      patriotism: p.patriotism,
      alcohol: p.alcohol,
      temper: p.temper,
      occupation: p.occupation,
      bodyType: p.bodyType,
      avatarConfig: JSON.stringify(p.avatarConfig),
      condition: p.condition,
      morale: p.morale,
      createdAt: new Date().toISOString(),
    }).returning();
    playerIds.push(result[0].id);
  }

  // 5. Generate relationships
  const rels = generateRelationships(rng, squad, villageInfo);
  for (const rel of rels) {
    await db.insert(await import("@okresni-masina/db").then((m) => m.relationships)).values({
      playerAId: playerIds[rel.playerAIndex],
      playerBId: playerIds[rel.playerBIndex],
      type: rel.type,
      strength: rel.strength,
      createdAt: new Date().toISOString(),
    });
  }

  // 6. Generate league
  const districtVillages = allVillages
    .filter((v) => v.district_code === village.district_code && v.code !== village.code) as
    Array<{ name: string; code: string; region_code: string; category: string; population: number }>;

  const league = generateLeague(
    rng, body.teamName, village, districtVillages,
    regionSurnames.surnames, firstnameData,
    village.district, "2024/2025",
  );

  // Insert league
  const leagueResult = await db.insert(leagues).values({
    name: league.name,
    district: league.district,
    level: league.level,
    season: league.season,
    totalRounds: league.totalRounds,
    status: "preparation",
    createdAt: new Date().toISOString(),
  }).returning();
  const leagueRow = leagueResult[0];

  // Update team with league
  await db.update(teams).set({ leagueId: leagueRow.id }).where(eq(teams.id, team.id));

  // Insert standings for player team
  await db.insert(leagueStandings).values({
    leagueId: leagueRow.id,
    teamId: team.id,
  });

  // 7. Update user with team
  await db.update(users).set({ teamId: team.id }).where(eq(users.id, session.userId));

  return c.json({
    team: { id: team.id, name: team.name, villageName: village.name },
    squadSize: squad.length,
    leagueName: league.name,
    leagueTeams: league.teams.length,
  }, 201);
});

export { teamsRouter };
