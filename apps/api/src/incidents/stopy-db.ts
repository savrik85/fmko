/** Zápis a čtení stop (`club_incident_clues`) a zdroje stop z DB (spec 5b). */

import { logger } from "../lib/logger";
import type { ZdrojeStop } from "./stopy";
import type { NavrhStopy, Stopa, ZdrojStopy } from "./typy";

const M = "incidents-stopy";

/**
 * Příkazy pro `db.batch`. Id `{incidentId}-{zdroj}-{n}`, `n` od 1 v rámci zdroje.
 * `INSERT OR IGNORE`: opakované zpracování dne stopy nezdvojí.
 */
export function prikazyStop(
  db: D1Database, teamId: string, incidentId: string, stopy: readonly NavrhStopy[], gameDate: string,
): D1PreparedStatement[] {
  const poradi: Record<string, number> = {};
  return stopy.map((s) => {
    poradi[s.zdroj] = (poradi[s.zdroj] ?? 0) + 1;
    return db.prepare(
      `INSERT OR IGNORE INTO club_incident_clues
         (id, incident_id, team_id, source, points_to_player_id, suspects, holder_player_id, strength, police_bonus, text, found, found_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `${incidentId}-${s.zdroj}-${poradi[s.zdroj]}`, incidentId, teamId, s.zdroj, s.ukazujeNa,
      s.podezreli ? JSON.stringify(s.podezreli) : null, s.drzitel, s.sila, s.bonusPolicie, s.text,
      s.nalezena ? 1 : 0, s.nalezena ? gameDate : null,
    );
  });
}

function seznamHracu(raw: unknown): string[] | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : null;
  } catch (e) {
    logger.warn({ module: M }, "nečitelný seznam podezřelých", e);
    return null;
  }
}

export function stopaZRadku(r: Record<string, unknown>): Stopa {
  const sila = Number(r.strength);
  return {
    id: String(r.id),
    zdroj: String(r.source) as ZdrojStopy,
    ukazujeNa: typeof r.points_to_player_id === "string" ? r.points_to_player_id : null,
    podezreli: seznamHracu(r.suspects),
    drzitel: typeof r.holder_player_id === "string" ? r.holder_player_id : null,
    sila: sila === 3 ? 3 : sila === 2 ? 2 : 1,
    bonusPolicie: Number(r.police_bonus) || 0,
    text: String(r.text),
    nalezena: r.found === 1,
  };
}

export async function nactiStopy(db: D1Database, incidentId: string): Promise<Stopa[]> {
  const rows = await db.prepare("SELECT * FROM club_incident_clues WHERE incident_id = ? ORDER BY found_on, id")
    .bind(incidentId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, `stopy ${incidentId}`, e); return { results: [] as Array<Record<string, unknown>> }; });
  return rows.results.map(stopaZRadku);
}

export async function nactiZdrojeStop(db: D1Database, teamId: string, pachatelId: string | null): Promise<ZdrojeStop> {
  const spravce = await db.prepare("SELECT MAX(judgement) AS usudek FROM staff_members WHERE team_id = ? AND role = 'spravce_hriste'")
    .bind(teamId).first<{ usudek: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `správce hřiště ${teamId}`, e); return null; });

  let vztahyPachatele: ZdrojeStop["vztahyPachatele"] = [];
  if (pachatelId) {
    const rows = await db.prepare("SELECT player_a_id, player_b_id, type, strength FROM relationships WHERE player_a_id = ? OR player_b_id = ?")
      .bind(pachatelId, pachatelId)
      .all<{ player_a_id: string; player_b_id: string; type: string; strength: number | null }>()
      .catch((e) => { logger.warn({ module: M }, `vztahy pachatele ${pachatelId}`, e); return { results: [] as Array<{ player_a_id: string; player_b_id: string; type: string; strength: number | null }> }; });
    vztahyPachatele = rows.results.map((r) => ({
      hracId: r.player_a_id === pachatelId ? r.player_b_id : r.player_a_id,
      typ: r.type,
      sila: r.strength ?? 50,
    }));
  }
  return { spravceUsudek: typeof spravce?.usudek === "number" ? spravce.usudek : null, vztahyPachatele };
}
