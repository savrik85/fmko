/**
 * Admin: AI kluby jako normální kluby (spec docs/superpowers/specs/2026-10-25-ai-clubs-design.md).
 *
 * POST /api/admin/ai-clubs/level?leagueId=&mode=&seed=&dryRun=1
 *   Narovnání klubů ligy, které vede AI (3.8). `dryRun=1` vrátí jen plán (tabulka před a po
 *   pro každý klub), bez něj se plán rovnou provede. Stejné `seed` dá stejný plán, takže se
 *   nanečisto zkontrolovaný plán provede beze změny. Bez `seed` se vylosuje a vrátí v plánu.
 *   Volitelně `teamIds=a,b` jen pro vybrané kluby. U21 liga se narovná stejným voláním.
 *   Volitelně `refLeagueId`: vzorem jsou lidé z jiné ligy (league-humans: ČB podle Prahy,
 *   below-league: IV. třída pod III. třídu místo pod přebor).
 *
 * POST /api/admin/ai-clubs/lower-league?district=Prachatice&seed=&dryRun=1
 *   III. třída okresu uprostřed sezóny (část 2): 14 AI klubů z největších obcí bez klubu,
 *   U21, rozpis středa a neděle do posledního kola přeboru, bez postupu a sestupu,
 *   narovnání. `dryRun=1` vrátí obce, jména klubů a rozpis. Opakované volání dokončí
 *   rozdělanou ligu (např. po překročení limitu dotazů).
 *   `level=iv_trida` založí pod III. třídou IV. třídu: úterý a sobota, doplňkové čtvrtky,
 *   když je potřeba, dohrávková neděle (čtyři kola týdně), síla klubů pod III. třídou.
 *   `villages=id1,id2` vynutí obce, které by se podle velikosti do výběru nedostaly.
 *
 * POST /api/admin/ai-clubs/open-district?district=České Budějovice&dryRun=1
 *   Spuštění ligy okresu: otevře okres registracím (část 1).
 *
 * POST /api/admin/ai-clubs/extend-schedule?leagueId=&dryRun=1
 *   Liga s jednokolovým rozpisem (založená registrací uprostřed sezóny do 2026-11-16) dostane
 *   plné dvoukolo: zbylá kola se posunou na dřívější termíny, přibudou odvety, U21 den po áčku.
 *   `dryRun=1` vrátí jen přehled posunů a nových kol. Opakované volání dokončí rozdělanou U21.
 *
 * POST /api/admin/ai-clubs/delete-league?leagueId=&dryRun=1&humanTeams=&closeDistrict=1
 *   Smaže seniorskou ligu i s U21: kluby, hráče, zápasy a všechno, co na ně odkazuje. Účty lidí
 *   zůstávají. `dryRun=1` vrátí, kolik řádků ve kterých tabulkách zmizí, a vazby na kluby mimo
 *   ligu, které smazání nedovolí. Naostro je potřeba `humanTeams` = počet klubů vedených
 *   člověkem z běhu nanečisto. `closeDistrict=1` zavře okres novým registracím.
 *
 * POST /api/admin/ai-clubs/align-schedule?leagueId=&refLeagueId=&dryRun=1
 *   Kola ligy (a její U21, o den později) dostanou termíny stejných kol vzorové ligy. Kola,
 *   jejichž termín už minul, pak dopočítá `POST /api/game/run-matches?leagueId=`, jedno na volání.
 *
 * POST /api/admin/ai-clubs/clear-schedule?leagueId=&dryRun=1
 *   Zruší rozpis ligy, která ještě nehrála (i U21). Kluby zůstanou, liga čeká v přípravném období.
 *
 * POST /api/admin/ai-clubs/start-league?leagueId=&dryRun=1
 *   Ruční spuštění ligy, která čeká bez rozpisu (jinak ji spustí první registrace): rozpis podle
 *   nejbližší vyšší soutěže okresu, U21 o den později, zameškaná kola dopočítá fronta zápasů.
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
import { alignLeagueSchedule } from "../league/align-schedule";
import { settleCaughtUpLeague } from "../league/catch-up-round";
import { enqueueLeagueCatchUp, startWaitingLeague } from "../league/start-league";
import { clearLeagueSchedule, deleteLeague } from "../league/delete-league";
import { extendLeagueToDouble } from "../league/extend-schedule";
import { backfillClubFacilities } from "../ai-clubs/facilities-backfill";
import { cleanupU21AiManagers } from "../ai-clubs/u21-manager-cleanup";
import { createLowerLeague, isLowerLeagueLevel, LowerLeagueError } from "../league/lower-league-setup";
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
  const referenceLeagueId = c.req.query("refLeagueId") || undefined;
  if (referenceLeagueId && mode === "newcomer") return c.json({ error: "refLeagueId jde jen s režimy league-humans a below-league" }, 400);

  const league = await c.env.DB.prepare("SELECT id FROM leagues WHERE id = ?").bind(leagueId).first<{ id: string }>();
  if (!league) return c.json({ error: "Liga neexistuje" }, 404);
  if (referenceLeagueId) {
    const ref = await c.env.DB.prepare("SELECT id FROM leagues WHERE id = ?").bind(referenceLeagueId).first<{ id: string }>();
    if (!ref) return c.json({ error: "Vzorová liga neexistuje" }, 404);
  }

  try {
    const plan = await planLeveling(c.env.DB, { leagueId, mode, seed, teamIds, referenceLeagueId });
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
  const level = c.req.query("level") || "okresni_soutez";
  if (!isLowerLeagueLevel(level)) return c.json({ error: "level musí být okresni_soutez nebo iv_trida" }, 400);

  try {
    const includeVillageIds = (c.req.query("villages") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const result = await createLowerLeague(c.env.DB, { district, seed, dryRun, level, includeVillageIds });
    return c.json({ seed, ...result });
  } catch (e) {
    if (e instanceof LowerLeagueError) return c.json({ error: e.message }, 400);
    logger.error({ module: M }, `založení nižší soutěže (${level}) v okrese ${district}`, e);
    return c.json({ error: "Založení soutěže selhalo, podrobnosti jsou v logu. Opakované volání rozdělanou ligu dokončí." }, 500);
  }
});

adminAiClubsRouter.post("/delete-league", async (c) => {
  const leagueId = c.req.query("leagueId")?.trim();
  if (!leagueId) return c.json({ error: "Chybí leagueId" }, 400);
  const dryRun = isDryRun(c.req.query("dryRun"));
  const rawHumans = c.req.query("humanTeams");
  const expectedHumanTeams = rawHumans !== undefined && /^\d+$/.test(rawHumans) ? Number(rawHumans) : undefined;
  try {
    const result = await deleteLeague(c.env.DB, leagueId, {
      dryRun, expectedHumanTeams, closeDistrict: c.req.query("closeDistrict") === "1",
    });
    return c.json(result, result.ok ? 200 : 400);
  } catch (e) {
    logger.error({ module: M }, `smazání ligy ${leagueId}`, e);
    return c.json({ error: "Smazání ligy selhalo, podrobnosti jsou v logu. Opakované volání domaže zbytek." }, 500);
  }
});

adminAiClubsRouter.post("/align-schedule", async (c) => {
  const leagueId = c.req.query("leagueId")?.trim();
  const referenceLeagueId = c.req.query("refLeagueId")?.trim();
  if (!leagueId || !referenceLeagueId) return c.json({ error: "Chybí leagueId nebo refLeagueId" }, 400);
  try {
    const result = await alignLeagueSchedule(c.env.DB, leagueId, referenceLeagueId, { dryRun: isDryRun(c.req.query("dryRun")) });
    return c.json(result, result.ok ? 200 : 400);
  } catch (e) {
    logger.error({ module: M }, `srovnání rozpisu ligy ${leagueId}`, e);
    return c.json({ error: "Srovnání rozpisu selhalo, podrobnosti jsou v logu" }, 500);
  }
});

// Zpětné vyrovnání kol, která liga dohnala po termínu dřív, než to runner uměl sám
// (Strakonice 2026-11-16): zkrácení zranění a vrácení kondice. S dryRun=1 jen náhled.
adminAiClubsRouter.post("/settle-catch-up", async (c) => {
  const leagueId = c.req.query("leagueId")?.trim();
  if (!leagueId) return c.json({ error: "Chybí leagueId" }, 400);
  try {
    const result = await settleCaughtUpLeague(c.env.DB, c.env.CACHE_KV, leagueId, { dryRun: isDryRun(c.req.query("dryRun")) });
    return c.json(result, result.ok ? 200 : 400);
  } catch (e) {
    logger.error({ module: M }, `vyrovnání dohnaných kol ligy ${leagueId}`, e);
    return c.json({ error: "Vyrovnání dohnaných kol selhalo, podrobnosti jsou v logu" }, 500);
  }
});

adminAiClubsRouter.post("/start-league", async (c) => {
  const leagueId = c.req.query("leagueId")?.trim();
  if (!leagueId) return c.json({ error: "Chybí leagueId" }, 400);
  try {
    const result = await startWaitingLeague(c.env.DB, leagueId, { dryRun: isDryRun(c.req.query("dryRun")) });
    const enqueued = result.ok && !result.dryRun ? await enqueueLeagueCatchUp(c.env, result, leagueId) : 0;
    return c.json({ ...result, enqueued }, result.ok ? 200 : 400);
  } catch (e) {
    logger.error({ module: M }, `spuštění ligy ${leagueId}`, e);
    return c.json({ error: "Spuštění ligy selhalo, podrobnosti jsou v logu" }, 500);
  }
});

adminAiClubsRouter.post("/clear-schedule", async (c) => {
  const leagueId = c.req.query("leagueId")?.trim();
  if (!leagueId) return c.json({ error: "Chybí leagueId" }, 400);
  try {
    const result = await clearLeagueSchedule(c.env.DB, leagueId, { dryRun: isDryRun(c.req.query("dryRun")) });
    return c.json(result, result.ok ? 200 : 400);
  } catch (e) {
    logger.error({ module: M }, `zrušení rozpisu ligy ${leagueId}`, e);
    return c.json({ error: "Zrušení rozpisu selhalo, podrobnosti jsou v logu" }, 500);
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

adminAiClubsRouter.post("/extend-schedule", async (c) => {
  const leagueId = c.req.query("leagueId")?.trim();
  if (!leagueId) return c.json({ error: "Chybí leagueId" }, 400);
  try {
    const result = await extendLeagueToDouble(c.env.DB, leagueId, { dryRun: isDryRun(c.req.query("dryRun")) });
    return c.json(result, result.ok ? 200 : 400);
  } catch (e) {
    logger.error({ module: M }, `rozšíření rozpisu ligy ${leagueId}`, e);
    return c.json({ error: "Rozšíření rozpisu selhalo, podrobnosti jsou v logu. Opakované volání dokončí rozdělanou U21." }, 500);
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
