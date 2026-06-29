/**
 * Vývoj na konci sezóny — hráči se zlepší/zhorší dle věku, trenér se vyvíjí.
 *
 * Hráči: mladí rostou, staří klesají (overall_rating + proporčně skills).
 * Trenér: získá zkušenost (atributy +/- dle sezóny) a zestárne.
 * Vrací top zlepšené/zhoršené hráče + změny trenéra pro recap.
 */

import { createRng } from "../generators/rng";
import { getTeamPosition } from "../stats/standings";
import { logger } from "../lib/logger";

const M = "season-development";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface PlayerDevEntry { playerId: string; name: string; position: string; age: number; before: number; after: number; delta: number }
export interface ManagerAttrDelta { attr: string; label: string; before: number; after: number }
export interface ManagerDev { name: string; age: number; deltas: ManagerAttrDelta[] }
export interface DevResult { improved: PlayerDevEntry[]; declined: PlayerDevEntry[]; manager: ManagerDev | null }

/** Věkově řízená změna overall (s trochou náhody). */
function ratingDelta(rng: ReturnType<typeof createRng>, age: number): number {
  if (age <= 20) return rng.int(1, 4);
  if (age <= 23) return rng.int(0, 3);
  if (age <= 26) return rng.int(-1, 2);
  if (age <= 29) return rng.int(-1, 1);
  if (age <= 32) return rng.int(-2, 0);
  if (age <= 34) return rng.int(-3, -1);
  return rng.int(-4, -2);
}

const MGR_LABELS: Record<string, string> = {
  coaching: "Trénování", motivation: "Motivace", tactics: "Taktika",
  youth_development: "Mládež", discipline: "Disciplína",
};

export async function developSquadAndManager(
  db: D1Database,
  leagueId: string,
  teamId: string,
  seasonNumber: number,
): Promise<DevResult> {
  const rng = createRng(hashSeed(`${teamId}:s${seasonNumber}:dev`));

  // ── Hráči ──
  const playersRes = await db.prepare(
    "SELECT id, first_name, last_name, age, position, overall_rating, skills FROM players WHERE team_id = ? AND status = 'active'",
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; age: number; position: string; overall_rating: number; skills: string }>()
    .catch((e) => { logger.warn({ module: M }, "load players", e); return { results: [] as any[] }; });

  const entries: PlayerDevEntry[] = [];
  for (const p of playersRes.results) {
    const before = p.overall_rating;
    const delta = ratingDelta(rng, p.age);
    const after = clamp(before + delta, 20, 99);
    const realDelta = after - before;
    if (realDelta === 0) continue;

    // proporční změna skills (celý hráč se mírně zlepší/zhorší)
    let skills: Record<string, unknown> = {};
    try { skills = JSON.parse(p.skills); } catch { skills = {}; }
    if (before > 0) {
      const ratio = after / before;
      for (const k of Object.keys(skills)) {
        if (typeof skills[k] === "number") skills[k] = clamp(Math.round((skills[k] as number) * ratio), 1, 99);
      }
    }
    await db.prepare("UPDATE players SET overall_rating = ?, skills = ? WHERE id = ?")
      .bind(after, JSON.stringify(skills), p.id).run()
      .catch((e) => logger.warn({ module: M }, "update player dev", e));

    entries.push({ playerId: p.id, name: `${p.first_name} ${p.last_name}`, position: p.position, age: p.age, before, after, delta: realDelta });
  }

  const improved = entries.filter((e) => e.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const declined = entries.filter((e) => e.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);

  // ── Trenér ──
  let manager: ManagerDev | null = null;
  const mgr = await db.prepare(
    "SELECT m.id, m.name, m.age, m.coaching, m.motivation, m.tactics, m.youth_development, m.discipline FROM managers m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ? AND m.user_id = t.user_id AND t.user_id != 'ai'",
  ).bind(teamId).first<{ id: string; name: string; age: number | null; coaching: number; motivation: number; tactics: number; youth_development: number; discipline: number }>()
    .catch((e) => { logger.warn({ module: M }, "load manager", e); return null; });

  if (mgr) {
    const pos = await getTeamPosition(db, leagueId, teamId).catch((e) => { logger.warn({ module: M }, "team position", e); return 0; });
    const totalTeams = (await db.prepare("SELECT COUNT(*) AS c FROM teams WHERE league_id = ?").bind(leagueId).first<{ c: number }>()
      .catch((e) => { logger.warn({ module: M }, "team count", e); return null; }))?.c ?? 14;
    const topHalf = pos > 0 && pos <= Math.ceil(totalTeams / 2);

    const next = { coaching: mgr.coaching, motivation: mgr.motivation, tactics: mgr.tactics, youth_development: mgr.youth_development, discipline: mgr.discipline };
    // Zkušenost: +1 do trénování nebo taktiky
    const expAttr = rng.pick(["coaching", "tactics"]) as keyof typeof next;
    next[expAttr] = clamp(next[expAttr] + 1, 1, 99);
    // Dle výsledku sezóny
    if (topHalf) {
      next.motivation = clamp(next.motivation + 1, 1, 99);
    } else {
      next.discipline = clamp(next.discipline + 1, 1, 99);
      if (rng.random() < 0.5) next.motivation = clamp(next.motivation - 1, 1, 99);
    }
    // Občas rozvoj mládeže
    if (rng.random() < 0.35) next.youth_development = clamp(next.youth_development + 1, 1, 99);

    const newAge = (mgr.age ?? 40) + 1;
    await db.prepare("UPDATE managers SET age = ?, coaching = ?, motivation = ?, tactics = ?, youth_development = ?, discipline = ? WHERE id = ?")
      .bind(newAge, next.coaching, next.motivation, next.tactics, next.youth_development, next.discipline, mgr.id).run()
      .catch((e) => logger.warn({ module: M }, "update manager dev", e));

    const deltas: ManagerAttrDelta[] = [];
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      const before = (mgr as any)[k] as number;
      if (next[k] !== before) deltas.push({ attr: k, label: MGR_LABELS[k] ?? k, before, after: next[k] });
    }
    manager = { name: mgr.name, age: newAge, deltas };
  }

  logger.info({ module: M }, `dev team=${teamId} improved=${improved.length} declined=${declined.length} mgr=${manager ? "y" : "n"}`);
  return { improved, declined, manager };
}
