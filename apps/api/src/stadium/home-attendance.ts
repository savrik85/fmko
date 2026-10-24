/**
 * Kolik lidí klubu doma opravdu chodí. Ukazuje se vedle kapacity u nabídky tribun
 * a přístaveb.
 *
 * Přístavby se dřív prodávaly jen s kapacitou: pět klubů za zhruba 460 000 Kč
 * postavilo místa, která žádný jejich zápas nenaplnil. Kdo vidí, že na posledních
 * deset zápasů přišlo nejvíc 250 lidí na stadion pro 440, ví, že další tribuna
 * vstupné nezvedne.
 */

import { logger } from "../lib/logger";

/** Kolik posledních domácích soutěžních zápasů se bere. Starší zápasy hrál klub na jiném stadionu. */
export const RECENT_HOME_MATCHES = 10;

export interface HomeAttendance {
  /** Z kolika zápasů je souhrn (méně než RECENT_HOME_MATCHES, když jich klub tolik nehrál). */
  matches: number;
  average: number | null;
  max: number | null;
}

export function summarizeAttendance(values: number[]): HomeAttendance {
  if (values.length === 0) return { matches: 0, average: null, max: null };
  return {
    matches: values.length,
    average: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
    max: Math.max(...values),
  };
}

/**
 * Návštěva posledních domácích soutěžních zápasů: liga (`matches` s kolem) a pohár
 * (`cup_matches`, kde je klub domácí). Přátelák se nepočítá, chodí na něj zlomek lidí
 * a kapacitu nikdy neprověří. Null, když se dotaz nepovede.
 */
export async function loadHomeAttendance(db: D1Database, teamId: string): Promise<HomeAttendance | null> {
  const rows = await db.prepare(
    `SELECT attendance FROM (
       SELECT attendance, simulated_at FROM matches
        WHERE home_team_id = ? AND status = 'simulated' AND calendar_id IS NOT NULL AND attendance IS NOT NULL
       UNION ALL
       SELECT cm.attendance, cm.simulated_at FROM cup_matches cm
         JOIN cup_teams hc ON hc.id = cm.home_cup_team_id
        WHERE hc.team_id = ? AND cm.status = 'simulated' AND cm.attendance IS NOT NULL
     ) ORDER BY simulated_at DESC LIMIT ?`,
  ).bind(teamId, teamId, RECENT_HOME_MATCHES).all<{ attendance: number }>()
    .catch((e) => {
      logger.warn({ module: "home-attendance", teamId }, "domácí návštěva pro nabídku tribun", e);
      return null;
    });
  if (!rows) return null;
  return summarizeAttendance(rows.results.map((r) => r.attendance));
}
