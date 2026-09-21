import { deriveLicenceLevel } from "@okresni-masina/shared";
import { generateAiManager } from "../generators/manager-generator";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";

/**
 * Trenér AI klubu.
 *
 * Generuje se deterministicky z id týmu, takže každý, kdo ho vytvoří, dostane
 * stejného člověka. Dřív se ukládal jen tehdy, když někdo otevřel profil —
 * AI kluby bez uloženého trenéra pak neměly zápasový bonus ani růst vlastností.
 */

/** Řádek z `managers`, přednostně lidský trenér (kdyby přece jen existovaly dva). */
export async function loadManagerRow(
  db: D1Database,
  teamId: string,
): Promise<Record<string, unknown> | null> {
  return db.prepare(
    "SELECT * FROM managers WHERE team_id = ? ORDER BY CASE WHEN user_id = 'ai' THEN 1 ELSE 0 END, created_at DESC LIMIT 1",
  ).bind(teamId).first<Record<string, unknown>>()
    .catch((e) => {
      logger.warn({ module: "ai-manager" }, `load manager ${teamId}`, e);
      return null;
    });
}

function seedFromTeamId(teamId: string): number {
  let seed = 0;
  for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
  return Math.abs(seed);
}

/**
 * Vrátí trenéra AI klubu, a když ještě není uložený, uloží ho.
 *
 * `INSERT OR IGNORE` + nové načtení: dva souběžné požadavky nevytvoří dva
 * řádky (unikátní index na team_id) a oba vrátí toho, který v DB skutečně je.
 * Pro lidský klub bez trenéra vrací null — toho zakládá registrace, ne tahle funkce.
 */
export async function ensureAiManager(
  db: D1Database,
  teamId: string,
): Promise<Record<string, unknown> | null> {
  const existing = await loadManagerRow(db, teamId);
  if (existing) return existing;

  const team = await db.prepare("SELECT user_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ user_id: string }>()
    .catch((e) => {
      logger.warn({ module: "ai-manager" }, `load team ${teamId}`, e);
      return null;
    });
  if (!team || team.user_id !== "ai") return null;

  const mgr = generateAiManager(createRng(seedFromTeamId(teamId)));
  await db.prepare(
    "INSERT OR IGNORE INTO managers (id, user_id, team_id, name, backstory, avatar, age, coaching, motivation, tactics, youth_development, discipline, reputation, bio, birthplace, licence_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), "ai", teamId, mgr.name, mgr.backstory, JSON.stringify(mgr.avatar),
    mgr.age, mgr.coaching, mgr.motivation, mgr.tactics,
    mgr.youthDevelopment, mgr.discipline, mgr.reputation, mgr.bio, mgr.birthplace,
    deriveLicenceLevel(mgr),
  ).run().catch((e) => logger.warn({ module: "ai-manager" }, `persist AI manager ${teamId}`, e));

  return loadManagerRow(db, teamId);
}
