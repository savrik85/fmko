/**
 * Sehranost taktik a formací — read/write/apply na úrovni týmu.
 *
 * Storage: `teams.tactic_familiarity` a `teams.formation_familiarity` (JSON {key: 0-100}).
 */

import type { D1Database } from "@cloudflare/workers-types";
import { logger } from "../lib/logger";

export interface FamiliaritySnapshot {
  tactic: Record<string, number>;
  formation: Record<string, number>;
}

const MATCH_BOOST = 3;
const MATCH_DECAY = 0.4;
const TRAINING_BOOST = 2;

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function parseMap(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function readFamiliarity(db: D1Database, teamId: string): Promise<FamiliaritySnapshot> {
  const row = await db.prepare(
    "SELECT tactic_familiarity, formation_familiarity FROM teams WHERE id = ?"
  ).bind(teamId).first<{ tactic_familiarity: string | null; formation_familiarity: string | null }>()
    .catch((e) => { logger.warn({ module: "chemistry" }, "read familiarity", e); return null; });

  return {
    tactic: parseMap(row?.tactic_familiarity),
    formation: parseMap(row?.formation_familiarity),
  };
}

/**
 * Po odehraném zápase: hraná taktika + formace +3, ostatní -0.4.
 */
export async function applyMatchResult(
  db: D1Database,
  teamId: string,
  tactic: string,
  formation: string,
): Promise<void> {
  const snap = await readFamiliarity(db, teamId);

  const nextTactic: Record<string, number> = {};
  const knownTactics = new Set([...Object.keys(snap.tactic), tactic]);
  for (const t of knownTactics) {
    const current = snap.tactic[t] ?? 0;
    nextTactic[t] = clamp(t === tactic ? current + MATCH_BOOST : current - MATCH_DECAY);
  }

  const nextFormation: Record<string, number> = {};
  const knownFormations = new Set([...Object.keys(snap.formation), formation]);
  for (const f of knownFormations) {
    const current = snap.formation[f] ?? 0;
    nextFormation[f] = clamp(f === formation ? current + MATCH_BOOST : current - MATCH_DECAY);
  }

  await db.prepare(
    "UPDATE teams SET tactic_familiarity = ?, formation_familiarity = ? WHERE id = ?"
  ).bind(JSON.stringify(nextTactic), JSON.stringify(nextFormation), teamId).run()
    .catch((e) => logger.warn({ module: "chemistry" }, "write familiarity", e));
}

/**
 * Tactics training: +2 pro aktuálně zvolenou taktiku.
 */
export async function applyTrainingBoost(
  db: D1Database,
  teamId: string,
  tactic: string,
): Promise<void> {
  const snap = await readFamiliarity(db, teamId);
  const next = { ...snap.tactic };
  next[tactic] = clamp((next[tactic] ?? 0) + TRAINING_BOOST);
  await db.prepare("UPDATE teams SET tactic_familiarity = ? WHERE id = ?")
    .bind(JSON.stringify(next), teamId).run()
    .catch((e) => logger.warn({ module: "chemistry" }, "training boost", e));
}

/**
 * Backfill z historie zápasů. Idempotentní — přepisuje hodnoty deterministicky
 * z chronologického přehrání všech odehraných zápasů.
 *
 * Pro každý tým: zápas s taktikou T → +MATCH_BOOST pro T, -MATCH_DECAY pro ostatní.
 */
export async function backfillFromHistory(db: D1Database): Promise<{ teamsUpdated: number; matchesProcessed: number }> {
  // Načti všechny týmy
  const teams = await db.prepare("SELECT id FROM teams").all<{ id: string }>();
  // Načti historii: tým + tactic + formation chronologicky
  const matches = await db.prepare(
    `SELECT m.id as match_id, m.simulated_at,
       l.team_id, l.tactic, l.formation
     FROM matches m
     JOIN lineups l ON l.id = m.home_lineup_id OR l.id = m.away_lineup_id
     WHERE m.status = 'simulated' AND l.tactic IS NOT NULL AND l.formation IS NOT NULL
     ORDER BY m.simulated_at ASC`
  ).all<{ match_id: string; simulated_at: string; team_id: string; tactic: string; formation: string }>();

  const tacticByTeam = new Map<string, Record<string, number>>();
  const formationByTeam = new Map<string, Record<string, number>>();

  for (const t of teams.results) {
    tacticByTeam.set(t.id, {});
    formationByTeam.set(t.id, {});
  }

  for (const m of matches.results) {
    const tMap = tacticByTeam.get(m.team_id);
    const fMap = formationByTeam.get(m.team_id);
    if (!tMap || !fMap) continue;

    const knownTactics = new Set([...Object.keys(tMap), m.tactic]);
    for (const t of knownTactics) {
      const current = tMap[t] ?? 0;
      tMap[t] = clamp(t === m.tactic ? current + MATCH_BOOST : current - MATCH_DECAY);
    }
    const knownForms = new Set([...Object.keys(fMap), m.formation]);
    for (const f of knownForms) {
      const current = fMap[f] ?? 0;
      fMap[f] = clamp(f === m.formation ? current + MATCH_BOOST : current - MATCH_DECAY);
    }
  }

  let teamsUpdated = 0;
  for (const t of teams.results) {
    const tMap = tacticByTeam.get(t.id) ?? {};
    const fMap = formationByTeam.get(t.id) ?? {};
    // Seed: pokud žádná historie, dej balanced/4-4-2 = 25 (něco aby chemistryFactor nebyl plně tlumený)
    if (Object.keys(tMap).length === 0) tMap.balanced = 25;
    if (Object.keys(fMap).length === 0) fMap["4-4-2"] = 25;

    await db.prepare("UPDATE teams SET tactic_familiarity = ?, formation_familiarity = ? WHERE id = ?")
      .bind(JSON.stringify(tMap), JSON.stringify(fMap), t.id).run()
      .catch((e) => logger.warn({ module: "chemistry" }, "backfill team", e));
    teamsUpdated++;
  }

  return { teamsUpdated, matchesProcessed: matches.results.length };
}
