/**
 * Sprint 1: Villages API — raw SQL on D1.
 */

import { logger } from "../lib/logger";
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

// GET /api/villages/:id/sponsors — naming rights sponsors from district data
villagesRouter.get("/:id/sponsors", async (c) => {
  const village = await c.env.DB.prepare("SELECT district, name, size FROM villages WHERE id = ?")
    .bind(c.req.param("id")).first<{ district: string; name: string; size: string }>();
  if (!village) return c.json({ error: "Village not found" }, 404);

  const sponsorRows = await c.env.DB.prepare(
    "SELECT name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max FROM district_sponsors WHERE district = ? ORDER BY RANDOM() LIMIT 5"
  ).bind(village.district).all().catch((e) => { logger.warn({ module: "villages" }, "query", e); return { results: [] }; });

  const catMod = village.size === "mesto" ? 1.5 : village.size === "mestys" ? 1.2 : village.size === "obec" ? 1.0 : 0.7;

  const offers = sponsorRows.results.map((s) => {
    const seasonBonus = Math.round(((s.monthly_min as number) * 6 + Math.random() * ((s.monthly_max as number) * 8 - (s.monthly_min as number) * 6)) * catMod);
    const seasons = 1 + Math.floor(Math.random() * 3); // 1-3 sezóny
    const terminationFee = Math.round(seasonBonus * seasons * 0.5);
    // Remove s.r.o. and location names from sponsor name for cleaner team names
    const rawName = s.name as string;
    const locationWords = [village.name, village.district, "II", "III"].filter(Boolean);
    let cleanName = rawName.replace(/\s*s\.r\.o\.?\s*/gi, "");
    for (const loc of locationWords) {
      cleanName = cleanName.replace(new RegExp(`\\s*${loc}\\s*`, "gi"), " ");
    }
    cleanName = cleanName.trim();
    return {
      name: cleanName,
      type: s.type as string,
      teamName: `FK ${cleanName} ${village.name}`,
      seasonBonus,
      seasons,
      terminationFee,
      tradeoffs: {
        benefits: [`+${seasonBonus.toLocaleString("cs")} Kč/sezóna`, "Lepší výchozí vybavení (míče + dresy Lv.1)"],
        negatives: ["-5 morálka kádru", "-2 reputace (fanoušci nespokojení)", "Hráči s patriotismem 70+ mohou být zklamaní"],
      },
    };
  });

  // Fallback to generic if no district data
  if (offers.length === 0) {
    const surnameRows = await c.env.DB.prepare(
      "SELECT surname FROM district_surnames WHERE district = ? ORDER BY frequency DESC LIMIT 10"
    ).bind(village.district).all().catch((e) => { logger.warn({ module: "villages" }, "query", e); return { results: [] }; });
    const surnames = surnameRows.results.length > 0
      ? surnameRows.results.map((r) => r.surname as string)
      : ["Novák", "Dvořák", "Svoboda", "Černý", "Kovář"];

    const genericTypes = ["Autoservis", "Řeznictví", "Potraviny", "Stavby", "Pila"];
    for (let i = 0; i < 3; i++) {
      const surname = surnames[Math.floor(Math.random() * surnames.length)];
      const type = genericTypes[i % genericTypes.length];
      const bonus = Math.round((8000 + Math.random() * 20000) * catMod);
      const seasons = 1 + Math.floor(Math.random() * 3);
      const terminationFee = Math.round(bonus * seasons * 0.5);
      offers.push({
        name: `${type} ${surname}`,
        type: type.toLowerCase(),
        teamName: `FK ${type} ${surname} ${village.name}`,
        seasonBonus: bonus,
        seasons,
        terminationFee,
        tradeoffs: {
          benefits: [`+${bonus.toLocaleString("cs")} Kč/sezóna`, "Lepší výchozí vybavení"],
          negatives: ["-5 morálka kádru", "-2 reputace", "Patriotičtí hráči nespokojení"],
        },
      });
    }
  }

  return c.json({ offers });
});

export { villagesRouter };
