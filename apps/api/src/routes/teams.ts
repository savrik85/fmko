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
import { createRng, cryptoSeed } from "../generators/rng";
import { generateSquad, type GeneratedPlayer } from "../generators/player";
import { generateNickname } from "../generators/nickname";
import { generateRelationships } from "../generators/relationships";
import type { AbsencePlayerInfo } from "../events/match-absences";
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
import { updateSessionTeamId } from "../auth/session";

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

  // Check if league in this district is full (no AI slots left)
  // Must happen BEFORE creating team to avoid orphan rows + FK issues
  const districtForCheck = village.district as string;
  const activeSeasonForCheck = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' LIMIT 1"
  ).first<{ id: string }>();
  if (activeSeasonForCheck) {
    const leagueForCheck = await c.env.DB.prepare(
      "SELECT id FROM leagues WHERE district = ? AND season_id = ? AND status = 'active' LIMIT 1"
    ).bind(districtForCheck, activeSeasonForCheck.id).first<{ id: string }>();
    if (leagueForCheck) {
      const aiCountRow = await c.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM teams WHERE league_id = ? AND user_id = 'ai'"
      ).bind(leagueForCheck.id).first<{ cnt: number }>();
      if ((aiCountRow?.cnt ?? 0) === 0) {
        return c.json({
          error: "league_full",
          message: "Liga v tomto okrese je plná. Připravujeme nižší soutěž, kam se brzy budete moci zaregistrovat.",
        }, 409);
      }
    }
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
    const { seasonBonus, seasons, terminationFee } = body.sponsor;
    if (!seasonBonus || seasonBonus <= 0 || !seasons || seasons <= 0 || terminationFee == null || terminationFee < 0) {
      return c.json({ error: "Neplatné hodnoty sponzorské smlouvy" }, 400);
    }
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
  const rng = createRng(cryptoSeed());
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
      await c.env.DB.prepare("UPDATE players SET squad_number = ? WHERE id = ?").bind(num, pid).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
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
  await c.env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none')").run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
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

  // Initial contract pro nové hráče (initial squad)
  for (const pid of playerIds) {
    await c.env.DB.prepare(
      "INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'generated', 0, 1)"
    ).bind(uuid(), pid, teamId, season.id).run().catch((e) => logger.warn({ module: "teams" }, "insert initial contract", e));
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
          await c.env.DB.prepare(`DELETE FROM ${t} WHERE ${col} = ?`).bind(ap.id).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
          if (t === "relationships") await c.env.DB.prepare("DELETE FROM relationships WHERE player_b_id = ?").bind(ap.id).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
        }
      }
      await c.env.DB.prepare("DELETE FROM players WHERE team_id = ?").bind(teamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));

      // 2. Move newly generated players + manager from origTeamId → teamId (oldId)
      await c.env.DB.prepare("UPDATE players SET team_id = ? WHERE team_id = ?").bind(teamId, origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("UPDATE managers SET team_id = ? WHERE team_id = ?").bind(teamId, origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));

      // Clean old AI equipment/stadium/conversations/messages (human gets fresh start)
      const oldConvIds = await c.env.DB.prepare("SELECT id FROM conversations WHERE team_id = ?").bind(teamId).all().catch(() => ({ results: [] }));
      for (const conv of oldConvIds.results) {
        await c.env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conv.id).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      }
      for (const t of ["equipment", "stadiums", "conversations", "sponsor_contracts", "transactions"]) {
        await c.env.DB.prepare(`DELETE FROM ${t} WHERE team_id = ?`).bind(teamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
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
          `INSERT INTO stadiums (id, team_id, capacity, pitch_condition, pitch_type, changing_rooms, showers, refreshments, stands, parking, fence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(uuid(), teamId, config.capacity, config.pitchCondition, config.pitchType,
          config.changingRooms, config.showers, config.refreshments,
          config.stands, config.parking, config.fence).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      }

      // Delete the duplicate team row created at line 159
      // First clean any FK references to origTeamId — move sponsor to takeover team, delete rest
      await c.env.DB.prepare("UPDATE sponsor_contracts SET team_id = ? WHERE team_id = ?").bind(teamId, origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("DELETE FROM players WHERE team_id = ?").bind(origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("DELETE FROM managers WHERE team_id = ?").bind(origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("DELETE FROM conversations WHERE team_id = ?").bind(origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("DELETE FROM stadiums WHERE team_id = ?").bind(origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("DELETE FROM equipment WHERE team_id = ?").bind(origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("DELETE FROM transactions WHERE team_id = ?").bind(origTeamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(origTeamId).run().catch((e) => {
        logger.error({ module: "teams" }, `FAILED to delete duplicate team ${origTeamId}`, e);
      });

      // Mark all existing matches as seen
      await c.env.DB.prepare("UPDATE matches SET home_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE home_team_id = ? AND status = 'simulated'").bind(teamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      await c.env.DB.prepare("UPDATE matches SET away_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE away_team_id = ? AND status = 'simulated'").bind(teamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));

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
        ]) { await c.env.DB.prepare(sql).bind(teamId, oldId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e)); }
        // Delete old team row if it still exists
        await c.env.DB.prepare("DELETE FROM teams WHERE id = ? AND id != ?").bind(oldId, teamId).run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
      }
    } else {
      // Safety net — should never reach here because we checked league fullness at the top.
      // But if it does (race condition), fail safely.
      logger.error({ module: "teams" }, `league_full race condition for team ${teamId}`);
      return c.json({
        error: "league_full",
        message: "Liga v tomto okrese je plná. Připravujeme nižší soutěž, kam se brzy budete moci zaregistrovat.",
      }, 409);
    }

    // Sync game_date from existing league teams
    const peerDate = await c.env.DB.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL AND id != ? LIMIT 1")
      .bind(existingLeague.id, teamId).first<{ game_date: string }>().catch((e) => { logger.warn({ module: "teams" }, "db op failed", e); return null; });
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
        "INSERT INTO news (id, league_id, team_id, type, headline, body, created_at) VALUES (?, ?, ?, 'manager_arrival', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
      ).bind(uuid(), existingLeague.id, teamId, headline, newsBody).run();
    } catch (e) { logger.warn({ module: "teams" }, "manager arrival news generation", e); }

    // Generate free agents if pool is empty
    try {
      const { maintainFreeAgentPool } = await import("../transfers/free-agent-pool");
      const { createRng } = await import("../generators/rng");
      await maintainFreeAgentPool(c.env.DB, createRng(cryptoSeed()), new Date());
    } catch (e) { logger.warn({ module: "teams" }, "free agent pool generation (join)", e); }

    // Pub backfill — vygeneruj včerejší hospodu, ať není prázdná hned po setupu
    try {
      const { backfillYesterdayPubSession } = await import("../season/pub");
      const gd = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string }>().catch((e) => { logger.warn({ module: "teams" }, "load team game_date for pub backfill", e); return null; });
      const gameDateStr = (gd?.game_date ?? new Date().toISOString()).slice(0, 10);
      await backfillYesterdayPubSession(c.env.DB, teamId, gameDateStr);
    } catch (e) { logger.warn({ module: "teams" }, "pub backfill (join)", e); }

    // Update KV session so teamId is no longer null (fixes post-onboarding auth)
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      await updateSessionTeamId(c.env.SESSION_KV, token, teamId).catch((e) => logger.warn({ module: "teams" }, "updateSessionTeamId (join)", e));
    }

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
  await c.env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none')").run().catch((e) => logger.warn({ module: "teams" }, "db op failed", e));
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

        // Initial contract for AI team player
        await c.env.DB.prepare(
          "INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'generated', 0, 1)"
        ).bind(uuid(), apId, aiTeamId, season.id).run().catch((e) => logger.warn({ module: "teams" }, "insert AI initial contract", e));
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
      "INSERT INTO news (id, league_id, team_id, type, headline, body, created_at) VALUES (?, ?, ?, 'manager_arrival', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    ).bind(uuid(), leagueId, teamId, headlines[idx], bodies[idx]).run();
  } catch (e) { logger.warn({ module: "teams" }, "news generation for manager arrival", e); }

  // Generate initial free agent pool for this district
  try {
    const { maintainFreeAgentPool } = await import("../transfers/free-agent-pool");
    const { createRng } = await import("../generators/rng");
    const faRng = createRng(cryptoSeed());
    await maintainFreeAgentPool(c.env.DB, faRng, new Date());
  } catch (e) { logger.warn({ module: "teams" }, "initial free agent pool generation", e); }

  // Pub backfill — vygeneruj včerejší hospodu, ať není prázdná hned po setupu
  try {
    const { backfillYesterdayPubSession } = await import("../season/pub");
    await backfillYesterdayPubSession(c.env.DB, teamId, new Date().toISOString().slice(0, 10));
  } catch (e) { logger.warn({ module: "teams" }, "pub backfill (create)", e); }

  // Update KV session so teamId is no longer null (fixes post-onboarding auth)
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await updateSessionTeamId(c.env.SESSION_KV, token, teamId).catch((e) => logger.warn({ module: "teams" }, "updateSessionTeamId (create)", e));
  }

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
  // team.* už obsahuje badge_primary_color, badge_secondary_color, badge_initials, badge_symbol

  const stadium = await c.env.DB.prepare(
    "SELECT capacity, pitch_condition, pitch_type FROM stadiums WHERE team_id = ? LIMIT 1"
  ).bind(c.req.param("id")).first().catch((e) => { logger.warn({ module: "teams" }, "db op failed", e); return null; });

  return c.json({
    ...team,
    stadium: stadium ? { name: team.stadium_name, capacity: stadium.capacity, pitchCondition: stadium.pitch_condition, pitchType: stadium.pitch_type } : null,
  });
});

// GET /api/teams/:id/players
teamsRouter.get("/:id/players", async (c) => {
  const teamId = c.req.param("id");
  const result = await c.env.DB.prepare(
    "SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released') ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 WHEN 'FWD' THEN 3 END, overall_rating DESC"
  ).bind(teamId).all();

  const activeInjuries = await c.env.DB.prepare(
    "SELECT player_id, type, days_remaining FROM injuries WHERE team_id = ? AND days_remaining > 0"
  ).bind(teamId).all<{ player_id: string; type: string; days_remaining: number }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch team injuries", e); return { results: [] }; });
  const injuryByPlayer = new Map(activeInjuries.results.map((r) => [r.player_id, { type: r.type, daysRemaining: r.days_remaining }]));

  const players = result.results.map((row) => {
    const lifeContext = JSON.parse(row.life_context as string);
    return {
      ...row,
      skills: JSON.parse(row.skills as string),
      physical: JSON.parse(row.physical as string),
      personality: JSON.parse(row.personality as string),
      lifeContext,
      avatar: JSON.parse(row.avatar as string),
      injury: injuryByPlayer.get(row.id as string) ?? null,
      absence: (lifeContext as Record<string, unknown>)?.absence ?? null,
    };
  });
  return c.json(players);
});

// GET /api/teams/:id/absences — seznam hráčů s aktivní absencí pro dnešek
teamsRouter.get("/:id/absences", async (c) => {
  const teamId = c.req.param("id");
  const result = await c.env.DB.prepare(
    `SELECT id, first_name, last_name, position, avatar, json_extract(life_context, '$.absence') as absence
     FROM players
     WHERE team_id = ? AND (status IS NULL OR status != 'released') AND json_extract(life_context, '$.absence') IS NOT NULL`
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; position: string; avatar: string; absence: string }>();

  const absences = result.results.map((r) => {
    let parsed: Record<string, unknown> | null = null;
    try { parsed = r.absence ? JSON.parse(r.absence) : null; } catch { parsed = null; }
    return {
      playerId: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      position: r.position,
      avatar: r.avatar ? JSON.parse(r.avatar) : null,
      absence: parsed,
    };
  });

  return c.json({ absences });
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

  // Check for active injury
  const injury = await c.env.DB.prepare(
    "SELECT type, days_remaining FROM injuries WHERE player_id = ? AND days_remaining > 0 ORDER BY days_remaining DESC LIMIT 1"
  ).bind(c.req.param("playerId")).first<{ type: string; days_remaining: number }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch injury for player detail", e); return null; });

  // Check if this player is on viewing team's watchlist
  const watched = await c.env.DB.prepare(
    "SELECT 1 FROM player_watchlist WHERE team_id = ? AND player_id = ? LIMIT 1"
  ).bind(teamId, c.req.param("playerId")).first<{ 1: number }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch watchlist status", e); return null; });

  // Teams watching this player (scouting visibility)
  const watchers = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.primary_color, t.secondary_color, t.badge_pattern
     FROM player_watchlist w JOIN teams t ON w.team_id = t.id
     WHERE w.player_id = ? ORDER BY w.created_at ASC`
  ).bind(c.req.param("playerId")).all<{ id: string; name: string; primary_color: string; secondary_color: string; badge_pattern: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch watchers", e); return { results: [] }; });

  // Absence pro nejbližší zápas — jen pro vlastní hráče (u cizích to nedává smysl)
  let absence: AbsencePlayerInfo | null = null;
  if (isOwn) {
    const { findUpcomingMatchContext, getAbsentPlayersMap } = await import("../events/match-absences");
    const ctx = await findUpcomingMatchContext(c.env.DB, row.team_id as string);
    if (ctx) {
      const map = await getAbsentPlayersMap(c.env.DB, row.team_id as string, ctx);
      absence = map.get(c.req.param("playerId")) ?? null;
    }
  }

  return c.json({
    ...row,
    isOwn,
    skills,
    physical,
    personality,
    lifeContext: lifeContext,
    avatar: JSON.parse(row.avatar as string),
    injury: injury ? { type: injury.type, daysRemaining: injury.days_remaining } : null,
    absence,
    isWatched: !!watched,
    watchers: watchers.results ?? [],
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
// LEFT JOIN players → player_stats: vrací VŠECHNY aktivní hráče i s nulovými staty
teamsRouter.get("/:id/stats", async (c) => {
  const teamId = c.req.param("id");

  const season = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "teams" }, "fetch active season for stats", e); return null; });

  const seasonId = season?.id ?? null;

  const result = await c.env.DB.prepare(
    `SELECT p.id as player_id, p.first_name, p.last_name, p.nickname, p.position, p.avatar,
            COALESCE(ps.appearances, 0) as appearances,
            COALESCE(ps.goals, 0) as goals,
            COALESCE(ps.assists, 0) as assists,
            COALESCE(ps.yellow_cards, 0) as yellow_cards,
            COALESCE(ps.red_cards, 0) as red_cards,
            COALESCE(ps.minutes_played, 0) as minutes_played,
            ps.avg_rating,
            COALESCE(ps.clean_sheets, 0) as clean_sheets,
            COALESCE(ps.man_of_match, 0) as man_of_match
     FROM players p
     LEFT JOIN player_stats ps
       ON ps.player_id = p.id AND ps.team_id = p.team_id AND ps.season_id = ?
     WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
     ORDER BY COALESCE(ps.goals, 0) DESC, COALESCE(ps.assists, 0) DESC, p.overall_rating DESC`
  ).bind(seasonId, teamId).all().catch((e) => { logger.warn({ module: "teams" }, "fetch player stats", e); return { results: [] }; });

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

// GET /api/teams/:id/club — klubová identita (skeleton — postupně se rozšíří)
teamsRouter.get("/:id/club", async (c) => {
  const teamId = c.req.param("id");
  const team = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.primary_color, t.secondary_color, t.badge_pattern, t.jersey_pattern, t.stadium_name,
            t.away_primary_color, t.away_secondary_color, t.away_jersey_pattern, t.jersey_sponsor,
            t.home_shorts_color, t.home_socks_color, t.away_shorts_color, t.away_socks_color,
            t.badge_primary_color, t.badge_secondary_color, t.badge_initials, t.badge_symbol,
            t.scarf_pattern,
            t.anthem_url, t.anthem_lyrics, t.anthem_title, t.anthem_style, t.anthem_attempts_used, t.anthem_task_id,
            t.stadium_nickname, t.stadium_built_year, t.stadium_specialita, t.stadium_tribuna_north, t.stadium_tribuna_south,
            t.team_nickname, t.club_motto, t.founding_year, t.founding_story, t.colors_meaning,
            v.name as village_name, v.district, v.region, v.population
     FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?`
  ).bind(teamId).first();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const stadium = await c.env.DB.prepare(
    "SELECT capacity, pitch_condition, pitch_type FROM stadiums WHERE team_id = ? LIMIT 1"
  ).bind(teamId).first<{ capacity: number; pitch_condition: number; pitch_type: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch stadium for /club", e); return null; });

  // Hlavní sponzor — spravuje se přes /dashboard/sponsors, ne v /klub/dres
  const mainSponsor = await c.env.DB.prepare(
    "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND (category = 'main' OR category IS NULL) LIMIT 1"
  ).bind(teamId).first<{ sponsor_name: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch main sponsor for /club", e); return null; });

  // Stadion sponsor — blokuje editaci názvu stadionu (každý stadium kontrakt dává jméno)
  const stadiumNamingSponsor = await c.env.DB.prepare(
    "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND category = 'stadium' LIMIT 1"
  ).bind(teamId).first<{ sponsor_name: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch stadium naming sponsor", e); return null; });

  return c.json({
    id: team.id,
    name: team.name,
    primaryColor: team.primary_color,
    secondaryColor: team.secondary_color,
    badgePattern: team.badge_pattern,
    jerseyPattern: team.jersey_pattern,
    village: { name: team.village_name, district: team.district, region: team.region, population: team.population },
    identity: {
      nickname: team.team_nickname,
      motto: team.club_motto,
      foundingYear: team.founding_year,
      foundingStory: team.founding_story,
      colorsMeaning: team.colors_meaning,
    },
    stadium: {
      name: team.stadium_name,
      capacity: stadium?.capacity ?? null,
      pitchCondition: stadium?.pitch_condition ?? null,
      pitchType: stadium?.pitch_type ?? null,
      nickname: team.stadium_nickname,
      builtYear: team.stadium_built_year,
      specialita: team.stadium_specialita,
      tribunaNorth: team.stadium_tribuna_north,
      tribunaSouth: team.stadium_tribuna_south,
      namingSponsor: stadiumNamingSponsor?.sponsor_name ?? null,
    },
    jersey: {
      pattern: team.jersey_pattern,
      homePrimary: team.primary_color,
      homeSecondary: team.secondary_color,
      awayPrimary: team.away_primary_color,
      awaySecondary: team.away_secondary_color,
      awayPattern: team.away_jersey_pattern,
      sponsor: mainSponsor?.sponsor_name ?? null,
      homeShortsColor: team.home_shorts_color,
      homeSocksColor: team.home_socks_color,
      awayShortsColor: team.away_shorts_color,
      awaySocksColor: team.away_socks_color,
    },
    badge: {
      pattern: team.badge_pattern,
      primary: team.badge_primary_color ?? team.primary_color,
      secondary: team.badge_secondary_color ?? team.secondary_color,
      customPrimary: team.badge_primary_color,
      customSecondary: team.badge_secondary_color,
      customInitials: team.badge_initials,
      symbol: team.badge_symbol,
    },
    scarfPattern: team.scarf_pattern ?? null,
    anthem: {
      url: team.anthem_url,
      lyrics: team.anthem_lyrics,
      title: team.anthem_title,
      style: team.anthem_style,
      attemptsUsed: (team.anthem_attempts_used as number) ?? 0,
      attemptsMax: ANTHEM_MAX_ATTEMPTS,
      generating: !!(await c.env.DB.prepare("SELECT id FROM team_anthems WHERE team_id = ? AND url IS NULL AND suno_task_id IS NOT NULL LIMIT 1").bind(teamId).first()),
    },
    mascot: await (async () => {
      const m = await c.env.DB.prepare(
        "SELECT name, image_url, story FROM team_mascots WHERE team_id = ? AND is_selected = 1 LIMIT 1"
      ).bind(teamId).first<{ name: string; image_url: string | null; story: string | null }>();
      return {
        name: m?.name ?? null,
        imageUrl: m?.image_url ?? null,
        story: m?.story ?? null,
      };
    })(),
  });
});

// PATCH /api/teams/:id/club — update klubové identity (zatím dres + znak)
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const VALID_JERSEY_PATTERNS = new Set(["solid", "stripes", "hoops", "halves", "sash", "sleeves", "chest_band", "pinstripes", "quarters", "gradient"]);
const VALID_BADGE_PATTERNS = new Set([
  "shield", "rounded_shield", "crest", "double_shield",
  "circle", "oval", "square", "diamond",
  "hexagon", "octagon", "triangle", "star",
  "pennant", "banner", "chevron", "arch",
]);
const VALID_SCARF_PATTERNS = new Set(["classic", "bar", "block", "hooped", "halves", "vertical", "solid"]);
const ANTHEM_MAX_ATTEMPTS = 3;
// Whitelist anglických stylových presetů — Suno API je sensitive na české názvy umělců
const ANTHEM_STYLE_PRESETS = new Set([
  "czech football anthem, marching tempo, strong male choir, energetic",
  "czech folk song, accordion, mixed choir, cheerful tempo",
  "czech rock anthem, electric guitar, drums, stadium feeling",
  "czech folk ballad, acoustic guitar, male voice, simple accompaniment",
  "czech punk rock, fast tempo, raw vocals, punk energy",
]);
const ANTHEM_DEFAULT_STYLE = "czech football anthem, marching tempo, strong male choir, energetic";

teamsRouter.patch("/:id/club", async (c) => {
  const teamId = c.req.param("id");

  // Auth + ownership check
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Nepřihlášen" }, 401);
  const token = authHeader.slice(7);
  const { getSession } = await import("../auth/session");
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const team = await c.env.DB.prepare("SELECT user_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ user_id: string }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  if (team.user_id !== session.userId) return c.json({ error: "Přístup odepřen" }, 403);

  const body = await c.req.json().catch((e) => { logger.warn({ module: "teams" }, "PATCH /club: invalid JSON body", e); return null; }) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return c.json({ error: "Neplatná data" }, 400);

  // Validace per field
  const updates: Array<{ col: string; val: string | null }> = [];

  function validateHex(field: string, val: unknown, allowNull = false): string | null | undefined {
    if (val === undefined) return undefined;
    if (val === null) return allowNull ? null : undefined;
    if (typeof val !== "string" || !HEX_RE.test(val)) {
      throw new Error(`Pole ${field} musí být hex barva (např. #2D5F2D)`);
    }
    return val;
  }
  function validateEnum(field: string, val: unknown, allowed: Set<string>, allowNull = false): string | null | undefined {
    if (val === undefined) return undefined;
    if (val === null) return allowNull ? null : undefined;
    if (typeof val !== "string" || !allowed.has(val)) {
      throw new Error(`Pole ${field} má neplatnou hodnotu`);
    }
    return val;
  }

  try {
    const homeP = validateHex("homePrimary", body.homePrimary);
    if (homeP !== undefined) updates.push({ col: "primary_color", val: homeP });
    const homeS = validateHex("homeSecondary", body.homeSecondary);
    if (homeS !== undefined) updates.push({ col: "secondary_color", val: homeS });
    const homePattern = validateEnum("homePattern", body.homePattern, VALID_JERSEY_PATTERNS);
    if (homePattern !== undefined) updates.push({ col: "jersey_pattern", val: homePattern });

    const awayP = validateHex("awayPrimary", body.awayPrimary, true);
    if (awayP !== undefined) updates.push({ col: "away_primary_color", val: awayP });
    const awayS = validateHex("awaySecondary", body.awaySecondary, true);
    if (awayS !== undefined) updates.push({ col: "away_secondary_color", val: awayS });
    const awayPattern = validateEnum("awayPattern", body.awayPattern, VALID_JERSEY_PATTERNS, true);
    if (awayPattern !== undefined) updates.push({ col: "away_jersey_pattern", val: awayPattern });

    const badgePattern = validateEnum("badgePattern", body.badgePattern, VALID_BADGE_PATTERNS);
    if (badgePattern !== undefined) updates.push({ col: "badge_pattern", val: badgePattern });

    const scarfPattern = validateEnum("scarfPattern", body.scarfPattern, VALID_SCARF_PATTERNS, true);
    if (scarfPattern !== undefined) updates.push({ col: "scarf_pattern", val: scarfPattern });

    const homeShorts = validateHex("homeShortsColor", body.homeShortsColor, true);
    if (homeShorts !== undefined) updates.push({ col: "home_shorts_color", val: homeShorts });
    const homeSocks = validateHex("homeSocksColor", body.homeSocksColor, true);
    if (homeSocks !== undefined) updates.push({ col: "home_socks_color", val: homeSocks });
    const awayShorts = validateHex("awayShortsColor", body.awayShortsColor, true);
    if (awayShorts !== undefined) updates.push({ col: "away_shorts_color", val: awayShorts });
    const awaySocks = validateHex("awaySocksColor", body.awaySocksColor, true);
    if (awaySocks !== undefined) updates.push({ col: "away_socks_color", val: awaySocks });

    const badgePrimary = validateHex("badgePrimary", body.badgePrimary, true);
    if (badgePrimary !== undefined) updates.push({ col: "badge_primary_color", val: badgePrimary });
    const badgeSecondary = validateHex("badgeSecondary", body.badgeSecondary, true);
    if (badgeSecondary !== undefined) updates.push({ col: "badge_secondary_color", val: badgeSecondary });

    if (body.badgeInitials !== undefined) {
      if (body.badgeInitials === null || body.badgeInitials === "") {
        updates.push({ col: "badge_initials", val: null });
      } else if (typeof body.badgeInitials !== "string" || body.badgeInitials.length > 5) {
        throw new Error("Iniciály: max 5 znaků");
      } else {
        updates.push({ col: "badge_initials", val: body.badgeInitials.trim().toUpperCase() });
      }
    }
    if (body.badgeSymbol !== undefined) {
      if (body.badgeSymbol === null || body.badgeSymbol === "") {
        updates.push({ col: "badge_symbol", val: null });
      } else if (typeof body.badgeSymbol !== "string") {
        throw new Error("Symbol: max 4 znaky (emoji)");
      } else if (!body.badgeSymbol.startsWith("svg:") && body.badgeSymbol.length > 4) {
        throw new Error("Symbol: max 4 znaky (emoji)");
      } else {
        updates.push({ col: "badge_symbol", val: body.badgeSymbol });
      }
    }

    // sponsor field v body se ignoruje — hlavní sponzor se spravuje přes /dashboard/sponsors
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  if (updates.length === 0) return c.json({ error: "Žádné platné změny" }, 400);

  const setClause = updates.map((u) => `${u.col} = ?`).join(", ");
  const values = updates.map((u) => u.val);
  await c.env.DB.prepare(`UPDATE teams SET ${setClause} WHERE id = ?`).bind(...values, teamId).run();

  return c.json({ ok: true, updated: updates.map((u) => u.col) });
});

// POST /api/teams/:id/club/anthem/lyrics — vygeneruje text hymny přes Gemini
// body: { mode: "auto" | "custom", hints?: string }  (hints = user's klíčová slova/fráze)
teamsRouter.post("/:id/club/anthem/lyrics", async (c) => {
  const teamId = c.req.param("id");

  // Auth + ownership check
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Nepřihlášen" }, 401);
  const token = authHeader.slice(7);
  const { getSession } = await import("../auth/session");
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const team = await c.env.DB.prepare(
    `SELECT t.user_id, t.name, t.primary_color, t.secondary_color, t.badge_initials, t.badge_symbol,
            t.stadium_name, v.name as village_name, v.district
     FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?`
  ).bind(teamId).first<{
    user_id: string; name: string; primary_color: string; secondary_color: string;
    badge_initials: string | null; badge_symbol: string | null;
    stadium_name: string | null; village_name: string; district: string;
  }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  if (team.user_id !== session.userId) return c.json({ error: "Přístup odepřen" }, 403);

  const body = await c.req.json<{ mode?: "auto" | "custom"; hints?: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "anthem/lyrics invalid body", e); return { mode: "auto" as const, hints: "" }; });
  const mode = body.mode ?? "auto";
  const hints = (body.hints ?? "").trim().slice(0, 500);

  const geminiApiKey = c.env.GEMINI_API_KEY;
  if (!geminiApiKey) return c.json({ error: "Gemini API klíč nenastaven" }, 500);

  const clubInfo = [
    `Klub: ${team.name}`,
    `Vesnice: ${team.village_name}, okres ${team.district}`,
    team.stadium_name ? `Stadion: ${team.stadium_name}` : "",
    team.badge_initials ? `Iniciály/přezdívka: ${team.badge_initials}` : "",
    team.badge_symbol ? `Symbol klubu: ${team.badge_symbol}` : "",
    `Barvy: ${team.primary_color} / ${team.secondary_color}`,
  ].filter(Boolean).join("\n");

  const prompt = mode === "custom" && hints
    ? `Napiš český text klubové hymny pro amatérský vesnický fotbalový klub.

INFORMACE O KLUBU:
${clubInfo}

POVINNÁ SLOVA/FRÁZE/TÉMATA OD MANAŽERA (musí být v textu zahrnuta):
${hints}

Požadavky:
- Česky, gramaticky správně
- 2 sloky + refrén (celkem 10-16 řádků)
- Rýmuje se (AABB nebo ABAB)
- Tón: hrdý, vesnický, fotbalový, s nadsázkou
- První řádek = název hymny (bez "Titulek:" prefixu, bez uvozovek)
- Označ "[Sloka 1]", "[Refrén]", "[Sloka 2]", "[Refrén]"
- Vrať POUZE text hymny, žádné další komentáře`
    : `Napiš český text klubové hymny pro amatérský vesnický fotbalový klub.

INFORMACE O KLUBU:
${clubInfo}

Požadavky:
- Česky, gramaticky správně
- 2 sloky + refrén (celkem 10-16 řádků)
- Rýmuje se (AABB nebo ABAB)
- Tón: hrdý, vesnický, fotbalový, s humorem a nadsázkou
- Zmiň vesnici/město, barvy nebo přezdívku klubu
- První řádek = název hymny (bez "Titulek:" prefixu, bez uvozovek)
- Označ "[Sloka 1]", "[Refrén]", "[Sloka 2]", "[Refrén]"
- Vrať POUZE text hymny, žádné další komentáře`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.85, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    logger.warn({ module: "teams" }, `Gemini API error for anthem: ${res.status} — ${errBody.slice(0, 200)}`);
    return c.json({ error: "Generace hymny selhala" }, 502);
  }

  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) return c.json({ error: "Prázdná odpověď z Gemini" }, 502);

  // První neprázdný řádek = titulek, zbytek = lyrics
  const lines = text.split("\n");
  const titleLine = lines.find((l) => l.trim().length > 0) ?? team.name;
  const title = titleLine.replace(/^#+\s*/, "").replace(/^\*+|\*+$/g, "").trim();
  const lyricsBody = text.slice(text.indexOf(titleLine) + titleLine.length).trim();

  return c.json({ title, lyrics: lyricsBody, fullText: text });
});

// Helper — auth + ownership check
async function requireTeamOwner(c: import("hono").Context<{ Bindings: Bindings }>, teamId: string) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: c.json({ error: "Nepřihlášen" }, 401) };
  const token = authHeader.slice(7);
  const { getSession } = await import("../auth/session");
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return { error: c.json({ error: "Neplatná session" }, 401) };
  const team = await c.env.DB.prepare("SELECT user_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ user_id: string }>();
  if (!team) return { error: c.json({ error: "Tým nenalezen" }, 404) };
  if (team.user_id !== session.userId) return { error: c.json({ error: "Přístup odepřen" }, 403) };
  return { session };
}

// POST /api/teams/:id/club/anthem/generate — vygeneruje audio přes Suno (async), ukládá do historie
// body: { title, lyrics, style }
teamsRouter.post("/:id/club/anthem/generate", async (c) => {
  const teamId = c.req.param("id");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  const attemptsRes = await c.env.DB.prepare("SELECT COALESCE(anthem_attempts_used, 0) as used FROM teams WHERE id = ?")
    .bind(teamId).first<{ used: number }>();
  const used = attemptsRes?.used ?? 0;
  if (used >= ANTHEM_MAX_ATTEMPTS) {
    return c.json({ error: `Vyčerpal jsi všechny ${ANTHEM_MAX_ATTEMPTS} pokusy generace hymny.` }, 403);
  }

  const body = await c.req.json<{ title?: string; lyrics?: string; style?: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "anthem/generate invalid body", e); return { title: "", lyrics: "", style: "" }; });
  const title = (body.title ?? "").trim();
  const lyrics = (body.lyrics ?? "").trim();
  const rawStyle = (body.style ?? "").trim();
  const style = ANTHEM_STYLE_PRESETS.has(rawStyle) ? rawStyle : ANTHEM_DEFAULT_STYLE;
  if (!title || !lyrics) return c.json({ error: "Chybí název nebo text hymny" }, 400);
  if (lyrics.length > 3000) return c.json({ error: "Text je příliš dlouhý (max 3000 znaků)" }, 400);

  const sunoApiKey = c.env.SUNO_API_KEY;
  if (!sunoApiKey) {
    return c.json({ error: "Hudební generace není aktivovaná (chybí API klíč)" }, 503);
  }

  const sunoRes = await fetch("https://api.sunoapi.org/api/v1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sunoApiKey}` },
    body: JSON.stringify({
      prompt: lyrics, style, title,
      customMode: true, instrumental: false, model: "V4",
      callBackUrl: `${c.env.API_BASE_URL ?? "https://api-test.prales.fun"}/api/teams/${teamId}/club/anthem/callback`,
    }),
  });

  if (!sunoRes.ok) {
    const errBody = await sunoRes.text().catch(() => "");
    logger.warn({ module: "teams" }, `Suno API error: ${sunoRes.status} — ${errBody.slice(0, 200)}`);
    return c.json({ error: "Hudební generace selhala (Suno API chyba)" }, 502);
  }

  const sunoJson = await sunoRes.json() as { code?: number; data?: { taskId?: string } };
  const taskId = sunoJson.data?.taskId;
  if (!taskId) return c.json({ error: "Suno nevrátilo task ID" }, 502);

  const anthemId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO team_anthems (id, team_id, title, lyrics, style, suno_task_id, is_selected) VALUES (?, ?, ?, ?, ?, ?, 0)"
  ).bind(anthemId, teamId, title, lyrics, style, taskId).run();
  await c.env.DB.prepare("UPDATE teams SET anthem_attempts_used = COALESCE(anthem_attempts_used, 0) + 1 WHERE id = ?")
    .bind(teamId).run();

  return c.json({ anthemId, taskId, attemptsUsed: used + 1, maxAttempts: ANTHEM_MAX_ATTEMPTS });
});

// GET /api/teams/:id/club/anthem/status — polling stavu všech pending hymen
teamsRouter.get("/:id/club/anthem/status", async (c) => {
  const teamId = c.req.param("id");

  // Pending hymny (url IS NULL, suno_task_id IS NOT NULL)
  const pending = await c.env.DB.prepare(
    "SELECT id, suno_task_id FROM team_anthems WHERE team_id = ? AND url IS NULL AND suno_task_id IS NOT NULL"
  ).bind(teamId).all<{ id: string; suno_task_id: string }>();

  if ((pending.results ?? []).length === 0) {
    return c.json({ status: "idle" });
  }

  const sunoApiKey = c.env.SUNO_API_KEY;
  if (!sunoApiKey) return c.json({ status: "pending", pendingCount: pending.results.length });

  const apiBase = c.env.API_BASE_URL || new URL(c.req.url).origin;
  const errorStatuses = ["SENSITIVE_WORD_ERROR", "CREDIT_INSUFFICIENT", "GENERATE_FAILED", "PARAM_ERROR", "CALLBACK_EXCEPTION"];
  const messages: string[] = [];

  for (const row of pending.results) {
    const sunoRes = await fetch(`https://api.sunoapi.org/api/v1/generate/record-info?taskId=${row.suno_task_id}`, {
      headers: { Authorization: `Bearer ${sunoApiKey}` },
    });
    if (!sunoRes.ok) continue;

    const statusJson = await sunoRes.json() as {
      data?: { status?: string; errorMessage?: string; response?: { sunoData?: Array<{ audioUrl?: string }> } };
    };
    const sunoStatus = statusJson.data?.status;
    const audioUrl = statusJson.data?.response?.sunoData?.[0]?.audioUrl;

    if (sunoStatus === "SUCCESS" && audioUrl) {
      try {
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) throw new Error(`audio fetch ${audioRes.status}`);
        const audioBuffer = await audioRes.arrayBuffer();
        await c.env.SEED_DATA.put(`anthem/${row.id}.mp3`, audioBuffer, { httpMetadata: { contentType: "audio/mpeg" } });
        const streamUrl = `${apiBase}/api/teams/${teamId}/club/anthem/${row.id}/stream`;
        await c.env.DB.prepare("UPDATE team_anthems SET url = ?, suno_task_id = NULL WHERE id = ?").bind(streamUrl, row.id).run();

        // Pokud nemá žádnou selected hymnu, auto-select tuhle
        const hasSelected = await c.env.DB.prepare("SELECT id FROM team_anthems WHERE team_id = ? AND is_selected = 1 LIMIT 1")
          .bind(teamId).first();
        if (!hasSelected) {
          await c.env.DB.prepare("UPDATE team_anthems SET is_selected = 1 WHERE id = ?").bind(row.id).run();
          await c.env.DB.prepare(
            "UPDATE teams SET anthem_url = ?, anthem_title = (SELECT title FROM team_anthems WHERE id = ?), anthem_lyrics = (SELECT lyrics FROM team_anthems WHERE id = ?), anthem_style = (SELECT style FROM team_anthems WHERE id = ?) WHERE id = ?"
          ).bind(streamUrl, row.id, row.id, row.id, teamId).run();
        }
        messages.push(`SUCCESS:${row.id}`);
      } catch (e) {
        logger.warn({ module: "teams" }, "anthem R2 upload failed", e);
      }
    } else if (sunoStatus && errorStatuses.includes(sunoStatus)) {
      // Při chybě smažeme pouze row (přísná politika — pokus se NEvrací)
      await c.env.DB.prepare("DELETE FROM team_anthems WHERE id = ?").bind(row.id).run();
      const rawErr = statusJson.data?.errorMessage || sunoStatus;
      let czechMsg = rawErr;
      if (sunoStatus === "SENSITIVE_WORD_ERROR") czechMsg = "Styl obsahuje zakázané slovo (jméno interpreta).";
      else if (sunoStatus === "CREDIT_INSUFFICIENT") czechMsg = "Nedostatek kreditů u Suno AI.";
      else if (sunoStatus === "GENERATE_FAILED") czechMsg = "Suno nedokázala hudbu vygenerovat. Zkus jiný styl.";
      else if (sunoStatus === "PARAM_ERROR") czechMsg = "Chybný formát textu nebo stylu.";
      messages.push(`ERROR:${row.id}:${czechMsg}`);
      logger.warn({ module: "teams" }, `Suno anthem error: ${sunoStatus} — ${rawErr}`);
    }
  }

  return c.json({ status: "polled", messages });
});

// GET /api/teams/:id/club/anthem/list — všechny hymny týmu
teamsRouter.get("/:id/club/anthem/list", async (c) => {
  const teamId = c.req.param("id");
  const rows = await c.env.DB.prepare(
    "SELECT id, title, lyrics, style, url, is_selected, created_at, suno_task_id FROM team_anthems WHERE team_id = ? ORDER BY created_at DESC"
  ).bind(teamId).all<{ id: string; title: string; lyrics: string; style: string; url: string | null; is_selected: number; created_at: string; suno_task_id: string | null }>();
  const attempts = await c.env.DB.prepare("SELECT COALESCE(anthem_attempts_used, 0) as used FROM teams WHERE id = ?")
    .bind(teamId).first<{ used: number }>();

  return c.json({
    anthems: (rows.results ?? []).map((r) => ({
      id: r.id, title: r.title, lyrics: r.lyrics, style: r.style, url: r.url,
      isSelected: r.is_selected === 1, createdAt: r.created_at,
      generating: !r.url && !!r.suno_task_id,
    })),
    attemptsUsed: attempts?.used ?? 0,
    maxAttempts: ANTHEM_MAX_ATTEMPTS,
  });
});

// POST /api/teams/:id/club/anthem/:anthemId/select — nastaví hymnu jako aktuální
teamsRouter.post("/:id/club/anthem/:anthemId/select", async (c) => {
  const teamId = c.req.param("id");
  const anthemId = c.req.param("anthemId");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  const row = await c.env.DB.prepare("SELECT id, team_id, title, lyrics, style, url FROM team_anthems WHERE id = ? AND team_id = ?")
    .bind(anthemId, teamId).first<{ id: string; team_id: string; title: string; lyrics: string; style: string; url: string | null }>();
  if (!row) return c.json({ error: "Hymna nenalezena" }, 404);
  if (!row.url) return c.json({ error: "Hymna ještě není hotová" }, 400);

  await c.env.DB.prepare("UPDATE team_anthems SET is_selected = 0 WHERE team_id = ?").bind(teamId).run();
  await c.env.DB.prepare("UPDATE team_anthems SET is_selected = 1 WHERE id = ?").bind(anthemId).run();
  await c.env.DB.prepare(
    "UPDATE teams SET anthem_url = ?, anthem_title = ?, anthem_lyrics = ?, anthem_style = ? WHERE id = ?"
  ).bind(row.url, row.title, row.lyrics, row.style, teamId).run();

  return c.json({ ok: true });
});

// DELETE /api/teams/:id/club/anthem/:anthemId — smaže hymnu z historie + R2
teamsRouter.delete("/:id/club/anthem/:anthemId", async (c) => {
  const teamId = c.req.param("id");
  const anthemId = c.req.param("anthemId");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  const row = await c.env.DB.prepare("SELECT is_selected FROM team_anthems WHERE id = ? AND team_id = ?")
    .bind(anthemId, teamId).first<{ is_selected: number }>();
  if (!row) return c.json({ error: "Hymna nenalezena" }, 404);

  await c.env.SEED_DATA.delete(`anthem/${anthemId}.mp3`).catch((e) => {
    logger.warn({ module: "teams" }, "anthem R2 delete failed", e);
  });
  await c.env.DB.prepare("DELETE FROM team_anthems WHERE id = ?").bind(anthemId).run();

  if (row.is_selected === 1) {
    // Pokud byla selected, vyber jinou nejnovější (pokud existuje) nebo clear teams
    const next = await c.env.DB.prepare(
      "SELECT id, title, lyrics, style, url FROM team_anthems WHERE team_id = ? AND url IS NOT NULL ORDER BY created_at DESC LIMIT 1"
    ).bind(teamId).first<{ id: string; title: string; lyrics: string; style: string; url: string }>();
    if (next) {
      await c.env.DB.prepare("UPDATE team_anthems SET is_selected = 1 WHERE id = ?").bind(next.id).run();
      await c.env.DB.prepare(
        "UPDATE teams SET anthem_url = ?, anthem_title = ?, anthem_lyrics = ?, anthem_style = ? WHERE id = ?"
      ).bind(next.url, next.title, next.lyrics, next.style, teamId).run();
    } else {
      await c.env.DB.prepare(
        "UPDATE teams SET anthem_url = NULL, anthem_title = NULL, anthem_lyrics = NULL, anthem_style = NULL WHERE id = ?"
      ).bind(teamId).run();
    }
  }

  return c.json({ ok: true });
});

// GET /api/teams/:id/club/anthem/:anthemId/stream — mp3 z R2
teamsRouter.get("/:id/club/anthem/:anthemId/stream", async (c) => {
  const anthemId = c.req.param("anthemId");
  const obj = await c.env.SEED_DATA.get(`anthem/${anthemId}.mp3`);
  if (!obj) return c.json({ error: "Hymna není k dispozici" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=3600" },
  });
});

// PATCH /api/teams/:id/club/identity — manuální update identity fields
teamsRouter.patch("/:id/club/identity", async (c) => {
  const teamId = c.req.param("id");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  type IdentityBody = {
    nickname?: string | null;
    motto?: string | null;
    foundingYear?: number | null;
    foundingStory?: string | null;
    colorsMeaning?: string | null;
  };
  const body: IdentityBody = await c.req.json<IdentityBody>()
    .catch((e) => { logger.warn({ module: "teams" }, "club/identity invalid body", e); return {} as IdentityBody; });

  const updates: Array<{ col: string; val: string | number | null }> = [];

  function strOrNull(field: string, val: unknown, maxLen: number): string | null | undefined {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    if (typeof val !== "string") throw new Error(`Pole ${field} musí být text`);
    const trimmed = val.trim();
    if (trimmed.length > maxLen) throw new Error(`Pole ${field}: max ${maxLen} znaků`);
    return trimmed;
  }

  try {
    const nickname = strOrNull("nickname", body.nickname, 40);
    if (nickname !== undefined) updates.push({ col: "team_nickname", val: nickname });
    const motto = strOrNull("motto", body.motto, 120);
    if (motto !== undefined) updates.push({ col: "club_motto", val: motto });
    const story = strOrNull("foundingStory", body.foundingStory, 2000);
    if (story !== undefined) updates.push({ col: "founding_story", val: story });
    const colors = strOrNull("colorsMeaning", body.colorsMeaning, 500);
    if (colors !== undefined) updates.push({ col: "colors_meaning", val: colors });
    if (body.foundingYear !== undefined) {
      if (body.foundingYear === null) updates.push({ col: "founding_year", val: null });
      else {
        const y = Number(body.foundingYear);
        if (!Number.isInteger(y) || y < 1800 || y > 2100) throw new Error("Rok založení musí být 1800-2100");
        updates.push({ col: "founding_year", val: y });
      }
    }
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  if (updates.length === 0) return c.json({ error: "Žádné změny" }, 400);
  const setClause = updates.map((u) => `${u.col} = ?`).join(", ");
  await c.env.DB.prepare(`UPDATE teams SET ${setClause} WHERE id = ?`)
    .bind(...updates.map((u) => u.val), teamId).run();

  return c.json({ ok: true, updated: updates.map((u) => u.col) });
});

// POST /api/teams/:id/club/identity/generate — AI generace textu (motto/story/colorsMeaning)
teamsRouter.post("/:id/club/identity/generate", async (c) => {
  const teamId = c.req.param("id");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  const body = await c.req.json<{ kind?: "motto" | "story" | "colors" }>()
    .catch((e) => { logger.warn({ module: "teams" }, "club/identity/generate invalid body", e); return { kind: undefined }; });
  const kind = body.kind;
  if (!kind || !["motto", "story", "colors"].includes(kind)) {
    return c.json({ error: "Neplatný typ generace" }, 400);
  }

  const team = await c.env.DB.prepare(
    `SELECT t.name, t.primary_color, t.secondary_color, t.team_nickname, t.badge_symbol, t.stadium_name, t.founding_year,
            v.name as village_name, v.district, v.region
     FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?`
  ).bind(teamId).first<{
    name: string; primary_color: string; secondary_color: string;
    team_nickname: string | null; badge_symbol: string | null;
    stadium_name: string | null; founding_year: number | null;
    village_name: string; district: string; region: string;
  }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const geminiKey = c.env.GEMINI_API_KEY;
  if (!geminiKey) return c.json({ error: "Gemini není nastaveno" }, 500);

  const primaryName = hexToCzechColorName(team.primary_color);
  const secondaryName = hexToCzechColorName(team.secondary_color);
  const clubInfo = [
    `Klub: ${team.name}`,
    `Vesnice: ${team.village_name}, okres ${team.district}, region ${team.region}`,
    team.team_nickname ? `Přezdívka: ${team.team_nickname}` : "",
    team.badge_symbol ? `Symbol klubu: ${team.badge_symbol}` : "",
    team.stadium_name ? `Stadion: ${team.stadium_name}` : "",
    team.founding_year ? `Rok založení: ${team.founding_year}` : "",
    `Barvy: ${primaryName} a ${secondaryName}`,
  ].filter(Boolean).join("\n");

  let prompt = "";
  let maxTokens = 400;
  if (kind === "motto") {
    prompt = `Vymysli klubové motto pro amatérský vesnický fotbalový klub.

${clubInfo}

Požadavky:
- Česky, gramaticky správně
- Krátké (max 60 znaků, ideálně 3-6 slov)
- Vesnický humor, fotbalový duch, hrdost
- Lze použít slovní hříčku, rým nebo ironii
- Vrať POUZE motto, žádné uvozovky, žádné komentáře`;
    maxTokens = 100;
  } else if (kind === "story") {
    prompt = `Napiš krátký humorný příběh o založení amatérského vesnického fotbalového klubu.

${clubInfo}

Požadavky:
- Česky, gramaticky správně
- 3-5 vět
- Vesnický humor, nadsázka (např. založili v hospodě, na poli, po pohřbu)
- Zmínit vesnici, rok (pokud je zadán), charakteristické osoby
- Vrať POUZE text, žádné komentáře ani uvozovky`;
    maxTokens = 500;
  } else if (kind === "colors") {
    prompt = `Vymysli význam klubových barev pro vesnický fotbalový klub.

${clubInfo}

Požadavky:
- Česky, gramaticky správně
- 1-2 věty (max 200 znaků)
- Co barvy symbolizují — mohou být vtipné (např. "zelená jako traktor starosty", "bílá jako pěna z piva U Medvěda")
- NIKDY neuváděj hex kódy barev (jako #2D5F2D), používej jen jejich české názvy
- Vrať POUZE text, žádné komentáře ani uvozovky`;
    maxTokens = 200;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.9, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    logger.warn({ module: "teams" }, `Gemini identity error: ${res.status} — ${errBody.slice(0, 200)}`);
    return c.json({ error: "Generace selhala" }, 502);
  }
  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) return c.json({ error: "Prázdná odpověď" }, 502);

  return c.json({ text });
});

// PATCH /api/teams/:id/club/stadium — update stadion metadata (jméno, přezdívka, rok, specialita, tribuny)
teamsRouter.patch("/:id/club/stadium", async (c) => {
  const teamId = c.req.param("id");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  type StadiumBody = {
    stadiumName?: string | null;
    nickname?: string | null;
    builtYear?: number | null;
    specialita?: string | null;
    tribunaNorth?: string | null;
    tribunaSouth?: string | null;
  };
  const body: StadiumBody = await c.req.json<StadiumBody>()
    .catch((e) => { logger.warn({ module: "teams" }, "club/stadium invalid body", e); return {} as StadiumBody; });

  const updates: Array<{ col: string; val: string | number | null }> = [];

  function strOrNull(field: string, val: unknown, maxLen: number): string | null | undefined {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    if (typeof val !== "string") throw new Error(`Pole ${field} musí být text`);
    const trimmed = val.trim();
    if (trimmed.length > maxLen) throw new Error(`Pole ${field}: max ${maxLen} znaků`);
    return trimmed;
  }

  try {
    const name = strOrNull("stadiumName", body.stadiumName, 60);
    if (name !== undefined) {
      const namingSponsor = await c.env.DB.prepare(
        "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND category = 'stadium' LIMIT 1"
      ).bind(teamId).first<{ sponsor_name: string }>();
      if (namingSponsor) {
        return c.json({ error: `Název stadionu nemůžeš měnit — určuje ho sponzor "${namingSponsor.sponsor_name}".` }, 403);
      }
      updates.push({ col: "stadium_name", val: name });
    }
    const nick = strOrNull("nickname", body.nickname, 40);
    if (nick !== undefined) updates.push({ col: "stadium_nickname", val: nick });
    const specialita = strOrNull("specialita", body.specialita, 80);
    if (specialita !== undefined) updates.push({ col: "stadium_specialita", val: specialita });
    const tn = strOrNull("tribunaNorth", body.tribunaNorth, 40);
    if (tn !== undefined) updates.push({ col: "stadium_tribuna_north", val: tn });
    const ts = strOrNull("tribunaSouth", body.tribunaSouth, 40);
    if (ts !== undefined) updates.push({ col: "stadium_tribuna_south", val: ts });
    if (body.builtYear !== undefined) {
      if (body.builtYear === null) updates.push({ col: "stadium_built_year", val: null });
      else {
        const y = Number(body.builtYear);
        if (!Number.isInteger(y) || y < 1800 || y > 2100) throw new Error("Rok výstavby musí být 1800-2100");
        updates.push({ col: "stadium_built_year", val: y });
      }
    }
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  if (updates.length === 0) return c.json({ error: "Žádné změny" }, 400);
  const setClause = updates.map((u) => `${u.col} = ?`).join(", ");
  await c.env.DB.prepare(`UPDATE teams SET ${setClause} WHERE id = ?`)
    .bind(...updates.map((u) => u.val), teamId).run();

  return c.json({ ok: true, updated: updates.map((u) => u.col) });
});

// ═══════════════════════════════════════════════════════════════════
// MASKOT — historie (max 3), Replicate Flux pro image gen
// ═══════════════════════════════════════════════════════════════════
const MASCOT_MAX_ATTEMPTS = 3;
const VALID_ANIMALS = new Set([
  "bear", "lion", "eagle", "wolf", "boar", "deer", "horse",
  "rooster", "dog", "cow", "bull", "fox", "dragon", "pirate",
  "jester", "human", "pepper", "tree",
]);
const VALID_MASCOT_STYLES = new Set([
  "cartoon", "sports_mascot", "retro_80s", "watercolor", "minimalist",
]);

function hexToCzechColorName(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lum = (r + g + b) / 3;
  if (chroma < 25) {
    if (lum > 220) return "bílá";
    if (lum > 170) return "světle šedá";
    if (lum > 80) return "šedá";
    if (lum > 40) return "tmavě šedá";
    return "černá";
  }
  const shade = lum > 180 ? "světle " : lum < 70 ? "tmavě " : "";
  if (r > 200 && g > 200 && b < 100) return "žlutá";
  if (r > 200 && g > 150 && g < 200 && b < 100) return "oranžová";
  if (r > g && r > b) return `${shade}červená`;
  if (g > r && g > b) return `${shade}zelená`;
  if (b > r && b > g) return `${shade}modrá`;
  if (r === g && r > b) return `${shade}žlutá`;
  if (r === b && r > g) return `${shade}fialová`;
  if (g === b && g > r) return `${shade}tyrkysová`;
  return `${shade}barva`;
}

function hexToColorName(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lum = (r + g + b) / 3;
  if (chroma < 25) {
    if (lum > 220) return "pure white";
    if (lum > 170) return "light gray";
    if (lum > 80) return "gray";
    if (lum > 40) return "dark gray";
    return "black";
  }
  const lightBucket = lum > 180 ? "light " : lum < 70 ? "dark " : "";
  if (r > 200 && g > 200 && b < 100) return "bright yellow";
  if (r > 200 && g > 150 && g < 200 && b < 100) return "orange";
  if (r > g && r > b) return `${lightBucket}red`;
  if (g > r && g > b) return `${lightBucket}green`;
  if (b > r && b > g) return `${lightBucket}blue`;
  if (r === g && r > b) return `${lightBucket}yellow`;
  if (r === b && r > g) return `${lightBucket}purple`;
  if (g === b && g > r) return `${lightBucket}cyan`;
  return `${lightBucket}colored`;
}

const JERSEY_PATTERN_DESC: Record<string, string> = {
  solid: "solid color",
  stripes: "vertical striped",
  hoops: "horizontal striped",
  halves: "two-colored half-split",
  sash: "sash design",
  sleeves: "contrast sleeves",
  chest_band: "chest band",
  pinstripes: "thin pinstriped",
  quarters: "quartered color-blocked",
  gradient: "gradient",
};

function mascotPromptFor(animal: string, style: string, _name: string, jersey: { primary: string; secondary: string; pattern: string }): string {
  const animalDesc: Record<string, string> = {
    bear: "friendly brown bear",
    lion: "majestic lion",
    eagle: "fierce eagle",
    wolf: "cool gray wolf",
    boar: "strong wild boar",
    deer: "noble deer with antlers",
    horse: "galloping horse",
    rooster: "proud rooster",
    dog: "loyal dog",
    cow: "happy cartoon cow",
    bull: "strong bull",
    fox: "clever red fox",
    dragon: "friendly green dragon",
    pirate: "pirate character with eyepatch",
    jester: "colorful jester character",
    human: "cheerful human mascot character",
    pepper: "anthropomorphic red chili pepper with face",
    tree: "anthropomorphic oak tree with face",
  };
  const styleDesc: Record<string, string> = {
    cartoon: "Disney Pixar 3D cartoon style, cute round proportions, big expressive eyes, soft lighting",
    sports_mascot: "NBA style sports mascot, bold confident pose, vibrant colors, dynamic action",
    retro_80s: "vintage 1980s sports logo style, simple bold lines, limited palette, flat design",
    watercolor: "soft watercolor painting, loose brush strokes, artistic, pastel colors",
    minimalist: "minimalist flat vector illustration, simple geometric shapes, thick outlines, 2-3 colors",
  };
  const base = animalDesc[animal] ?? animal;
  const styleStr = styleDesc[style] ?? style;
  const primaryName = hexToColorName(jersey.primary);
  const secondaryName = hexToColorName(jersey.secondary);
  const patternDesc = JERSEY_PATTERN_DESC[jersey.pattern] ?? "solid color";
  return `${base} as football team mascot, wearing a ${patternDesc} football jersey in ${primaryName} and ${secondaryName} colors with matching shorts, no text or numbers on the jersey, holding a soccer ball, ${styleStr}, centered composition, full body shot, clean white background`;
}

// POST /api/teams/:id/club/mascot/generate
teamsRouter.post("/:id/club/mascot/generate", async (c) => {
  const teamId = c.req.param("id");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  const attemptsRes = await c.env.DB.prepare("SELECT COALESCE(mascot_attempts_used, 0) as used FROM teams WHERE id = ?")
    .bind(teamId).first<{ used: number }>();
  const used = attemptsRes?.used ?? 0;
  if (used >= MASCOT_MAX_ATTEMPTS) {
    return c.json({ error: `Vyčerpal jsi všechny ${MASCOT_MAX_ATTEMPTS} pokusy generace maskota.` }, 403);
  }

  const body = await c.req.json<{ name?: string; animal?: string; style?: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "mascot/generate invalid body", e); return { name: "", animal: "", style: "" }; });
  const name = (body.name ?? "").trim().slice(0, 50);
  const animal = (body.animal ?? "").trim();
  const style = (body.style ?? "").trim();
  if (!name) return c.json({ error: "Chybí jméno maskota" }, 400);
  if (!VALID_ANIMALS.has(animal)) return c.json({ error: "Neplatný typ bytosti" }, 400);
  if (!VALID_MASCOT_STYLES.has(style)) return c.json({ error: "Neplatný styl" }, 400);

  const token = c.env.REPLICATE_API_TOKEN;
  if (!token) return c.json({ error: "Image generace není aktivovaná (chybí API token)" }, 503);

  // Získat team colors + jersey pattern pro prompt
  const team = await c.env.DB.prepare("SELECT primary_color, secondary_color, jersey_pattern FROM teams WHERE id = ?")
    .bind(teamId).first<{ primary_color: string; secondary_color: string; jersey_pattern: string | null }>();
  const prompt = mascotPromptFor(animal, style, name, {
    primary: team?.primary_color ?? "#2D5F2D",
    secondary: team?.secondary_color ?? "#FFFFFF",
    pattern: team?.jersey_pattern ?? "solid",
  });
  logger.warn({ module: "teams" }, `Mascot prompt: ${prompt}`);

  // Volání Replicate (Flux Schnell - rychlý)
  const replicateRes = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Prefer: "wait",
    },
    body: JSON.stringify({
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: "1:1",
        output_format: "png",
        output_quality: 90,
        num_inference_steps: 4,
      },
    }),
  });

  if (!replicateRes.ok) {
    const errBody = await replicateRes.text().catch(() => "");
    logger.warn({ module: "teams" }, `Replicate error: ${replicateRes.status} — ${errBody.slice(0, 300)}`);
    if (replicateRes.status === 402 || errBody.toLowerCase().includes("insufficient credit")) {
      return c.json({ error: "Replicate účet nemá kredity. Kontaktuj administrátora aby dokoupil kredity na https://replicate.com/account/billing." }, 402);
    }
    if (replicateRes.status === 401) {
      return c.json({ error: "Replicate API token je neplatný. Kontaktuj administrátora." }, 502);
    }
    if (replicateRes.status === 429) {
      return c.json({ error: "Replicate rate limit — zkus za chvíli znovu." }, 429);
    }
    return c.json({ error: `Generace obrázku selhala (Replicate ${replicateRes.status})` }, 502);
  }

  const predictionJson = await replicateRes.json() as { output?: string | string[]; status?: string; error?: string };
  if (predictionJson.status === "failed" || predictionJson.error) {
    logger.warn({ module: "teams" }, `Replicate prediction failed: ${predictionJson.error}`);
    return c.json({ error: "Generace obrázku selhala" }, 502);
  }
  const imageUrl = Array.isArray(predictionJson.output) ? predictionJson.output[0] : predictionJson.output;
  if (!imageUrl) return c.json({ error: "Replicate nevrátilo obrázek" }, 502);

  // Stáhnout a uložit do R2
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return c.json({ error: "Nepodařilo se stáhnout obrázek" }, 502);
  const imgBuffer = await imgRes.arrayBuffer();
  const mascotId = crypto.randomUUID();
  await c.env.SEED_DATA.put(`mascot/${mascotId}.png`, imgBuffer, { httpMetadata: { contentType: "image/png" } });
  const apiBase = c.env.API_BASE_URL || new URL(c.req.url).origin;
  const publicUrl = `${apiBase}/api/teams/${teamId}/club/mascot/${mascotId}/image`;

  await c.env.DB.prepare(
    "INSERT INTO team_mascots (id, team_id, name, animal, style, image_url, is_selected) VALUES (?, ?, ?, ?, ?, ?, 0)"
  ).bind(mascotId, teamId, name, animal, style, publicUrl).run();
  await c.env.DB.prepare("UPDATE teams SET mascot_attempts_used = COALESCE(mascot_attempts_used, 0) + 1 WHERE id = ?")
    .bind(teamId).run();

  // Auto-select pokud je to první
  const hasSelected = await c.env.DB.prepare("SELECT id FROM team_mascots WHERE team_id = ? AND is_selected = 1 LIMIT 1")
    .bind(teamId).first();
  if (!hasSelected) {
    await c.env.DB.prepare("UPDATE team_mascots SET is_selected = 1 WHERE id = ?").bind(mascotId).run();
  }

  return c.json({ mascotId, url: publicUrl, attemptsUsed: used + 1, maxAttempts: MASCOT_MAX_ATTEMPTS });
});

// POST /api/teams/:id/club/mascot/:mascotId/story — AI příběh maskota
teamsRouter.post("/:id/club/mascot/:mascotId/story", async (c) => {
  const teamId = c.req.param("id");
  const mascotId = c.req.param("mascotId");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  const row = await c.env.DB.prepare("SELECT id, name, animal, style FROM team_mascots WHERE id = ? AND team_id = ?")
    .bind(mascotId, teamId).first<{ id: string; name: string; animal: string; style: string }>();
  if (!row) return c.json({ error: "Maskot nenalezen" }, 404);

  const team = await c.env.DB.prepare(
    `SELECT t.name, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?`
  ).bind(teamId).first<{ name: string; village_name: string; district: string }>();

  const geminiKey = c.env.GEMINI_API_KEY;
  if (!geminiKey) return c.json({ error: "Gemini není nastaveno" }, 500);

  const prompt = `Napiš krátký humorný příběh (2-3 věty, česky) o maskotu fotbalového klubu ${team?.name}.

Maskot se jmenuje "${row.name}" a je to ${row.animal}.
Klub je z vesnice ${team?.village_name} (okres ${team?.district}).

Požadavky:
- Česky, přirozeně
- 2-3 věty max
- Vesnický humor, nadsázka
- Zmínit vesnici nebo okres
- Vrať POUZE text, žádné další komentáře`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.9, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );
  if (!geminiRes.ok) return c.json({ error: "Příběh se nepovedlo vygenerovat" }, 502);
  const json = await geminiRes.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const story = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!story) return c.json({ error: "Prázdná odpověď" }, 502);

  await c.env.DB.prepare("UPDATE team_mascots SET story = ? WHERE id = ?").bind(story, mascotId).run();
  return c.json({ story });
});

// GET /api/teams/:id/club/mascot/list
teamsRouter.get("/:id/club/mascot/list", async (c) => {
  const teamId = c.req.param("id");
  const rows = await c.env.DB.prepare(
    "SELECT id, name, animal, style, story, image_url, is_selected, created_at FROM team_mascots WHERE team_id = ? ORDER BY created_at DESC"
  ).bind(teamId).all<{ id: string; name: string; animal: string; style: string; story: string | null; image_url: string | null; is_selected: number; created_at: string }>();

  const attempts = await c.env.DB.prepare("SELECT COALESCE(mascot_attempts_used, 0) as used FROM teams WHERE id = ?")
    .bind(teamId).first<{ used: number }>();

  return c.json({
    mascots: (rows.results ?? []).map((r) => ({
      id: r.id, name: r.name, animal: r.animal, style: r.style,
      story: r.story, imageUrl: r.image_url, isSelected: r.is_selected === 1,
      createdAt: r.created_at,
    })),
    attemptsUsed: attempts?.used ?? 0,
    maxAttempts: MASCOT_MAX_ATTEMPTS,
  });
});

// POST /api/teams/:id/club/mascot/:mascotId/select
teamsRouter.post("/:id/club/mascot/:mascotId/select", async (c) => {
  const teamId = c.req.param("id");
  const mascotId = c.req.param("mascotId");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  const row = await c.env.DB.prepare("SELECT id FROM team_mascots WHERE id = ? AND team_id = ?")
    .bind(mascotId, teamId).first();
  if (!row) return c.json({ error: "Maskot nenalezen" }, 404);

  await c.env.DB.prepare("UPDATE team_mascots SET is_selected = 0 WHERE team_id = ?").bind(teamId).run();
  await c.env.DB.prepare("UPDATE team_mascots SET is_selected = 1 WHERE id = ?").bind(mascotId).run();
  return c.json({ ok: true });
});

// DELETE /api/teams/:id/club/mascot/:mascotId
teamsRouter.delete("/:id/club/mascot/:mascotId", async (c) => {
  const teamId = c.req.param("id");
  const mascotId = c.req.param("mascotId");
  const auth = await requireTeamOwner(c, teamId);
  if (auth.error) return auth.error;

  const row = await c.env.DB.prepare("SELECT is_selected FROM team_mascots WHERE id = ? AND team_id = ?")
    .bind(mascotId, teamId).first<{ is_selected: number }>();
  if (!row) return c.json({ error: "Maskot nenalezen" }, 404);

  await c.env.SEED_DATA.delete(`mascot/${mascotId}.png`).catch((e) => {
    logger.warn({ module: "teams" }, "mascot R2 delete failed", e);
  });
  await c.env.DB.prepare("DELETE FROM team_mascots WHERE id = ?").bind(mascotId).run();

  if (row.is_selected === 1) {
    const next = await c.env.DB.prepare(
      "SELECT id FROM team_mascots WHERE team_id = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(teamId).first<{ id: string }>();
    if (next) {
      await c.env.DB.prepare("UPDATE team_mascots SET is_selected = 1 WHERE id = ?").bind(next.id).run();
    }
  }
  return c.json({ ok: true });
});

// GET /api/teams/:id/club/mascot/:mascotId/image — obrázek z R2
teamsRouter.get("/:id/club/mascot/:mascotId/image", async (c) => {
  const mascotId = c.req.param("mascotId");
  const obj = await c.env.SEED_DATA.get(`mascot/${mascotId}.png`);
  if (!obj) return c.json({ error: "Obrázek není k dispozici" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
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

// GET /api/teams/:id/players/:playerId/attendance — docházka hráče
//   - tréninky: kumulativní X/Y + procento (nemáme per-day historii)
//   - zápasy: seznam zameškaných v aktuální sezóně s důvodem + SMS
teamsRouter.get("/:id/players/:playerId/attendance", async (c) => {
  const teamId = c.req.param("id");
  const playerId = c.req.param("playerId");

  // Získat jméno hráče (pro fuzzy match v matches.absences[].name)
  const player = await c.env.DB.prepare(
    "SELECT first_name, last_name FROM players WHERE id = ? AND team_id = ?"
  ).bind(playerId, teamId).first<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch player for attendance", e); return null; });
  if (!player) return c.json({ error: "Player not found in this team" }, 404);
  const fullName = `${player.first_name} ${player.last_name}`;

  // Aktivní sezóna
  const season = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "teams" }, "fetch active season for player attendance", e); return null; });

  // Training attendance z teams.training_attendance
  const teamRow = await c.env.DB.prepare("SELECT training_attendance FROM teams WHERE id = ?")
    .bind(teamId).first<{ training_attendance: string | null }>().catch((e) => { logger.warn({ module: "teams" }, "fetch team training_attendance for player", e); return null; });
  let trainingAttended = 0;
  let trainingTotal = 0;
  try {
    const att = JSON.parse(teamRow?.training_attendance ?? "{}") as Record<string, { attended: number; total: number }>;
    if (att[playerId]) {
      trainingAttended = att[playerId].attended ?? 0;
      trainingTotal = att[playerId].total ?? 0;
    }
  } catch (e) { logger.warn({ module: "teams" }, "parse training_attendance for player", e); }
  const trainingPct = trainingTotal > 0 ? Math.round((trainingAttended / trainingTotal) * 100) : 0;

  // Zápasy aktuální sezóny pro tým
  let matches: Array<{
    matchId: string; date: string | null; round: number | null;
    opponent: string; opponentId: string; isHome: boolean;
    homeScore: number | null; awayScore: number | null;
    status: "played" | "missed";
    reason: string | null; smsText: string | null;
  }> = [];
  if (season) {
    const matchRows = await c.env.DB.prepare(
      `SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
              m.simulated_at, m.round, m.absences,
              ht.name as home_name, at.name as away_name
       FROM matches m
       JOIN leagues l ON m.league_id = l.id
       LEFT JOIN teams ht ON m.home_team_id = ht.id
       LEFT JOIN teams at ON m.away_team_id = at.id
       WHERE (m.home_team_id = ? OR m.away_team_id = ?)
         AND m.status = 'simulated'
         AND l.season_id = ?
       ORDER BY m.simulated_at DESC`
    ).bind(teamId, teamId, season.id).all<Record<string, unknown>>()
      .catch((e) => { logger.warn({ module: "teams" }, "fetch matches for attendance", e); return { results: [] }; });

    // Které zápasy hráč skutečně hrál (z match_player_stats)
    const playedRes = await c.env.DB.prepare(
      `SELECT mps.match_id FROM match_player_stats mps
       JOIN matches m ON mps.match_id = m.id
       JOIN leagues l ON m.league_id = l.id
       WHERE mps.player_id = ? AND mps.team_id = ? AND l.season_id = ?`
    ).bind(playerId, teamId, season.id).all<{ match_id: string }>()
      .catch((e) => { logger.warn({ module: "teams" }, "fetch played matches", e); return { results: [] }; });
    const playedSet = new Set(playedRes.results.map((r) => r.match_id));

    matches = matchRows.results.map((row) => {
      const isHome = row.home_team_id === teamId;
      const opponentId = isHome ? (row.away_team_id as string) : (row.home_team_id as string);
      const opponent = isHome ? (row.away_name as string) : (row.home_name as string);
      const matchId = row.id as string;
      const played = playedSet.has(matchId);
      let reason: string | null = null;
      let smsText: string | null = null;
      if (!played) {
        try {
          const absences = JSON.parse((row.absences as string) ?? "[]") as Array<{ name: string; reason: string; smsText?: string; teamId?: string }>;
          const ours = absences.filter((a) => !a.teamId || a.teamId === teamId);
          const found = ours.find((a) => a.name === fullName);
          if (found) {
            reason = found.reason;
            smsText = found.smsText ?? null;
          } else {
            reason = "Mimo nominaci";
          }
        } catch (e) { logger.warn({ module: "teams" }, "parse absences", e); reason = "Neznámý"; }
      }
      return {
        matchId,
        date: (row.simulated_at as string) ?? null,
        round: (row.round as number) ?? null,
        opponent,
        opponentId,
        isHome,
        homeScore: (row.home_score as number) ?? null,
        awayScore: (row.away_score as number) ?? null,
        status: played ? "played" as const : "missed" as const,
        reason,
        smsText,
      };
    });
  }

  const matchesPlayed = matches.filter((m) => m.status === "played").length;
  const matchesAvailable = matches.length;
  const matchesMissed = matches.filter((m) => m.status === "missed");

  return c.json({
    training: { attended: trainingAttended, total: trainingTotal, pct: trainingPct },
    matches: {
      available: matchesAvailable,
      played: matchesPlayed,
      missedCount: matchesMissed.length,
      missed: matchesMissed.map((m) => ({
        matchId: m.matchId, date: m.date, round: m.round,
        opponent: m.opponent, opponentId: m.opponentId, isHome: m.isHome,
        homeScore: m.homeScore, awayScore: m.awayScore,
        reason: m.reason, smsText: m.smsText,
      })),
      all: matches.map((m) => ({
        matchId: m.matchId, date: m.date, round: m.round,
        opponent: m.opponent, opponentId: m.opponentId,
        status: m.status, reason: m.reason,
      })),
    },
  });
});

// GET /api/teams/:id/attendance — týmový přehled docházky všech aktivních hráčů
teamsRouter.get("/:id/attendance", async (c) => {
  const teamId = c.req.param("id");

  const season = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "teams" }, "fetch active season for team attendance", e); return null; });

  // Aktivní hráči
  const playersRes = await c.env.DB.prepare(
    "SELECT id, first_name, last_name, position FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')"
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; position: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "fetch players for attendance", e); return { results: [] }; });

  // Training attendance
  const teamRow = await c.env.DB.prepare("SELECT training_attendance FROM teams WHERE id = ?")
    .bind(teamId).first<{ training_attendance: string | null }>().catch((e) => { logger.warn({ module: "teams" }, "fetch team training_attendance", e); return null; });
  let attMap: Record<string, { attended: number; total: number }> = {};
  try { attMap = JSON.parse(teamRow?.training_attendance ?? "{}"); } catch (e) { logger.warn({ module: "teams" }, "parse team training_attendance", e); }

  // Zápasy a absences pro celou sezónu
  let matchPlayedCounts: Record<string, number> = {};
  let matchAbsenceBreakdown: Record<string, { injury: number; suspension: number; excuse: number; notInSquad: number }> = {};
  let matchesAvailable = 0;
  if (season) {
    const matchRows = await c.env.DB.prepare(
      `SELECT m.id, m.absences FROM matches m
       JOIN leagues l ON m.league_id = l.id
       WHERE (m.home_team_id = ? OR m.away_team_id = ?)
         AND m.status = 'simulated' AND l.season_id = ?`
    ).bind(teamId, teamId, season.id).all<{ id: string; absences: string | null }>()
      .catch((e) => { logger.warn({ module: "teams" }, "fetch matches for team attendance", e); return { results: [] }; });
    matchesAvailable = matchRows.results.length;

    const matchIds = matchRows.results.map((r) => r.id);
    if (matchIds.length > 0) {
      const placeholders = matchIds.map(() => "?").join(",");
      const playedRes = await c.env.DB.prepare(
        `SELECT player_id, match_id FROM match_player_stats
         WHERE team_id = ? AND match_id IN (${placeholders})`
      ).bind(teamId, ...matchIds).all<{ player_id: string; match_id: string }>()
        .catch((e) => { logger.warn({ module: "teams" }, "fetch played matches for team attendance", e); return { results: [] }; });
      for (const r of playedRes.results) {
        matchPlayedCounts[r.player_id] = (matchPlayedCounts[r.player_id] ?? 0) + 1;
      }
    }

    // Absences breakdown — pro každý match parsujeme absences a pro každého aktivního hráče
    // přiřadíme typ podle reason (Zranění → injury, Stopka za karty → suspension, jinak excuse).
    // notInSquad = matchesAvailable - played - injury - suspension - excuse
    const nameToId: Record<string, string> = {};
    for (const p of playersRes.results) nameToId[`${p.first_name} ${p.last_name}`] = p.id;
    for (const p of playersRes.results) matchAbsenceBreakdown[p.id] = { injury: 0, suspension: 0, excuse: 0, notInSquad: 0 };

    for (const m of matchRows.results) {
      try {
        const absences = JSON.parse(m.absences ?? "[]") as Array<{ name: string; reason: string; teamId?: string }>;
        const ours = absences.filter((a) => !a.teamId || a.teamId === teamId);
        for (const a of ours) {
          const pid = nameToId[a.name];
          if (!pid) continue;
          const r = a.reason;
          if (r === "Zranění") matchAbsenceBreakdown[pid].injury++;
          else if (r === "Stopka za karty") matchAbsenceBreakdown[pid].suspension++;
          else matchAbsenceBreakdown[pid].excuse++;
        }
      } catch (e) { logger.warn({ module: "teams" }, "parse absences in team-wide attendance", e); }
    }

    // notInSquad = available - played - tracked absences
    for (const p of playersRes.results) {
      const played = matchPlayedCounts[p.id] ?? 0;
      const br = matchAbsenceBreakdown[p.id];
      const known = played + br.injury + br.suspension + br.excuse;
      br.notInSquad = Math.max(0, matchesAvailable - known);
    }
  }

  const players = playersRes.results.map((p) => {
    const att = attMap[p.id] ?? { attended: 0, total: 0 };
    const trainingPct = att.total > 0 ? Math.round((att.attended / att.total) * 100) : 0;
    const matchesPlayed = matchPlayedCounts[p.id] ?? 0;
    const breakdown = matchAbsenceBreakdown[p.id] ?? { injury: 0, suspension: 0, excuse: 0, notInSquad: 0 };
    return {
      playerId: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position,
      trainingAttended: att.attended,
      trainingTotal: att.total,
      trainingPct,
      matchesAvailable,
      matchesPlayed,
      matchesMissed: matchesAvailable - matchesPlayed,
      breakdown,
    };
  });

  return c.json({ players, matchesAvailable });
});

// GET /api/teams/:id/pub-sessions — historie hospodských session
teamsRouter.get("/:id/pub-sessions", async (c) => {
  const teamId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 60);

  const rows = await c.env.DB.prepare(
    `SELECT id, game_date, attendees, incidents, daily_special, created_at FROM pub_sessions
     WHERE team_id = ? ORDER BY game_date DESC, created_at DESC LIMIT ?`,
  ).bind(teamId, limit).all<{ id: number; game_date: string; attendees: string; incidents: string; daily_special: string | null; created_at: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "load pub sessions history", e); return { results: [] }; });

  const sessions = rows.results.map((s) => {
    let attendees: Array<Record<string, unknown>> = [];
    let incidents: unknown[] = [];
    try { attendees = JSON.parse(s.attendees); } catch (e) { logger.warn({ module: "teams" }, "parse pub attendees", e); }
    try { incidents = JSON.parse(s.incidents); } catch (e) { logger.warn({ module: "teams" }, "parse pub incidents", e); }
    return { id: s.id, gameDate: s.game_date, attendees, incidents, dailySpecial: s.daily_special, createdAt: s.created_at };
  });

  // Enrich visitor attendees with their avatars (from cizích týmů — nemáme je v lokálním players fetch)
  const visitorIds = new Set<string>();
  for (const s of sessions) {
    for (const a of s.attendees) if (a.isVisitor) visitorIds.add(a.playerId as string);
  }
  if (visitorIds.size > 0) {
    const ids = [...visitorIds];
    const ph = ids.map(() => "?").join(",");
    const rows = await c.env.DB.prepare(
      `SELECT id, avatar FROM players WHERE id IN (${ph})`,
    ).bind(...ids).all<{ id: string; avatar: string }>()
      .catch((e) => { logger.warn({ module: "teams" }, "load visitor avatars", e); return { results: [] }; });
    const avatarMap = new Map<string, unknown>();
    for (const r of rows.results) {
      try { avatarMap.set(r.id, JSON.parse(r.avatar)); } catch (e) { logger.warn({ module: "teams" }, "parse visitor avatar", e); }
    }
    for (const s of sessions) {
      s.attendees = s.attendees.map((a) => a.isVisitor ? { ...a, avatar: avatarMap.get(a.playerId as string) ?? null } : a);
    }
  }

  return c.json({ sessions });
});

// GET /api/teams/:id/pub-session — poslední hospodská session
teamsRouter.get("/:id/pub-session", async (c) => {
  const teamId = c.req.param("id");

  const session = await c.env.DB.prepare(
    `SELECT id, game_date, attendees, incidents, daily_special, created_at FROM pub_sessions
     WHERE team_id = ? ORDER BY game_date DESC, created_at DESC LIMIT 1`,
  ).bind(teamId).first<{ id: number; game_date: string; attendees: string; incidents: string; daily_special: string | null; created_at: string }>()
    .catch((e) => { logger.warn({ module: "teams" }, "load pub session", e); return null; });

  if (!session) return c.json({ session: null });

  let attendees: Array<Record<string, unknown>> = [];
  let incidents: unknown[] = [];
  try { attendees = JSON.parse(session.attendees); } catch (e) { logger.warn({ module: "teams" }, "parse pub attendees", e); }
  try { incidents = JSON.parse(session.incidents); } catch (e) { logger.warn({ module: "teams" }, "parse pub incidents", e); }

  // Enrich visitor attendees with avatars
  const visitorIds = attendees.filter((a) => a.isVisitor).map((a) => a.playerId as string);
  if (visitorIds.length > 0) {
    const ph = visitorIds.map(() => "?").join(",");
    const rows = await c.env.DB.prepare(
      `SELECT id, avatar FROM players WHERE id IN (${ph})`,
    ).bind(...visitorIds).all<{ id: string; avatar: string }>()
      .catch((e) => { logger.warn({ module: "teams" }, "load visitor avatars", e); return { results: [] }; });
    const avatarMap = new Map<string, unknown>();
    for (const r of rows.results) {
      try { avatarMap.set(r.id, JSON.parse(r.avatar)); } catch (e) { logger.warn({ module: "teams" }, "parse visitor avatar", e); }
    }
    attendees = attendees.map((a) => a.isVisitor ? { ...a, avatar: avatarMap.get(a.playerId as string) ?? null } : a);
  }

  return c.json({
    session: {
      id: session.id,
      gameDate: session.game_date,
      attendees,
      incidents,
      dailySpecial: session.daily_special,
      createdAt: session.created_at,
    },
  });
});

// GET /api/teams/:id/players/:playerId/condition-log — vývoj kondice (timeline)
// Query: ?days=14 (default), ?limit=200 (max). Vrací entries za posledních N dní (dle created_at).
teamsRouter.get("/:id/players/:playerId/condition-log", async (c) => {
  const playerId = c.req.param("playerId");
  const days = Math.max(1, Math.min(Number(c.req.query("days") ?? 14), 365));
  const limit = Math.min(Number(c.req.query("limit") ?? 200), 500);

  const rows = await c.env.DB.prepare(
    `SELECT id, old_value, new_value, delta, source, description, game_date, created_at
     FROM condition_log
     WHERE player_id = ?
       AND created_at >= datetime('now', ?)
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  ).bind(playerId, `-${days} days`, limit).all<{
    id: number; old_value: number; new_value: number; delta: number;
    source: string; description: string | null; game_date: string | null; created_at: string;
  }>().catch((e) => { logger.warn({ module: "teams" }, "load condition log", e); return { results: [] }; });

  return c.json({
    days,
    entries: rows.results.map((r) => ({
      id: r.id,
      oldValue: r.old_value,
      newValue: r.new_value,
      delta: r.delta,
      source: r.source,
      description: r.description,
      gameDate: r.game_date,
      createdAt: r.created_at,
    })),
  });
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
    swap: "Výměna",
    pub: "Tip od hospodského",
    friend: "Tip kapitána",
    recommendation: "Tip starosty",
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
