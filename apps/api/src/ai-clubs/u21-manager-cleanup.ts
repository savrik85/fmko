/**
 * Úklid AI trenérů u U21 týmů.
 *
 * `ensureAiManager` dřív zakládal trenéra i U21 týmu AI klubu, když někdo otevřel jeho profil
 * (na produkci k 25. 10. 2026 Meteor Žižkov U21 a Jiskra Vinohrady U21). U21 trenéra nemá,
 * patří áčku. Takový řádek se pak ukazoval v síni slávy jako další AI trenér.
 */

import { logger } from "../lib/logger";

export interface U21ManagerCleanup {
  found: Array<{ managerId: string; teamId: string; name: string }>;
  deleted: number;
}

export async function cleanupU21AiManagers(db: D1Database, dryRun: boolean): Promise<U21ManagerCleanup> {
  const rows = await db.prepare(
    `SELECT m.id AS managerId, m.team_id AS teamId, m.name
       FROM managers m JOIN teams t ON t.id = m.team_id
      WHERE m.user_id = 'ai' AND t.parent_team_id IS NOT NULL`,
  ).all<{ managerId: string; teamId: string; name: string }>()
    .catch((e) => {
      logger.warn({ module: "u21-manager-cleanup" }, "hledání AI trenérů u U21", e);
      return { results: [] as Array<{ managerId: string; teamId: string; name: string }> };
    });

  if (dryRun || rows.results.length === 0) return { found: rows.results, deleted: 0 };

  let deleted = 0;
  for (const r of rows.results) {
    const res = await db.prepare("DELETE FROM managers WHERE id = ? AND user_id = 'ai'").bind(r.managerId).run()
      .catch((e) => { logger.error({ module: "u21-manager-cleanup" }, `smazání AI trenéra ${r.managerId} (U21 ${r.teamId})`, e); return null; });
    deleted += res?.meta?.changes ?? 0;
  }
  return { found: rows.results, deleted };
}
