/**
 * Kompletace AI klubu: všechno, co má lidský klub od založení a AI klub dřív neměl.
 *
 * AI kluby vznikaly jen jako řádek `teams` + hráči. Stadion a vybavení dostaly až ve chvíli,
 * kdy někdo otevřel jejich stránku, trenér vznikl při otevření profilu a hráči neměli čísla
 * dresů ani bydliště. Idempotentní: chybějící doplní, existující nechá být.
 */

import { ensureAiProfile } from "../ai-coach/profile";
import { ensureEquipmentRow } from "../equipment/equipment-service";
import { createRng } from "../generators/rng";
import { generateResidence } from "../generators/residence";
import { logger } from "../lib/logger";
import { ensureSquadNumbers } from "../players/squad-numbers";
import { ensureStadiumRow } from "../stadium/stadium-service";

const RESIDENCE_SEED_OFFSET = 31337;

function seedFromTeamId(teamId: string): number {
  let seed = 0;
  for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
  return Math.abs(seed);
}

/** Hráčům bez bydliště doplní obec a dojíždění stejně, jako je dostávají hráči lidského klubu. */
async function ensureResidences(db: D1Database, teamId: string): Promise<number> {
  const village = await db.prepare(
    "SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(teamId).first<{ name: string; size: string; district: string }>()
    .catch((e) => { logger.warn({ module: "complete-club" }, `obec týmu ${teamId}`, e); return null; });
  if (!village) return 0;

  const rows = await db.prepare(
    "SELECT id FROM players WHERE team_id = ? AND (residence IS NULL OR residence = '') ORDER BY id",
  ).bind(teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "complete-club" }, `hráči bez bydliště ${teamId}`, e); return { results: [] as { id: string }[] }; });
  if (rows.results.length === 0) return 0;

  const rng = createRng(seedFromTeamId(teamId) + RESIDENCE_SEED_OFFSET);
  const stmts = rows.results.map((p) => {
    const res = generateResidence(rng, village.name, village.size, village.district);
    return db.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?").bind(res.residence, res.commuteKm, p.id);
  });
  for (let i = 0; i < stmts.length; i += 80) {
    await db.batch(stmts.slice(i, i + 80))
      .catch((e) => logger.warn({ module: "complete-club" }, `bydliště hráčů ${teamId}`, e));
  }
  return rows.results.length;
}

/**
 * Doplní AI klubu stadion, vybavení, trenéra s povahou, čísla dresů a bydliště hráčů.
 * U21 tým (parent_team_id) dostane stadion i vybavení taky, trenér patří áčku.
 */
export async function completeAiClub(db: D1Database, teamId: string): Promise<void> {
  const team = await db.prepare("SELECT id, user_id, parent_team_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ id: string; user_id: string; parent_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: "complete-club" }, `načtení týmu ${teamId}`, e); return null; });
  if (!team) return;

  await ensureStadiumRow(db, teamId);
  await ensureEquipmentRow(db, teamId);
  if (team.user_id === "ai" && !team.parent_team_id) {
    await ensureAiProfile(db, teamId);
  }
  await ensureSquadNumbers(db, teamId)
    .catch((e) => logger.warn({ module: "complete-club" }, `čísla dresů ${teamId}`, e));
  await ensureResidences(db, teamId);
}
