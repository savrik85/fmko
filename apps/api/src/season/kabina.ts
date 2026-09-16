/**
 * Kabina & frakce — týdenní dynamika šatny.
 * Tahoun (vysoký leadership) drží partu a zvedá morálku; potížista (nízká disciplína +
 * vysoký temperament) dělá dusno. Rivalové v kádru se hádají (−), parťáci od piva drží spolu (+).
 * Morálka je v players.life_context JSON. Volá se z daily-ticku v pondělí.
 */

import { nactiDruhyHracu } from "../incidents/absence-hracu";
import { KAMARADSKE_VZTAHY, SILA_KAMARADSTVI } from "../incidents/nastaveni";
import { logger } from "../lib/logger";

const M = "kabina";

export interface KabinaResult {
  tahoun: { id: string; name: string } | null;
  potizista: { id: string; name: string } | null;
  mood: number; // průměrná morálka kádru po úpravě
  applied: boolean;
  /** Věta o incidentu do notifikace (odhalený zloděj nebo křivě obviněný), jinak null. */
  incident: string | null;
}

interface KabinaPlayer {
  id: string; name: string; leadership: number; discipline: number; temper: number; morale: number;
}

/**
 * Incidenty v kabině (spec 17c). Odhalenému zlodějovi kabina nevěří: ostatní −1,
 * jeho kamarádi drží s ním (0) a tahounem být nemůže. Křivě obviněný nese křivdu:
 * sám −2, kamarádi −1. Počítá jen hráče z `hraci`.
 */
export function incidentyVKabine(
  hraci: readonly string[],
  druhy: ReadonlyMap<string, readonly string[]>,
  kamaradi: ReadonlyMap<string, ReadonlySet<string>>,
): { delta: Map<string, number>; nesmiBytTahoun: Set<string> } {
  const vKadru = new Set(hraci);
  const delta = new Map<string, number>();
  const nesmiBytTahoun = new Set<string>();
  const pridej = (id: string, d: number) => { if (vKadru.has(id)) delta.set(id, (delta.get(id) ?? 0) + d); };
  for (const id of hraci) {
    const d = druhy.get(id) ?? [];
    const jehoKamaradi = kamaradi.get(id) ?? new Set<string>();
    if (d.includes("pachatel")) {
      nesmiBytTahoun.add(id);
      for (const jiny of hraci) if (jiny !== id && !jehoKamaradi.has(jiny)) pridej(jiny, -1);
    }
    if (d.includes("obvineny")) {
      pridej(id, -2);
      for (const kamarad of jehoKamaradi) pridej(kamarad, -1);
    }
  }
  return { delta, nesmiBytTahoun };
}

export async function processKabina(db: D1Database, teamId: string, gameDate?: string): Promise<KabinaResult> {
  const squad = await db.prepare(
    // Hráč, který odmítá hrát (quit), do kabiny nechodí: není tahoun ani potížista.
    "SELECT id, first_name, last_name, personality, json_extract(life_context, '$.morale') AS morale FROM players WHERE team_id = ? AND (status IS NULL OR status NOT IN ('released', 'quit'))"
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
  if (players.length < 5) return { tahoun: null, potizista: null, mood: 50, applied: false, incident: null };

  // Incidenty v kabině (spec 17c). Bez herního data se nepočítají.
  const druhy = gameDate ? await nactiDruhyHracu(db, teamId, gameDate) : new Map<string, string[]>();
  let incidentniUpravy = { delta: new Map<string, number>(), nesmiBytTahoun: new Set<string>() };
  let incident: string | null = null;
  if (druhy.size > 0) {
    const idsKadru = players.map((p) => p.id);
    const phKadru = idsKadru.map(() => "?").join(",");
    const typy = KAMARADSKE_VZTAHY.map(() => "?").join(",");
    const vztahy = await db.prepare(
      `SELECT player_a_id, player_b_id FROM relationships
        WHERE type IN (${typy}) AND strength >= ? AND player_a_id IN (${phKadru}) AND player_b_id IN (${phKadru})`,
    ).bind(...KAMARADSKE_VZTAHY, SILA_KAMARADSTVI, ...idsKadru, ...idsKadru)
      .all<{ player_a_id: string; player_b_id: string }>()
      .catch((e) => { logger.warn({ module: M }, "kamarádi pro incidenty v kabině", e); return { results: [] as Array<{ player_a_id: string; player_b_id: string }> }; });
    const kamaradi = new Map<string, Set<string>>();
    for (const r of vztahy.results) {
      kamaradi.set(r.player_a_id, (kamaradi.get(r.player_a_id) ?? new Set()).add(r.player_b_id));
      kamaradi.set(r.player_b_id, (kamaradi.get(r.player_b_id) ?? new Set()).add(r.player_a_id));
    }
    incidentniUpravy = incidentyVKabine(idsKadru, druhy, kamaradi);
    const jmeno = (id: string) => players.find((p) => p.id === id)?.name;
    const pachatel = idsKadru.find((id) => druhy.get(id)?.includes("pachatel"));
    const obvineny = idsKadru.find((id) => druhy.get(id)?.includes("obvineny"));
    incident = pachatel && jmeno(pachatel) ? `kabina nevěří hráči, kvůli kterému byl v klubu průšvih: ${jmeno(pachatel)}`
      : obvineny && jmeno(obvineny) ? `obvinění pořád dusí hráče: ${jmeno(obvineny)}`
      : null;
  }

  // Tahoun = nejvyšší leadership (musí být dost vysoký). Potížisti = nízká disciplína + vysoký temperament.
  const byLead = players.filter((p) => !incidentniUpravy.nesmiBytTahoun.has(p.id)).sort((a, b) => b.leadership - a.leadership);
  const tahoun = byLead[0] && byLead[0].leadership >= 65 ? byLead[0] : null;
  const troublemakers = players.filter((p) => p.discipline < 35 && p.temper > 60);
  const potizista = [...troublemakers].sort((a, b) => (b.temper - b.discipline) - (a.temper - a.discipline))[0] ?? null;

  // Vztahy v kádru — rivalové a švagři dělají dusno, parťáci od piva, kolegové
  // a sousedi drží partu. (Kolegové/sousedi/švagři byly dřív fantomové typy —
  // UI jim slibovalo efekt, který nikde neexistoval.)
  const ids = players.map((p) => p.id);
  const ph = ids.map(() => "?").join(",");
  const rels = await db.prepare(
    `SELECT player_a_id, player_b_id, type, strength FROM relationships WHERE type IN ('rivals','drinking_buddies','coworkers','neighbors','in_laws') AND player_a_id IN (${ph}) AND player_b_id IN (${ph})`
  ).bind(...ids, ...ids).all<{ player_a_id: string; player_b_id: string; type: string; strength: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "load relationships", e); return { results: [] as never[] }; });

  const delta = new Map<string, number>(players.map((p) => [p.id, 0]));
  const add = (id: string, d: number) => delta.set(id, (delta.get(id) ?? 0) + d);

  if (tahoun) for (const p of players) add(p.id, p.id === tahoun.id ? 1 : 2);
  for (const tm of troublemakers) for (const p of players) if (p.id !== tm.id) add(p.id, -2);
  // Dopad škáluje síla vztahu (strength/50) — nerozluční parťáci drží partu víc
  // než náhodná známost, zapšklá rivalita otráví kabinu víc než drobná řevnivost.
  const REL_WEEKLY: Record<string, number> = {
    rivals: -3, drinking_buddies: 2, coworkers: 1, neighbors: 1, in_laws: -1,
  };
  for (const r of rels.results) {
    const base = REL_WEEKLY[r.type] ?? 0;
    if (base === 0) continue;
    const d = Math.round(base * ((r.strength ?? 50) / 50));
    if (d !== 0) { add(r.player_a_id, d); add(r.player_b_id, d); }
  }

  for (const [id, d] of incidentniUpravy.delta) add(id, d);

  // Aplikuj (clamp týdenní delta na [-6,6], morálka 0-100).
  const stmts = [] as ReturnType<D1Database["prepare"]>[];
  let moodSum = 0;
  for (const p of players) {
    const d = Math.max(-6, Math.min(6, delta.get(p.id) ?? 0));
    const nm = Math.max(0, Math.min(100, Math.round(p.morale + d)));
    moodSum += nm;
    if (d !== 0) stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?").bind(nm, p.id));
  }
  let failed = false;
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40)).catch((e) => { logger.warn({ module: M }, "apply morale", e); failed = true; });

  return {
    tahoun: tahoun ? { id: tahoun.id, name: tahoun.name } : null,
    potizista: potizista ? { id: potizista.id, name: potizista.name } : null,
    mood: Math.round(moodSum / players.length),
    applied: !failed, // když batch spadl, nehlásit úspěch (jinak notifikace „nálada X" neodpovídá DB)
    incident,
  };
}
