/** Načtení incidentu, herního data a hráče kádru pro akce manažera a denní vyšetřování. */

import { logger } from "../lib/logger";
import { OBLIBENY_SILA_VZTAHU } from "./nastaveni";
import { hracZRadku, SLOUPCE_HRACE } from "./stav-klubu";
import type { HracKlubu, KategorieIncidentu, StavIncidentu, TypPachatele } from "./typy";
import type { IncidentProAkce } from "./vysetrovani";

const M = "incidents-db";

export interface IncidentRadek {
  id: string;
  team_id: string;
  season_number: number;
  kind: string;
  category: KategorieIncidentu;
  status: StavIncidentu;
  severity: number;
  game_date: string;
  deadline: string | null;
  culprit_type: TypPachatele | null;
  culprit_player_id: string | null;
  culprit_revealed: number;
  loss: string;
  accusations: number;
  accused: string;
  police_result_on: string | null;
  police_success: number | null;
  resolution: string | null;
  resolution_data: string | null;
  text: string;
  resolved_on: string | null;
}

export const SLOUPCE_INCIDENTU = [
  "id", "team_id", "season_number", "kind", "category", "status", "severity", "game_date", "deadline",
  "culprit_type", "culprit_player_id", "culprit_revealed", "loss", "accusations", "accused",
  "police_result_on", "police_success", "resolution", "resolution_data", "text", "resolved_on",
] as const;

export async function nactiIncident(db: D1Database, teamId: string, incidentId: string): Promise<IncidentRadek | null> {
  return db.prepare(`SELECT ${SLOUPCE_INCIDENTU.join(", ")} FROM club_incidents WHERE id = ? AND team_id = ?`)
    .bind(incidentId, teamId).first<IncidentRadek>()
    .catch((e) => { logger.warn({ module: M }, `incident ${incidentId}`, e); return null; });
}

export async function herniDatum(db: D1Database, teamId: string): Promise<string | null> {
  const r = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `herní datum ${teamId}`, e); return null; });
  return r?.game_date ?? null;
}

export interface HracKadru extends HracKlubu {
  krestni: string;
  prijmeni: string;
  /** Týdenní mzda v Kč. */
  mzda: number;
  /** Nerivalské vztahy se silou aspoň `OBLIBENY_SILA_VZTAHU`. */
  silnychVztahu: number;
}

/** Aktivní hráč klubu, nebo `null`, když v kádru není (prodaný, vyhozený, cizí). */
export async function nactiHraceKadru(db: D1Database, teamId: string, playerId: string): Promise<HracKadru | null> {
  const r = await db.prepare(
    `SELECT ${SLOUPCE_HRACE}, weekly_wage FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')`,
  ).bind(playerId, teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, `hráč ${playerId}`, e); return null; });
  if (!r) return null;
  const vztahy = await db.prepare(
    "SELECT COUNT(*) AS n FROM relationships WHERE (player_a_id = ? OR player_b_id = ?) AND type != 'rivals' AND strength >= ?",
  ).bind(playerId, playerId, OBLIBENY_SILA_VZTAHU).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `vztahy ${playerId}`, e); return null; });
  return {
    ...hracZRadku(r),
    krestni: String(r.first_name),
    prijmeni: String(r.last_name),
    mzda: typeof r.weekly_wage === "number" ? r.weekly_wage : 0,
    silnychVztahu: vztahy?.n ?? 0,
  };
}

export function proAkce(
  r: Pick<IncidentRadek, "status" | "category" | "culprit_type" | "culprit_revealed" | "accusations" | "police_success">,
  pachatelVKadru: boolean,
): IncidentProAkce {
  return {
    status: r.status, category: r.category, culpritType: r.culprit_type,
    odhalen: r.culprit_revealed === 1, obvineni: r.accusations, policieVysledek: r.police_success, pachatelVKadru,
  };
}
