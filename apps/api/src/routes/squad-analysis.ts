/**
 * Rozbor kádru od asistenta trenéra (Kádr → Rozbor). Jen pro majitele týmu: rozbor
 * prozrazuje slabiny kádru, soupeř ho vidět nesmí.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireOwnedTeamRead } from "../auth/middleware";

export const squadAnalysisRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/teams/:teamId/squad-analysis
squadAnalysisRouter.get("/teams/:teamId/squad-analysis", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const { loadSquadAnalysis } = await import("../analysis/squad-analysis-data");
  const result = await loadSquadAnalysis(c.env.DB, teamId);
  if (!result) return c.json({ error: "Tým nenalezen" }, 404);
  return c.json(result);
});
