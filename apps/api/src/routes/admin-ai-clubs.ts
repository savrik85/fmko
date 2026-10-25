/**
 * Admin: AI kluby jako normální kluby (spec docs/superpowers/specs/2026-10-25-ai-clubs-design.md).
 *
 * POST /api/admin/ai-clubs/level?leagueId=&mode=&seed=&dryRun=1
 *   Narovnání klubů ligy, které vede AI (3.8). `dryRun=1` vrátí jen plán (tabulka před a po
 *   pro každý klub), bez něj se plán rovnou provede. Stejné `seed` dá stejný plán, takže se
 *   nanečisto zkontrolovaný plán provede beze změny. Bez `seed` se vylosuje a vrátí v plánu.
 *   Volitelně `teamIds=a,b` jen pro vybrané kluby. U21 liga se narovná stejným voláním.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireAdmin, requireAuth } from "../auth/middleware";
import { applyLeveling, LEVELING_MODES, planLeveling, type LevelingMode } from "../ai-clubs/leveling";
import { cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";

const M = "admin-ai-clubs";

export const adminAiClubsRouter = new Hono<{ Bindings: Bindings }>();

adminAiClubsRouter.use("*", requireAuth, requireAdmin);

function parseSeed(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n : null;
}

function isDryRun(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

adminAiClubsRouter.post("/level", async (c) => {
  const leagueId = c.req.query("leagueId");
  const mode = c.req.query("mode") as LevelingMode | undefined;
  if (!leagueId) return c.json({ error: "Chybí leagueId" }, 400);
  if (!mode || !LEVELING_MODES.includes(mode)) {
    return c.json({ error: `Neznámý režim, povolené jsou ${LEVELING_MODES.join(", ")}` }, 400);
  }
  const rawSeed = c.req.query("seed");
  const parsedSeed = parseSeed(rawSeed);
  if (rawSeed !== undefined && rawSeed !== "" && parsedSeed === null) return c.json({ error: "seed musí být celé číslo 0 až 4294967295" }, 400);
  const seed = parsedSeed ?? cryptoSeed();
  const teamIds = c.req.query("teamIds")?.split(",").map((s) => s.trim()).filter(Boolean);

  const league = await c.env.DB.prepare("SELECT id FROM leagues WHERE id = ?").bind(leagueId).first<{ id: string }>();
  if (!league) return c.json({ error: "Liga neexistuje" }, 404);

  try {
    const plan = await planLeveling(c.env.DB, { leagueId, mode, seed, teamIds });
    if (isDryRun(c.req.query("dryRun"))) return c.json({ dryRun: true, plan });
    const result = await applyLeveling(c.env.DB, plan);
    return c.json({ dryRun: false, plan, result });
  } catch (e) {
    logger.error({ module: M }, `narovnání ligy ${leagueId} (${mode})`, e);
    return c.json({ error: "Narovnání selhalo, podrobnosti jsou v logu" }, 500);
  }
});
