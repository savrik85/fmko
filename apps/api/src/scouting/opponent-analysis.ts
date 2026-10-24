/**
 * Rozbor soupeře (úkol skauta „Sledování soupeře“): co dá do zápasu a jak dlouho.
 *
 * Bonus jde do zápasu stejnou cestou jako ostatní bonusy zaměstnanců
 * (equipment/match-mods.ts → simulateMatch přičte techniqueMod a moraleMod celé sestavě
 * i lavičce). Soupeře zná jen ligový zápas, pohár a přáteláky ho do modů nepředávají.
 */

import { logger } from "../lib/logger";

export const OPPONENT_ANALYSIS_TECHNIQUE_BONUS = 2;
export const OPPONENT_ANALYSIS_MORALE_BONUS = 3;
/** Jak dlouho po dokončení rozboru bonus platí (reálné dny, stejně jako zápasy). */
export const OPPONENT_ANALYSIS_BONUS_DAYS = 14;

/** Bonus z hotového rozboru soupeře, který není starší než `OPPONENT_ANALYSIS_BONUS_DAYS`. */
export async function opponentAnalysisBonus(
  db: D1Database, teamId: string, opponentTeamId: string,
): Promise<{ techniqueMod: number; moraleMod: number }> {
  // julianday, ne textové porovnání: closed_at je „…T…Z“ a datetime() vrací „… …“ s mezerou,
  // takže na hraničním dni bonus platil i po čtrnácti dnech.
  const row = await db.prepare(
    `SELECT id FROM scout_assignments
      WHERE team_id = ? AND target_team_id = ? AND assignment_type = 'match' AND status = 'finished'
        AND julianday(closed_at) > julianday('now', ?) LIMIT 1`,
  ).bind(teamId, opponentTeamId, `-${OPPONENT_ANALYSIS_BONUS_DAYS} days`).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "scouting", teamId }, "rozbor soupeře pro zápas", e); return null; });
  return row
    ? { techniqueMod: OPPONENT_ANALYSIS_TECHNIQUE_BONUS, moraleMod: OPPONENT_ANALYSIS_MORALE_BONUS }
    : { techniqueMod: 0, moraleMod: 0 };
}
