/**
 * Reakce vesnice na výsledek sezóny — úprava přízně obce (village_team_favor).
 *
 * Sponzorský efekt NEřešíme zvlášť: sponzorský příjem odvisí od reputace klubu,
 * která se mění ve fázi rewards podle pořadí → efekt se projeví příští sezónu.
 *
 * Idempotenci řeší orchestrátor (phase status=done). Bounded počet UPDATE/tým.
 */

import type { StandingEntry } from "../stats/standings";
import { logger } from "../lib/logger";

export interface VillageReactionResult {
  teamId: string;
  pos: number;
  favorDelta: number;
}

/** Delta přízně dle umístění (top 3 oslavy, spodní třetina nespokojenost). */
function favorDelta(pos: number, n: number): number {
  if (pos <= 3) return 6;
  if (pos <= Math.ceil(n / 2)) return 2;
  if (pos > Math.ceil((2 * n) / 3)) return -4;
  return 0;
}

export async function applyVillageSeasonReaction(
  db: D1Database,
  standings: StandingEntry[],
): Promise<VillageReactionResult[]> {
  const n = standings.length;
  const results: VillageReactionResult[] = [];

  for (const s of standings) {
    const delta = favorDelta(s.pos, n);
    if (delta !== 0) {
      await db.prepare(
        "UPDATE village_team_favor SET favor = MAX(0, MIN(100, favor + ?)), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND official_id IS NULL",
      ).bind(delta, s.teamId).run()
        .catch((e) => logger.warn({ module: "season-village" }, "update favor", e));
    }
    results.push({ teamId: s.teamId, pos: s.pos, favorDelta: delta });
  }

  logger.info({ module: "season-village" }, `village reaction applied for ${n} teams`);
  return results;
}
