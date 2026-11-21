/**
 * Tipovačka v hospodě: lístek na stránce Hospoda (tipy na nejbližší kolo okresu,
 * poslední výsledky, tabulka sezóny) a uložení tipů. Herní mechanika bez postavy,
 * proto ovládání na stránce, výsledky posílá hospodský SMS.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { loadTipView, saveTips, TipError } from "../pub/tip-game";

const M = "pub-tips";
const pubTipsRouter = new Hono<{ Bindings: Bindings }>();

pubTipsRouter.use("/teams/:teamId/pub-tips", requireTeamOwnership);

pubTipsRouter.get("/teams/:teamId/pub-tips", async (c) => {
  const view = await loadTipView(c.env.DB, c.req.param("teamId"));
  return c.json(view ?? { round: null, matches: [], last: null, season: [] });
});

pubTipsRouter.put("/teams/:teamId/pub-tips", async (c) => {
  const body = await c.req.json<{ tips?: unknown }>().catch((e) => {
    logger.warn({ module: M }, "nečitelné tělo tipů", e);
    return { tips: undefined };
  });
  if (!Array.isArray(body.tips)) return c.json({ error: "Pošli tipy." }, 400);
  const tips = (body.tips as Array<Record<string, unknown>>)
    .filter((t) => t && typeof t.matchId === "string")
    .map((t) => ({ matchId: t.matchId as string, home: t.home, away: t.away }));
  try {
    const res = await saveTips(c.env.DB, c.req.param("teamId"), tips);
    return c.json({ ok: true, ...res });
  } catch (e) {
    if (e instanceof TipError) return c.json({ error: e.message }, e.status);
    logger.error({ module: M }, "uložení tipů", e);
    return c.json({ error: "Tipy se nepodařilo uložit." }, 500);
  }
});

export default pubTipsRouter;
