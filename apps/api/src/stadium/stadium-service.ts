/**
 * Řádek stadionu týmu.
 *
 * Dřív vznikal až při prvním otevření stránky stadionu, takže AI kluby (a kluby, jejichž
 * stránku nikdo neotevřel) stadion vůbec neměly: zápas pak počítal s kapacitou 200
 * a údržba trávníku je přeskakovala. Teď se dá založit odkudkoli.
 */

import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { generateStadium } from "./stadium-generator";

export type StadiumRow = Record<string, unknown>;

/**
 * Vrátí řádek stadionu týmu, a pokud neexistuje, založí ho.
 * Startovní stadion je deterministický z id týmu (stejně jako dřív v GET /stadium).
 */
export async function ensureStadiumRow(db: D1Database, teamId: string): Promise<StadiumRow | null> {
  const existing = await db.prepare("SELECT * FROM stadiums WHERE team_id = ?")
    .bind(teamId).first<StadiumRow>()
    .catch((e) => { logger.warn({ module: "stadium-service" }, "fetch stadium", e); return null; });
  if (existing) return existing;

  const team = await db.prepare("SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(teamId).first<{ size: string }>()
    .catch((e) => { logger.warn({ module: "stadium-service" }, "fetch team for stadium creation", e); return null; });
  if (!team) return null;

  let seed = 0;
  for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
  const rng = createRng(Math.abs(seed));
  const config = generateStadium(rng, team.size);

  await db.prepare(
    // Plachtu píše kotel. Sloupec už nikdo nečte, ale ať v datech nelže.
    `INSERT OR IGNORE INTO stadiums (id, team_id, capacity, pitch_condition, pitch_type, changing_rooms, showers, refreshments, lighting, stands, parking, fence, ultras_text_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fanousci')`,
  ).bind(crypto.randomUUID(), teamId, config.capacity, config.pitchCondition, config.pitchType,
    config.changingRooms, config.showers, config.refreshments, config.lighting,
    config.stands, config.parking, config.fence,
  ).run().catch((e) => logger.warn({ module: "stadium-service" }, "insert stadium", e));

  return db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId).first<StadiumRow>()
    .catch((e) => { logger.warn({ module: "stadium-service" }, "re-fetch stadium after insert", e); return null; });
}
