/**
 * Doplní bydliště hráčům, kteří ho nemají (prod 2026-11-06: 887 z 2 400 aktivních).
 * Vzniklo ze dvou děr: hráči z doby před bydlištěm (duben až červen) a generátory dorostu
 * a AI klubů nových soutěží (league/u21-generator.ts, league/insert-ai-teams.ts), které ho
 * nenastavovaly.
 *
 * Dojíždění zůstává, jak je: kdo nedojíždí, bydlí v obci klubu, kdo dojíždí, dostane
 * skutečnou obec okresu zhruba v té vzdálenosti. Skutečné obce místo seznamu v
 * generators/residence.ts, který pro Prahu znal jen smyšlené „Dolní Lhota“ apod.
 */
import { logger } from "../lib/logger";

const M = "residence-fill";

type VillageRow = { id: string; name: string; lat: number | null; lng: number | null; district: string };
type PlayerRow = { id: string; commute_km: number | null; village_id: string; village_name: string; lat: number | null; lng: number | null; district: string };

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.hypot((a.lng - b.lng) * 71.5, (a.lat - b.lat) * 111.2);
}

/** Stabilní číslo z textu (FNV-1a): stejný hráč dostane pokaždé stejnou obec. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Obec okresu, která je od obce klubu nejblíž vzdálenosti dojíždění (ze tří nejbližších podle hráče). */
export function commuteVillage(
  home: { id: string; name: string; lat: number | null; lng: number | null },
  commuteKm: number,
  villages: readonly VillageRow[],
  playerId: string,
): string {
  if (commuteKm <= 0 || home.lat === null || home.lng === null) return home.name;
  const from = { lat: home.lat, lng: home.lng };
  const ranked = villages
    .filter((v) => v.id !== home.id && v.lat !== null && v.lng !== null)
    .map((v) => ({ name: v.name, off: Math.abs(km(from, { lat: v.lat!, lng: v.lng! }) - commuteKm) }))
    .sort((a, b) => a.off - b.off)
    .slice(0, 3);
  if (ranked.length === 0) return home.name;
  return ranked[hash(playerId) % ranked.length].name;
}

/**
 * Doplní bydliště hráčům bez něj. `teamIds` omezí na kluby (generátor po vložení kádru),
 * `limit` na počet hráčů za běh (D1 a čas Workeru). Vrací doplněné a kolik jich zbývá.
 */
export async function fillMissingResidences(
  db: D1Database,
  opts: { teamIds?: string[]; limit?: number; includeUnknown?: boolean } = {},
): Promise<{ filled: number; remaining: number }> {
  const limit = Math.max(1, Math.min(2000, opts.limit ?? 500));
  const teamFilter = opts.teamIds?.length ? ` AND p.team_id IN (${opts.teamIds.map(() => "?").join(",")})` : "";
  // `includeUnknown`: i vymyšlená obec, která v okrese není (generators/residence.ts pro okresy
  // bez seznamu, např. Praha: „Dolní Lhota“, „Lučice“)
  const missing = opts.includeUnknown
    ? "(p.residence IS NULL OR p.residence = '' OR NOT EXISTS (SELECT 1 FROM villages w WHERE w.name = p.residence AND w.district = v.district))"
    : "(p.residence IS NULL OR p.residence = '')";
  const where = `${missing} AND p.team_id IS NOT NULL${teamFilter}`;
  const rows = (await db.prepare(
    `SELECT p.id, p.commute_km, v.id AS village_id, v.name AS village_name, v.lat, v.lng, v.district
       FROM players p JOIN teams t ON t.id = p.team_id JOIN villages v ON v.id = t.village_id
      WHERE ${where} AND (p.status IS NULL OR p.status = 'active') LIMIT ?`,
  ).bind(...(opts.teamIds ?? []), limit).all<PlayerRow>()).results;
  if (rows.length === 0) return { filled: 0, remaining: 0 };

  const byDistrict = new Map<string, VillageRow[]>();
  for (const d of new Set(rows.map((r) => r.district))) {
    const list = (await db.prepare("SELECT id, name, lat, lng, district FROM villages WHERE district = ? AND lat IS NOT NULL").bind(d).all<VillageRow>()
      .catch((e) => { logger.warn({ module: M }, `obce okresu ${d}`, e); return { results: [] as VillageRow[] }; })).results;
    byDistrict.set(d, list);
  }

  const updates = rows.map((r) => {
    const name = commuteVillage(
      { id: r.village_id, name: r.village_name, lat: r.lat, lng: r.lng },
      r.commute_km ?? 0,
      byDistrict.get(r.district) ?? [],
      r.id,
    );
    return db.prepare("UPDATE players SET residence = ? WHERE id = ?").bind(name, r.id);
  });
  let filled = 0;
  for (let i = 0; i < updates.length; i += 80) {
    const res = await db.batch(updates.slice(i, i + 80));
    filled += res.reduce((n, x) => n + (x.meta?.changes ?? 0), 0);
  }
  const left = await db.prepare(
    `SELECT COUNT(*) AS n FROM players p JOIN teams t ON t.id = p.team_id JOIN villages v ON v.id = t.village_id
      WHERE ${where} AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(...(opts.teamIds ?? [])).first<{ n: number }>();
  return { filled, remaining: left?.n ?? 0 };
}
