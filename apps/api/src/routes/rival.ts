/**
 * Profil soupeře (profil týmu → záložka Soupeř). Jen pro majitele týmu: obsahuje jeho
 * skautský rozbor soupeře, který druhá strana vidět nesmí.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireOwnedTeamRead } from "../auth/middleware";

export const rivalRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/teams/:teamId/rival/:rivalId
rivalRouter.get("/teams/:teamId/rival/:rivalId", async (c) => {
  const teamId = c.req.param("teamId");
  const rivalId = c.req.param("rivalId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  if (rivalId === teamId) return c.json({ error: "Sám sobě soupeřem nejsi." }, 400);
  const { loadRivalProfile } = await import("../rival/rival-profile-data");
  const profile = await loadRivalProfile(c.env.DB, teamId, rivalId);
  if (!profile) return c.json({ error: "Tým nenalezen" }, 404);
  return c.json(profile);
});
