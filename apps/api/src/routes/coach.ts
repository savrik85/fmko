/**
 * Trenér — API profilu: Kabina (vztah hráčů k trenérovi) a historie vztahu hráče.
 *
 * GET routy propouští `requireTeamOwnership` bez kontroly, proto si je hlídáme
 * přes `tymyDivaka`: vztah hráčů k trenérovi cizí kluby nevidí.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireTeamOwnership } from "../auth/middleware";
import { tymyDivaka } from "../auth/divak";
import { loadKabina, loadPlayerRelationLog } from "../coach/kabina";

export const coachRouter = new Hono<{ Bindings: Bindings }>();

coachRouter.use("/teams/:teamId/coach/*", requireTeamOwnership);

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
