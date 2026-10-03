/**
 * Shared utility: inserts AI teams (players + relationships) into D1.
 * Uses db.batch() to minimize subrequests and stay within worker limits.
 */

import type { Rng } from "../generators/rng";
import type { LeagueSetup } from "./league-generator";
import type { GeneratedPlayer } from "../generators/player";
import { createPlayer, levelFromVillageSize, aiTeamShift } from "../generators/create-player";
import { generateDescription } from "../generators/description-generator";
import { logger } from "../lib/logger";
import { mustSeason } from "../lib/season";

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
  const seasonId = mustSeason(activeSeason?.id);

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
        // Úroveň podle obce TOHOTO AI klubu (dřív se brala obec lidského hráče) a slabší o AI posun.
        const apCreated = createPlayer(rng, {
          identity: ap, position: ap.position as "GK" | "DEF" | "MID" | "FWD",
          level: levelFromVillageSize((aiVillage?.category as string | undefined) ?? villageSize),
          shift: aiTeamShift(rng),
        });
        const apSkills = apCreated.skills;
        const apPhysical = apCreated.physical;
        const apPersonality = apCreated.personality;
        const apLifeContext = apCreated.lifeContext;
        const apRating = apCreated.rating;
        const apDescription = generateDescription(rng, {
          firstName: ap.firstName, lastName: ap.lastName, nickname: apNickname,
          age: ap.age, position: ap.position, occupation: apLifeContext.occupation,
          bodyType: ap.bodyType, alcohol: apPersonality.alcohol, discipline: apPersonality.discipline,
          speed: apSkills.speed, shooting: apSkills.shooting, technique: apSkills.technique,
          patriotism: apPersonality.patriotism,
        });

        playerStmts.push(
          db.prepare("INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience, weekly_wage, nationality) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(apId, aiTeamId, ap.firstName, ap.lastName, apNickname, ap.age, ap.position, apRating,
              JSON.stringify(apSkills), JSON.stringify(apPhysical), JSON.stringify(apPersonality),
              JSON.stringify(apLifeContext), JSON.stringify(apCreated.avatar), apDescription,
              JSON.stringify(apCreated.skillsMax), apCreated.hiddenTalent,
              apCreated.experience,
              Math.round(10 + apRating * 4), ap.nationality ?? "CZ")
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
              db.prepare("INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES (?, ?, ?, ?, ?)")
                .bind(crypto.randomUUID(), aiPlayerIds[rel.playerAIndex], aiPlayerIds[rel.playerBIndex], rel.type, rel.strength ?? 50)
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
