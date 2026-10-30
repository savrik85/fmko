/**
 * Rodina mezi trenéry: bratři trénující v okrese.
 *
 * Na rozdíl od manager_relations (respekt a napětí mezi kluby) je to vazba mezi
 * lidmi a hra ji sama neumí poznat, zapisuje se ručně do `manager_family`.
 * Profil trenéra ji ukazuje v záložce Trenéři, Zpravodaj ji dostane do podkladů.
 */

import { logger } from "../lib/logger";

const M = "manager-family";

export type FamilyKind = "brother";

/** Jak se příbuzný jmenuje na profilu („Bratr: Michal Novotný"). */
export const FAMILY_LABEL: Record<FamilyKind, string> = { brother: "Bratr" };

/** Jak to zní ve větě pro Zpravodaje. */
const FAMILY_PHRASE: Record<FamilyKind, string> = { brother: "jsou bratři" };

export interface FamilyMember {
  kind: FamilyKind;
  label: string;
  managerName: string;
  teamId: string;
  teamName: string;
}

function asKind(kind: string): FamilyKind | null {
  return kind in FAMILY_LABEL ? (kind as FamilyKind) : null;
}

/**
 * Příbuzní trenéra klubu `teamId`, každý s klubem, který teď trénuje.
 * Kdo zrovna žádný klub nemá, se nevypíše: na profilu by nebylo kam prokliknout.
 */
export async function familyOfTeam(db: D1Database, teamId: string): Promise<FamilyMember[]> {
  const rows = await db.prepare(
    `SELECT f.kind, m.name AS manager_name, t.id AS team_id, t.name AS team_name
       FROM teams me
       JOIN manager_family f ON me.user_id IN (f.user_a_id, f.user_b_id)
       JOIN teams t ON t.user_id = CASE WHEN f.user_a_id = me.user_id THEN f.user_b_id ELSE f.user_a_id END
       JOIN managers m ON m.team_id = t.id
      WHERE me.id = ? AND me.user_id != 'ai'
        AND COALESCE(t.team_type, 'senior') = 'senior' AND t.name NOT LIKE 'DELETED-%'
      ORDER BY m.name`
  ).bind(teamId).all<{ kind: string; manager_name: string; team_id: string; team_name: string }>()
    .catch((e) => { logger.warn({ module: M }, `rodina trenéra ${teamId}`, e); return { results: [] }; });

  const out: FamilyMember[] = [];
  for (const r of rows.results) {
    const kind = asKind(r.kind);
    if (!kind) continue;
    out.push({ kind, label: FAMILY_LABEL[kind], managerName: r.manager_name, teamId: r.team_id, teamName: r.team_name });
  }
  return out;
}

/**
 * Věta pro prompt Zpravodaje, když trenéři obou klubů patří do jedné rodiny,
 * třeba „Trenéři Adam Novotný a Michal Novotný jsou bratři". Jinak null.
 */
export async function familyLineBetweenTeams(db: D1Database, teamA: string, teamB: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT f.kind, ma.name AS name_a, mb.name AS name_b
       FROM teams a JOIN teams b ON b.id = ?
       JOIN manager_family f
         ON (f.user_a_id = a.user_id AND f.user_b_id = b.user_id)
         OR (f.user_a_id = b.user_id AND f.user_b_id = a.user_id)
       LEFT JOIN managers ma ON ma.team_id = a.id
       LEFT JOIN managers mb ON mb.team_id = b.id
      WHERE a.id = ? AND a.user_id != 'ai' AND b.user_id != 'ai'
      LIMIT 1`
  ).bind(teamB, teamA).first<{ kind: string; name_a: string | null; name_b: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `rodina mezi ${teamA} a ${teamB}`, e); return null; });
  const kind = row ? asKind(row.kind) : null;
  if (!row || !kind) return null;
  const names = row.name_a && row.name_b ? ` ${row.name_a} a ${row.name_b}` : "";
  return `Trenéři${names} ${FAMILY_PHRASE[kind]}`;
}
