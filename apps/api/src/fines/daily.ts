/**
 * Denní běh sazebníku pokut (volá season/daily-tick.ts po hospodě):
 * pokuty z včerejší hospody a vyhodnocení odporu kabiny pro lidská áčka se sazebníkem.
 */

import type { ChatEnv } from "../messaging/ai-player-chat";
import { logger } from "../lib/logger";
import { applyPubFines } from "./detect";
import { evaluateSquadFines } from "./squad";

const M = "fines-daily";

export async function runDailyFines(db: D1Database, env: ChatEnv | undefined, day: string): Promise<{ teams: number; fines: number }> {
  const rows = await db.prepare(
    `SELECT fs.team_id, t.league_id FROM fine_schedules fs JOIN teams t ON t.id = fs.team_id
      WHERE t.user_id != 'ai' AND t.parent_team_id IS NULL AND (fs.status = 'active' OR fs.squad_stage > 0)`,
  ).all<{ team_id: string; league_id: string | null }>();
  let fines = 0;
  for (const r of rows.results ?? []) {
    try {
      fines += (await applyPubFines(db, r.team_id, r.league_id, day)).length;
      await evaluateSquadFines(db, env, r.team_id, day);
    } catch (e) {
      logger.error({ module: M, teamId: r.team_id }, "denní sazebník", e);
    }
  }
  return { teams: rows.results?.length ?? 0, fines };
}
