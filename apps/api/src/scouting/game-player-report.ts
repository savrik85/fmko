/**
 * Hlášení skauta o hráči, který hraje ve hře (úkoly U21 liga, Naše liga, Sledování hráče).
 *
 * Takový hráč patří klubu ve hře, kupuje se běžnou nabídkou z jeho profilu. Jednání s klubem
 * mimo hru (ai-negotiation.ts) by ho přes `purchaseVirtualPlayer` naklonovalo a originál by
 * zůstal u soupeře. Hlášení má jinak stejný tvar jako ostatní (`scout_reports.source` smí být
 * jen 'village_club' nebo 'free_agent'), skutečné `players.id` nese `player_data.gamePlayerId`.
 */

import { logger } from "../lib/logger";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";

export interface ScoutReportPlayerData extends VirtualPlayerData {
  /** `players.id` hráče ve hře; chybí u hráčů klubů mimo hru a volných hráčů. */
  gamePlayerId?: string;
}

/** `players.id` hráče ve hře z `scout_reports.player_data`, jinak `null`. */
export function gamePlayerIdOf(playerData: string | ScoutReportPlayerData | Partial<ScoutReportPlayerData> | null | undefined): string | null {
  if (!playerData) return null;
  let data: Partial<ScoutReportPlayerData>;
  if (typeof playerData === "string") {
    try {
      data = JSON.parse(playerData) as Partial<ScoutReportPlayerData>;
    } catch (e) {
      logger.warn({ module: "scouting" }, "nečitelná data hráče v hlášení", e);
      return null;
    }
  } else {
    data = playerData;
  }
  return typeof data.gamePlayerId === "string" && data.gamePlayerId ? data.gamePlayerId : null;
}

/** SQL: `players.id` hráče ve hře z hlášení, u ostatních NULL (i u nečitelného JSON). */
export const GAME_PLAYER_ID_SQL = "(CASE WHEN json_valid(player_data) THEN json_extract(player_data, '$.gamePlayerId') END)";
