/**
 * Návrat vlastníka ke klubu, který mezitím vedl AI trenér.
 *
 * Bývalý vlastník převzatého klubu (`teams.ai_former_user_id`) dostane při přihlášení nabídku
 * „Vrátit se ke klubu". Klub dostane zpátky v tom stavu, v jakém ho AI nechala, i se svým
 * trenérem: AI trenér se smaže, lidský (odpojený při převzetí) se připojí. Nabídka platí,
 * jen dokud klub vede AI (nová registrace ho po 90 dnech nečinnosti smí přepsat) a vlastník
 * mezitím nezaložil jiný klub (jeden účet, jeden klub).
 */

import { logger } from "../lib/logger";

const M = "reclaim-club";

export interface ReclaimableClub {
  teamId: string;
  name: string;
  /** Kdy klub převzal AI trenér (reálný čas). */
  aiSince: string | null;
}

/** Má uživatel vlastní áčko? U21 se nepočítá, je to přívěsek áčka. */
async function ownsSeniorTeam(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS x FROM teams WHERE user_id = ? AND user_id <> 'ai' AND COALESCE(team_type, 'senior') <> 'u21' LIMIT 1`,
  ).bind(userId).first<{ x: number }>();
  return !!row;
}

/** Klub, ke kterému se uživatel může vrátit, nebo null. */
export async function findReclaimableClub(db: D1Database, userId: string): Promise<ReclaimableClub | null> {
  if (!userId || userId === "ai") return null;
  if (await ownsSeniorTeam(db, userId)) return null;
  const row = await db.prepare(
    `SELECT id, name, ai_since FROM teams
      WHERE user_id = 'ai' AND ai_former_user_id = ? AND parent_team_id IS NULL
        AND COALESCE(team_type, 'senior') <> 'u21'
      ORDER BY ai_since DESC LIMIT 1`,
  ).bind(userId).first<{ id: string; name: string; ai_since: string | null }>();
  return row ? { teamId: row.id, name: row.name, aiSince: row.ai_since } : null;
}

/**
 * Vrátí klub bývalému vlastníkovi. Vrací false, když klub už nevede AI, patřil někomu
 * jinému, nebo má uživatel mezitím jiný klub.
 */
export async function reclaimClub(db: D1Database, userId: string, teamId: string): Promise<boolean> {
  if (!userId || userId === "ai") return false;
  if (await ownsSeniorTeam(db, userId)) return false;
  const team = await db.prepare(
    `SELECT id, ai_since FROM teams
      WHERE id = ? AND user_id = 'ai' AND ai_former_user_id = ? AND parent_team_id IS NULL
        AND COALESCE(team_type, 'senior') <> 'u21'`,
  ).bind(teamId, userId).first<{ id: string; ai_since: string | null }>();
  if (!team) return false;

  // Lidský trenér, kterého převzetí odpojilo. Nejnovější, kdyby jich účet měl víc.
  const coach = await db.prepare(
    "SELECT id FROM managers WHERE user_id = ? AND team_id IS NULL ORDER BY created_at DESC LIMIT 1",
  ).bind(userId).first<{ id: string }>();

  // Jedna dávka = jedna transakce. Všechno navazuje na to, že áčko teď opravdu patří vlastníkovi.
  const [senior] = await db.batch([
    db.prepare(
      `UPDATE teams SET user_id = ?1, ai_since = NULL, ai_former_user_id = NULL
        WHERE id = ?2 AND user_id = 'ai' AND ai_former_user_id = ?1`,
    ).bind(userId, teamId),
    db.prepare(
      `UPDATE teams SET user_id = ?1, ai_since = NULL, ai_former_user_id = NULL
        WHERE parent_team_id = ?2 AND COALESCE(team_type, 'senior') = 'u21' AND user_id = 'ai'
          AND EXISTS (SELECT 1 FROM teams a WHERE a.id = ?2 AND a.user_id = ?1)`,
    ).bind(userId, teamId),
    // AI trenér odchází dřív, než se připojí lidský (jeden trenér na klub, unikátní index).
    db.prepare(
      `DELETE FROM managers WHERE team_id = ?1 AND user_id = 'ai'
          AND EXISTS (SELECT 1 FROM teams a WHERE a.id = ?1 AND a.user_id = ?2)`,
    ).bind(teamId, userId),
    db.prepare(
      `UPDATE managers SET team_id = ?1
        WHERE id = ?2 AND team_id IS NULL
          AND EXISTS (SELECT 1 FROM teams a WHERE a.id = ?1 AND a.user_id = ?3)`,
    ).bind(teamId, coach?.id ?? "", userId),
  ]);
  if ((senior.meta?.changes ?? 0) === 0) return false;

  // Změny vlastností AI trenéra patří jemu, ne lidskému trenérovi, ke kterému se klub vrací.
  if (team.ai_since) {
    await db.prepare("DELETE FROM manager_attr_log WHERE team_id = ? AND julianday(created_at) >= julianday(?)")
      .bind(teamId, team.ai_since).run()
      .catch((e) => logger.warn({ module: M, teamId }, "úklid deníku vlastností AI trenéra", e));
  }

  logger.info({ module: M, teamId }, `vlastník ${userId} se vrátil ke klubu`);
  return true;
}
