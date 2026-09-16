/**
 * Následky incidentu pro hráče: morálka a vztah k trenérovi (spec 7b–7d).
 * Vrací připravené příkazy pro `db.batch`, sám nic nespouští.
 */

import { KAMARADSKE_VZTAHY, SILA_KAMARADSTVI } from "./nastaveni";

const AKTIVNI = "(status IS NULL OR status = 'active')";

/** Jeden parametr: posun morálky. Ořez 0–100. */
const MORALKA = `life_context = json_set(COALESCE(life_context, '{}'), '$.morale',
  MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))`;

/** Kamarádi hráče, kteří by ho kryli (spec 5b). Tři parametry: id hráče. Typy vztahů jsou konstanty, ne vstup. */
const KAMARADI = `SELECT CASE WHEN player_a_id = ? THEN player_b_id ELSE player_a_id END FROM relationships
  WHERE (player_a_id = ? OR player_b_id = ?)
    AND type IN (${KAMARADSKE_VZTAHY.map((t) => `'${t}'`).join(", ")}) AND strength >= ${SILA_KAMARADSTVI}`;

export function posunHrace(
  db: D1Database, teamId: string, playerId: string, zmena: { morale?: number; vztah?: number },
): D1PreparedStatement {
  return db.prepare(
    `UPDATE players SET ${MORALKA},
       coach_relationship = MAX(0, MIN(100, COALESCE(coach_relationship, 50) + ?))
     WHERE id = ? AND team_id = ?`,
  ).bind(zmena.morale ?? 0, zmena.vztah ?? 0, playerId, teamId);
}

/** Morálka aktivního kádru. Hráči v `krome` a kamarádi hráče `kromeKamaraduHrace` se vynechají. */
export function posunKadru(
  db: D1Database, teamId: string, delta: number,
  krome: readonly string[] = [], kromeKamaraduHrace: string | null = null,
): D1PreparedStatement {
  let sql = `UPDATE players SET ${MORALKA} WHERE team_id = ? AND ${AKTIVNI}`;
  const parametry: unknown[] = [delta, teamId];
  if (krome.length > 0) {
    sql += ` AND id NOT IN (${krome.map(() => "?").join(", ")})`;
    parametry.push(...krome);
  }
  if (kromeKamaraduHrace) {
    sql += ` AND id NOT IN (${KAMARADI})`;
    parametry.push(kromeKamaraduHrace, kromeKamaraduHrace, kromeKamaraduHrace);
  }
  return db.prepare(sql).bind(...parametry);
}

export function posunKamaradu(db: D1Database, teamId: string, playerId: string, delta: number): D1PreparedStatement {
  return db.prepare(`UPDATE players SET ${MORALKA} WHERE team_id = ? AND ${AKTIVNI} AND id IN (${KAMARADI})`)
    .bind(delta, teamId, playerId, playerId, playerId);
}
