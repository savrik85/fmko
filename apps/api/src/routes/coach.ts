/**
 * Trenér — API profilu: Kabina (vztah hráčů k trenérovi) a historie vztahu hráče.
 *
 * GET routy propouští `requireTeamOwnership` bez kontroly, proto si je hlídáme
 * přes `tymyDivaka`: vztah hráčů k trenérovi cizí kluby nevidí.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { tymyDivaka } from "../auth/divak";
import { loadKabina, loadPlayerRelationLog } from "../coach/kabina";
import { ensureAiManager } from "../coach/ai-manager";

export const coachRouter = new Hono<{ Bindings: Bindings }>();

coachRouter.use("/teams/:teamId/coach/*", requireTeamOwnership);
coachRouter.use("/admin/coach/*", requireAdmin);

const NOT_YOURS = "Kabinu cizího klubu nevidíš.";

/** GET /teams/:teamId/coach/kabina — vztahy vlastních hráčů k trenérovi. */
coachRouter.get("/teams/:teamId/coach/kabina", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: NOT_YOURS }, 403);
  try {
    return c.json(await loadKabina(c.env.DB, teamId));
  } catch (e) {
    logger.error({ module: "coach" }, `kabina ${teamId}`, e);
    return c.json({ error: "Kabinu se nepodařilo načíst." }, 500);
  }
});

/** GET /teams/:teamId/coach/relation-log?playerId= — proč se vztah hráče k trenérovi měnil. */
coachRouter.get("/teams/:teamId/coach/relation-log", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.query("playerId");
  if (!playerId) return c.json({ error: "Chybí hráč." }, 400);
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: NOT_YOURS }, 403);
  return c.json({ items: await loadPlayerRelationLog(c.env.DB, teamId, playerId) });
});

/**
 * POST /admin/coach/backfill-ai-managers?limit=100 — uloží trenéra každému AI klubu, který ho nemá.
 * Dřív se AI trenér ukládal jen při otevření profilu, takže většina AI klubů hrála bez
 * zápasového bonusu trenéra i bez vlivu jeho disciplíny. Idempotentní, dá se pouštět opakovaně.
 */
coachRouter.post("/admin/coach/backfill-ai-managers", async (c) => {
  // Každý klub jsou až čtyři dotazy; 100 klubů se vejde do limitu subrequestů workeru.
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 100) || 100));
  const rows = await c.env.DB.prepare(
    `SELECT t.id FROM teams t
      WHERE t.user_id = 'ai' AND t.parent_team_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM managers m WHERE m.team_id = t.id)
      LIMIT ?`,
  ).bind(limit).all<{ id: string }>()
    .catch((e) => { logger.error({ module: "coach" }, "backfill AI managers: load teams", e); return null; });
  if (!rows) return c.json({ error: "Kluby se nepodařilo načíst." }, 500);

  let created = 0;
  for (const r of rows.results) {
    if (await ensureAiManager(c.env.DB, r.id)) created++;
  }
  const left = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM teams t
      WHERE t.user_id = 'ai' AND t.parent_team_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM managers m WHERE m.team_id = t.id)`,
  ).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: "coach" }, "backfill AI managers: count left", e); return null; });
  logger.info({ module: "coach" }, `backfill AI managers: ${created} uloženo, zbývá ${left?.n ?? "?"}`);
  return c.json({ created, remaining: left?.n ?? null });
});
