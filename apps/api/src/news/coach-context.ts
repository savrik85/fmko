/**
 * Pověst trenéra pro redaktory Zpravodaje: štítky z jeho vlastností (Taktik, Motivátor,
 * Lajdák…, `coachTags` ve sdíleném balíčku) jako podklad do zadání článku.
 *
 * Uživatel 11-01: „jako kontext, ale ne aby to zmiňovali vždy, jen někdy“. Proto
 * pravidlo, že pověst zmíní redaktor nanejvýš jednou a jen když přirozeně sedí.
 */

import { coachTags } from "@okresni-masina/shared";
import { logger } from "../lib/logger";

const M = "coach-context";

/** Pravidlo do zadání: pověst je podklad, ne povinnost. */
export const COACH_REPUTATION_RULE =
  "- Pověst trenérů v závorce (např. Taktik, Lajdák) je jen podklad. Zmiň ji nanejvýš u jednoho trenéra a jen když přirozeně sedí k tomu, co se stalo; většinou ji vynech. Nikdy ji necituj jako štítek ani čísla.";

/** Štítky trenérů podle týmu (jen trenéři se štítkem). */
export async function coachReputationByTeam(db: D1Database, teamIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (!ids.length) return out;
  const rows = await db.prepare(
    `SELECT team_id, coaching, motivation, tactics, youth_development, discipline, reputation, licence_level
       FROM managers WHERE team_id IN (${ids.map(() => "?").join(",")})`,
  ).bind(...ids).all<{
    team_id: string; coaching: number | null; motivation: number | null; tactics: number | null;
    youth_development: number | null; discipline: number | null; reputation: number | null; licence_level: number | null;
  }>()
    .catch((e) => { logger.warn({ module: M }, "vlastnosti trenérů pro pověst", e); return { results: [] as never[] }; });
  for (const r of rows.results) {
    const tags = coachTags({
      coaching: r.coaching ?? 40, motivation: r.motivation ?? 40, tactics: r.tactics ?? 40,
      youthDevelopment: r.youth_development ?? 40, discipline: r.discipline ?? 40, reputation: r.reputation ?? 30,
      licence: r.licence_level ?? 0,
    }, 2);
    if (tags.length) out.set(r.team_id, tags.map((t) => t.label));
  }
  return out;
}

/** „ (pověst: Taktik, Motivátor)“ nebo prázdný řetězec. */
export function coachReputationNote(labels: readonly string[] | undefined): string {
  return labels && labels.length ? ` (pověst: ${labels.join(", ")})` : "";
}
