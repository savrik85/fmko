/**
 * Villages API routes: list, filter by region/district.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";

const villagesRouter = new Hono<{ Bindings: Bindings }>();

villagesRouter.get("/", async (c) => {
  // Try cache first
  const cacheKey = "api:villages";
  const cached = await c.env.CACHE_KV.get(cacheKey);
  if (cached) return c.json(JSON.parse(cached));

  // Load from R2
  const obj = await c.env.SEED_DATA.get("villages.json");
  if (!obj) return c.json({ error: "Villages data not found" }, 404);

  const allVillages = JSON.parse(await obj.text()) as Array<Record<string, unknown>>;

  // Filter by query params
  const region = c.req.query("region");
  const district = c.req.query("district");
  const search = c.req.query("q")?.toLowerCase();

  let filtered = allVillages;
  if (region) {
    filtered = filtered.filter((v) => v.region_code === region || v.region === region);
  }
  if (district) {
    filtered = filtered.filter((v) => v.district_code === district || v.district === district);
  }
  if (search) {
    filtered = filtered.filter((v) => (v.name as string).toLowerCase().includes(search));
  }

  // Cache full list for 1 hour
  if (!region && !district && !search) {
    await c.env.CACHE_KV.put(cacheKey, JSON.stringify(filtered), { expirationTtl: 3600 });
  }

  return c.json(filtered);
});

// Get unique regions
villagesRouter.get("/regions", async (c) => {
  const obj = await c.env.SEED_DATA.get("villages.json");
  if (!obj) return c.json({ error: "Villages data not found" }, 404);

  const villages = JSON.parse(await obj.text()) as Array<{ region: string; region_code: string }>;
  const regions = [...new Map(villages.map((v) => [v.region_code, { code: v.region_code, name: v.region }])).values()];
  regions.sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return c.json(regions);
});

// Get districts for a region
villagesRouter.get("/districts", async (c) => {
  const region = c.req.query("region");
  if (!region) return c.json({ error: "Missing region parameter" }, 400);

  const obj = await c.env.SEED_DATA.get("villages.json");
  if (!obj) return c.json({ error: "Villages data not found" }, 404);

  const villages = JSON.parse(await obj.text()) as Array<{ region_code: string; district: string; district_code: string }>;
  const filtered = villages.filter((v) => v.region_code === region);
  const districts = [...new Map(filtered.map((v) => [v.district_code, { code: v.district_code, name: v.district }])).values()];
  districts.sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return c.json(districts);
});

export { villagesRouter };
