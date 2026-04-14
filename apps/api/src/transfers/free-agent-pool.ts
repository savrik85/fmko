/**
 * Správa poolu volných hráčů — generování nových, expirace starých.
 * Voláno z daily-tick.
 */

import { logger } from "../lib/logger";
import type { Rng } from "../generators/rng";
import { generatePlayer, type VillageInfo } from "../generators/player";
import { getDistrictDataFromDB } from "../data/districts";
import { generatePlayerFace } from "../routes/teams";

const FIRSTNAMES: Record<string, Record<string, number>> = {
  "1960s": { "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06, "Jaroslav": 0.05, "Milan": 0.05, "Zdeněk": 0.04 },
  "1970s": { "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Jiří": 0.06, "Pavel": 0.05, "Tomáš": 0.04, "Roman": 0.03 },
  "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05, "David": 0.05, "Lukáš": 0.04 },
  "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05, "Ondřej": 0.05, "Filip": 0.04 },
  "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05, "Filip": 0.05, "Vojtěch": 0.04 },
  "2010s": { "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05, "Filip": 0.05, "Tomáš": 0.05, "Šimon": 0.04 },
};

const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;

/**
 * Maintain the free agent pool: expire old entries, generate new ones.
 * Returns count of new free agents generated.
 */
export async function maintainFreeAgentPool(
  db: D1Database,
  rng: Rng,
  gameDate: Date,
): Promise<number> {
  // 1. Expire old free agents
  await db.prepare("DELETE FROM free_agents WHERE expires_at < ?")
    .bind(gameDate.toISOString()).run().catch((e) => logger.warn({ module: "free-agent-pool" }, "expire/insert", e));

  // 2. Find districts with active human teams
  const districts = await db.prepare(
    "SELECT DISTINCT v.district, v.id as village_id, v.population, v.size, v.lat, v.lng FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.user_id != 'ai'"
  ).all().catch((e) => { logger.warn({ module: "free-agent-pool" }, "query", e); return { results: [] }; });

  let generated = 0;

  for (const row of districts.results) {
    const district = row.district as string;

    // Check current pool size for this district
    const poolCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM free_agents WHERE district = ?"
    ).bind(district).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "free-agent-pool" }, "count pool", e); return { cnt: 0 }; });

    // Max 8 free agents per district, generate 0-2 per day
    if ((poolCount?.cnt ?? 0) >= 8) continue;
    const count = rng.int(0, 2);
    if (count === 0) continue;

    const districtData = await getDistrictDataFromDB(db, district);
    const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
    const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

    const sizeMap: Record<string, string> = { hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto" };
    const villageInfo: VillageInfo = {
      region_code: district,
      category: (sizeMap[(row.size as string)] ?? "obec") as VillageInfo["category"],
      population: (row.population as number) ?? 500,
      district,
    };

    // Pick random villages from the district for residence
    const nearbyVillages = await db.prepare(
      "SELECT id, lat, lng FROM villages WHERE district = ? ORDER BY RANDOM() LIMIT 10"
    ).bind(district).all().catch((e) => { logger.warn({ module: "free-agent-pool" }, "query", e); return { results: [] }; });

    for (let i = 0; i < count; i++) {
      const pos = rng.pick([...POSITIONS]);
      const player = generatePlayer(rng, villageInfo, pos, surnameData, firstnameData);

      // Build skills from generated player
      const skills = {
        speed: player.speed, technique: player.technique, shooting: player.shooting,
        passing: player.passing, heading: player.heading, defense: player.defense,
        goalkeeping: player.goalkeeping ?? 0, stamina: player.stamina, strength: player.strength,
        vision: player.technique, creativity: player.passing, setPieces: rng.int(10, 50),
        experience: Math.min(80, player.age * 2),
      };
      const posWeights: Record<string, Record<string, number>> = {
        GK: { goalkeeping: 4, strength: 2, stamina: 1 },
        DEF: { defense: 3, heading: 2, strength: 2, speed: 1, stamina: 2, passing: 1 },
        MID: { passing: 3, technique: 2, stamina: 3, speed: 1, shooting: 1, vision: 2 },
        FWD: { shooting: 3, speed: 3, technique: 2, heading: 1, stamina: 1 },
      };
      const w = posWeights[pos] ?? posWeights.MID;
      let wSum = 0, wTotal = 0;
      for (const [k, wt] of Object.entries(w)) {
        wSum += ((skills as Record<string, number>)[k] ?? 30) * wt;
        wTotal += wt;
      }
      const rawRating = wTotal > 0 ? wSum / wTotal : 30;
      const overallRating = Number.isFinite(rawRating) ? Math.round(rawRating) : 30;
      const weeklyWage = Math.round(10 + (overallRating / 100) * 400);

      // Pick a random village for residence
      const resVillage = nearbyVillages.results.length > 0
        ? nearbyVillages.results[rng.int(0, nearbyVillages.results.length - 1)]
        : null;

      const expiresAt = new Date(gameDate);
      expiresAt.setDate(expiresAt.getDate() + rng.int(5, 7));

      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, source, village_id, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?)`
      ).bind(
        id, district, player.firstName, player.lastName, player.age, pos, overallRating,
        JSON.stringify(skills),
        JSON.stringify({ stamina: player.stamina, strength: player.strength, injuryProneness: player.injuryProneness ?? 50, preferredFoot: player.preferredFoot, preferredSide: player.preferredSide }),
        JSON.stringify({ discipline: player.discipline, patriotism: player.patriotism, alcohol: player.alcohol, temper: player.temper, leadership: player.leadership ?? 30, workRate: player.workRate ?? 50, aggression: player.aggression ?? 40, consistency: player.consistency ?? 50, clutch: player.clutch ?? 50 }),
        JSON.stringify({ occupation: player.occupation, condition: 100, morale: 50 }),
        JSON.stringify(generatePlayerFace({ age: player.age, bodyType: player.bodyType ?? "normal" })),
        weeklyWage, resVillage?.id ?? null, expiresAt.toISOString(),
      ).run();

      generated++;
      logger.info({ module: "free-agent-pool" }, `inserted ${player.firstName} ${player.lastName} (${pos}, ${overallRating}) in ${district}`);
    }
  }

  return generated;
}
