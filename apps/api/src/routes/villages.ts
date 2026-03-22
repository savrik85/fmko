/**
 * Sprint 1: Villages API — raw SQL on D1.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";

const villagesRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/villages — list with optional filters
villagesRouter.get("/", async (c) => {
  const region = c.req.query("region");
  const district = c.req.query("district");
  const search = c.req.query("search");

  let sql = "SELECT * FROM villages";
  const params: string[] = [];
  const conditions: string[] = [];

  if (region) {
    conditions.push("region = ?");
    params.push(region);
  }
  if (district) {
    conditions.push("district = ?");
    params.push(district);
  }
  if (search) {
    conditions.push("name LIKE ?");
    params.push(`%${search}%`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY name";

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(result.results);
});

// GET /api/villages/stats — player counts per village/district/region
villagesRouter.get("/stats", async (c) => {
  // Count human teams (non-AI) per village
  const perVillage = await c.env.DB.prepare(
    "SELECT village_id, COUNT(*) as cnt FROM teams WHERE user_id != 'ai' GROUP BY village_id"
  ).all();
  const villageCounts: Record<string, number> = {};
  for (const r of perVillage.results) {
    villageCounts[r.village_id as string] = r.cnt as number;
  }

  // Count per district and region
  const perDistrict = await c.env.DB.prepare(
    "SELECT v.district, COUNT(*) as cnt FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.user_id != 'ai' GROUP BY v.district"
  ).all();
  const districtCounts: Record<string, number> = {};
  for (const r of perDistrict.results) {
    districtCounts[r.district as string] = r.cnt as number;
  }

  const perRegion = await c.env.DB.prepare(
    "SELECT v.region, COUNT(*) as cnt FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.user_id != 'ai' GROUP BY v.region"
  ).all();
  const regionCounts: Record<string, number> = {};
  for (const r of perRegion.results) {
    regionCounts[r.region as string] = r.cnt as number;
  }

  return c.json({ villageCounts, districtCounts, regionCounts });
});

// GET /api/villages/:id — detail
villagesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("SELECT * FROM villages WHERE id = ?").bind(id).first();
  if (!result) return c.json({ error: "Village not found" }, 404);
  return c.json(result);
});

export { villagesRouter };
