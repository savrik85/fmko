/**
 * Shared utility: inserts AI teams (players + relationships) into D1.
 * Uses db.batch() to minimize subrequests and stay within worker limits.
 */

import type { Rng } from "../generators/rng";
import type { LeagueSetup } from "./league-generator";
import type { GeneratedPlayer } from "../generators/player";
import { generateFieldSkills, generateGKSkills, generateHiddenTalent, calculateOverallRating } from "../skills/generator";
import { generateDescription } from "../generators/description-generator";
import { pickOccupation } from "../generators/occupations";
import { generatePlayerFace } from "../routes/teams";
import { logger } from "../lib/logger";

export async function insertAITeamsIntoDB(
  db: D1Database,
  leagueId: string,
  leagueSetup: LeagueSetup,
  districtVillages: Array<{ code: string; name: string; population: number; [key: string]: unknown }>,
  rng: Rng,
  villageSize: string,
  district?: string,
): Promise<void> {
  // Zjistit aktivní sezónu pro initial kontrakty
  const activeSeason = await db.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "insert-ai-teams" }, "fetch active season", e); return null; });
  const seasonId = activeSeason?.id ?? "season-1";

  // Collect all statements and batch them
  const teamStmts: D1PreparedStatement[] = [];
  const playerStmts: D1PreparedStatement[] = [];
  const contractStmts: D1PreparedStatement[] = [];
  const relStmts: D1PreparedStatement[] = [];

  for (const lt of leagueSetup.teams) {
    if (lt.isPlayer) continue;

    const aiTeamId = crypto.randomUUID();
    const aiVillage = districtVillages.find((v) => v.code === lt.villageCode);
    const aiVillageId = (aiVillage?.code as string) ?? districtVillages[0]?.code ?? "unknown";
    const aiBudget = ((aiVillage?.population as number) ?? 500) > 5000 ? 80000
      : ((aiVillage?.population as number) ?? 500) > 1000 ? 40000 : 20000;

    teamStmts.push(
      db.prepare("INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget, league_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(aiTeamId, "ai", aiVillageId, lt.teamName, lt.primaryColor, lt.secondaryColor, aiBudget, leagueId)
    );

    if (lt.aiTeam?.squad) {
      const aiPlayerIds: string[] = [];
      for (const ap of lt.aiTeam.squad) {
        const apId = crypto.randomUUID();
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

        playerStmts.push(
          db.prepare("INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience, weekly_wage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(apId, aiTeamId, ap.firstName, ap.lastName, apNickname, ap.age, ap.position, apRating,
              JSON.stringify(apSkills), JSON.stringify(apPhysical), JSON.stringify(apPersonality),
              JSON.stringify(apLifeContext), JSON.stringify(generatePlayerFace(ap)), apDescription,
              JSON.stringify(isGK ? apGkSkills : apFieldSkills), apHiddenTalent,
              isGK ? apGkSkills!.experience.current : apFieldSkills!.experience.current,
              Math.round(10 + apRating * 4))
        );

        contractStmts.push(
          db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'generated', 0, 1)")
            .bind(crypto.randomUUID(), apId, aiTeamId, seasonId)
        );
      }

      if (lt.aiTeam.relationships) {
        for (const rel of lt.aiTeam.relationships) {
          if (rel.playerAIndex < aiPlayerIds.length && rel.playerBIndex < aiPlayerIds.length) {
            relStmts.push(
              db.prepare("INSERT INTO relationships (id, player_a_id, player_b_id, type) VALUES (?, ?, ?, ?)")
                .bind(crypto.randomUUID(), aiPlayerIds[rel.playerAIndex], aiPlayerIds[rel.playerBIndex], rel.type)
            );
          }
        }
      }
    }
  }

  // Execute in batches — teams first, then players, then relationships
  // D1 batch limit is ~100 statements per batch
  const BATCH_SIZE = 80;

  try {
    // Teams (max 14)
    if (teamStmts.length > 0) await db.batch(teamStmts);
  } catch (e) {
    logger.error({ module: "insert-ai-teams" }, `Batch insert teams failed`, e);
    return;
  }

  // Players (~280 for 14 teams × 20 players) — split into batches
  for (let i = 0; i < playerStmts.length; i += BATCH_SIZE) {
    const batch = playerStmts.slice(i, i + BATCH_SIZE);
    try {
      await db.batch(batch);
    } catch (e) {
      logger.error({ module: "insert-ai-teams" }, `Batch insert players ${i}-${i + batch.length} failed`, e);
    }
  }

  // Initial contracts (musí být AŽ po INSERT players kvůli FK)
  for (let i = 0; i < contractStmts.length; i += BATCH_SIZE) {
    const batch = contractStmts.slice(i, i + BATCH_SIZE);
    try {
      await db.batch(batch);
    } catch (e) {
      logger.error({ module: "insert-ai-teams" }, `Batch insert contracts ${i}-${i + batch.length} failed`, e);
    }
  }

  // Relationships
  for (let i = 0; i < relStmts.length; i += BATCH_SIZE) {
    const batch = relStmts.slice(i, i + BATCH_SIZE);
    try {
      await db.batch(batch);
    } catch (e) {
      logger.error({ module: "insert-ai-teams" }, `Batch insert relationships ${i}-${i + batch.length} failed`, e);
    }
  }
}
