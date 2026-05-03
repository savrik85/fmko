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

  // Find districts where the active league has 0 AI slots left (= full)
  const fullLeagueRows = await c.env.DB.prepare(
    `SELECT l.district FROM leagues l
     WHERE l.status = 'active'
     AND (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id AND t.user_id = 'ai') = 0`
  ).all().catch((e) => { logger.warn({ module: "villages" }, "fetch full leagues", e); return { results: [] }; });
  const fullDistricts: string[] = (fullLeagueRows.results as Array<{ district: string }>).map((r) => r.district);

  return c.json({ villageCounts, districtCounts, regionCounts, fullDistricts });
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

// ── Feature "Obec" — officials, favor, history ─────────────────────────────

import { ensureVillageOfficials, ensureGlobalFavor } from "../villages/officials-store";

// GET /api/villages/:id/officials — 4 představitelé (lazy seed)
villagesRouter.get("/:id/officials", async (c) => {
  const villageId = c.req.param("id");
  const village = await c.env.DB.prepare("SELECT id FROM villages WHERE id = ?")
    .bind(villageId).first();
  if (!village) return c.json({ error: "Village not found" }, 404);

  const officials = await ensureVillageOfficials(c.env.DB, villageId);
  return c.json(officials.map((o) => ({
    id: o.id,
    villageId: o.village_id,
    role: o.role,
    firstName: o.first_name,
    lastName: o.last_name,
    age: o.age,
    occupation: o.occupation,
    faceConfig: JSON.parse(o.face_config),
    personality: o.personality,
    portfolio: JSON.parse(o.portfolio),
    preferences: JSON.parse(o.preferences),
    termStartAt: o.term_start_at,
    termEndAt: o.term_end_at,
  })));
});

// GET /api/villages/:id/favor?teamId=... — favor tohoto týmu (global + per-official)
villagesRouter.get("/:id/favor", async (c) => {
  const villageId = c.req.param("id");
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId required" }, 400);

  const global = await ensureGlobalFavor(c.env.DB, villageId, teamId);
  const perOfficial = await c.env.DB.prepare(
    `SELECT vtf.official_id, vtf.favor, vtf.trust, vtf.last_interaction_at
     FROM village_team_favor vtf
     JOIN village_officials vo ON vo.id = vtf.official_id
     WHERE vtf.team_id = ? AND vo.village_id = ?`
  ).bind(teamId, villageId).all<{
    official_id: string; favor: number; trust: number; last_interaction_at: string | null;
  }>();

  return c.json({
    global,
    perOfficial: (perOfficial.results ?? []).map((r) => ({
      officialId: r.official_id,
      favor: r.favor,
      trust: r.trust,
      lastInteractionAt: r.last_interaction_at,
    })),
  });
});

// GET /api/villages/:id/teams — týmy v obci (multi-team transparency)
villagesRouter.get("/:id/teams", async (c) => {
  const villageId = c.req.param("id");
  const teams = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.user_id, t.primary_color, t.secondary_color, t.reputation,
            COALESCE(vtf.favor, 50) as global_favor
     FROM teams t
     LEFT JOIN village_team_favor vtf ON vtf.team_id = t.id AND vtf.official_id IS NULL
     WHERE t.village_id = ?
     ORDER BY t.name`
  ).bind(villageId).all();
  return c.json(teams.results ?? []);
});

// GET /api/villages/:id/brigades — všechny otevřené i obsazené brigády obce
villagesRouter.get("/:id/brigades", async (c) => {
  const villageId = c.req.param("id");
  const rows = await c.env.DB.prepare(
    `SELECT vb.*, t.name as taken_team_name,
            (vo.first_name || ' ' || vo.last_name) as offering_official_name,
            vo.role as offering_official_role,
            vo.personality as offering_official_personality
     FROM village_brigades vb
     LEFT JOIN teams t ON t.id = vb.taken_by_team_id
     LEFT JOIN village_officials vo ON vo.id = vb.offered_by_official_id
     WHERE vb.village_id = ? AND vb.status IN ('open','taken','completed')
     ORDER BY vb.status ASC, vb.expires_at ASC`
  ).bind(villageId).all();
  return c.json(rows.results ?? []);
});

// POST /api/villages/brigades/:brigadeId/take — vzít brigádu (Sprint B)
import { requireAuth } from "../auth/middleware";
import { recordTransaction } from "../season/finance-processor";

villagesRouter.post("/brigades/:brigadeId/take", requireAuth, async (c) => {
  const brigadeId = c.req.param("brigadeId");
  const session = c.get("session" as never) as { userId: string; teamId: string | null };
  if (!session.teamId) return c.json({ error: "Nemáš tým" }, 400);

  const body = await c.req.json<{ playerIds: string[] }>().catch(() => ({ playerIds: [] }));
  const playerIds = Array.isArray(body.playerIds) ? body.playerIds : [];

  // Načíst brigádu + zámek na status='open'
  const brigade = await c.env.DB.prepare(
    "SELECT * FROM village_brigades WHERE id = ? AND status = 'open'"
  ).bind(brigadeId).first<{
    id: string; village_id: string; type: string; title: string;
    required_player_count: number; reward_money: number; reward_favor: number;
    condition_drain: number; morale_change: number; offered_by_official_id: string | null;
    expires_at: string;
  }>();
  if (!brigade) return c.json({ error: "Brigáda už není dostupná" }, 409);

  if (new Date(brigade.expires_at) < new Date()) {
    return c.json({ error: "Brigáda již vypršela" }, 410);
  }

  if (playerIds.length !== brigade.required_player_count) {
    return c.json({ error: `Vyber přesně ${brigade.required_player_count} hráčů` }, 400);
  }

  // Ověřit že všichni hráči patří týmu, nejsou zranění a mají condition >= 60
  const placeholders = playerIds.map(() => "?").join(",");
  const playerCheck = await c.env.DB.prepare(
    `SELECT id, first_name, last_name, life_context, status, team_id
     FROM players WHERE id IN (${placeholders}) AND team_id = ?`
  ).bind(...playerIds, session.teamId).all<{
    id: string; first_name: string; last_name: string; life_context: string; status: string | null; team_id: string;
  }>();
  const players = playerCheck.results ?? [];
  if (players.length !== playerIds.length) {
    const foundIds = new Set(players.map((p) => p.id));
    const missing = playerIds.filter((id) => !foundIds.has(id));
    logger.warn(
      { module: "villages", endpoint: "take" },
      `take brigade ${brigadeId}: session.teamId=${session.teamId}, playerIds=${JSON.stringify(playerIds)}, missing=${JSON.stringify(missing)}, found=${players.length}`
    );
    return c.json({
      error: "Některý hráč nepatří tvému týmu nebo neexistuje",
      missing,
      sessionTeamId: session.teamId,
    }, 400);
  }
  for (const p of players) {
    if (p.status === "released") {
      return c.json({ error: `${p.first_name} ${p.last_name} byl uvolněn` }, 400);
    }
    let lc: { condition?: number; injury?: unknown } = {};
    try { lc = JSON.parse(p.life_context); } catch { lc = {}; }
    if (lc.injury) {
      return c.json({ error: `${p.first_name} ${p.last_name} je zraněný` }, 400);
    }
    const cond = typeof lc.condition === "number" ? lc.condition : 100;
    if (cond < 60) {
      return c.json({ error: `${p.first_name} ${p.last_name} má kondici jen ${cond}/100 (potřeba ≥ 60)` }, 400);
    }
  }

  // Cooldown: jeden tým max 1 brigáda za posledních 7 dní
  const recent = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM village_brigades
     WHERE taken_by_team_id = ? AND taken_at > datetime('now', '-7 days')`
  ).bind(session.teamId).first<{ cnt: number }>();
  if ((recent?.cnt ?? 0) >= 1) {
    return c.json({ error: "Tvůj tým už tento týden brigádu vzal — musíš počkat." }, 429);
  }

  // Atomicky: označit brigádu jako taken+completed, pak side-effecty
  const now = new Date().toISOString();
  const updateRes = await c.env.DB.prepare(
    `UPDATE village_brigades
     SET status = 'completed',
         taken_by_team_id = ?,
         taken_player_ids = ?,
         taken_at = ?,
         completed_at = ?
     WHERE id = ? AND status = 'open'`
  ).bind(session.teamId, JSON.stringify(playerIds), now, now, brigadeId).run();

  if ((updateRes.meta?.changes ?? 0) === 0) {
    return c.json({ error: "Brigáda už byla mezitím obsazena" }, 409);
  }

  // Get team game_date pro recordTransaction
  const teamRow = await c.env.DB.prepare(
    "SELECT game_date FROM teams WHERE id = ?"
  ).bind(session.teamId).first<{ game_date: string }>();
  const gameDate = teamRow?.game_date ?? now;

  // Per-hráč condition drain a morale change
  for (const p of players) {
    let lc: { condition?: number; morale?: number } = {};
    try { lc = JSON.parse(p.life_context); } catch { lc = {}; }
    const newCondition = Math.max(0, (lc.condition ?? 100) - brigade.condition_drain);
    const newMorale = Math.max(0, Math.min(100, (lc.morale ?? 50) + brigade.morale_change));
    await c.env.DB.prepare(
      `UPDATE players
       SET life_context = json_set(json_set(life_context, '$.condition', ?), '$.morale', ?)
       WHERE id = ?`
    ).bind(newCondition, newMorale, p.id).run().catch((e) => {
      logger.warn({ module: "villages" }, `update life_context for ${p.id}`, e);
    });
  }

  // Peníze
  await recordTransaction(
    c.env.DB, session.teamId, "village_brigade", brigade.reward_money,
    `Brigáda: ${brigade.title}`, gameDate,
  );

  // Favor: globální + individuální (offering official, pokud existuje)
  const { ensureGlobalFavor: ensureFavor } = await import("../villages/officials-store");
  await ensureFavor(c.env.DB, brigade.village_id, session.teamId);
  await c.env.DB.prepare(
    `UPDATE village_team_favor
     SET favor = MIN(100, favor + ?), last_interaction_at = ?, updated_at = ?
     WHERE team_id = ? AND official_id IS NULL`
  ).bind(brigade.reward_favor, now, now, session.teamId).run();

  if (brigade.offered_by_official_id) {
    // Lazy seed per-official favor row pokud chybí
    const exists = await c.env.DB.prepare(
      "SELECT id FROM village_team_favor WHERE team_id = ? AND official_id = ?"
    ).bind(session.teamId, brigade.offered_by_official_id).first<{ id: string }>();
    if (!exists) {
      await c.env.DB.prepare(
        `INSERT INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, last_interaction_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 50, ?, ?)`
      ).bind(crypto.randomUUID(), brigade.village_id, session.teamId, brigade.offered_by_official_id,
             50 + Math.round(brigade.reward_favor * 1.5), now, now).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE village_team_favor
         SET favor = MIN(100, favor + ?), last_interaction_at = ?, updated_at = ?
         WHERE id = ?`
      ).bind(Math.round(brigade.reward_favor * 1.5), now, now, exists.id).run();
    }
  }

  // History audit
  const teamName = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(session.teamId).first<{ name: string }>();
  const desc = `${teamName?.name ?? "Tým"} odpracoval brigádu „${brigade.title}" (+${brigade.reward_money} Kč, +${brigade.reward_favor} přízeň).`;
  await c.env.DB.prepare(
    `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
     VALUES (?, ?, ?, ?, 'brigade_completed', ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), brigade.village_id, session.teamId, brigade.offered_by_official_id,
    desc, JSON.stringify({ rewardMoney: brigade.reward_money, rewardFavor: brigade.reward_favor }),
    gameDate, now,
  ).run().catch((e) => logger.warn({ module: "villages" }, "insert history", e));

  return c.json({
    ok: true,
    rewardMoney: brigade.reward_money,
    rewardFavor: brigade.reward_favor,
    conditionDrain: brigade.condition_drain,
    moraleChange: brigade.morale_change,
  });
});

// GET /api/villages/:id/feed?limit=20 — historie napříč všemi týmy (transparency)
villagesRouter.get("/:id/feed", async (c) => {
  const villageId = c.req.param("id");
  const limit = Math.min(50, parseInt(c.req.query("limit") ?? "20", 10) || 20);

  const rows = await c.env.DB.prepare(
    `SELECT vh.id, vh.team_id, vh.official_id, vh.event_type, vh.description,
            vh.impact, vh.game_date, vh.created_at,
            t.name as team_name,
            (vo.first_name || ' ' || vo.last_name) as official_name,
            vo.role as official_role
     FROM village_history vh
     LEFT JOIN teams t ON t.id = vh.team_id
     LEFT JOIN village_officials vo ON vo.id = vh.official_id
     WHERE vh.village_id = ?
     ORDER BY vh.created_at DESC
     LIMIT ?`
  ).bind(villageId, limit).all();

  return c.json(rows.results ?? []);
});

export { villagesRouter };
