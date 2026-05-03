/**
 * Persistence helpery pro village_officials.
 * Lazy seed: pokud obec nemá vygenerované 4 představitele, automaticky se založí.
 */

import { logger } from "../lib/logger";
import {
  generateOfficialsForVillage,
  type OfficialRole,
  type Personality,
} from "./officials-generator";

export interface OfficialRow {
  id: string;
  village_id: string;
  role: OfficialRole;
  first_name: string;
  last_name: string;
  age: number;
  occupation: string;
  face_config: string;
  personality: Personality;
  portfolio: string;
  preferences: string;
  term_start_at: string;
  term_end_at: string;
  created_at: string;
}

const TERM_LENGTH_YEARS = 4;

/** Vrací 4 představitele obce, případně lazy nageneruje. */
export async function ensureVillageOfficials(
  db: D1Database,
  villageId: string,
): Promise<OfficialRow[]> {
  const existing = await db.prepare(
    "SELECT * FROM village_officials WHERE village_id = ? ORDER BY role"
  ).bind(villageId).all<OfficialRow>();

  if (existing.results && existing.results.length === 4) {
    return existing.results;
  }

  // Buď chybí všichni nebo nějaký výpadek — regenerujeme chybějící role.
  const haveRoles = new Set((existing.results ?? []).map((r) => r.role));
  const termStartSeason = computeCurrentSeason();
  const generated = generateOfficialsForVillage(villageId, termStartSeason);

  const now = new Date();
  const termEnd = new Date(now);
  termEnd.setFullYear(termEnd.getFullYear() + TERM_LENGTH_YEARS);

  const inserts = generated.filter((g) => !haveRoles.has(g.role));
  for (const g of inserts) {
    const id = crypto.randomUUID();
    try {
      await db.prepare(
        `INSERT INTO village_officials
          (id, village_id, role, first_name, last_name, age, occupation,
           face_config, personality, portfolio, preferences, term_start_at, term_end_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        villageId,
        g.role,
        g.firstName,
        g.lastName,
        g.age,
        g.occupation,
        JSON.stringify(g.faceConfig),
        g.personality,
        JSON.stringify(g.portfolio),
        JSON.stringify(g.preferences),
        now.toISOString(),
        termEnd.toISOString(),
      ).run();
    } catch (e) {
      logger.warn({ module: "officials-store" }, `insert official ${g.role} for village ${villageId}`, e);
    }
  }

  const final = await db.prepare(
    "SELECT * FROM village_officials WHERE village_id = ? ORDER BY role"
  ).bind(villageId).all<OfficialRow>();
  return final.results ?? [];
}

/** Aktuální sezóna jako jednoduchý ordinal — slouží jen pro deterministic seed. */
function computeCurrentSeason(): number {
  const now = new Date();
  return now.getFullYear() * 2 + (now.getMonth() < 6 ? 0 : 1);
}

/** Vrátí globální favor řádek (official_id IS NULL); pokud chybí, založí default 50. */
export async function ensureGlobalFavor(
  db: D1Database,
  villageId: string,
  teamId: string,
): Promise<{ favor: number; trust: number }> {
  const row = await db.prepare(
    "SELECT favor, trust FROM village_team_favor WHERE team_id = ? AND official_id IS NULL"
  ).bind(teamId).first<{ favor: number; trust: number }>();

  if (row) return row;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, updated_at)
       VALUES (?, ?, ?, NULL, 50, 50, ?)`
    ).bind(id, villageId, teamId, now).run();
  } catch (e) {
    logger.warn({ module: "officials-store" }, `seed global favor ${teamId}`, e);
  }
  return { favor: 50, trust: 50 };
}
