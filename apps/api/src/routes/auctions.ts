/**
 * Dražba hráčů z opuštěných klubů: seznam běžících a skončených dražeb a příhoz.
 * Herní mechanika bez postavy, proto ovládání na stránce Přestupy (záložka Dražba).
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { BidError, loadAuctions, placeBid } from "../transfers/auctions";

const M = "auctions";
const auctionsRouter = new Hono<{ Bindings: Bindings }>();

auctionsRouter.use("/teams/:teamId/auctions", requireTeamOwnership);
auctionsRouter.use("/teams/:teamId/auctions/*", requireTeamOwnership);

auctionsRouter.get("/teams/:teamId/auctions", async (c) => {
  return c.json(await loadAuctions(c.env.DB, c.req.param("teamId")));
});

auctionsRouter.post("/teams/:teamId/auctions/:auctionId/bid", async (c) => {
  const body = await c.req.json<{ amount?: unknown }>().catch((e) => {
    logger.warn({ module: M }, "nečitelné tělo příhozu", e);
    return { amount: undefined };
  });
  const amount = Number(body.amount);
  try {
    const a = await placeBid(c.env.DB, c.req.param("teamId"), c.req.param("auctionId"), amount);
    return c.json({ ok: true, currentBid: a.current_bid, endsAt: a.ends_at });
  } catch (e) {
    if (e instanceof BidError) return c.json({ error: e.message }, e.status);
    logger.error({ module: M }, "příhoz v dražbě", e);
    return c.json({ error: "Příhoz se nepodařilo uložit." }, 500);
  }
});

export default auctionsRouter;
