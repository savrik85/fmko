/**
 * Stav AI trenérů pro přehled administrace: režim, AI kluby po ligách, rozhodnutí za 24 hodin
 * po druzích, poslední chyby, kluby v mínusu a převzetí opuštěných klubů (kdo čeká, kdo
 * přijde na řadu do týdne, koho AI převzala za posledních 7 dní).
 *
 * Jen čte. Každý dotaz má vlastní zachycení, takže výpadek jedné části (třeba chybějící
 * tabulka na starší databázi) nezhasne zbytek přehledu.
 */

import { findAbandonedClubs, isTakeoverEnabled, MAX_TAKEOVERS_PER_RUN } from "../ai-clubs/abandoned";
import { ABANDONED_AFTER_DAYS, daysBefore } from "../ai-clubs/owner-activity";
import { logger } from "../lib/logger";
import { COACH_MODEL } from "./llm";
import { readAllCoachModes, type CoachArea, type CoachMode } from "./mode";

const M = "ai-coach-status";

/** Kolik dní před převzetím se klub ukáže jako „na řadě do týdne". */
const SOON_DAYS = 7;
const MAX_LISTED = 30;

export interface CoachStatusClub {
  teamId: string;
  name: string;
}

export interface CoachStatus {
  model: string;
  modes: Record<CoachArea, CoachMode>;
  clubs: {
    total: number;
    byLeague: Array<{ league: string; count: number }>;
    /** AI kluby, jejichž liga v `leagues` neexistuje (pozůstatek testování): nehrají, jen dostávají úlohy. */
    orphaned: number;
    inDebt: Array<CoachStatusClub & { budget: number }>;
  };
  last24h: {
    decisions: number;
    /** Rozhodnutí, o kterých má rozhodovat model (bez režimu off). */
    modelDecisions: number;
    /** Z nich rozhodlo náhradní pravidlo (výpadek, čas, nesmyslná odpověď). Režim off se nepočítá. */
    fallback: number;
    errors: number;
    avgLatencyMs: number | null;
    tokensIn: number;
    tokensOut: number;
    byKind: Array<{ kind: string; decisions: number; fallback: number; errors: number }>;
  };
  last7d: { decisions: number; fallback: number; errors: number };
  lastDecisionAt: string | null;
  recentErrors: Array<{ id: string; teamId: string; teamName: string | null; kind: string; error: string; createdAt: string }>;
  takeover: {
    enabled: boolean;
    brake: number;
    waitingCount: number;
    waiting: CoachStatusClub[];
    soon: CoachStatusClub[];
    recent: Array<CoachStatusClub & { since: string }>;
  };
}

const SINCE_24H = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')";
const SINCE_7D = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')";

async function teamNames(db: D1Database, ids: string[]): Promise<CoachStatusClub[]> {
  const list = ids.slice(0, MAX_LISTED);
  if (list.length === 0) return [];
  const rows = await db.prepare(`SELECT id, name FROM teams WHERE id IN (${list.map(() => "?").join(",")})`)
    .bind(...list).all<{ id: string; name: string }>()
    .catch((e) => { logger.warn({ module: M }, "jména klubů", e); return { results: [] as Array<{ id: string; name: string }> }; });
  const nameOf = new Map(rows.results.map((r) => [r.id, r.name]));
  return list.map((id) => ({ teamId: id, name: nameOf.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export async function loadCoachStatus(db: D1Database, kv: KVNamespace | undefined, now: Date): Promise<CoachStatus> {
  const leagues = await db.prepare(
    `SELECT l.name AS league, COUNT(*) AS n FROM teams t LEFT JOIN leagues l ON l.id = t.league_id
      WHERE t.user_id = 'ai' AND t.parent_team_id IS NULL AND t.league_id IS NOT NULL
        AND COALESCE(t.team_type, 'senior') <> 'u21'
      GROUP BY t.league_id`,
  ).all<{ league: string | null; n: number }>()
    .catch((e) => { logger.warn({ module: M }, "AI kluby po ligách", e); return { results: [] as Array<{ league: string | null; n: number }> }; });
  const byLeague = leagues.results.filter((r) => r.league !== null)
    .map((r) => ({ league: r.league as string, count: r.n }))
    .sort((a, b) => b.count - a.count || a.league.localeCompare(b.league, "cs"));
  const orphaned = leagues.results.filter((r) => r.league === null).reduce((s, r) => s + r.n, 0);

  const debt = await db.prepare(
    `SELECT id, name, budget FROM teams WHERE user_id = 'ai' AND parent_team_id IS NULL AND league_id IS NOT NULL AND budget < 0
      ORDER BY budget LIMIT 10`,
  ).all<{ id: string; name: string; budget: number }>()
    .catch((e) => { logger.warn({ module: M }, "AI kluby v mínusu", e); return { results: [] as Array<{ id: string; name: string; budget: number }> }; });

  const kinds = await db.prepare(
    `SELECT kind, COUNT(*) AS n, SUM(CASE WHEN mode != 'off' THEN 1 ELSE 0 END) AS model_n,
            SUM(CASE WHEN used_fallback = 1 AND mode != 'off' THEN 1 ELSE 0 END) AS fallback,
            SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
            SUM(latency_ms) AS latency_sum, COUNT(latency_ms) AS latency_n,
            SUM(COALESCE(tokens_in, 0)) AS tokens_in, SUM(COALESCE(tokens_out, 0)) AS tokens_out
       FROM ai_coach_decisions WHERE created_at >= ${SINCE_24H}
      GROUP BY kind ORDER BY n DESC, kind`,
  ).all<{ kind: string; n: number; model_n: number; fallback: number; errors: number; latency_sum: number | null; latency_n: number; tokens_in: number; tokens_out: number }>()
    .catch((e) => { logger.warn({ module: M }, "rozhodnutí za 24 h", e); return null; });
  const kindRows = kinds?.results ?? [];
  const latencyN = kindRows.reduce((s, r) => s + r.latency_n, 0);
  const latencySum = kindRows.reduce((s, r) => s + (r.latency_sum ?? 0), 0);

  const week = await db.prepare(
    `SELECT COUNT(*) AS n,
            SUM(CASE WHEN used_fallback = 1 AND mode != 'off' THEN 1 ELSE 0 END) AS fallback,
            SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors
       FROM ai_coach_decisions WHERE created_at >= ${SINCE_7D}`,
  ).first<{ n: number; fallback: number | null; errors: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "rozhodnutí za 7 dní", e); return null; });
  const last = await db.prepare("SELECT MAX(created_at) AS at FROM ai_coach_decisions")
    .first<{ at: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "poslední rozhodnutí", e); return null; });

  const errors = await db.prepare(
    `SELECT d.id, d.team_id, t.name AS team_name, d.kind, d.error, d.created_at
       FROM ai_coach_decisions d LEFT JOIN teams t ON t.id = d.team_id
      WHERE d.error IS NOT NULL AND d.created_at >= ${SINCE_7D}
      ORDER BY d.created_at DESC LIMIT 8`,
  ).all<{ id: string; team_id: string; team_name: string | null; kind: string; error: string; created_at: string }>()
    .catch((e) => { logger.warn({ module: M }, "poslední chyby", e); return { results: [] as Array<{ id: string; team_id: string; team_name: string | null; kind: string; error: string; created_at: string }> }; });

  const enabled = await isTakeoverEnabled(kv);
  const waiting = await findAbandonedClubs(db, now);
  const waitingIds = new Set(waiting.map((w) => w.teamId));
  const soon = (await findAbandonedClubs(db, now, ABANDONED_AFTER_DAYS - SOON_DAYS)).filter((c) => !waitingIds.has(c.teamId));
  const recent = await db.prepare(
    `SELECT id, name, ai_since FROM teams
      WHERE parent_team_id IS NULL AND ai_former_user_id IS NOT NULL AND ai_since >= ?
      ORDER BY ai_since DESC LIMIT 10`,
  ).bind(daysBefore(now, SOON_DAYS)).all<{ id: string; name: string; ai_since: string }>()
    .catch((e) => { logger.warn({ module: M }, "nedávno převzaté kluby", e); return { results: [] as Array<{ id: string; name: string; ai_since: string }> }; });

  return {
    model: COACH_MODEL,
    modes: await readAllCoachModes(kv),
    clubs: {
      total: leagues.results.reduce((s, r) => s + r.n, 0),
      byLeague,
      orphaned,
      inDebt: debt.results.map((r) => ({ teamId: r.id, name: r.name, budget: r.budget })),
    },
    last24h: {
      decisions: kindRows.reduce((s, r) => s + r.n, 0),
      modelDecisions: kindRows.reduce((s, r) => s + (r.model_n ?? 0), 0),
      fallback: kindRows.reduce((s, r) => s + (r.fallback ?? 0), 0),
      errors: kindRows.reduce((s, r) => s + (r.errors ?? 0), 0),
      avgLatencyMs: latencyN > 0 ? Math.round(latencySum / latencyN) : null,
      tokensIn: kindRows.reduce((s, r) => s + (r.tokens_in ?? 0), 0),
      tokensOut: kindRows.reduce((s, r) => s + (r.tokens_out ?? 0), 0),
      byKind: kindRows.map((r) => ({ kind: r.kind, decisions: r.n, fallback: r.fallback ?? 0, errors: r.errors ?? 0 })),
    },
    last7d: { decisions: week?.n ?? 0, fallback: week?.fallback ?? 0, errors: week?.errors ?? 0 },
    lastDecisionAt: last?.at ?? null,
    recentErrors: errors.results.map((r) => ({
      id: r.id, teamId: r.team_id, teamName: r.team_name, kind: r.kind, error: r.error, createdAt: r.created_at,
    })),
    takeover: {
      enabled,
      brake: MAX_TAKEOVERS_PER_RUN,
      waitingCount: waiting.length,
      waiting: await teamNames(db, waiting.map((w) => w.teamId)),
      soon: await teamNames(db, soon.map((s) => s.teamId)),
      recent: recent.results.map((r) => ({ teamId: r.id, name: r.name, since: r.ai_since })),
    },
  };
}
