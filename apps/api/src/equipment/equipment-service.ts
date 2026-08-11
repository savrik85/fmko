/**
 * Sdílené operace nad tabulkou equipment.
 *
 * Řádek vybavení vzniká líně — historicky až při prvním GET /equipment. To stačilo,
 * dokud se s vybavením dalo pracovat jen z vlastní stránky. S bazarem do něj sahá
 * i kupující, který stránku vybavení nikdy neotevřel, takže založení řádku musí být
 * dostupné odkudkoli.
 */

import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { CATEGORIES, generateEquipment } from "./equipment-generator";

export type EquipmentRow = Record<string, unknown>;

/**
 * Vrátí řádek vybavení týmu, a pokud neexistuje, založí ho.
 *
 * Startovní vybavení je deterministické ze `teamId` — stejný tým dostane při
 * opakovaném založení stejné hodnoty, takže wipe a rekonstrukce nevyrobí jiný klub.
 */
export async function ensureEquipmentRow(db: D1Database, teamId: string): Promise<EquipmentRow | null> {
  const existing = await db.prepare("SELECT * FROM equipment WHERE team_id = ?")
    .bind(teamId).first<EquipmentRow>()
    .catch((e) => { logger.warn({ module: "equipment-service" }, "fetch equipment", e); return null; });
  if (existing) return existing;

  const team = await db.prepare("SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(teamId).first<{ size: string }>()
    .catch((e) => { logger.warn({ module: "equipment-service" }, "fetch team size for equipment", e); return null; });

  let seed = 0;
  for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
  const rng = createRng(Math.abs(seed) + 99);
  const config = generateEquipment(rng, team?.size ?? "obec");

  const cols = CATEGORIES.join(", ");
  const condCols = CATEGORIES.map((c) => `${c}_condition`).join(", ");
  const vals = CATEGORIES.map((c) => config[c] ?? 0);
  const condVals = CATEGORIES.map((c) => config[`${c}_condition`] ?? 50);
  const placeholders = [...vals, ...condVals].map(() => "?").join(", ");

  await db.prepare(`INSERT INTO equipment (id, team_id, ${cols}, ${condCols}) VALUES (?, ?, ${placeholders})`)
    .bind(crypto.randomUUID(), teamId, ...vals, ...condVals).run()
    .catch((e) => logger.warn({ module: "equipment-service" }, "insert equipment", e));

  return db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first<EquipmentRow>()
    .catch((e) => { logger.warn({ module: "equipment-service" }, "re-fetch equipment after insert", e); return null; });
}

/** Rozloží širokou tabulku na levely a stavy, se kterými pracují cenové a efektové funkce. */
export function splitEquipmentRow(row: EquipmentRow): {
  levels: Record<string, number>;
  conditions: Record<string, number>;
} {
  const levels: Record<string, number> = {};
  const conditions: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    levels[cat] = (row[cat] as number) ?? 0;
    conditions[`${cat}_condition`] = (row[`${cat}_condition`] as number) ?? 50;
  }
  return { levels, conditions };
}
