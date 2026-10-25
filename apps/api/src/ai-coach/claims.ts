/**
 * Pojistka proti dvojímu zpracování úlohy AI trenéra.
 *
 * Fronty doručují „aspoň jednou“: týdenní správa nebo nákup by bez nároku mohly proběhnout
 * dvakrát (dvakrát stržené peníze). Nárok je řádek (tým, úloha, den) v `ai_coach_claims`.
 */

import { logger } from "../lib/logger";

export async function claimCoachTask(db: D1Database, teamId: string, task: string, day: string): Promise<boolean> {
  const res = await db.prepare("INSERT OR IGNORE INTO ai_coach_claims (team_id, task, day) VALUES (?, ?, ?)")
    .bind(teamId, task, day).run()
    .catch((e) => {
      logger.error({ module: "ai-coach-claims" }, `nárok na úlohu ${task} týmu ${teamId} (${day})`, e);
      return null;
    });
  return (res?.meta?.changes ?? 0) > 0;
}

/** Uvolní nárok, když úloha spadla dřív, než cokoli provedla (aby ji šlo zopakovat). */
export async function releaseCoachTask(db: D1Database, teamId: string, task: string, day: string): Promise<void> {
  await db.prepare("DELETE FROM ai_coach_claims WHERE team_id = ? AND task = ? AND day = ?")
    .bind(teamId, task, day).run()
    .catch((e) => logger.warn({ module: "ai-coach-claims" }, `uvolnění nároku ${task} týmu ${teamId}`, e));
}
