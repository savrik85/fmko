/**
 * Správa poolu volných hráčů — generování nových, expirace starých.
 * Voláno z daily-tick.
 */

import { logger } from "../lib/logger";
import { FIRSTNAMES } from "../data/czech-names";
import type { Rng } from "../generators/rng";
import { generatePlayer, type VillageInfo } from "../generators/player";
import { generateHeightWeight } from "../generators/physicals";
import { getDistrictDataFromDB } from "../data/districts";
import { generatePlayerFace } from "../routes/teams";
import { stropyZDovednosti, talentPodleVeku } from "../skills/stropy-z-dovednosti";
import { overallRatingFromFlat } from "../skills/generator";
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

  const sizeMap: Record<string, string> = { hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto" };
  const villageInfo: VillageInfo = {
    region_code: district,
    category: (sizeMap[(villageRow?.size as string)] ?? "obec") as VillageInfo["category"],
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
    const player = generatePlayer(rng, villageInfo, pos, surnameData, firstnameData);

    // Build skills from generated player
    const skills = {
      speed: player.speed, technique: player.technique, shooting: player.shooting,
      passing: player.passing, heading: player.heading, defense: player.defense,
      goalkeeping: player.goalkeeping ?? 0, stamina: player.stamina, strength: player.strength,
      vision: player.technique, creativity: player.passing, setPieces: rng.int(10, 50),
      // Shodně s generátorem hráčů: zkušenost roste od 16 let, ne od narození.
      // Dřív `age * 2` — dvacetiletý dostal 40 místo 12–24, třicetiletý 60.
      experience: Math.min(100, Math.max(1, (player.age - 16) * rng.int(3, 6))),
    };
    // Stropy a talent MUSÍ vzniknout tady. Bez nich podpis dosadí za stropy ploché
    // dovednosti, takže hráč nemá kam růst — a `hidden_talent` spadne na DEFAULT 0.
    const skillsMax = stropyZDovednosti(rng, skills as Record<string, number>, player.age);
    const hiddenTalent = talentPodleVeku(rng, player.age);

    const physical = {
      stamina: player.stamina,
      strength: player.strength,
      injuryProneness: player.injuryProneness ?? 50,
      ...generateHeightWeight(rng, pos, player.bodyType ?? "normal"),
      preferredFoot: player.preferredFoot,
      preferredSide: player.preferredSide,
    };

    // Hodnocení TÝMŽ vzorcem jako zbytek hry — stejná oprava jako u inzerátů AI klubů
    // (`virtual-teams.ts`). Trh si dřív počítal vlastní vážený průměr; brankáři z něj
    // vycházeli nejhůř, protože se počítalo jen chytání, síla a výdrž, zatímco hra
    // počítá i obranu, rychlost, hlavičky, techniku, přihrávku a zkušenost. Naměřeno
    // na produkci: brankář v nabídce +12, podepsaní brankáři +18 oproti skutečnosti.
    // Manažer koupil číslo, které mu první noční trénink srazil, a platil podle něj mzdu.
    const overallRating = overallRatingFromFlat(pos, skills as Record<string, number>, physical, hiddenTalent, skillsMax)
      // null = málo vyplněných atributů; po `skills` výš nemá nastat, ale hráč bez
      // hodnocení by rozbil mzdu i cenu, tak ať radši spadne na průměr dovedností.
      ?? Math.round(Object.values(skills).reduce((a, b) => a + b, 0) / Object.keys(skills).length);
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
      JSON.stringify({ discipline: player.discipline, patriotism: player.patriotism, alcohol: player.alcohol, temper: player.temper, leadership: player.leadership ?? 30, workRate: player.workRate ?? 50, aggression: player.aggression ?? 40, consistency: player.consistency ?? 50, clutch: player.clutch ?? 50 }),
      JSON.stringify({ occupation: player.occupation, condition: 100, morale: 50 }),
      JSON.stringify(generatePlayerFace({ age: player.age, bodyType: player.bodyType ?? "normal", ethnicity: player.ethnicity })),
      player.nationality ?? "CZ",
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
