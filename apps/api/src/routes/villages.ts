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

// ── Routes co MUSÍ být PŘED /:id katchall (jinak je Hono matchne jako village id) ──

// GET /api/villages/upcoming-match?teamId=X — nejbližší domácí zápas + slot stav officials
villagesRouter.get("/upcoming-match", async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId required" }, 400);

  const team = await c.env.DB.prepare(
    "SELECT village_id FROM teams WHERE id = ?"
  ).bind(teamId).first<{ village_id: string }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const match = await c.env.DB.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.calendar_id, m.status,
            sc.scheduled_at, ah.name as home_name, aw.name as away_name
     FROM matches m
     LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
     LEFT JOIN teams ah ON ah.id = m.home_team_id
     LEFT JOIN teams aw ON aw.id = m.away_team_id
     WHERE m.home_team_id = ? AND m.status != 'simulated'
       AND sc.scheduled_at >= date('now', '-1 day')
     ORDER BY sc.scheduled_at ASC LIMIT 1`
  ).bind(teamId).first<{
    id: string; home_team_id: string; away_team_id: string;
    calendar_id: string | null; status: string; scheduled_at: string | null;
    home_name: string; away_name: string;
  }>();

  if (!match || !match.scheduled_at) {
    return c.json({ match: null, officials: [], myInvitations: [] });
  }
  const matchDay = match.scheduled_at.slice(0, 10);
  const officials = await c.env.DB.prepare(
    `SELECT vo.id, vo.first_name, vo.last_name, vo.role, vo.personality,
            COALESCE(vtf.favor, 50) as favor,
            (SELECT vi.team_id FROM village_invitations vi
             WHERE vi.official_id = vo.id AND vi.match_day = ?
               AND vi.status IN ('accepted','attended') LIMIT 1) as slot_taken_by,
            (SELECT t.name FROM village_invitations vi
             JOIN teams t ON t.id = vi.team_id
             WHERE vi.official_id = vo.id AND vi.match_day = ?
               AND vi.status IN ('accepted','attended') LIMIT 1) as slot_taken_by_name
     FROM village_officials vo
     LEFT JOIN village_team_favor vtf ON vtf.official_id = vo.id AND vtf.team_id = ?
     WHERE vo.village_id = ?
     ORDER BY vo.role`
  ).bind(matchDay, matchDay, teamId, team.village_id).all();
  const myInvitations = await c.env.DB.prepare(
    `SELECT id, official_id, status, gift_cost, attendance_effects, created_at
     FROM village_invitations WHERE match_id = ? AND team_id = ?
     ORDER BY created_at`
  ).bind(match.id, teamId).all();
  return c.json({
    match: { id: match.id, scheduled_at: match.scheduled_at, home_name: match.home_name, away_name: match.away_name },
    officials: officials.results ?? [],
    myInvitations: myInvitations.results ?? [],
  });
});

// GET /api/villages/petitions?teamId=X — aktivní petice pro tým
villagesRouter.get("/petitions", async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId required" }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM village_petitions WHERE team_id = ? AND status = 'active'
     ORDER BY expires_at ASC`
  ).bind(teamId).all();
  return c.json(rows.results ?? []);
});

// GET /api/villages/local-pride?teamId=X — místní hrdost: rodáci v kádru a jejich příspěvek
villagesRouter.get("/local-pride", async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId required" }, 400);

  const team = await c.env.DB.prepare(
    `SELECT t.village_id, v.name as village_name FROM teams t
     JOIN villages v ON v.id = t.village_id WHERE t.id = ?`
  ).bind(teamId).first<{ village_id: string; village_name: string }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  // Místní hráči v aktivním kádru
  const locals = await c.env.DB.prepare(
    `SELECT id, first_name, last_name, position, overall_rating, residence, status
     FROM players
     WHERE team_id = ? AND residence = ? AND (status IS NULL OR status != 'released')
     ORDER BY overall_rating DESC`
  ).bind(teamId, team.village_name).all<{
    id: string; first_name: string; last_name: string; position: string;
    overall_rating: number; residence: string; status: string | null;
  }>();

  const localList = locals.results ?? [];

  if (localList.length === 0) {
    return c.json({
      villageName: team.village_name,
      locals: [],
      totalLocalCount: 0,
      avgRating: null,
      recentStartersTotal: 0,
    });
  }

  // Zápasové statistiky posledních 5 zápasů
  const playerIds = localList.map((p) => p.id);
  const placeholders = playerIds.map(() => "?").join(",");
  const stats = await c.env.DB.prepare(
    `SELECT mps.player_id, COUNT(*) as starts, SUM(mps.goals) as goals,
            SUM(mps.assists) as assists, AVG(mps.rating) as avg_rating
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     WHERE mps.player_id IN (${placeholders}) AND mps.team_id = ?
       AND mps.started = 1 AND m.status = 'simulated'
       AND m.simulated_at > datetime('now', '-90 days')
     GROUP BY mps.player_id`
  ).bind(...playerIds, teamId).all<{
    player_id: string; starts: number; goals: number; assists: number; avg_rating: number;
  }>();

  const statsByPlayer = new Map(stats.results?.map((s) => [s.player_id, s]) ?? []);

  const enriched = localList.map((p) => {
    const s = statsByPlayer.get(p.id);
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position,
      overallRating: p.overall_rating,
      recentStarts: s?.starts ?? 0,
      recentGoals: s?.goals ?? 0,
      recentAssists: s?.assists ?? 0,
      recentAvgRating: s?.avg_rating ? Math.round(s.avg_rating * 10) / 10 : null,
    };
  });

  const avgRating = Math.round(
    (localList.reduce((sum, p) => sum + p.overall_rating, 0) / localList.length) * 10,
  ) / 10;
  const recentStartersTotal = enriched.reduce((sum, p) => sum + (p.recentStarts > 0 ? 1 : 0), 0);

  return c.json({
    villageName: team.village_name,
    locals: enriched,
    totalLocalCount: localList.length,
    avgRating,
    recentStartersTotal,
  });
});

// GET /api/villages/pub-encounters?teamId=X — aktivní hospodské střetnutí
villagesRouter.get("/pub-encounters", async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId required" }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT vpe.*, vo.first_name, vo.last_name, vo.role, vo.personality, vo.face_config
     FROM village_pub_encounters vpe
     JOIN village_officials vo ON vo.id = vpe.official_id
     WHERE vpe.team_id = ? AND vpe.status = 'active'
     ORDER BY vpe.expires_at ASC`
  ).bind(teamId).all();
  return c.json(rows.results ?? []);
});

// GET /api/villages/investments?teamId=X — pending investiční nabídky pro tým
villagesRouter.get("/investments", async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId required" }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM village_investments
     WHERE team_id = ? AND status = 'offered'
     ORDER BY expires_at ASC`
  ).bind(teamId).all();
  return c.json(rows.results ?? []);
});

// GET /api/villages/invitations?matchId=X — list pozvánek pro daný zápas
villagesRouter.get("/invitations", async (c) => {
  const matchId = c.req.query("matchId");
  if (!matchId) return c.json({ error: "matchId required" }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT vi.*, (vo.first_name || ' ' || vo.last_name) as official_name,
            vo.role as official_role, t.name as inviting_team_name
     FROM village_invitations vi
     JOIN village_officials vo ON vo.id = vi.official_id
     JOIN teams t ON t.id = vi.team_id
     WHERE vi.match_id = ? ORDER BY vi.created_at`
  ).bind(matchId).all();
  return c.json(rows.results ?? []);
});

// ── /:id (musí být po static GET routes výše) ─────────────────────────────

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

// GET /api/villages/:id/teams — týmy v obci včetně matice per-NPC favor
villagesRouter.get("/:id/teams", async (c) => {
  const villageId = c.req.param("id");
  const teams = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.user_id, t.primary_color, t.secondary_color, t.reputation,
            COALESCE(vtf.favor, 50) as global_favor
     FROM teams t
     LEFT JOIN village_team_favor vtf ON vtf.team_id = t.id AND vtf.official_id IS NULL
     WHERE t.village_id = ?
     ORDER BY t.name`
  ).bind(villageId).all<{
    id: string; name: string; user_id: string; primary_color: string;
    secondary_color: string; reputation: number; global_favor: number;
  }>();

  // Per-NPC favor pro všechny týmy v obci (matrix)
  const perOfficial = await c.env.DB.prepare(
    `SELECT vtf.team_id, vtf.official_id, vtf.favor
     FROM village_team_favor vtf
     JOIN village_officials vo ON vo.id = vtf.official_id
     WHERE vo.village_id = ?`
  ).bind(villageId).all<{ team_id: string; official_id: string; favor: number }>();

  const matrix: Record<string, Record<string, number>> = {};
  for (const r of perOfficial.results ?? []) {
    if (!matrix[r.team_id]) matrix[r.team_id] = {};
    matrix[r.team_id][r.official_id] = r.favor;
  }

  return c.json({
    teams: teams.results ?? [],
    favorMatrix: matrix,
  });
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
villagesRouter.post("/brigades/:brigadeId/take", requireAuth, async (c) => {
  const brigadeId = c.req.param("brigadeId");
  const session = c.get("session" as never) as { userId: string; teamId: string | null };
  // Session.teamId v KV může být zastaralé (po znovu-založení týmu).
  // Single source of truth = teams.user_id.
  const teamRowAuth = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id = ? AND name NOT LIKE 'DELETED%' LIMIT 1"
  ).bind(session.userId).first<{ id: string }>();
  if (!teamRowAuth) return c.json({ error: "Nemáš tým" }, 400);
  session.teamId = teamRowAuth.id;

  const body = await c.req.json<{ playerIds: string[] }>().catch((e) => {
    logger.warn({ module: "villages" }, "parse take body", e);
    return { playerIds: [] as string[] };
  });
  const playerIds = Array.isArray(body.playerIds) ? body.playerIds : [];

  // Načíst brigádu + zámek na status='open'
  const brigade = await c.env.DB.prepare(
    "SELECT * FROM village_brigades WHERE id = ? AND status = 'open'"
  ).bind(brigadeId).first<{
    id: string; village_id: string; type: string; title: string;
    required_player_count: number; reward_favor: number;
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

  // Get team game_date pro audit logy
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

  // Brigády NEDÁVAJÍ peníze — jen přízeň výměnou za kondici a morálku.

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
  const desc = `${teamName?.name ?? "Tým"} odpracoval brigádu „${brigade.title}" (+${brigade.reward_favor} přízeň, ${brigade.morale_change} morálka, -${brigade.condition_drain} kondice).`;
  await c.env.DB.prepare(
    `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
     VALUES (?, ?, ?, ?, 'brigade_completed', ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), brigade.village_id, session.teamId, brigade.offered_by_official_id,
    desc, JSON.stringify({ rewardFavor: brigade.reward_favor }),
    gameDate, now,
  ).run().catch((e) => logger.warn({ module: "villages" }, "insert history", e));

  return c.json({
    ok: true,
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

// ── Petice občanů (Sprint C+) — POST endpoint (GET je nahoře před /:id) ──

// POST /api/villages/petitions/:id/respond — accept | ignore
villagesRouter.post("/petitions/:petitionId/respond", requireAuth, async (c) => {
  const petitionId = c.req.param("petitionId");
  const session = c.get("session" as never) as { userId: string; teamId: string | null };
  // Session.teamId v KV může být zastaralé (po znovu-založení týmu).
  // Single source of truth = teams.user_id.
  const teamRowAuth = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id = ? AND name NOT LIKE 'DELETED%' LIMIT 1"
  ).bind(session.userId).first<{ id: string }>();
  if (!teamRowAuth) return c.json({ error: "Nemáš tým" }, 400);
  session.teamId = teamRowAuth.id;

  const body = await c.req.json<{ action: "accept" | "ignore" }>().catch((e) => {
    logger.warn({ module: "villages" }, "parse petition body", e);
    return null;
  });
  if (!body || (body.action !== "accept" && body.action !== "ignore")) {
    return c.json({ error: "action musí být accept|ignore" }, 400);
  }

  const petition = await c.env.DB.prepare(
    `SELECT * FROM village_petitions WHERE id = ? AND status = 'active'`
  ).bind(petitionId).first<{
    id: string; village_id: string; team_id: string; title: string;
    cost_money: number; reward_favor: number; ignore_penalty: number;
  }>();
  if (!petition) return c.json({ error: "Petice už není aktivní" }, 410);
  if (petition.team_id !== session.teamId) return c.json({ error: "Petice není pro tvůj tým" }, 403);

  const now = new Date().toISOString();
  const teamRow = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(session.teamId).first<{ game_date: string }>();
  const gameDate = teamRow?.game_date ?? now;

  if (body.action === "accept") {
    if (petition.cost_money > 0) {
      const { recordTransaction: rec } = await import("../season/finance-processor");
      await rec(
        c.env.DB, session.teamId, "event", -petition.cost_money,
        `Petice: ${petition.title}`, gameDate,
      );
    }
    // Bump favor
    const fav = await c.env.DB.prepare(
      `SELECT id FROM village_team_favor WHERE team_id = ? AND official_id IS NULL`
    ).bind(session.teamId).first<{ id: string }>();
    if (fav) {
      await c.env.DB.prepare(
        `UPDATE village_team_favor SET favor = MIN(100, favor + ?),
         last_interaction_at = ?, updated_at = ? WHERE id = ?`
      ).bind(petition.reward_favor, now, now, fav.id).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, last_interaction_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, 50, ?, ?)`
      ).bind(crypto.randomUUID(), petition.village_id, session.teamId,
             50 + petition.reward_favor, now, now).run();
    }
    await c.env.DB.prepare(
      `UPDATE village_petitions SET status = 'accepted', responded_at = ? WHERE id = ?`
    ).bind(now, petition.id).run();

    await c.env.DB.prepare(
      `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
       VALUES (?, ?, ?, NULL, 'petition_accepted', ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), petition.village_id, session.teamId,
      `Klub vyhověl petici „${petition.title}"`,
      JSON.stringify({ cost: petition.cost_money, favor: petition.reward_favor }),
      gameDate, now,
    ).run().catch((e) => logger.warn({ module: "villages" }, "petition accepted history", e));

    return c.json({ ok: true, action: "accept", costMoney: petition.cost_money, rewardFavor: petition.reward_favor });
  }

  // ignore
  await c.env.DB.prepare(
    `UPDATE village_petitions SET status = 'ignored', responded_at = ? WHERE id = ?`
  ).bind(now, petition.id).run();
  const fav = await c.env.DB.prepare(
    `SELECT id FROM village_team_favor WHERE team_id = ? AND official_id IS NULL`
  ).bind(session.teamId).first<{ id: string }>();
  if (fav) {
    await c.env.DB.prepare(
      `UPDATE village_team_favor SET favor = MAX(0, favor + ?),
       last_interaction_at = ?, updated_at = ? WHERE id = ?`
    ).bind(petition.ignore_penalty, now, now, fav.id).run();
  }
  await c.env.DB.prepare(
    `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
     VALUES (?, ?, ?, NULL, 'petition_ignored', ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), petition.village_id, session.teamId,
    `Klub odmítl petici „${petition.title}"`,
    JSON.stringify({ penalty: petition.ignore_penalty }),
    gameDate, now,
  ).run().catch((e) => logger.warn({ module: "villages" }, "petition ignored history", e));

  return c.json({ ok: true, action: "ignore", penaltyFavor: petition.ignore_penalty });
});


// POST /api/villages/invitations — pozvi NPC na zápas
villagesRouter.post("/invitations", requireAuth, async (c) => {
  const session = c.get("session" as never) as { userId: string; teamId: string | null };
  // Session.teamId v KV může být zastaralé (po znovu-založení týmu).
  // Single source of truth = teams.user_id.
  const teamRowAuth = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id = ? AND name NOT LIKE 'DELETED%' LIMIT 1"
  ).bind(session.userId).first<{ id: string }>();
  if (!teamRowAuth) return c.json({ error: "Nemáš tým" }, 400);
  session.teamId = teamRowAuth.id;

  const body = await c.req.json<{ matchId: string; officialId: string }>().catch((e) => {
    logger.warn({ module: "villages" }, "parse invitation body", e);
    return null;
  });
  if (!body?.matchId || !body?.officialId) return c.json({ error: "matchId a officialId povinné" }, 400);

  // Načíst zápas + ověřit že jsem v něm
  const match = await c.env.DB.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.calendar_id, m.status,
            sc.scheduled_at
     FROM matches m
     LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.id = ?`
  ).bind(body.matchId).first<{
    id: string; home_team_id: string; away_team_id: string;
    calendar_id: string | null; status: string; scheduled_at: string | null;
  }>();
  if (!match) return c.json({ error: "Zápas nenalezen" }, 404);
  if (match.status === "simulated") return c.json({ error: "Zápas už proběhl" }, 410);
  if (match.home_team_id !== session.teamId && match.away_team_id !== session.teamId) {
    return c.json({
      error: `Nehraješ v tom zápase (session=${session.teamId}, home=${match.home_team_id})`,
    }, 403);
  }
  if (!match.scheduled_at) return c.json({ error: "Zápas nemá termín" }, 400);

  const matchDay = match.scheduled_at.slice(0, 10);
  const isHome = match.home_team_id === session.teamId;

  // Načíst NPC + favor + trust
  const official = await c.env.DB.prepare(
    `SELECT vo.id, vo.village_id, vo.first_name, vo.last_name, vo.personality, vo.role,
            COALESCE(vtf.favor, 50) as favor, COALESCE(vtf.trust, 50) as trust
     FROM village_officials vo
     LEFT JOIN village_team_favor vtf
       ON vtf.official_id = vo.id AND vtf.team_id = ?
     WHERE vo.id = ?`
  ).bind(session.teamId, body.officialId).first<{
    id: string; village_id: string; first_name: string; last_name: string;
    personality: string; role: string; favor: number; trust: number;
  }>();
  if (!official) return c.json({ error: "Zastupitel neexistuje" }, 404);

  // Slot lock: pokud už NPC přijal pozvánku jiného týmu na tento matchday, blokuj
  const conflicting = await c.env.DB.prepare(
    `SELECT id, team_id FROM village_invitations
     WHERE official_id = ? AND match_day = ? AND status IN ('accepted','attended')`
  ).bind(body.officialId, matchDay).first<{ id: string; team_id: string }>();
  if (conflicting) {
    return c.json({ error: "Zastupitel už přijal pozvání jiného týmu na tento den" }, 409);
  }

  // Cena pozvání (občerstvení/dárek): škáluje s favor (lepší vztah = nižší)
  const giftCost = Math.max(300, 500 + (50 - official.favor) * 10);

  // Acceptance probability
  let p = 0.30;
  p += 0.005 * (official.favor - 50);
  p += 0.003 * (official.trust - 50);
  if (isHome) p += 0.10;

  // Persona modifiery (zjednodušené)
  if (official.personality === "sportovec") {
    // hodnotí výsledky — preview last 5 výsledků
    const recent = await c.env.DB.prepare(
      `SELECT home_team_id, away_team_id, home_score, away_score FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
       ORDER BY simulated_at DESC LIMIT 5`
    ).bind(session.teamId, session.teamId).all<{
      home_team_id: string; away_team_id: string; home_score: number; away_score: number;
    }>();
    let losses = 0;
    for (const m of recent.results ?? []) {
      const teamHome = m.home_team_id === session.teamId;
      const ourScore = teamHome ? m.home_score : m.away_score;
      const theirScore = teamHome ? m.away_score : m.home_score;
      if (ourScore < theirScore) losses++;
    }
    if (losses >= 3) p -= 0.15; // sportovec netoleruje série proher
  } else if (official.personality === "aktivista") {
    // chce dialog když je vztah špatný
    if (official.favor < 40) p += 0.20;
    else p -= 0.10;
  } else if (official.personality === "tradicionalista") {
    if (isHome) p += 0.10;
  } else if (official.personality === "populista") {
    p += 0.10;
  }

  // Dárek nad standardem
  if (giftCost > 1500) p += 0.05;

  // Šum
  p += (Math.random() - 0.5) * 0.20;

  // Clamp
  p = Math.max(0.05, Math.min(0.95, p));

  const accepted = Math.random() < p;
  const status = accepted ? "accepted" : "declined";
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Pokud odmítl, vyber realistický důvod podle persona + situace
  const rejectReason = accepted ? null : pickInvitationRejectReason(
    official.personality, official.favor, isHome,
  );

  try {
    await c.env.DB.prepare(
      `INSERT INTO village_invitations
        (id, match_id, match_day, official_id, team_id, status, gift_cost, attendance_effects, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.matchId, matchDay, body.officialId, session.teamId, status, giftCost,
      JSON.stringify({
        probability: Math.round(p * 100) / 100,
        rejectReason: rejectReason ?? undefined,
      }),
      now,
    ).run();
  } catch (e) {
    // Conflict (slot taken in race) — vrať standard error
    logger.warn({ module: "villages" }, `insert invitation`, e);
    return c.json({ error: "Pozvánku se nepodařilo uložit" }, 500);
  }

  // Cost zaplaceno hned (občerstvení / dárek)
  if (giftCost > 0) {
    const teamRow = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
      .bind(session.teamId).first<{ game_date: string }>();
    const { recordTransaction: rec } = await import("../season/finance-processor");
    await rec(
      c.env.DB, session.teamId, "event", -giftCost,
      `Pozvání ${official.first_name} ${official.last_name}`,
      teamRow?.game_date ?? now,
    );
  }

  // History
  const teamName = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(session.teamId).first<{ name: string }>();
  const histDesc = accepted
    ? `${official.first_name} ${official.last_name} přijal pozvání ${teamName?.name ?? "týmu"} na zápas.`
    : `${official.first_name} ${official.last_name} odmítl pozvání ${teamName?.name ?? "týmu"}: „${rejectReason}"`;
  await c.env.DB.prepare(
    `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), official.village_id, session.teamId, official.id,
    accepted ? "invitation_accepted" : "invitation_declined",
    histDesc, JSON.stringify({ giftCost, probability: Math.round(p * 100) / 100, rejectReason }),
    now.slice(0, 10), now,
  ).run().catch((e) => logger.warn({ module: "villages" }, "insert invitation history", e));

  return c.json({
    id, status, giftCost,
    probability: Math.round(p * 100) / 100,
    officialName: `${official.first_name} ${official.last_name}`,
    rejectReason,
  });
});

// Persona-aware důvody odmítnutí pozvánky na zápas.
function pickInvitationRejectReason(persona: string, favor: number, isHome: boolean): string {
  const lowFavor = favor < 40;
  const COMMON: string[] = [
    "Zrovna na ten den máme rodinnou návštěvu.",
    "Vnoučata mají soutěž ve škole, musím s nimi.",
    "Bohužel mám už jiný program — jindy rád.",
  ];
  const BY_PERSONA: Record<string, string[]> = {
    sportovec: [
      "Forma vašeho týmu poslední dobou není přesvědčivá. Počkám si na lepší zápas.",
      "Když budete hrát líp, rád přijdu.",
      "Sleduji vás — uvidíme až dáte výsledky.",
      "Tahle sezóna je pro vás slabá. Příště.",
    ],
    aktivista: [
      "Nelíbí se mi, jak komunikujete s občany. Zatím ne.",
      "Slyšel jsem, jak jste zacházeli s tím mladým talentem. Pozvánka? Ne.",
      "Mám své priority a fotbal mezi nimi teď není.",
      ...(lowFavor ? ["Nevidím s vámi shodu. Možná až přehodnotíte přístup."] : []),
    ],
    podnikatel: [
      "Nemám teď čas, jednám o jedné zakázce.",
      "Mám obchodní jednání zrovna ten víkend.",
      "Bohužel tipuji jiný projekt který si žádá pozornost.",
      ...(lowFavor ? ["Když nemůžete dorazit ani na schůzi obce, nevidím důvod, proč na zápas."] : []),
    ],
    tradicionalista: [
      "Mám hody u sousedů, to se neodmítá.",
      "Zrovna se sloučí důchodci na výletě, vedu to.",
      "Manželka by mě zabila, kdybych zase nešel s ní.",
      ...(!isHome ? ["Cestování za vámi mě v tomhle věku unavuje."] : []),
    ],
    populista: [
      "Mám už domluvený šachový turnaj v hospodě.",
      "Něco mi do toho přišlo — uvidíme příště.",
      "Možná jindy, dnes to nevyjde.",
      ...(lowFavor ? ["Občané by mě viděli s vámi neradi."] : []),
    ],
  };
  const pool = [...COMMON, ...(BY_PERSONA[persona] ?? [])];
  return pool[Math.floor(Math.random() * pool.length)];
}

// POST /api/villages/pub-encounters/:id/respond — invite_beer | ignore
villagesRouter.post("/pub-encounters/:encId/respond", requireAuth, async (c) => {
  const encId = c.req.param("encId");
  const session = c.get("session" as never) as { userId: string; teamId: string | null };
  const teamRowAuth = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id = ? AND name NOT LIKE 'DELETED%' LIMIT 1"
  ).bind(session.userId).first<{ id: string }>();
  if (!teamRowAuth) return c.json({ error: "Nemáš tým" }, 400);

  const body = await c.req.json<{ action: "invite_beer" | "ignore" }>().catch((e) => {
    logger.warn({ module: "villages" }, "parse pub body", e);
    return null;
  });
  if (!body || (body.action !== "invite_beer" && body.action !== "ignore")) {
    return c.json({ error: "action musí být invite_beer|ignore" }, 400);
  }

  const enc = await c.env.DB.prepare(
    `SELECT vpe.*, vo.first_name, vo.last_name, vo.personality
     FROM village_pub_encounters vpe
     JOIN village_officials vo ON vo.id = vpe.official_id
     WHERE vpe.id = ? AND vpe.status = 'active'`
  ).bind(encId).first<{
    id: string; village_id: string; team_id: string; official_id: string;
    first_name: string; last_name: string; personality: string;
  }>();
  if (!enc) return c.json({ error: "Encounter už není aktivní" }, 410);
  if (enc.team_id !== teamRowAuth.id) return c.json({ error: "Není pro tvůj tým" }, 403);

  const now = new Date().toISOString();
  const teamRow = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamRowAuth.id).first<{ game_date: string }>();
  const gameDate = teamRow?.game_date ?? now;

  if (body.action === "ignore") {
    await c.env.DB.prepare(
      `UPDATE village_pub_encounters SET status = 'ignored', responded_at = ?, outcome = 'ignored' WHERE id = ?`
    ).bind(now, encId).run();
    return c.json({ ok: true, action: "ignore" });
  }

  // invite_beer
  const beerCost = enc.personality === "tradicionalista" ? 350 : enc.personality === "populista" ? 250 : 400;

  const { recordTransaction: rec } = await import("../season/finance-processor");
  await rec(
    c.env.DB, teamRowAuth.id, "event", -beerCost,
    `Pivo s ${enc.first_name} ${enc.last_name}`, gameDate,
  );

  // Šance skandálu (5% pro aktivistu, 2% pro ostatní)
  const scandalProb = enc.personality === "aktivista" ? 0.05 : 0.02;
  const isScandal = Math.random() < scandalProb;

  let trustGain = 0;
  let favorDelta = 0;
  let outcome: "beer" | "scandal" = "beer";
  let desc = "";

  if (isScandal) {
    outcome = "scandal";
    favorDelta = -5;
    desc = `${enc.first_name} ${enc.last_name} odešel z hospody znechucený. Skandál!`;
    // Také snížit morálku náhodnému hráči o 10
    await c.env.DB.prepare(
      `UPDATE players
       SET life_context = json_set(life_context, '$.morale',
         MAX(0, COALESCE(json_extract(life_context, '$.morale'), 50) - 10))
       WHERE team_id = ? AND (status IS NULL OR status != 'released')
       ORDER BY RANDOM() LIMIT 1`
    ).bind(teamRowAuth.id).run().catch((e) => logger.warn({ module: "villages" }, "scandal morale hit", e));
  } else {
    trustGain = enc.personality === "populista" ? 4
      : enc.personality === "tradicionalista" ? 3 : 2;
    favorDelta = 1;
    desc = `Pohoda u piva s ${enc.first_name} ${enc.last_name}. Trust +${trustGain}.`;
  }

  // Update favor / trust per official
  const fav = await c.env.DB.prepare(
    `SELECT id FROM village_team_favor WHERE team_id = ? AND official_id = ?`
  ).bind(teamRowAuth.id, enc.official_id).first<{ id: string }>();
  if (fav) {
    await c.env.DB.prepare(
      `UPDATE village_team_favor
       SET favor = MAX(0, MIN(100, favor + ?)),
           trust = MAX(0, MIN(100, trust + ?)),
           last_interaction_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(favorDelta, trustGain, now, now, fav.id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, last_interaction_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), enc.village_id, teamRowAuth.id, enc.official_id,
      50 + favorDelta, 50 + trustGain, now, now,
    ).run();
  }

  await c.env.DB.prepare(
    `UPDATE village_pub_encounters SET status = 'accepted', responded_at = ?, outcome = ? WHERE id = ?`
  ).bind(now, outcome, encId).run();

  await c.env.DB.prepare(
    `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), enc.village_id, teamRowAuth.id, enc.official_id,
    isScandal ? "pub_scandal" : "pub_beer",
    desc, JSON.stringify({ cost: beerCost, trustGain, favorDelta, outcome }),
    gameDate, now,
  ).run().catch((e) => logger.warn({ module: "villages" }, "pub encounter history", e));

  return c.json({
    ok: true, outcome, beerCost, trustGain, favorDelta,
    officialName: `${enc.first_name} ${enc.last_name}`,
  });
});

// POST /api/villages/investments/:id/respond — accept | decline
villagesRouter.post("/investments/:invId/respond", requireAuth, async (c) => {
  const invId = c.req.param("invId");
  const session = c.get("session" as never) as { userId: string; teamId: string | null };
  const teamRowAuth = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id = ? AND name NOT LIKE 'DELETED%' LIMIT 1"
  ).bind(session.userId).first<{ id: string }>();
  if (!teamRowAuth) return c.json({ error: "Nemáš tým" }, 400);

  const body = await c.req.json<{ action: "accept" | "decline" }>().catch((e) => {
    logger.warn({ module: "villages" }, "parse investment body", e);
    return null;
  });
  if (!body || (body.action !== "accept" && body.action !== "decline")) {
    return c.json({ error: "action musí být accept|decline" }, 400);
  }

  const inv = await c.env.DB.prepare(
    `SELECT * FROM village_investments WHERE id = ? AND status = 'offered'`
  ).bind(invId).first<{
    id: string; village_id: string; team_id: string; type: string;
    target_facility: string | null; offered_amount: number;
    required_contribution: number; political_cost: number;
  }>();
  if (!inv) return c.json({ error: "Nabídka už není aktivní" }, 410);
  if (inv.team_id !== teamRowAuth.id) return c.json({ error: "Nabídka není pro tvůj tým" }, 403);

  const now = new Date().toISOString();
  const teamRow = await c.env.DB.prepare("SELECT game_date, budget FROM teams WHERE id = ?")
    .bind(teamRowAuth.id).first<{ game_date: string; budget: number }>();
  const gameDate = teamRow?.game_date ?? now;

  if (body.action === "decline") {
    await c.env.DB.prepare(
      `UPDATE village_investments SET status = 'declined', responded_at = ? WHERE id = ?`
    ).bind(now, invId).run();
    await c.env.DB.prepare(
      `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
       VALUES (?, ?, ?, NULL, 'investment_declined', ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), inv.village_id, teamRowAuth.id,
      `Klub odmítl spolufinancování (${inv.offered_amount.toLocaleString("cs")} Kč).`,
      JSON.stringify({ offeredAmount: inv.offered_amount }),
      gameDate, now,
    ).run().catch((e) => logger.warn({ module: "villages" }, "investment declined history", e));
    return c.json({ ok: true, action: "decline" });
  }

  // accept — tým musí doplatit required_contribution
  if ((teamRow?.budget ?? 0) < inv.required_contribution) {
    return c.json({ error: `Nemáš dost peněz na doplatek (${inv.required_contribution.toLocaleString("cs")} Kč)` }, 400);
  }

  // Aplikovat upgrade na stadion (pokud target_facility je stadium key)
  const stadiumFacilities = ["showers", "stands", "parking", "changing_rooms", "refreshments", "fence"];
  if (inv.target_facility && stadiumFacilities.includes(inv.target_facility)) {
    await c.env.DB.prepare(
      `UPDATE stadiums SET ${inv.target_facility} = MIN(3, COALESCE(${inv.target_facility}, 0) + 1)
       WHERE team_id = ?`
    ).bind(teamRowAuth.id).run().catch((e) => {
      logger.warn({ module: "villages" }, `upgrade ${inv.target_facility}`, e);
    });
  } else if (inv.target_facility === "pitch") {
    await c.env.DB.prepare(
      `UPDATE stadiums SET pitch_condition = MIN(100, COALESCE(pitch_condition, 70) + 25)
       WHERE team_id = ?`
    ).bind(teamRowAuth.id).run().catch((e) => {
      logger.warn({ module: "villages" }, "renovate pitch", e);
    });
  }

  // Tým doplatí
  const { recordTransaction: rec } = await import("../season/finance-processor");
  await rec(
    c.env.DB, teamRowAuth.id, "stadium_upgrade", -inv.required_contribution,
    `Spolufinancování: ${inv.target_facility ?? inv.type}`, gameDate,
  );

  await c.env.DB.prepare(
    `UPDATE village_investments SET status = 'completed', responded_at = ? WHERE id = ?`
  ).bind(now, invId).run();

  // Political cost: opoziční NPC (favor < 40) ztratí dalších body
  if (inv.political_cost > 0) {
    await c.env.DB.prepare(
      `UPDATE village_team_favor
       SET favor = MAX(0, favor - ?), updated_at = ?
       WHERE team_id = ? AND official_id IS NOT NULL AND favor < 40`
    ).bind(inv.political_cost, now, teamRowAuth.id).run().catch((e) => {
      logger.warn({ module: "villages" }, "political cost", e);
    });
  }

  await c.env.DB.prepare(
    `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
     VALUES (?, ?, ?, NULL, 'investment_accepted', ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), inv.village_id, teamRowAuth.id,
    `Obec uhradila ${inv.offered_amount.toLocaleString("cs")} Kč na ${inv.target_facility ?? inv.type}.`,
    JSON.stringify({ offeredAmount: inv.offered_amount, contribution: inv.required_contribution, politicalCost: inv.political_cost }),
    gameDate, now,
  ).run().catch((e) => logger.warn({ module: "villages" }, "investment accepted history", e));

  return c.json({
    ok: true, action: "accept",
    offeredAmount: inv.offered_amount,
    contribution: inv.required_contribution,
    targetFacility: inv.target_facility,
  });
});

export { villagesRouter };
