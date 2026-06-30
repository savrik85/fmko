/**
 * Finanční odměny a změna reputace na konci sezóny — dle konečného pořadí.
 *
 * BEZ postupů/sestupů. 1. místo = největší odměna + nárůst reputace,
 * poslední = malá odměna + mírný pokles reputace.
 *
 * Idempotence: každá odměna má reference_id `season-{n}-rwd-{teamId}`;
 * reputace se mění jen současně s odměnou (gate na neexistenci transakce).
 */

import { recordTransaction } from "./finance-processor";
import type { StandingEntry } from "../stats/standings";
import { logger } from "../lib/logger";

export interface SeasonRewardResult {
  teamId: string;
  pos: number;
  reward: number;
  managerRepDelta: number;
  teamRepDelta: number;
  skipped: boolean;
}

/** Násobič odměny dle úrovně soutěže (vyšší soutěž = vyšší příjmy). */
const LEVEL_MULT: Record<string, number> = {
  okresni_soutez: 0.85,
  okresni_prebor: 1.0,
  ib_trida: 1.2,
  ia_trida: 1.45,
  krajsky_prebor: 1.75,
};

export async function applySeasonRewards(
  db: D1Database,
  standings: StandingEntry[],
  seasonNumber: number,
  gameDate: string,
  level: string,
): Promise<SeasonRewardResult[]> {
  const n = standings.length;
  if (n === 0) return [];
  const levelMult = LEVEL_MULT[level] ?? 1.0;
  const results: SeasonRewardResult[] = [];

  for (const entry of standings) {
    const { teamId, pos } = entry;
    // Lineární škála: 1. ~150 000, poslední ~15 000 (× levelMult)
    const base = n > 1 ? 15000 + (135000 * (n - pos)) / (n - 1) : 82500;
    const reward = Math.round(base * levelMult);
    const managerRepDelta = Math.round((n / 2 - pos + 0.5) * 1.5);
    const teamRepDelta = Math.round((n / 2 - pos + 0.5) * 0.8);
    const refId = `season-${seasonNumber}-rwd-${teamId}`;

    const exists = await db.prepare("SELECT 1 FROM transactions WHERE reference_id = ?").bind(refId).first();
    if (exists) {
      results.push({ teamId, pos, reward, managerRepDelta, teamRepDelta, skipped: true });
      continue;
    }

    // Reputace nejdřív, transakce jako "commit marker" naposledy
    if (managerRepDelta !== 0) {
      await db.prepare("UPDATE managers SET reputation = MAX(15, MIN(75, reputation + ?)) WHERE team_id = ?")
        .bind(managerRepDelta, teamId).run()
        .catch((e) => logger.warn({ module: "season-rewards" }, "manager reputation update", e));
    }
    if (teamRepDelta !== 0) {
      await db.prepare("UPDATE teams SET reputation = MAX(0, MIN(100, reputation + ?)) WHERE id = ?")
        .bind(teamRepDelta, teamId).run()
        .catch((e) => logger.warn({ module: "season-rewards" }, "team reputation update", e));
    }
    await recordTransaction(
      db, teamId, "season_reward", reward,
      `Odměna za ${seasonNumber}. sezónu (${pos}. místo)`, gameDate, refId,
    ).catch((e) => logger.warn({ module: "season-rewards" }, "record season reward", e));

    results.push({ teamId, pos, reward, managerRepDelta, teamRepDelta, skipped: false });
  }
  return results;
}
