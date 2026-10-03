/**
 * Správa poolu volných hráčů — generování nových, expirace starých.
 * Voláno z daily-tick.
 */

import { logger } from "../lib/logger";
import { FIRSTNAMES } from "../data/czech-names";
import type { Rng } from "../generators/rng";
import type { VillageInfo } from "../generators/player";
import { createPlayer, levelFromVillageSize, categoryFromVillageSize, MARKET_SHIFT } from "../generators/create-player";
import { getDistrictDataFromDB } from "../data/districts";
import { zapisNaTrh } from "./market-log";


const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;

/**
 * Vygeneruje `count` volných hráčů pro daný okres a vloží je do free_agents.
 * Sdílené jádro — používá maintainFreeAgentPool (respektuje strop) i admin
 * force-doplnění (strop ignoruje, volá s libovolným count).
 * Returns count of free agents actually inserted.
 */
export async function generateFreeAgentsForDistrict(
  db: D1Database,
  rng: Rng,
  district: string,
  count: number,
  gameDate: Date,
): Promise<number> {
  if (count <= 0) return 0;

  const districtData = await getDistrictDataFromDB(db, district);
  const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
  const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

  // Info o okrese z libovolné vesnice (population/size pro generátor)
  const villageRow = await db.prepare(
    "SELECT population, size FROM villages WHERE district = ? ORDER BY RANDOM() LIMIT 1"
  ).bind(district).first<{ population: number; size: string }>()
    .catch((e) => { logger.warn({ module: "free-agent-pool" }, "district village info", e); return null; });

  const villageInfo: VillageInfo = {
    region_code: district,
    category: categoryFromVillageSize(villageRow?.size),
    population: (villageRow?.population as number) ?? 500,
    district,
  };

  // Pick random villages from the district for residence
  const nearbyVillages = await db.prepare(
    "SELECT id, lat, lng FROM villages WHERE district = ? ORDER BY RANDOM() LIMIT 10"
  ).bind(district).all().catch((e) => { logger.warn({ module: "free-agent-pool" }, "query", e); return { results: [] }; });

  let generated = 0;
  for (let i = 0; i < count; i++) {
    // Brankáři vzácně — na trhu jich má být málo (klub potřebuje jen 1–2 a nerad je pouští)
    const pos = rng.weighted({ GK: 1, DEF: 8, MID: 8, FWD: 7 }) as typeof POSITIONS[number];
    const created = createPlayer(rng, {
      position: pos, village: villageInfo, names: { surnameData, firstnameData },
      level: levelFromVillageSize(villageRow?.size), shift: MARKET_SHIFT,
    });
    const player = created.identity;
    const { skills, skillsMax, hiddenTalent, physical, rating: overallRating } = created;
    const weeklyWage = Math.round(10 + (overallRating / 100) * 400);

    // Pick a random village for residence
    const resVillage = nearbyVillages.results.length > 0
      ? nearbyVillages.results[rng.int(0, nearbyVillages.results.length - 1)]
      : null;

    const expiresAt = new Date(gameDate);
    expiresAt.setDate(expiresAt.getDate() + rng.int(5, 7));

    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, nationality, weekly_wage, source, village_id, expires_at, skills_max, hidden_talent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, ?)`
    ).bind(
      id, district, player.firstName, player.lastName, player.age, pos, overallRating,
      JSON.stringify(skills),
      JSON.stringify(physical),
      JSON.stringify(created.personality),
      JSON.stringify({ ...created.lifeContext, morale: 50 }),
      JSON.stringify(created.avatar),
      created.nationality,
      weeklyWage, resVillage?.id ?? null, expiresAt.toISOString(),
      JSON.stringify(skillsMax), hiddenTalent,
    ).run();

    generated++;
    // Bez tohohle zápisu se zpětně nedá zjistit, kolik lidí hra vytvořila:
    // řádek ve `free_agents` po podpisu nebo vypršení zmizí.
    await zapisNaTrh(db, { district, origin: "generated", gameDate: gameDate.toISOString() });
    logger.info({ module: "free-agent-pool" }, `inserted ${player.firstName} ${player.lastName} (${pos}, ${overallRating}) in ${district}`);
  }

  return generated;
}

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
    "SELECT DISTINCT v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.user_id != 'ai'"
  ).all().catch((e) => { logger.warn({ module: "free-agent-pool" }, "query", e); return { results: [] }; });

  let generated = 0;

  for (const row of districts.results) {
    const district = row.district as string;

    // Strop se počítá JEN z vygenerovaných hráčů. Propuštění (`released`/`quit`)
    // do poolu padají bez limitu — v okrese s hodně manažery samy udržely pool
    // trvale nad stropem a nová krev se pak negenerovala vůbec (Prachatice).
    const poolCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM free_agents WHERE district = ? AND source = 'generated'"
    ).bind(district).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "free-agent-pool" }, "count pool", e); return { cnt: 0 }; });

    // Max 8 generated free agents per district, generate 0-2 per day
    if ((poolCount?.cnt ?? 0) >= 8) continue;
    const count = rng.int(0, 2);
    if (count === 0) continue;

    generated += await generateFreeAgentsForDistrict(db, rng, district, count, gameDate);
  }

  return generated;
}
