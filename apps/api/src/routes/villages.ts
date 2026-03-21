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

// GET /api/villages/:id — detail
villagesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("SELECT * FROM villages WHERE id = ?").bind(id).first();
  if (!result) return c.json({ error: "Village not found" }, 404);
  return c.json(result);
});

export { villagesRouter };
