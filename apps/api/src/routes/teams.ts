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
import { totalRounds, generateSchedule } from "../league/schedule";
import { generateLeague } from "../league/league-generator";
import { applyManagerModifiers } from "../generators/manager-effects";
import { generateManagerAttributes } from "../generators/manager-generator";
import { initTeamConversations } from "./messaging";
import { generateResidence } from "../generators/residence";
import { getDistrictDataFromDB } from "../data/districts";
import type { ManagerBackstory } from "@okresni-masina/shared";
import { logger } from "../lib/logger";

const teamsRouter = new Hono<{ Bindings: Bindings }>();

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Generate a facesjs-compatible config on the server.
 * No DOM needed — just a JSON object that facesjs display() can render on the client.
 */
export function generatePlayerFace(player: { age: number; bodyType: string }): Record<string, unknown> {
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
  let step = "init";
  try {
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
    sponsor?: {
      name: string;
      type: string;
      seasonBonus: number;
      seasons: number;
      terminationFee: number;
      isNamingRights: boolean;
    };
  }>();

  if (!body.villageId || !body.name) {
    return c.json({ error: "Missing villageId or name" }, 400);
  }

  const village = await c.env.DB.prepare("SELECT * FROM villages WHERE id = ?")
    .bind(body.villageId).first<Record<string, unknown>>();
  if (!village) return c.json({ error: "Village not found" }, 404);

  let teamId = uuid();

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
    return c.json({ error: "Musíš být přihlášen" }, 401);
  }

  // Prevent duplicate team creation — jeden uživatel = jeden tým
  const existingTeam = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id = ? AND user_id <> 'ai' LIMIT 1"
  ).bind(userId).first<{ id: string }>();
  logger.info({ module: "teams" }, `duplicate check: userId=${userId}, existingTeam=${existingTeam?.id ?? "NONE"}`);
  if (existingTeam) {
    const existingName = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(existingTeam.id).first<{ name: string }>();
    logger.info({ module: "teams" }, `returning existing team: ${existingTeam.id} (${existingName?.name})`);
    return c.json({ id: existingTeam.id, name: existingName?.name ?? "", existing: true }, 200);
  }

  const budget = (village.population as number) > 5000 ? 80000
    : (village.population as number) > 1000 ? 40000 : 20000;

  step = "insert-team";
  await c.env.DB.prepare(
    "INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget, jersey_pattern, badge_pattern, stadium_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(teamId, userId, body.villageId, body.name,
    body.primaryColor ?? "#2D5F2D", body.secondaryColor ?? "#FFFFFF", budget,
    body.jerseyPattern ?? "solid", body.badgePattern ?? "shield", body.stadiumName ?? null).run();

  // Create sponsor contract if selected during onboarding (naming rights = main sponsor)
  if (body.sponsor) {
    // Naming rights sponzor (jméno v názvu klubu/stadionu) by měl dávat více
    const baseMonthly = Math.round(body.sponsor.seasonBonus / 10);
    const monthlyAmount = body.sponsor.isNamingRights ? Math.max(3000, baseMonthly * 5) : Math.max(1000, baseMonthly * 3);
    const winBonus = Math.round(monthlyAmount * 0.15);
    await c.env.DB.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, win_bonus,
        seasons_total, seasons_remaining, early_termination_fee, is_naming_rights, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(uuid(), teamId, body.sponsor.name, body.sponsor.type, monthlyAmount, winBonus,
      body.sponsor.seasons, body.sponsor.seasons, body.sponsor.terminationFee,
      body.sponsor.isNamingRights ? 1 : 0, "main",
    ).run().catch((e) => logger.warn({ module: "teams" }, "insert sponsor contract", e));
  }

  step = "generate-squad";
  const rng = createRng(Date.now());
  const villageInfo = {
    region_code: "CZ020",
    category: (village.size as string) === "hamlet" ? "vesnice" as const
      : (village.size as string) === "village" ? "obec" as const
      : (village.size as string) === "town" ? "mestys" as const
      : "mesto" as const,
    population: village.population as number,
    district: village.district as string,
  };

  // District-specific surnames from DB (weighted by local frequency)
  const districtData = await getDistrictDataFromDB(c.env.DB, village.district as string);
  const surnameData = {
    surnames: districtData.surnames,
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
  const playerConvData: Array<{ id: string; firstName: string; lastName: string; nickname?: string; avatar: string }> = [];
  const playerResidences: string[] = []; // residence name per player index
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

    // Skills JSON — current values for display (backward compatible + new skills)
    const skillsCurrent = isGK
      ? { speed: 0, technique: 0, shooting: 0, passing: gkSkills!.distribution.current, heading: 0, defense: 0, goalkeeping: gkSkills!.reflexes.current, creativity: 0, setPieces: 0 }
      : { speed: fieldSkills!.speed.current, technique: fieldSkills!.technique.current, shooting: fieldSkills!.shooting.current, passing: fieldSkills!.passing.current, heading: fieldSkills!.heading.current, defense: fieldSkills!.defense.current, goalkeeping: 0, creativity: fieldSkills!.creativity.current, setPieces: fieldSkills!.setPieces.current };

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
      preferredFoot: player.preferredFoot,
      preferredSide: player.preferredSide,
    };
    const playerIndex = squad.indexOf(player);
    const pMod = managerMods?.personalityMods[playerIndex];
    const personality = {
      discipline: Math.min(100, rng.int(10, 90) + (pMod?.discipline ?? 0)),
      patriotism: Math.min(100, rng.int(20, 90) + (pMod?.patriotism ?? 0)),
      alcohol: rng.int(5, 85),
      temper: rng.int(10, 80),
      leadership: player.leadership,
      workRate: player.workRate,
      aggression: player.aggression,
      consistency: player.consistency,
      clutch: player.clutch,
    };
    // Pick occupation based on village size
    const occ = pickOccupation(rng, villageSize, player.age, village.district as string);
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

    const res = generateResidence(rng, village.name as string, village.size as string, village.district as string);
    playerResidences.push(res.residence);

    await c.env.DB.prepare(
      "INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience, residence, commute_km, weekly_wage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(pid, teamId, player.firstName, player.lastName, nickname, player.age, player.position, rating,
      JSON.stringify(skillsCurrent), JSON.stringify(physical), JSON.stringify(personality),
      JSON.stringify(lifeContext), JSON.stringify(generatePlayerFace(player)), description,
      JSON.stringify(skillsMax), hiddenTalent, isGK ? (gkSkills!.experience.current) : (fieldSkills!.experience.current),
      res.residence, res.commuteKm, Math.round(10 + rating * 4),
    ).run();

    playerConvData.push({
      id: pid,
      firstName: player.firstName,
      lastName: player.lastName,
      nickname: nickname || undefined,
      avatar: JSON.stringify(generatePlayerFace(player)),
    });
  }

  // Relationships
  const rels = generateRelationships(rng, squad, villageInfo);
  // Add manager backstory extra relationships
  if (managerMods?.extraRelationships) {
    rels.push(...managerMods.extraRelationships);
  }
  // Add neighbors — players who live in the same non-home village
  const residenceGroups = new Map<string, number[]>();
  playerResidences.forEach((res, i) => {
    if (res !== (village.name as string)) {
      const group = residenceGroups.get(res) ?? [];
      group.push(i);
      residenceGroups.set(res, group);
    }
  });
  for (const [, group] of residenceGroups) {
    if (group.length >= 2) {
      rels.push({ playerAIndex: group[0], playerBIndex: group[1], type: "neighbors", strength: rng.int(35, 60) });
    }
  }
  for (const rel of rels) {
    await c.env.DB.prepare(
      "INSERT INTO relationships (id, player_a_id, player_b_id, type) VALUES (?, ?, ?, ?)"
    ).bind(uuid(), playerIds[rel.playerAIndex], playerIds[rel.playerBIndex], rel.type).run();
  }

  // Assign squad numbers (1 = GK, 2-5 DEF, 6-8 MID, 9-11 FWD, rest 12+)
  {
    const posOrder = ["GK", "DEF", "MID", "FWD"];
    const sorted = playerIds.map((pid, i) => ({ pid, pos: squad[i].position, i }))
      .sort((a, b) => posOrder.indexOf(a.pos) - posOrder.indexOf(b.pos));
    let num = 1;
    for (const { pid } of sorted) {
      await c.env.DB.prepare("UPDATE players SET squad_number = ? WHERE id = ?").bind(num, pid).run().catch(() => {});
      num++;
    }
  }

  // Create manager profile (graceful — table may not exist before migration 0006)
  if (body.managerName && body.managerBackstory) {
    const mgrAttrs = generateManagerAttributes(body.managerBackstory, rng);
    await c.env.DB.prepare(
      "INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, age, coaching, motivation, tactics, youth_development, discipline, reputation, bio, birthplace) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(uuid(), userId, teamId, body.managerName, body.managerBackstory,
      JSON.stringify(body.managerAvatar ?? {}),
      mgrAttrs.age, mgrAttrs.coaching, mgrAttrs.motivation, mgrAttrs.tactics,
      mgrAttrs.youthDevelopment, mgrAttrs.discipline, mgrAttrs.reputation, mgrAttrs.bio,
      mgrAttrs.birthplace,
    ).run().catch((e) => logger.warn({ module: "teams" }, "insert manager profile", e));
  }

  step = "league-setup";
  // Ensure AI user exists
  await c.env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none')").run().catch(() => {});
  const district = village.district as string;

  // Get current active season (or create season 1)
  let season = await c.env.DB.prepare(
    "SELECT id, number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string; number: number }>();
  if (!season) {
    const seasonId = "season-1";
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO seasons (id, number, status) VALUES (?, 1, 'active')"
    ).bind(seasonId).run();
    season = { id: seasonId, number: 1 };
  }

  // Check if a league already exists in this district for current season
  const existingLeague = await c.env.DB.prepare(
    "SELECT id, name FROM leagues WHERE district = ? AND season_id = ? AND status = 'active' LIMIT 1"
  ).bind(district, season.id).first<{ id: string; name: string }>();

  if (existingLeague) {
    // ── JOIN existing league: replace a random AI team ──
    const aiTeam = await c.env.DB.prepare(
      "SELECT id FROM teams WHERE league_id = ? AND user_id = 'ai' ORDER BY RANDOM() LIMIT 1"
    ).bind(existingLeague.id).first<{ id: string }>();

    if (aiTeam) {
      // TAKEOVER: Reuse AI team ID — just update its identity to the human player
      // This preserves all match history, stats, and FK references
      const oldId = aiTeam.id;

      // Keep AI team ID — just update its identity to human player
      // Delete the new team we created earlier (line 159) — we'll use AI team instead
      const origTeamId = teamId;
      await c.env.DB.prepare("UPDATE teams SET name = ?, user_id = ?, village_id = ?, primary_color = ?, secondary_color = ?, badge_pattern = ?, jersey_pattern = ?, budget = ?, reputation = 50, stadium_name = ? WHERE id = ?")
        .bind(body.name, userId, body.villageId, body.primaryColor ?? "#2D5F2D", body.secondaryColor ?? "#FFF", body.badgePattern ?? "shield", body.jerseyPattern ?? "solid",
          village.size === "small_city" || village.size === "city" ? 80000 : village.size === "town" || village.size === "village" ? 40000 : 20000,
          body.stadiumName ?? null, oldId).run();
      teamId = oldId;

      // 1. Delete OLD AI players first (they are under teamId = oldId)
      const aiPlayers = await c.env.DB.prepare("SELECT id FROM players WHERE team_id = ?").bind(teamId).all();
      for (const ap of aiPlayers.results) {
        for (const t of ["relationships", "match_player_stats", "player_stats", "player_contracts", "injuries", "training_log"]) {
          const col = t === "relationships" ? "player_a_id" : "player_id";
          await c.env.DB.prepare(`DELETE FROM ${t} WHERE ${col} = ?`).bind(ap.id).run().catch(() => {});
          if (t === "relationships") await c.env.DB.prepare("DELETE FROM relationships WHERE player_b_id = ?").bind(ap.id).run().catch(() => {});
        }
      }
      await c.env.DB.prepare("DELETE FROM players WHERE team_id = ?").bind(teamId).run().catch(() => {});

      // 2. Move newly generated players + manager from origTeamId → teamId (oldId)
      await c.env.DB.prepare("UPDATE players SET team_id = ? WHERE team_id = ?").bind(teamId, origTeamId).run().catch(() => {});
      await c.env.DB.prepare("UPDATE managers SET team_id = ? WHERE team_id = ?").bind(teamId, origTeamId).run().catch(() => {});

      // Clean old AI equipment/stadium/conversations/messages (human gets fresh start)
      const oldConvIds = await c.env.DB.prepare("SELECT id FROM conversations WHERE team_id = ?").bind(teamId).all().catch(() => ({ results: [] }));
      for (const conv of oldConvIds.results) {
        await c.env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conv.id).run().catch(() => {});
      }
      for (const t of ["equipment", "stadiums", "conversations", "sponsor_contracts", "transactions"]) {
        await c.env.DB.prepare(`DELETE FROM ${t} WHERE team_id = ?`).bind(teamId).run().catch(() => {});
      }

      // Create fresh stadium for the new human player
      {
        const { generateStadium } = await import("../stadium/stadium-generator");
        const { createRng } = await import("../generators/rng");
        let seed = 0;
        for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
        const rng = createRng(Math.abs(seed));
        const villageSize = (village as any).size as string || "small";
        const config = generateStadium(rng, villageSize);
        await c.env.DB.prepare(
          `INSERT INTO stadiums (id, team_id, capacity, pitch_condition, pitch_type, changing_rooms, showers, refreshments, lighting, stands, parking, fence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(uuid(), teamId, config.capacity, config.pitchCondition, config.pitchType,
          config.changingRooms, config.showers, config.refreshments, config.lighting,
          config.stands, config.parking, config.fence).run().catch(() => {});
      }

      // Delete the duplicate team row created at line 159
      // First clean any FK references to origTeamId — move sponsor to takeover team, delete rest
      await c.env.DB.prepare("UPDATE sponsor_contracts SET team_id = ? WHERE team_id = ?").bind(teamId, origTeamId).run().catch(() => {});
      await c.env.DB.prepare("DELETE FROM players WHERE team_id = ?").bind(origTeamId).run().catch(() => {});
      await c.env.DB.prepare("DELETE FROM managers WHERE team_id = ?").bind(origTeamId).run().catch(() => {});
      await c.env.DB.prepare("DELETE FROM conversations WHERE team_id = ?").bind(origTeamId).run().catch(() => {});
      await c.env.DB.prepare("DELETE FROM stadiums WHERE team_id = ?").bind(origTeamId).run().catch(() => {});
      await c.env.DB.prepare("DELETE FROM equipment WHERE team_id = ?").bind(origTeamId).run().catch(() => {});
      await c.env.DB.prepare("DELETE FROM transactions WHERE team_id = ?").bind(origTeamId).run().catch(() => {});
      await c.env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(origTeamId).run().catch((e) => {
        logger.error({ module: "teams" }, `FAILED to delete duplicate team ${origTeamId}`, e);
      });

      // Mark all existing matches as seen
      await c.env.DB.prepare("UPDATE matches SET home_seen_at = datetime('now') WHERE home_team_id = ? AND status = 'simulated'").bind(teamId).run().catch(() => {});
      await c.env.DB.prepare("UPDATE matches SET away_seen_at = datetime('now') WHERE away_team_id = ? AND status = 'simulated'").bind(teamId).run().catch(() => {});

      // Update references from oldId to teamId (if ID changed — shouldn't happen now)
      if (oldId !== teamId) {
        for (const sql of [
          "UPDATE matches SET home_team_id = ? WHERE home_team_id = ?",
          "UPDATE matches SET away_team_id = ? WHERE away_team_id = ?",
          "UPDATE match_player_stats SET team_id = ? WHERE team_id = ?",
          "UPDATE player_stats SET team_id = ? WHERE team_id = ?",
          "UPDATE lineups SET team_id = ? WHERE team_id = ?",
          "UPDATE transactions SET team_id = ? WHERE team_id = ?",
          "UPDATE injuries SET team_id = ? WHERE team_id = ?",
          "UPDATE training_log SET team_id = ? WHERE team_id = ?",
        ]) { await c.env.DB.prepare(sql).bind(teamId, oldId).run().catch(() => {}); }
        // Delete old team row if it still exists
        await c.env.DB.prepare("DELETE FROM teams WHERE id = ? AND id != ?").bind(oldId, teamId).run().catch(() => {});
      }
    } else {
      // No AI team to replace — just join the league
      await c.env.DB.prepare("UPDATE teams SET league_id = ? WHERE id = ?").bind(existingLeague.id, teamId).run();
    }

    // Sync game_date from existing league teams
    const peerDate = await c.env.DB.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL AND id != ? LIMIT 1")
      .bind(existingLeague.id, teamId).first<{ game_date: string }>().catch(() => null);
    if (peerDate?.game_date) {
      await c.env.DB.prepare("UPDATE teams SET game_date = ? WHERE id = ?").bind(peerDate.game_date, teamId).run();
    }

    // ── Ensure schedule exists (may be missing if first team creation failed) ──
    const matchCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM matches WHERE league_id = ?"
    ).bind(existingLeague.id).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "teams" }, "count league matches", e); return { cnt: 0 }; });

    if (!matchCount || matchCount.cnt === 0) {
      const leagueTeamIds = await c.env.DB.prepare(
        "SELECT id FROM teams WHERE league_id = ? ORDER BY name"
      ).bind(existingLeague.id).all().catch((e) => { logger.warn({ module: "teams" }, "fetch league teams for schedule", e); return { results: [] }; });

      const allTeamIds = leagueTeamIds.results.map((r) => r.id as string);

      if (allTeamIds.length >= 2) {
        const schedule = generateSchedule(rng, allTeamIds.length);
        const calendar = generateSeasonCalendar(existingLeague.id, season.number, new Date());

        for (const entry of calendar.entries) {
          await c.env.DB.prepare(
            "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
          ).bind(entry.id, existingLeague.id, season.number, entry.gameWeek, entry.matchDay, entry.scheduledAt).run().catch((e) => logger.warn({ module: "teams" }, "insert calendar entry (join)", e));
        }

        const calendarByWeek = new Map<number, string>();
        for (const entry of calendar.entries) {
          if (!calendarByWeek.has(entry.gameWeek)) {
            calendarByWeek.set(entry.gameWeek, entry.id);
          }
        }

        for (const match of schedule) {
          if (match.homeTeamIndex >= allTeamIds.length || match.awayTeamIndex >= allTeamIds.length) continue;
          const calId = calendarByWeek.get(match.round) ?? null;
          await c.env.DB.prepare(
            "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
          ).bind(uuid(), existingLeague.id, calId, match.round, allTeamIds[match.homeTeamIndex], allTeamIds[match.awayTeamIndex]).run().catch((e) => logger.warn({ module: "teams" }, "insert match (join)", e));
        }

        // Set game_date for all teams in the league
        if (calendar.entries.length > 0) {
          const firstMatch = new Date(calendar.entries[0].scheduledAt);
          firstMatch.setDate(firstMatch.getDate() - 1);
          await c.env.DB.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
            .bind(firstMatch.toISOString(), existingLeague.id).run();
        }
      }
    }

    // Init phone conversations
    await initTeamConversations(c.env.DB, teamId, playerConvData).catch((e) => logger.warn({ module: "teams" }, "init conversations (join)", e));

    // Zpravodaj: nový trenér převzal tým
    try {
      const topRows = await c.env.DB.prepare(
        "SELECT first_name, last_name, position, overall_rating FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 3"
      ).bind(teamId).all();
      const topList = topRows.results.map((p) => `${p.first_name} ${p.last_name} (${p.position}, ${p.overall_rating})`).join(", ");
      const managerLabel = body.managerName ?? "Nový trenér";
      const headline = `${body.name} má nového trenéra: ${managerLabel}!`;
      const newsBody = `${managerLabel} přebírá vedení ${body.name} z ${village.name as string}. V kádru je ${squad.length} hráčů, oporami by měli být ${topList}. Fanoušci jsou zvědaví, co přinese nová éra.`;
      await c.env.DB.prepare(
        "INSERT INTO news (id, league_id, team_id, type, headline, body, created_at) VALUES (?, ?, ?, 'manager_arrival', ?, ?, datetime('now'))"
      ).bind(uuid(), existingLeague.id, teamId, headline, newsBody).run();
    } catch { /* news optional */ }

    // Generate free agents if pool is empty
    try {
      const { maintainFreeAgentPool } = await import("../transfers/free-agent-pool");
      const { createRng } = await import("../generators/rng");
      await maintainFreeAgentPool(c.env.DB, createRng(Date.now() + 7777), new Date());
    } catch { /* optional */ }

    return c.json({
      id: teamId,
      name: body.name,
      village: village.name,
      playersCount: squad.length,
      leagueId: existingLeague.id,
      leagueName: existingLeague.name,
    }, 201);
  }

  step = "create-league";
  // Ensure AI user exists (required for FK on AI team inserts)
  await c.env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none')").run().catch(() => {});
  const leagueId = uuid();
  const LEAGUE_NAMES: Record<string, string> = { 'Praha': 'Přebor Prahy' };
  const leagueName = LEAGUE_NAMES[district] ?? `Okresní přebor ${district}`;

  await c.env.DB.prepare(
    "INSERT INTO leagues (id, season_id, district, name, level, status) VALUES (?, ?, ?, ?, 'okresni_prebor', 'active')"
  ).bind(leagueId, season.id, district, leagueName).run();

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

    step = `insert-ai-team-${lt.teamName}`;
    await c.env.DB.prepare(
      "INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget, league_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(aiTeamId, "ai", aiVillageId, lt.teamName, lt.primaryColor, lt.secondaryColor, aiBudget, leagueId).run();

    step = `insert-ai-players-${lt.teamName}`;
    if (lt.aiTeam?.squad) {
      const aiPlayerIds: string[] = [];
      for (const ap of lt.aiTeam.squad) {
        const apId = uuid();
        aiPlayerIds.push(apId);
        const apNickname = (ap as GeneratedPlayer & { nickname?: string | null }).nickname ?? "";
        const isGK = ap.position === "GK";
        const apFieldSkills = !isGK ? generateFieldSkills(rng, ap.position as "DEF" | "MID" | "FWD", villageSize, ap.age, true) : null;
        const apGkSkills = isGK ? generateGKSkills(rng, villageSize, ap.age, true) : null;
        const apHiddenTalent = generateHiddenTalent(rng, villageSize);

        const apSkills = isGK
          ? { speed: 0, technique: 0, shooting: 0, passing: apGkSkills!.distribution.current, heading: 0, defense: 0, goalkeeping: apGkSkills!.reflexes.current, creativity: 0, setPieces: 0 }
          : { speed: apFieldSkills!.speed.current, technique: apFieldSkills!.technique.current, shooting: apFieldSkills!.shooting.current, passing: apFieldSkills!.passing.current, heading: apFieldSkills!.heading.current, defense: apFieldSkills!.defense.current, goalkeeping: 0, creativity: apFieldSkills!.creativity.current, setPieces: apFieldSkills!.setPieces.current };

        const apHeight = (ap.position === "GK" ? 185 : ap.position === "DEF" ? 180 : ap.position === "FWD" ? 178 : 176) + rng.int(-8, 8);
        const apBaseWeight = ap.bodyType === "obese" ? 100 : ap.bodyType === "stocky" ? 88 : ap.bodyType === "thin" ? 68 : ap.bodyType === "athletic" ? 78 : 80;
        const apWeight = apBaseWeight + rng.int(-5, 8);

        const apPhysical = {
          stamina: isGK ? apGkSkills!.strength.current : apFieldSkills!.stamina.current,
          strength: isGK ? apGkSkills!.strength.current : apFieldSkills!.strength.current,
          injuryProneness: rng.int(10, 80), height: apHeight, weight: apWeight,
          preferredFoot: ap.preferredFoot, preferredSide: ap.preferredSide,
        };
        const apPersonality = {
          discipline: rng.int(10, 90), patriotism: rng.int(20, 90), alcohol: rng.int(5, 85), temper: rng.int(10, 80),
          leadership: ap.leadership, workRate: ap.workRate, aggression: ap.aggression,
          consistency: ap.consistency, clutch: ap.clutch,
        };
        const apOcc = pickOccupation(rng, villageSize, ap.age, district);
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
          "INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience, weekly_wage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(apId, aiTeamId, ap.firstName, ap.lastName, apNickname, ap.age, ap.position, apRating,
          JSON.stringify(apSkills), JSON.stringify(apPhysical), JSON.stringify(apPersonality),
          JSON.stringify(apLifeContext), JSON.stringify(generatePlayerFace(ap)), apDescription,
          JSON.stringify(isGK ? apGkSkills : apFieldSkills), apHiddenTalent,
          isGK ? apGkSkills!.experience.current : apFieldSkills!.experience.current,
          Math.round(10 + apRating * 4),
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

  // ── Generate season schedule (all matches for the league) ──
  // Generate schedule from all teams in the league

  // Get AI team IDs from DB (they were just inserted)
  const leagueTeamIds = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE league_id = ? ORDER BY name"
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "teams" }, "fetch league teams for new schedule", e); return { results: [] }; });

  const teamIds = leagueTeamIds.results.map((r) => r.id as string);

  step = "create-schedule";
  if (teamIds.length >= 2) {
    const schedule = generateSchedule(rng, teamIds.length);
    const calendar = generateSeasonCalendar(leagueId, season.number, new Date());

    // Insert calendar entries
    for (const entry of calendar.entries) {
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
      ).bind(entry.id, leagueId, season.number, entry.gameWeek, entry.matchDay, entry.scheduledAt).run().catch((e) => logger.warn({ module: "teams" }, "insert calendar entry (create)", e));
    }

    // Insert matches — map schedule rounds to calendar entries
    const calendarByWeek = new Map<number, string>();
    for (const entry of calendar.entries) {
      if (!calendarByWeek.has(entry.gameWeek)) {
        calendarByWeek.set(entry.gameWeek, entry.id);
      }
    }

    for (const match of schedule) {
      if (match.homeTeamIndex >= teamIds.length || match.awayTeamIndex >= teamIds.length) continue;
      const calId = calendarByWeek.get(match.round) ?? null;
      await c.env.DB.prepare(
        "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
      ).bind(uuid(), leagueId, calId, match.round, teamIds[match.homeTeamIndex], teamIds[match.awayTeamIndex]).run().catch((e) => logger.warn({ module: "teams" }, "insert match (create)", e));
    }

    // Set game_date for all teams in the league (day before first match)
    if (calendar.entries.length > 0) {
      const firstMatch = new Date(calendar.entries[0].scheduledAt);
      firstMatch.setDate(firstMatch.getDate() - 1);
      await c.env.DB.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
        .bind(firstMatch.toISOString(), leagueId).run();
    }
  }

  // Init phone conversations
  await initTeamConversations(c.env.DB, teamId, playerConvData).catch((e) => logger.warn({ module: "teams" }, "init conversations (create)", e));

  // Zpravodaj: článek o novém trenérovi
  try {
    const topRows = await c.env.DB.prepare(
      "SELECT first_name, last_name, position, overall_rating FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 3"
    ).bind(teamId).all();
    const topList = topRows.results.map((p) => `${p.first_name} ${p.last_name} (${p.position}, ${p.overall_rating})`).join(", ");
    const managerLabel = body.managerName || "Nový trenér";
    const backstoryMap: Record<string, string> = {
      byvaly_hrac: "bývalý hráč, který se rozhodl zkusit trenérskou kariéru",
      mistni_nadsenec: "místní nadšenec do fotbalu",
      ucitel_tv: "učitel tělesné výchovy",
      hospodsky: "hospodský, který si fotbal zamiloval u výčepu",
    };
    const backstoryText = backstoryMap[body.managerBackstory ?? ""] ?? "nová tvář na trenérské lavičce";

    const headlines = [
      `${managerLabel} přebírá ${body.name}!`,
      `Nová éra v ${village.name as string}: ${managerLabel} u kormidla`,
      `${body.name} má nového trenéra!`,
    ];
    const bodies = [
      `${managerLabel}, ${backstoryText}, se ujímá vedení ${body.name} z ${village.name as string}. Kádr čítá ${squad.length} hráčů. Mezi oporami vyčnívají ${topList}. Fanoušci jsou zvědaví, co nová sezóna přinese.`,
      `V ${village.name as string} to žije — ${managerLabel} převzal tým ${body.name}. „Chceme hrát dobrý fotbal," řekl po svém jmenování. Na soupisku se dostal ${squad.length} hráčů, tahouny by měli být ${topList}.`,
      `Okresní fotbal má novou kapitolu. ${managerLabel} (${backstoryText}) dorazil do ${village.name as string} a ujal se vedení ${body.name}. V kádru o ${squad.length} hráčích budou klíčoví ${topList}.`,
    ];
    const idx = Math.floor(Math.random() * headlines.length);
    await c.env.DB.prepare(
      "INSERT INTO news (id, league_id, team_id, type, headline, body, created_at) VALUES (?, ?, ?, 'manager_arrival', ?, ?, datetime('now'))"
    ).bind(uuid(), leagueId, teamId, headlines[idx], bodies[idx]).run();
  } catch (e) { logger.warn({ module: "teams" }, "news generation for manager arrival", e); }

  // Generate initial free agent pool for this district
  try {
    const { maintainFreeAgentPool } = await import("../transfers/free-agent-pool");
    const { createRng } = await import("../generators/rng");
    const faRng = createRng(Date.now() + 7777);
    await maintainFreeAgentPool(c.env.DB, faRng, new Date());
  } catch (e) { logger.warn({ module: "teams" }, "initial free agent pool generation", e); }

  return c.json({
    id: teamId,
    name: body.name,
    village: village.name,
    playersCount: squad.length,
    leagueId,
    leagueName: leagueSetup.name,
  }, 201);
  } catch (e: any) {
    logger.error({ module: "teams", step }, "team creation failed", e);
    return c.json({ error: e.message, step }, 500);
  }
});

// GET /api/teams/:id
teamsRouter.get("/:id", async (c) => {
  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.population, v.size, v.district, v.region FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(c.req.param("id")).first();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const stadium = await c.env.DB.prepare(
    "SELECT capacity, pitch_condition, pitch_type FROM stadiums WHERE team_id = ? LIMIT 1"
  ).bind(c.req.param("id")).first().catch(() => null);

  return c.json({
    ...team,
    stadium: stadium ? { name: team.stadium_name, capacity: stadium.capacity, pitchCondition: stadium.pitch_condition, pitchType: stadium.pitch_type } : null,
  });
});

// GET /api/teams/:id/players
teamsRouter.get("/:id/players", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released') ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 WHEN 'FWD' THEN 3 END, overall_rating DESC"
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
  const teamId = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM players WHERE id = ?")
    .bind(c.req.param("playerId")).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "Player not found" }, 404);

  const isOwn = row.team_id === teamId;
  const skills = JSON.parse(row.skills as string);
  const physical = JSON.parse(row.physical as string);
  const personality = JSON.parse(row.personality as string);
  const lifeContext = JSON.parse(row.life_context as string);

  // Foreign players: round attributes to nearest 5, hide personality details
  if (!isOwn) {
    const blur = (v: number) => Math.round(v / 5) * 5;
    for (const k of Object.keys(skills)) { if (typeof skills[k] === "number") skills[k] = blur(skills[k]); }
    for (const k of Object.keys(physical)) { if (typeof physical[k] === "number") physical[k] = blur(physical[k]); }
    // Hide precise personality — show only rough level
    for (const k of Object.keys(personality)) {
      if (typeof personality[k] === "number") personality[k] = blur(personality[k]);
    }
    // Hide condition and morale
    lifeContext.condition = Math.round((lifeContext.condition ?? 50) / 10) * 10;
    lifeContext.morale = Math.round((lifeContext.morale ?? 50) / 10) * 10;
  }

  return c.json({
    ...row,
    isOwn,
    skills,
    physical,
    personality,
    lifeContext: lifeContext,
    avatar: JSON.parse(row.avatar as string),
  });
});

// GET /api/teams/:id/manager — get manager profile for team
teamsRouter.get("/:id/manager", async (c) => {
  const tId = c.req.param("id");

  // Try DB first
  const row = await c.env.DB.prepare(
    "SELECT * FROM managers WHERE team_id = ? LIMIT 1"
  ).bind(tId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "teams" }, "fetch manager from DB", e); return null; });

  if (row) {
    return c.json({
      id: row.id,
      name: row.name,
      backstory: row.backstory,
      avatar: JSON.parse(row.avatar as string),
      age: row.age,
      coaching: row.coaching ?? 40,
      motivation: row.motivation ?? 40,
      tactics: row.tactics ?? 40,
      youthDevelopment: row.youth_development ?? 40,
      discipline: row.discipline ?? 40,
      reputation: row.reputation ?? 30,
      bio: row.bio,
      birthplace: row.birthplace,
    });
  }

  // For AI teams, generate deterministic manager from team id
  const team = await c.env.DB.prepare("SELECT user_id FROM teams WHERE id = ?")
    .bind(tId).first<{ user_id: string }>();
  if (!team || team.user_id !== "ai") return c.json(null);

  // Generate deterministic AI manager
  const { generateAiManager } = await import("../generators/manager-generator");
  const { createRng } = await import("../generators/rng");
  // Hash team ID to numeric seed
  let seed = 0;
  for (let i = 0; i < tId.length; i++) seed = ((seed << 5) - seed + tId.charCodeAt(i)) | 0;
  const rng = createRng(Math.abs(seed));
  const mgr = generateAiManager(rng);

  // Persist for future requests
  const mgrId = uuid();
  await c.env.DB.prepare(
    "INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, age, coaching, motivation, tactics, youth_development, discipline, reputation, bio, birthplace) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(mgrId, "ai", tId, mgr.name, mgr.backstory, JSON.stringify(mgr.avatar),
    mgr.age, mgr.coaching, mgr.motivation, mgr.tactics,
    mgr.youthDevelopment, mgr.discipline, mgr.reputation, mgr.bio, mgr.birthplace,
  ).run().catch((e) => logger.warn({ module: "teams" }, "persist AI manager", e));

  return c.json({
    id: mgrId,
    name: mgr.name,
    backstory: mgr.backstory,
    avatar: mgr.avatar,
    age: mgr.age,
    coaching: mgr.coaching,
    motivation: mgr.motivation,
    tactics: mgr.tactics,
    youthDevelopment: mgr.youthDevelopment,
    discipline: mgr.discipline,
    reputation: mgr.reputation,
    bio: mgr.bio,
    birthplace: mgr.birthplace,
  });
});

// GET /api/teams/:id/league-teams — all teams in same league
teamsRouter.get("/:id/league-teams", async (c) => {
  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(c.req.param("id")).first<{ league_id: string }>();
  if (!team?.league_id) return c.json([]);

  const result = await c.env.DB.prepare(
    "SELECT t.id, t.name, t.primary_color, t.secondary_color, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? AND t.user_id != 'ai' ORDER BY t.name"
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

// GET /api/teams/:id/stats — statistiky kádru pro aktuální sezónu
teamsRouter.get("/:id/stats", async (c) => {
  const teamId = c.req.param("id");

  const season = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "teams" }, "fetch active season for stats", e); return null; });

  if (!season) return c.json({ stats: [], topScorers: [], topAssists: [] });

  const result = await c.env.DB.prepare(
    `SELECT ps.*, p.first_name, p.last_name, p.nickname, p.position, p.avatar
     FROM player_stats ps
     JOIN players p ON ps.player_id = p.id
     WHERE ps.team_id = ? AND ps.season_id = ?
     ORDER BY ps.goals DESC, ps.assists DESC`
  ).bind(teamId, season.id).all().catch((e) => { logger.warn({ module: "teams" }, "fetch player stats", e); return { results: [] }; });

  const stats = result.results.map((row) => ({
    playerId: row.player_id,
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    position: row.position,
    avatar: row.avatar ? JSON.parse(row.avatar as string) : null,
    appearances: row.appearances,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    minutesPlayed: row.minutes_played,
    avgRating: row.avg_rating,
    cleanSheets: row.clean_sheets,
    manOfMatch: row.man_of_match,
  }));

  return c.json({
    stats,
    topScorers: [...stats].sort((a, b) => (b.goals as number) - (a.goals as number)).slice(0, 5),
    topAssists: [...stats].sort((a, b) => (b.assists as number) - (a.assists as number)).slice(0, 5),
  });
});

// GET /api/teams/:id/players/:playerId/career-stats — kariérní statistiky hráče
teamsRouter.get("/:id/players/:playerId/career-stats", async (c) => {
  const playerId = c.req.param("playerId");

  const result = await c.env.DB.prepare(
    `SELECT ps.*, s.number as season_number,
       t.name as team_name, t.primary_color as team_color, t.secondary_color as team_secondary,
       t.badge_pattern as team_badge, t.id as stats_team_id,
       l.name as league_name
     FROM player_stats ps
     JOIN seasons s ON ps.season_id = s.id
     JOIN teams t ON ps.team_id = t.id
     LEFT JOIN leagues l ON l.season_id = ps.season_id AND t.league_id = l.id
     WHERE ps.player_id = ?
     ORDER BY s.number`
  ).bind(playerId).all().catch((e) => { logger.warn({ module: "teams" }, "query player data", e); return { results: [] }; });

  const seasons = result.results.map((row) => ({
    season: row.season_number,
    teamId: row.stats_team_id,
    teamName: row.team_name,
    teamColor: row.team_color || "#2D5F2D",
    teamSecondary: row.team_secondary || "#FFFFFF",
    teamBadge: row.team_badge || "shield",
    leagueName: row.league_name ?? null,
    appearances: row.appearances,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    avgRating: row.avg_rating,
    cleanSheets: row.clean_sheets,
    minutesPlayed: row.minutes_played,
  }));

  // Career totals
  const totals = {
    appearances: seasons.reduce((s, r) => s + (r.appearances as number), 0),
    goals: seasons.reduce((s, r) => s + (r.goals as number), 0),
    assists: seasons.reduce((s, r) => s + (r.assists as number), 0),
    yellowCards: seasons.reduce((s, r) => s + (r.yellowCards as number), 0),
    redCards: seasons.reduce((s, r) => s + (r.redCards as number), 0),
  };

  return c.json({ seasons, totals });
});

// GET /api/teams/:id/players/:playerId/career-history — historie klubů hráče
teamsRouter.get("/:id/players/:playerId/career-history", async (c) => {
  const playerId = c.req.param("playerId");

  const contracts = await c.env.DB.prepare(
    `SELECT pc.*, t.name as team_name, t.primary_color as team_color,
       t.secondary_color as team_secondary, t.badge_pattern as team_badge,
       s.number as season_number
     FROM player_contracts pc
     JOIN teams t ON pc.team_id = t.id
     JOIN seasons s ON pc.season_id = s.id
     WHERE pc.player_id = ?
     ORDER BY pc.joined_at DESC`
  ).bind(playerId).all().catch((e) => { logger.warn({ module: "teams" }, "query player data", e); return { results: [] }; });

  // If no contracts exist, create one from current player data
  if (contracts.results.length === 0) {
    const player = await c.env.DB.prepare("SELECT team_id FROM players WHERE id = ?")
      .bind(playerId).first<{ team_id: string }>().catch((e) => { logger.warn({ module: "teams" }, "fetch player for contract", e); return null; });
    const season = await c.env.DB.prepare("SELECT id, number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
      .first<{ id: string; number: number }>().catch((e) => { logger.warn({ module: "teams" }, "fetch season for contract", e); return null; });

    if (player && season) {
      const contractId = crypto.randomUUID();
      await c.env.DB.prepare(
        "INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, is_active) VALUES (?, ?, ?, ?, 'generated', 1)"
      ).bind(contractId, playerId, player.team_id, season.id).run().catch((e) => logger.warn({ module: "teams" }, "insert player contract", e));

      // Re-query
      const fresh = await c.env.DB.prepare(
        `SELECT pc.*, t.name as team_name, t.primary_color as team_color,
           t.secondary_color as team_secondary, t.badge_pattern as team_badge,
           s.number as season_number
         FROM player_contracts pc
         JOIN teams t ON pc.team_id = t.id
         JOIN seasons s ON pc.season_id = s.id
         WHERE pc.player_id = ?
         ORDER BY pc.joined_at DESC`
      ).bind(playerId).all().catch((e) => { logger.warn({ module: "teams" }, "query player data", e); return { results: [] }; });
      contracts.results = fresh.results;
    }
  }

  const JOIN_LABELS: Record<string, string> = {
    generated: "Zakládající člen",
    transfer: "Přestup",
    free_agent: "Volný hráč",
    youth: "Z mládeže",
    loan: "Hostování",
  };

  return c.json({
    contracts: contracts.results.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      teamName: row.team_name,
      teamColor: row.team_color || "#2D5F2D",
      teamSecondary: row.team_secondary || "#FFFFFF",
      teamBadge: row.team_badge || "shield",
      seasonNumber: row.season_number,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      joinType: row.join_type,
      joinLabel: JOIN_LABELS[row.join_type as string] ?? row.join_type,
      leaveType: row.leave_type,
      fee: row.fee,
      isActive: row.is_active === 1,
    })),
  });
});

export { teamsRouter };
