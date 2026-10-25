/**
 * Admin AI trenérů: deník rozhodnutí, přepínač režimu a ruční spuštění úlohy.
 *
 * GET  /api/admin/ai-coach/decisions?teamId=&kind=&only=errors|fallback&limit=   poslední rozhodnutí
 * GET  /api/admin/ai-coach/clubs                            AI kluby s povahou a chybovostí
 * GET  /api/admin/ai-coach/status                           stav pro přehled (24 h, chyby, převzetí)
 * GET  /api/admin/ai-coach/mode                             režim po oblastech
 * POST /api/admin/ai-coach/mode                             { mode } nebo { match, weekly, market }
 * POST /api/admin/ai-coach/run?teamId=&task=match|weekly|hourly|market&dryRun=1   (market = trh hned, bez dryRun)
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireAdmin, requireAuth } from "../auth/middleware";
import { logger } from "../lib/logger";
import { COACH_MODE_KEY, normalizeCoachModeSetting, readAllCoachModes, writeCoachMode } from "../ai-coach/mode";
import { generateAiProfile, parseAiProfile } from "../ai-coach/profile";
import { COACH_MODEL } from "../ai-coach/llm";
import type { CoachTask } from "../queue/messages";

export const adminAiCoachRouter = new Hono<{ Bindings: Bindings }>();

adminAiCoachRouter.use("*", requireAuth);
adminAiCoachRouter.use("*", requireAdmin);

const M = "admin-ai-coach";

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: M }, "nečitelný JSON v deníku AI trenéra", e);
    return raw;
  }
}

adminAiCoachRouter.get("/decisions", async (c) => {
  const teamId = c.req.query("teamId") || null;
  const kind = c.req.query("kind") || null;
  // only=errors: jen rozhodnutí s chybou, only=fallback: jen ta bez modelu.
  const only = c.req.query("only");
  const onlyFilter = only === "errors" || only === "fallback" ? only : null;
  const full = c.req.query("full") === "1";
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") ?? 50) || 50));
  const rows = await c.env.DB.prepare(
    `SELECT d.id, d.team_id, t.name AS team_name, d.kind, d.mode, d.model, d.context_ref, d.raw_output, d.actions, d.executed,
            d.used_fallback, d.error, d.tokens_in, d.tokens_out, d.latency_ms, d.created_at${full ? ", d.input_summary" : ""}
       FROM ai_coach_decisions d LEFT JOIN teams t ON t.id = d.team_id
      WHERE (?1 IS NULL OR d.team_id = ?1) AND (?2 IS NULL OR d.kind = ?2)
        AND (?4 IS NULL OR (?4 = 'errors' AND d.error IS NOT NULL) OR (?4 = 'fallback' AND d.used_fallback = 1))
      ORDER BY d.created_at DESC LIMIT ?3`,
  ).bind(teamId, kind, limit, onlyFilter).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, "načtení deníku", e); return null; });
  if (!rows) return c.json({ error: "Deník se nepodařilo načíst" }, 500);
  return c.json({
    decisions: rows.results.map((r) => {
      const actions = parseJson(r.actions) as { decision?: { reasoning?: string } } | null;
      return {
        id: r.id,
        teamId: r.team_id,
        teamName: r.team_name ?? null,
        kind: r.kind,
        mode: r.mode,
        model: r.model,
        contextRef: r.context_ref,
        reasoning: actions?.decision?.reasoning ?? null,
        actions,
        executed: parseJson(r.executed),
        rawOutput: typeof r.raw_output === "string" ? r.raw_output.slice(0, 4000) : null,
        usedFallback: r.used_fallback === 1,
        error: r.error,
        tokensIn: r.tokens_in,
        tokensOut: r.tokens_out,
        latencyMs: r.latency_ms,
        createdAt: r.created_at,
        ...(full ? { inputSummary: r.input_summary } : {}),
      };
    }),
  });
});

adminAiCoachRouter.get("/clubs", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.budget, t.reputation, l.name AS league_name, m.name AS coach_name, m.ai_profile,
            m.tactics, m.youth_development, m.discipline, m.motivation,
            (SELECT COUNT(*) FROM ai_coach_decisions d WHERE d.team_id = t.id AND d.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS decisions_7d,
            (SELECT COUNT(*) FROM ai_coach_decisions d WHERE d.team_id = t.id AND d.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND d.used_fallback = 1) AS fallback_7d,
            (SELECT MAX(d.created_at) FROM ai_coach_decisions d WHERE d.team_id = t.id) AS last_decision_at
       FROM teams t
       LEFT JOIN leagues l ON l.id = t.league_id
       LEFT JOIN managers m ON m.team_id = t.id AND m.user_id = 'ai'
      WHERE t.user_id = 'ai' AND t.parent_team_id IS NULL AND t.league_id IS NOT NULL
      ORDER BY l.name, t.name`,
  ).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, "seznam AI klubů", e); return null; });
  if (!rows) return c.json({ error: "Kluby se nepodařilo načíst" }, 500);
  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n, SUM(used_fallback) AS fallback, SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
            AVG(latency_ms) AS latency
       FROM ai_coach_decisions WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND mode != 'off'`,
  ).first<{ n: number; fallback: number | null; errors: number | null; latency: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "souhrn deníku", e); return null; });
  return c.json({
    model: COACH_MODEL,
    totals: {
      decisions7d: totals?.n ?? 0,
      fallback7d: totals?.fallback ?? 0,
      errors7d: totals?.errors ?? 0,
      avgLatencyMs: totals?.latency ? Math.round(totals.latency) : null,
    },
    clubs: rows.results.map((r) => {
      const stored = parseAiProfile(r.ai_profile);
      return {
        teamId: r.id,
        name: r.name,
        league: r.league_name,
        coachName: r.coach_name ?? null,
        budget: r.budget,
        reputation: r.reputation,
        profile: stored ?? generateAiProfile(r.id as string, {
          tactics: r.tactics as number | null, youth_development: r.youth_development as number | null,
          discipline: r.discipline as number | null, motivation: r.motivation as number | null,
        }),
        profileStored: !!stored,
        decisions7d: r.decisions_7d,
        fallback7d: r.fallback_7d,
        lastDecisionAt: r.last_decision_at ?? null,
      };
    }),
  });
});

adminAiCoachRouter.get("/status", async (c) => {
  const { loadCoachStatus } = await import("../ai-coach/status");
  try {
    return c.json(await loadCoachStatus(c.env.DB, c.env.CACHE_KV, new Date()));
  } catch (e) {
    logger.error({ module: M }, "stav AI trenérů", e);
    return c.json({ error: "Stav AI trenérů se nepodařilo načíst" }, 500);
  }
});

adminAiCoachRouter.get("/mode", async (c) => {
  const raw = await c.env.CACHE_KV.get(COACH_MODE_KEY)
    .catch((e) => { logger.warn({ module: M }, "čtení přepínače", e); return null; });
  return c.json({ modes: await readAllCoachModes(c.env.CACHE_KV), raw, model: COACH_MODEL });
});

adminAiCoachRouter.post("/mode", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((e) => {
    logger.warn({ module: M }, "nečitelné tělo přepínače", e);
    return null;
  });
  if (!body) return c.json({ error: "Chybí nastavení" }, 400);
  const setting = normalizeCoachModeSetting(body.mode !== undefined ? body.mode : body);
  if (!setting) return c.json({ error: "Režim musí být off, shadow nebo on (celkově, nebo pro match, weekly a market)" }, 400);
  // Částečné nastavení oblastí doplní zbylé oblasti z dosavadního stavu.
  const value = typeof setting === "string" ? setting : { ...(await readAllCoachModes(c.env.CACHE_KV)), ...setting };
  await writeCoachMode(c.env.CACHE_KV, value);
  logger.info({ module: M }, `přepínač AI trenérů: ${JSON.stringify(value)}`);
  return c.json({ ok: true, modes: await readAllCoachModes(c.env.CACHE_KV) });
});

const TASKS: readonly CoachTask[] = ["match", "weekly", "hourly"];

adminAiCoachRouter.post("/run", async (c) => {
  const teamId = c.req.query("teamId");
  const rawTask = c.req.query("task");
  const dryRun = c.req.query("dryRun") === "1";
  const model = c.req.query("model") || undefined;
  if (!teamId) return c.json({ error: "Chybí teamId" }, 400);

  // Trh hned, mimo rozvrh (hodina, denní šance): na vyzkoušení nákupů a prodeje. Řídí se režimem
  // oblasti trh, nanečisto jde jen přes režim shadow (trh vlastní „nanečisto" nemá).
  if (rawTask === "market") {
    if (dryRun) return c.json({ error: "Trh nanečisto jde jen přes režim shadow v oblasti trh" }, 400);
    const { runTransferMarket } = await import("../ai-coach/transfer-market");
    try {
      const result = await runTransferMarket(c.env, teamId, new Date(), { ignoreSchedule: true, model });
      return c.json({ ok: true, task: "market", result });
    } catch (e) {
      logger.error({ module: M, teamId }, "ruční trh AI klubu selhal", e);
      return c.json({ error: "Trh selhal, podrobnosti jsou v logu" }, 500);
    }
  }

  const task = rawTask as CoachTask | undefined;
  if (!task || !TASKS.includes(task)) return c.json({ error: "task musí být match, weekly, hourly nebo market" }, 400);

  const { currentGameDay, runAiCoachTask, taskDay } = await import("../ai-coach/jobs");
  const gameDay = await currentGameDay(c.env.DB);
  if (!gameDay) return c.json({ error: "Chybí herní datum" }, 409);
  const now = new Date();
  const day = taskDay(task, gameDay, now);
  try {
    // Nanečisto bez nároku (jde opakovat), naostro s nárokem jako ve frontě (nic dvakrát).
    const result = await runAiCoachTask(c.env, teamId, task, day, now, { dryRun, claims: !dryRun, model });
    const last = await c.env.DB.prepare(
      "SELECT id, kind, mode, used_fallback, error, created_at FROM ai_coach_decisions WHERE team_id = ? ORDER BY created_at DESC LIMIT 3",
    ).bind(teamId).all<Record<string, unknown>>()
      .catch((e) => { logger.warn({ module: M }, "poslední rozhodnutí", e); return { results: [] as Array<Record<string, unknown>> }; });
    return c.json({ ok: true, task, day, dryRun, result, lastDecisions: last.results });
  } catch (e) {
    logger.error({ module: M, teamId }, `ruční úloha ${task} selhala`, e);
    return c.json({ error: "Úloha selhala, podrobnosti jsou v logu" }, 500);
  }
});
