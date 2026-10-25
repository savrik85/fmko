/**
 * Admin: AI kluby jako normální kluby (spec docs/superpowers/specs/2026-10-25-ai-clubs-design.md).
 *
 * POST /api/admin/ai-clubs/level?leagueId=&mode=&seed=&dryRun=1
 *   Narovnání klubů ligy, které vede AI (3.8). `dryRun=1` vrátí jen plán (tabulka před a po
 *   pro každý klub), bez něj se plán rovnou provede. Stejné `seed` dá stejný plán, takže se
 *   nanečisto zkontrolovaný plán provede beze změny. Bez `seed` se vylosuje a vrátí v plánu.
 *   Volitelně `teamIds=a,b` jen pro vybrané kluby. U21 liga se narovná stejným voláním.
 *
 * POST /api/admin/ai-clubs/lower-league?district=Prachatice&seed=&dryRun=1
 *   III. třída okresu uprostřed sezóny (část 2): 14 AI klubů z největších obcí bez klubu,
 *   U21, rozpis středa a neděle do posledního kola přeboru, bez postupu a sestupu,
 *   narovnání. `dryRun=1` vrátí obce, jména klubů a rozpis. Opakované volání dokončí
 *   rozdělanou ligu (např. po překročení limitu dotazů).
 *
 * POST /api/admin/ai-clubs/open-district?district=České Budějovice&dryRun=1
 *   Spuštění ligy okresu: otevře okres registracím (část 1).
 *
 * POST /api/admin/ai-clubs/facilities?dryRun=1
 *   Řádek stadionu a vybavení všem klubům v ligách, které ho ještě nemají.
 *
 * POST /api/admin/ai-clubs/u21-ai-managers?dryRun=1
 *   Smaže AI trenéry, kteří omylem vznikli u U21 týmů (trenér patří áčku).
 *
 * POST /api/admin/ai-clubs/takeover?dryRun=1
 *   Převzetí opuštěných klubů hned, bez čekání na noční tick (3.1). `dryRun=1` jen vypíše,
 *   koho by AI převzala. Přepínač `ai_club_takeover` hlídá jen noční tick, tohle je ruční akce.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireAdmin, requireAuth } from "../auth/middleware";
import { applyLeveling, LEVELING_MODES, planLeveling, type LevelingMode } from "../ai-clubs/leveling";
import { cryptoSeed } from "../generators/rng";
import { findAbandonedClubs, MAX_TAKEOVERS_PER_RUN, runAbandonedClubTakeover } from "../ai-clubs/abandoned";
import { openDistrictRegistration } from "../ai-clubs/district-opening";
import { backfillClubFacilities } from "../ai-clubs/facilities-backfill";
import { cleanupU21AiManagers } from "../ai-clubs/u21-manager-cleanup";
import { createLowerLeague, LowerLeagueError } from "../league/lower-league-setup";
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

adminAiClubsRouter.post("/lower-league", async (c) => {
  const district = c.req.query("district")?.trim();
  if (!district) return c.json({ error: "Chybí district" }, 400);
  const rawSeed = c.req.query("seed");
  const parsedSeed = parseSeed(rawSeed);
  if (rawSeed !== undefined && rawSeed !== "" && parsedSeed === null) return c.json({ error: "seed musí být celé číslo 0 až 4294967295" }, 400);
  const seed = parsedSeed ?? cryptoSeed();
  const dryRun = isDryRun(c.req.query("dryRun"));

  try {
    const result = await createLowerLeague(c.env.DB, { district, seed, dryRun });
    return c.json({ seed, ...result });
  } catch (e) {
    if (e instanceof LowerLeagueError) return c.json({ error: e.message }, 400);
    logger.error({ module: M }, `založení III. třídy v okrese ${district}`, e);
    return c.json({ error: "Založení III. třídy selhalo, podrobnosti jsou v logu. Opakované volání rozdělanou ligu dokončí." }, 500);
  }
});

adminAiClubsRouter.post("/open-district", async (c) => {
  const district = c.req.query("district")?.trim();
  if (!district) return c.json({ error: "Chybí district" }, 400);
  try {
    const result = await openDistrictRegistration(c.env.DB, district, isDryRun(c.req.query("dryRun")));
    return c.json(result);
  } catch (e) {
    logger.error({ module: M }, `otevření okresu ${district}`, e);
    return c.json({ error: "Otevření okresu selhalo, podrobnosti jsou v logu" }, 500);
  }
});

adminAiClubsRouter.post("/facilities", async (c) => {
  try {
    const result = await backfillClubFacilities(c.env.DB, isDryRun(c.req.query("dryRun")));
    return c.json(result);
  } catch (e) {
    logger.error({ module: M }, "doplnění stadionů a vybavení", e);
    return c.json({ error: "Doplnění selhalo, podrobnosti jsou v logu" }, 500);
  }
});

adminAiClubsRouter.post("/u21-ai-managers", async (c) => {
  try {
    const result = await cleanupU21AiManagers(c.env.DB, isDryRun(c.req.query("dryRun")));
    return c.json(result);
  } catch (e) {
    logger.error({ module: M }, "úklid AI trenérů u U21", e);
    return c.json({ error: "Úklid selhal, podrobnosti jsou v logu" }, 500);
  }
});

adminAiClubsRouter.post("/takeover", async (c) => {
  const now = new Date();
  try {
    const candidates = await findAbandonedClubs(c.env.DB, now);
    const names = await Promise.all(candidates.map(async (club) => {
      const row = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(club.teamId).first<{ name: string }>()
        .catch((e) => { logger.warn({ module: M }, `jméno klubu ${club.teamId}`, e); return null; });
      return { teamId: club.teamId, name: row?.name ?? club.teamId };
    }));
    if (isDryRun(c.req.query("dryRun"))) return c.json({ dryRun: true, clubs: names, brake: MAX_TAKEOVERS_PER_RUN });
    // Nad brzdou jen s výslovným force=1: admin viděl seznam a převzetí potvrzuje.
    const force = c.req.query("force") === "1";
    if (candidates.length > MAX_TAKEOVERS_PER_RUN && !force) {
      return c.json({ error: `Opuštěných klubů je ${candidates.length}, víc než brzda ${MAX_TAKEOVERS_PER_RUN}. Zkontroluj seznam a potvrď force=1.`, clubs: names }, 409);
    }
    const taken = await runAbandonedClubTakeover(c.env.DB, now, { force });
    return c.json({ dryRun: false, clubs: names, taken });
  } catch (e) {
    logger.error({ module: M }, "ruční převzetí opuštěných klubů", e);
    return c.json({ error: "Převzetí selhalo, podrobnosti jsou v logu" }, 500);
  }
});
