/**
 * Kabina & frakce — týdenní dynamika šatny.
 * Tahoun (vysoký leadership) drží partu a zvedá morálku; potížista (nízká disciplína +
 * vysoký temperament) dělá dusno. Rivalové v kádru se hádají (−), parťáci od piva drží spolu (+).
 * Morálka je v players.life_context JSON. Volá se z daily-ticku v pondělí.
 */

import { logger } from "../lib/logger";

const M = "kabina";

export interface KabinaResult {
  tahoun: { id: string; name: string } | null;
  potizista: { id: string; name: string } | null;
  mood: number; // průměrná morálka kádru po úpravě
  applied: boolean;
}

interface KabinaPlayer {
  id: string; name: string; leadership: number; discipline: number; temper: number; morale: number;
}

export async function processKabina(db: D1Database, teamId: string): Promise<KabinaResult> {
  const squad = await db.prepare(
    "SELECT id, first_name, last_name, personality, json_extract(life_context, '$.morale') AS morale FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released')"
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; personality: string; morale: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "load squad", e); return { results: [] as never[] }; });

  const players: KabinaPlayer[] = squad.results.map((p) => {
    let pers: Record<string, number> = {};
    try { pers = JSON.parse(p.personality as string); } catch (e) { logger.warn({ module: M }, "parse personality", e); }
    return {
      id: p.id, name: `${p.first_name} ${p.last_name}`,
      leadership: pers.leadership ?? 30, discipline: pers.discipline ?? 50, temper: pers.temper ?? 40,
      morale: p.morale ?? 50,
    };
  });
  if (players.length < 5) return { tahoun: null, potizista: null, mood: 50, applied: false };

  // Tahoun = nejvyšší leadership (musí být dost vysoký). Potížisti = nízká disciplína + vysoký temperament.
  const byLead = [...players].sort((a, b) => b.leadership - a.leadership);
  const tahoun = byLead[0].leadership >= 65 ? byLead[0] : null;
  const troublemakers = players.filter((p) => p.discipline < 35 && p.temper > 60);
  const potizista = [...troublemakers].sort((a, b) => (b.temper - b.discipline) - (a.temper - a.discipline))[0] ?? null;

  // Vztahy v kádru — rivalové (friction) a parťáci od piva (camaraderie).
  const ids = players.map((p) => p.id);
  const ph = ids.map(() => "?").join(",");
  const rels = await db.prepare(
    `SELECT player_a_id, player_b_id, type FROM relationships WHERE type IN ('rivals','drinking_buddies') AND player_a_id IN (${ph}) AND player_b_id IN (${ph})`
  ).bind(...ids, ...ids).all<{ player_a_id: string; player_b_id: string; type: string }>()
    .catch((e) => { logger.warn({ module: M }, "load relationships", e); return { results: [] as never[] }; });

  const delta = new Map<string, number>(players.map((p) => [p.id, 0]));
  const add = (id: string, d: number) => delta.set(id, (delta.get(id) ?? 0) + d);

  if (tahoun) for (const p of players) add(p.id, p.id === tahoun.id ? 1 : 2);
  for (const tm of troublemakers) for (const p of players) if (p.id !== tm.id) add(p.id, -2);
  for (const r of rels.results) {
    if (r.type === "rivals") { add(r.player_a_id, -3); add(r.player_b_id, -3); }
    else { add(r.player_a_id, 2); add(r.player_b_id, 2); }
  }

  // Aplikuj (clamp týdenní delta na [-6,6], morálka 0-100).
  const stmts = [] as ReturnType<D1Database["prepare"]>[];
  let moodSum = 0;
  for (const p of players) {
    const d = Math.max(-6, Math.min(6, delta.get(p.id) ?? 0));
    const nm = Math.max(0, Math.min(100, Math.round(p.morale + d)));
    moodSum += nm;
    if (d !== 0) stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?").bind(nm, p.id));
  }
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40)).catch((e) => logger.warn({ module: M }, "apply morale", e));

  return {
    tahoun: tahoun ? { id: tahoun.id, name: tahoun.name } : null,
    potizista: potizista ? { id: potizista.id, name: potizista.name } : null,
    mood: Math.round(moodSum / players.length),
    applied: true,
  };
}
