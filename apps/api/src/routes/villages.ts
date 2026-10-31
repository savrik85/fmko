/**
 * Sprint 1: Villages API — raw SQL on D1.
 */

import { logger } from "../lib/logger";
import { isGameExpired } from "../lib/game-time";
import { STAND_COLUMNS, standFacilities } from "../stadium/stands-model";
import { loadStadiumRender } from "./club-website";
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

  // Okresy, kam se nový klub nevejde: přebor i III. třída bez AI týmů, nebo na
  // III. třídu nezbývá dost volných obcí. Pravidlo drží league/district-leagues.ts.
  const { listFullDistricts } = await import("../league/district-leagues");
  const fullDistricts: string[] = await listFullDistricts(c.env.DB)
    .catch((e) => { logger.warn({ module: "villages" }, "fetch full districts", e); return [] as string[]; });

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
     ORDER BY CASE vo.role
       WHEN 'starosta' THEN 0
       WHEN 'mistostarosta' THEN 1
       WHEN 'zastupitel_1' THEN 2
       WHEN 'zastupitel_2' THEN 3
       ELSE 4 END`
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
// GET /api/villages/district/:district/map — obce okresu na mapu: souřadnice, kluby, kolik tu bylo akcí
villagesRouter.get("/district/:district/map", async (c) => {
  const district = c.req.param("district");
  const [villages, clubs, events] = await Promise.all([
    c.env.DB.prepare("SELECT id, name, population, size, lat, lng FROM villages WHERE district = ? ORDER BY population DESC")
      .bind(district).all<{ id: string; name: string; population: number; size: string; lat: number; lng: number }>(),
    c.env.DB.prepare(
      `SELECT t.id, t.name, t.village_id, t.user_id, t.primary_color, t.secondary_color, l.name AS league_name,
              t.badge_pattern, t.badge_primary_color, t.badge_secondary_color, t.badge_initials, t.badge_symbol
         FROM teams t JOIN villages v ON v.id = t.village_id LEFT JOIN leagues l ON l.id = t.league_id
        WHERE v.district = ? AND t.parent_team_id IS NULL AND COALESCE(t.team_type, 'senior') != 'u21'
          AND t.name NOT LIKE 'DELETED%'`,
    ).bind(district).all<{
      id: string; name: string; village_id: string; user_id: string; primary_color: string; secondary_color: string; league_name: string | null;
      badge_pattern: string | null; badge_primary_color: string | null; badge_secondary_color: string | null; badge_initials: string | null; badge_symbol: string | null;
    }>(),
    c.env.DB.prepare("SELECT place FROM district_events WHERE district = ? AND status = 'done'")
      .bind(district).all<{ place: string }>()
      .catch((e) => { logger.warn({ module: "villages" }, "okresní akce pro mapu", e); return { results: [] as { place: string }[] }; }),
  ]);
  // Ukazují se jen obce, ke kterým něco je: klub, akce, kronika, fanoušci, hráči nebo trenéři odtud.
  const linked = await c.env.DB.prepare(
    `SELECT v.id FROM villages v WHERE v.district = ? AND (
       EXISTS (SELECT 1 FROM village_history h WHERE h.village_id = v.id)
       OR EXISTS (SELECT 1 FROM bus_satellite_fans b WHERE b.village_id = v.id)
       OR EXISTS (SELECT 1 FROM managers m WHERE m.team_id IS NOT NULL AND (m.birthplace_village_id = v.id OR (m.birthplace_village_id IS NULL AND m.birthplace = v.name)))
       OR EXISTS (SELECT 1 FROM players p JOIN teams t ON t.id = p.team_id JOIN villages tv ON tv.id = t.village_id
                  WHERE p.residence = v.name AND tv.district = v.district AND (p.status IS NULL OR p.status = 'active')))`,
  ).bind(district).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "villages" }, "obce se záznamy", e); return { results: [] as { id: string }[] }; });
  const linkedIds = new Set(linked.results.map((r) => r.id));
  const byVillage = new Map<string, Array<Record<string, unknown>>>();
  for (const t of clubs.results) {
    const list = byVillage.get(t.village_id) ?? [];
    list.push({
      id: t.id, name: t.name, isAi: t.user_id === "ai", leagueName: t.league_name, primaryColor: t.primary_color, secondaryColor: t.secondary_color,
      badge: { pattern: t.badge_pattern, primary: t.badge_primary_color, secondary: t.badge_secondary_color, initials: t.badge_initials, symbol: t.badge_symbol },
    });
    byVillage.set(t.village_id, list);
  }
  const districts = await c.env.DB.prepare(
    `SELECT v.district FROM villages v WHERE EXISTS (SELECT 1 FROM teams t WHERE t.village_id = v.id AND t.parent_team_id IS NULL)
      GROUP BY v.district ORDER BY v.district`,
  ).all<{ district: string }>().catch((e) => { logger.warn({ module: "villages" }, "okresy s kluby", e); return { results: [] }; });
  return c.json({
    district,
    districts: districts.results.map((d) => d.district),
    villages: villages.results
      .map((v) => ({
        ...v,
        clubs: byVillage.get(v.id) ?? [],
        events: events.results.filter((e) => placeMentions(e.place, v.name)).length,
      }))
      .filter((v) => v.clubs.length > 0 || v.events > 0 || linkedIds.has(v.id)),
  });
});

// GET /api/villages/:id/profile — profil obce na prohlížení: starosta, kluby a stadiony, akce, kdo tu bydlí
villagesRouter.get("/:id/profile", async (c) => {
  const id = c.req.param("id");
  const village = await c.env.DB.prepare("SELECT id, name, district, region, population, size, lat, lng, flavor_facts FROM villages WHERE id = ?")
    .bind(id).first<{ id: string; name: string; district: string; region: string; population: number; size: string; lat: number; lng: number; flavor_facts: string | null }>();
  if (!village) return c.json({ error: "Obec nenalezena" }, 404);

  const officials = await c.env.DB.prepare(
    `SELECT role, first_name, last_name, age, occupation, face_config, personality FROM village_officials WHERE village_id = ?
      ORDER BY CASE role WHEN 'starosta' THEN 0 WHEN 'mistostarosta' THEN 1 ELSE 2 END`,
  ).bind(id).all<{ role: string; first_name: string; last_name: string; age: number; occupation: string; face_config: string; personality: string }>()
    .catch((e) => { logger.warn({ module: "villages" }, "zastupitelstvo obce", e); return { results: [] }; });

  // Trenéři, kteří tu bydlí: podle id obce, u starších jen podle názvu.
  const coachesFrom = await c.env.DB.prepare(
    `SELECT m.name, m.avatar, m.team_id, t.name AS team_name, t.user_id FROM managers m LEFT JOIN teams t ON t.id = m.team_id
      WHERE (m.birthplace_village_id = ? OR (m.birthplace_village_id IS NULL AND m.birthplace = ?)) AND m.team_id IS NOT NULL LIMIT 12`,
  ).bind(village.id, village.name).all<{ name: string; avatar: string | null; team_id: string; team_name: string | null; user_id: string | null }>()
    .catch((e) => { logger.warn({ module: "villages" }, "trenéři z obce", e); return { results: [] }; });

  // Kronika: volby, místní senzace, investice, petice, brigády.
  const chronicle = await c.env.DB.prepare(
    `SELECT h.event_type, h.description, h.game_date, t.name AS team_name FROM village_history h LEFT JOIN teams t ON t.id = h.team_id
      WHERE h.village_id = ? ORDER BY h.game_date DESC, h.created_at DESC LIMIT 15`,
  ).bind(id).all<{ event_type: string; description: string; game_date: string; team_name: string | null }>()
    .catch((e) => { logger.warn({ module: "villages" }, "kronika obce", e); return { results: [] }; });

  // Odkud fanoušci jezdí autobusem: kterým klubům obec fandí.
  const busFans = await c.env.DB.prepare(
    `SELECT b.team_id, t.name AS team_name, b.casual_count + b.regular_count + b.hardcore_count AS fans
       FROM bus_satellite_fans b JOIN teams t ON t.id = b.team_id
      WHERE b.village_id = ? AND b.casual_count + b.regular_count + b.hardcore_count > 0 ORDER BY fans DESC LIMIT 6`,
  ).bind(id).all<{ team_id: string; team_name: string; fans: number }>()
    .catch((e) => { logger.warn({ module: "villages" }, "fanoušci z obce", e); return { results: [] }; });

  const clubRows = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.user_id, t.league_id, t.primary_color, t.secondary_color, t.badge_pattern, t.badge_primary_color,
            t.badge_secondary_color, t.badge_initials, t.badge_symbol, t.stadium_name, t.reputation,
            l.name AS league_name, m.name AS coach_name, m.avatar AS coach_avatar,
            s.capacity, s.pitch_type, s.pitch_condition, s.lighting, s.stands, s.roof, s.changing_rooms, s.refreshments, s.parking,
            s.vip_box, ${STAND_COLUMNS.split(", ").map((col) => `s.${col}`).join(", ")},
            (SELECT GROUP_CONCAT(viewpoint || '|' || version, ',') FROM team_stadium_photos p WHERE p.team_id = t.id) AS photos
       FROM teams t LEFT JOIN leagues l ON l.id = t.league_id LEFT JOIN managers m ON m.team_id = t.id
       LEFT JOIN stadiums s ON s.team_id = t.id
      WHERE t.village_id = ? AND t.parent_team_id IS NULL AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED%'
      ORDER BY t.reputation DESC`,
  ).bind(id).all<Record<string, string | number | null>>();

  const { calculateStandings } = await import("../stats/standings");
  // Kapacita stejně jako v profilu klubu: základ plus tribuny a VIP lóže (sloupec sám je jen základ).
  const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
  const { loadFanbaseAggregate } = await import("../season/fanbase-helpers");
  const clubs = [];
  for (const t of clubRows.results) {
    const teamId = t.id as string;
    const standings = t.league_id
      ? await calculateStandings(c.env.DB, t.league_id as string).catch((e) => { logger.warn({ module: "villages" }, "tabulka pro profil obce", e); return []; })
      : [];
    const position = standings.find((x) => x.teamId === teamId);
    const recent = await c.env.DB.prepare(
      `SELECT m.id, m.home_score, m.away_score, m.home_team_id, m.attendance, m.simulated_at, ht.name AS home_name, at.name AS away_name
         FROM matches m JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
        WHERE m.home_team_id = ? AND m.status = 'simulated' AND m.parent_match_id IS NULL
        ORDER BY m.simulated_at DESC LIMIT 3`,
    ).bind(teamId).all<{ id: string; home_score: number; away_score: number; attendance: number | null; home_name: string; away_name: string; simulated_at: string }>()
      .catch((e) => { logger.warn({ module: "villages" }, "zápasy na hřišti obce", e); return { results: [] }; });
    // Fanoušci celkem stejně jako na stránce Fanoušci: domácí, z propagace i z okolních obcí.
    const fans = await loadFanbaseAggregate(c.env.DB, teamId)
      .then((f) => f.agg.total)
      .catch((e) => { logger.warn({ module: "villages" }, "fanoušci klubu pro profil obce", e); return null; });
    // Fotka platí jen pro současnou podobu stadionu (stejně jako na klubovém webu): po přestavbě
    // nebo změně 3D modelu by ukazovala starý stadion. Přednost má celkový pohled.
    const stored = String(t.photos ?? "").split(",").filter(Boolean).map((x) => x.split("|") as [string, string]);
    const current = stored.length
      ? await loadStadiumRender(c.env.DB, teamId).catch((e) => { logger.warn({ module: "villages" }, "otisk stadionu pro fotku", e); return null; })
      : null;
    const valid = current ? stored.filter(([, ver]) => ver === current.version) : [];
    const [vp, version] = valid.find(([v]) => v === "overview") ?? valid[0] ?? [];
    let coachAvatar: Record<string, unknown> | null = null;
    try { coachAvatar = t.coach_avatar ? JSON.parse(String(t.coach_avatar)) : null; } catch (e) { logger.warn({ module: "villages" }, "avatar trenéra", e); }
    clubs.push({
      id: teamId, name: t.name, isAi: t.user_id === "ai", leagueName: t.league_name,
      position: position?.pos ?? null, teamsInLeague: standings.length || null, points: position?.points ?? null, fans,
      colors: { primary: t.primary_color, secondary: t.secondary_color },
      badge: { pattern: t.badge_pattern, primary: t.badge_primary_color, secondary: t.badge_secondary_color, initials: t.badge_initials, symbol: t.badge_symbol },
      coach: t.coach_name ? { name: t.coach_name, avatar: coachAvatar } : null,
      stadium: {
        name: t.stadium_name,
        capacity: t.capacity == null ? null
          : (t.capacity as number) + calculateFacilityEffects({ ...standFacilities(t as never), vip_box: (t.vip_box as number) ?? 0 }).capacityBonus,
        pitchType: t.pitch_type, pitchCondition: t.pitch_condition,
        lighting: t.lighting, stands: t.stands, roof: t.roof, changingRooms: t.changing_rooms, refreshments: t.refreshments, parking: t.parking,
        photoUrl: vp && version ? `/api/teams/${teamId}/website/stadium-photo/${vp}?v=${version}` : null,
      },
      recentHomeMatches: recent.results.map((m) => ({
        id: m.id, home: m.home_name, away: m.away_name, score: `${m.home_score}:${m.away_score}`, attendance: m.attendance,
      })),
    });
  }

  const events = await c.env.DB.prepare(
    "SELECT id, title, place, event_date, report FROM district_events WHERE district = ? AND status = 'done' ORDER BY event_date DESC LIMIT 20",
  ).bind(village.district).all<{ id: string; title: string; place: string; event_date: string; report: string | null }>()
    .catch((e) => { logger.warn({ module: "villages" }, "akce v obci", e); return { results: [] }; });
  const villageEvents = events.results.filter((e) => placeMentions(e.place, village.name)).map((e) => {
    type Report = { headline?: string; body?: string; scenes?: Array<{ text: string }> };
    let report: Report | null = null;
    try { report = e.report ? (JSON.parse(e.report) as { report: Report | null }).report : null; } catch (err) { logger.warn({ module: "villages" }, "reportáž akce", err); }
    return { id: e.id, title: e.title, place: e.place, date: e.event_date, headline: report?.headline ?? null, body: report?.body ?? null, scenes: (report?.scenes ?? []).slice(0, 3).map((x) => x.text) };
  });

  // Kdo tu bydlí: hráči klubů okresu s bydlištěm v obci (bydliště je název obce).
  const residents = await c.env.DB.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.age, p.position, p.avatar, t.id AS team_id, t.name AS team_name
       FROM players p JOIN teams t ON t.id = p.team_id JOIN villages v ON v.id = t.village_id
      WHERE p.residence = ? AND v.district = ? AND (p.status IS NULL OR p.status = 'active')
      ORDER BY p.age DESC LIMIT 24`,
  ).bind(village.name, village.district).all<{ id: string; first_name: string; last_name: string; age: number; position: string; avatar: string; team_id: string; team_name: string }>()
    .catch((e) => { logger.warn({ module: "villages" }, "hráči z obce", e); return { results: [] }; });

  // Rekordy hřiště: všechny domácí zápasy klubů obce (bez U21).
  const clubIds = clubs.map((cl) => cl.id as string);
  type MatchRow = { id: string; home_score: number; away_score: number; attendance: number | null; home_name: string; away_name: string };
  const homeMatches = clubIds.length
    ? await c.env.DB.prepare(
      `SELECT m.id, m.home_score, m.away_score, m.attendance, ht.name AS home_name, at.name AS away_name
         FROM matches m JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
        WHERE m.home_team_id IN (${clubIds.map(() => "?").join(",")}) AND m.status = 'simulated' AND m.parent_match_id IS NULL`,
    ).bind(...clubIds).all<MatchRow>().catch((e) => { logger.warn({ module: "villages" }, "rekordy hřiště", e); return { results: [] as MatchRow[] }; })
    : { results: [] as MatchRow[] };
  const hm = homeMatches.results;
  const asMatch = (m: MatchRow | undefined) => m ? { id: m.id, home: m.home_name, away: m.away_name, score: `${m.home_score}:${m.away_score}`, attendance: m.attendance } : null;
  const topAttendance = [...hm].filter((m) => m.attendance).sort((a, b) => (b.attendance ?? 0) - (a.attendance ?? 0))[0];
  const biggestWin = [...hm].filter((m) => m.home_score > m.away_score)
    .sort((a, b) => (b.home_score - b.away_score) - (a.home_score - a.away_score) || b.home_score - a.home_score)[0];
  const mostGoals = [...hm].sort((a, b) => (b.home_score + b.away_score) - (a.home_score + a.away_score))[0];
  const records = {
    homeMatches: hm.length,
    wins: hm.filter((m) => m.home_score > m.away_score).length,
    draws: hm.filter((m) => m.home_score === m.away_score).length,
    losses: hm.filter((m) => m.home_score < m.away_score).length,
    goalsFor: hm.reduce((a, m) => a + m.home_score, 0),
    goalsAgainst: hm.reduce((a, m) => a + m.away_score, 0),
    averageAttendance: hm.some((m) => m.attendance) ? Math.round(hm.reduce((a, m) => a + (m.attendance ?? 0), 0) / hm.filter((m) => m.attendance).length) : null,
    topAttendance: asMatch(topAttendance),
    biggestWin: asMatch(biggestWin),
    mostGoals: mostGoals && mostGoals.home_score + mostGoals.away_score > 0 ? asMatch(mostGoals) : null,
  };

  let facts: unknown = null;
  try { facts = village.flavor_facts ? JSON.parse(village.flavor_facts) : null; } catch (e) { logger.warn({ module: "villages" }, "zajímavosti obce", e); }
  // Zajímavosti mají v datech dlouhé pomlčky, v textech pro hráče je nechceme.
  if (Array.isArray(facts)) facts = facts.map((f) => typeof f === "string" ? f.replace(/\s*[\u2014\u2013]\s*/g, ", ") : f);
  const face = (raw: string | null): Record<string, unknown> | null => {
    if (!raw) return null;
    try { return JSON.parse(raw) as Record<string, unknown>; } catch (e) { logger.warn({ module: "villages" }, "obličej v profilu obce", e); return null; }
  };

  return c.json({
    village: { id: village.id, name: village.name, district: village.district, region: village.region, population: village.population, size: village.size, lat: village.lat, lng: village.lng, facts },
    officials: officials.results.map((o) => ({
      role: o.role, name: `${o.first_name} ${o.last_name}`, age: o.age, occupation: o.occupation, personality: o.personality, face: face(o.face_config),
    })),
    coachesFrom: coachesFrom.results.map((m) => ({
      name: m.name, avatar: face(m.avatar), teamId: m.team_id, teamName: m.team_name, isAi: m.user_id === "ai",
    })),
    // Starší zápisy kroniky mají dlouhé pomlčky, v textech pro hráče je nechceme.
    chronicle: chronicle.results.map((h) => ({ type: h.event_type, text: h.description.replace(/\s*[\u2014\u2013]\s*/g, ", "), date: h.game_date, teamName: h.team_name })),
    busFans: busFans.results.map((b) => ({ teamId: b.team_id, teamName: b.team_name, fans: b.fans })),
    clubs,
    records,
    events: villageEvents,
    residents: residents.results.map((p) => {
      let avatar: Record<string, unknown> | null = null;
      try { avatar = JSON.parse(p.avatar); } catch (e) { logger.warn({ module: "villages" }, "avatar hráče z obce", e); }
      return { id: p.id, name: `${p.first_name} ${p.last_name}`, age: p.age, position: p.position, avatar, teamId: p.team_id, teamName: p.team_name };
    }),
  });
});

villagesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("SELECT * FROM villages WHERE id = ?").bind(id).first();
  if (!result) return c.json({ error: "Village not found" }, 404);
  return c.json(result);
});

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
     WHERE t.village_id = ? AND t.name NOT LIKE 'DELETED%'
       AND COALESCE(t.team_type, 'senior') != 'u21'
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
import { requireAuth, requireAdmin } from "../auth/middleware";
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

  // expires_at je HERNÍ čas — porovnávat s reálným datem znamená, že kontrola
  // při posunutém game_clock.offset_days nikdy nesedí.
  const brigadeTeamDate = await c.env.DB.prepare(
    "SELECT game_date FROM teams WHERE id = ?"
  ).bind(session.teamId).first<{ game_date: string }>().catch((e) => {
    logger.warn({ module: "villages" }, "load game date for brigade expiry", e);
    return null;
  });
  // Bez herního data se kontrola NESMÍ přeskočit — dávno vypršelá brigáda by prošla
  // a strhla hráčům kondici. Radši odmítnout, než pustit neznámý stav.
  if (!brigadeTeamDate?.game_date) {
    logger.warn({ module: "villages" }, `brigade ${brigadeId}: chybí game_date týmu ${session.teamId}`);
    return c.json({ error: "Nepodařilo se ověřit platnost brigády, zkus to znovu" }, 503);
  }
  if (isGameExpired(brigade.expires_at, brigadeTeamDate.game_date)) {
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
    return c.json({ error: "Tvůj tým už tento týden brigádu vzal, musíš počkat." }, 429);
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

  // Načíst NPC + favor
  const official = await c.env.DB.prepare(
    `SELECT vo.id, vo.village_id, vo.first_name, vo.last_name, vo.personality, vo.role,
            COALESCE(vtf.favor, 50) as favor
     FROM village_officials vo
     LEFT JOIN village_team_favor vtf
       ON vtf.official_id = vo.id AND vtf.team_id = ?
     WHERE vo.id = ?`
  ).bind(session.teamId, body.officialId).first<{
    id: string; village_id: string; first_name: string; last_name: string;
    personality: string; role: string; favor: number;
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
  p += 0.008 * (official.favor - 50);
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
    "Bohužel mám už jiný program, jindy rád.",
  ];
  const BY_PERSONA: Record<string, string[]> = {
    sportovec: [
      "Forma vašeho týmu poslední dobou není přesvědčivá. Počkám si na lepší zápas.",
      "Když budete hrát líp, rád přijdu.",
      "Sleduji vás, uvidíme až dáte výsledky.",
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
      "Něco mi do toho přišlo, uvidíme příště.",
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
    `SELECT vpe.*, vo.first_name, vo.last_name, vo.personality, vo.face_config
     FROM village_pub_encounters vpe
     JOIN village_officials vo ON vo.id = vpe.official_id
     WHERE vpe.id = ? AND vpe.status = 'active'`
  ).bind(encId).first<{
    id: string; village_id: string; team_id: string; official_id: string;
    first_name: string; last_name: string; personality: string; face_config: string;
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
    favorDelta = enc.personality === "populista" ? 2
      : enc.personality === "tradicionalista" ? 2 : 1;
    desc = `Pohoda u piva s ${enc.first_name} ${enc.last_name}. Přízeň +${favorDelta}.`;
  }

  // Update favor per official
  const fav = await c.env.DB.prepare(
    `SELECT id FROM village_team_favor WHERE team_id = ? AND official_id = ?`
  ).bind(teamRowAuth.id, enc.official_id).first<{ id: string }>();
  if (fav) {
    await c.env.DB.prepare(
      `UPDATE village_team_favor
       SET favor = MAX(0, MIN(100, favor + ?)),
           last_interaction_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(favorDelta, now, now, fav.id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, last_interaction_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), enc.village_id, teamRowAuth.id, enc.official_id,
      50 + favorDelta, 50, now, now,
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
    desc, JSON.stringify({ cost: beerCost, favorDelta, outcome }),
    gameDate, now,
  ).run().catch((e) => logger.warn({ module: "villages" }, "pub encounter history", e));

  // Promítnout do dnešní pub_session: přidat incident "official_visit"
  const todayKey = (teamRow?.game_date ?? now).slice(0, 10);
  const incidentText = isScandal
    ? `${enc.first_name} ${enc.last_name} (${enc.personality === "aktivista" ? "aktivista" : "zastupitel"}) odešel z hospody znechucený. Skandál!`
    : `${enc.first_name} ${enc.last_name} si dal s týmem několik piv. Přízeň +${favorDelta}.`;
  const newIncident = {
    type: isScandal ? "official_scandal" : "official_visit",
    playerIds: [],
    text: incidentText,
  };
  let officialAvatar: Record<string, unknown> | null = null;
  try { officialAvatar = JSON.parse(enc.face_config); } catch (e) {
    logger.warn({ module: "villages" }, "parse official face_config", e);
  }
  const officialAttendee = {
    playerId: `npc-${enc.official_id}`,
    firstName: enc.first_name,
    lastName: enc.last_name,
    alcohol: 50,
    teamId: teamRowAuth.id,
    isVisitor: false,
    fromTeamName: undefined,
    avatar: officialAvatar,
  };
  const existing = await c.env.DB.prepare(
    `SELECT attendees, incidents FROM pub_sessions WHERE team_id = ? AND game_date = ?`
  ).bind(teamRowAuth.id, todayKey).first<{ attendees: string; incidents: string }>();
  if (existing) {
    let atts: unknown[] = []; let incs: unknown[] = [];
    try { atts = JSON.parse(existing.attendees); } catch { atts = []; }
    try { incs = JSON.parse(existing.incidents); } catch { incs = []; }
    atts.push(officialAttendee);
    incs.push(newIncident);
    await c.env.DB.prepare(
      `UPDATE pub_sessions SET attendees = ?, incidents = ? WHERE team_id = ? AND game_date = ?`
    ).bind(JSON.stringify(atts), JSON.stringify(incs), teamRowAuth.id, todayKey).run()
      .catch((e) => logger.warn({ module: "villages" }, "update pub_session with NPC", e));
  } else {
    await c.env.DB.prepare(
      `INSERT INTO pub_sessions (team_id, game_date, attendees, incidents) VALUES (?, ?, ?, ?)`
    ).bind(
      teamRowAuth.id, todayKey,
      JSON.stringify([officialAttendee]),
      JSON.stringify([newIncident]),
    ).run().catch((e) => logger.warn({ module: "villages" }, "insert pub_session for NPC", e));
  }

  return c.json({
    ok: true, outcome, beerCost, favorDelta,
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

  // Pojistka: přijmout jde jen investici, která má reálný efekt. Jinak by se
  // strhly peníze za no-op (např. zatím neimplementovaná mládežnická akademie).
  const upgradeableFacilities = ["showers", "stands", "parking", "changing_rooms", "refreshments", "fence", "pitch"];
  if (!inv.target_facility || !upgradeableFacilities.includes(inv.target_facility)) {
    logger.warn({ module: "villages" }, `accept rejected, neimplementovaný cíl: ${inv.target_facility ?? inv.type}`);
    return c.json({ error: "Tuto investici teď nelze přijmout, připravujeme ji." }, 409);
  }

  // Český název cíle investice (do historie/transakcí — žádná angličtina v UI)
  const TARGET_LABEL_CZ: Record<string, string> = {
    showers: "Sprchy", stands: "Tribuny", parking: "Parkoviště", changing_rooms: "Šatny",
    refreshments: "Občerstvení", fence: "Oplocení", pitch: "Hřiště", youth: "Mládežnická akademie",
    stadium_upgrade: "Modernizace stadionu", pitch_renovation: "Renovace hřiště",
    youth_facility: "Mládežnická akademie", bus_subsidy: "Příspěvek na autobus",
  };
  const targetCz =
    (inv.target_facility && TARGET_LABEL_CZ[inv.target_facility]) ||
    TARGET_LABEL_CZ[inv.type] ||
    inv.target_facility || inv.type;

  // Aplikovat upgrade na stadion (pokud target_facility je stadium key)
  const stadiumFacilities = ["showers", "parking", "changing_rooms", "refreshments", "fence"];
  if (inv.target_facility === "stands") {
    // Tribuny se staví po stranách, obecní rozšíření zvedne všechny o jednu úroveň.
    const { raiseAllStandSides } = await import("../stadium/stands-db");
    await raiseAllStandSides(c.env.DB, teamRowAuth.id).catch((e) => {
      logger.warn({ module: "villages" }, "upgrade stands", e);
    });
  } else if (inv.target_facility && stadiumFacilities.includes(inv.target_facility)) {
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
    `Spolufinancování: ${targetCz}`, gameDate,
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
    `Obec uhradila ${inv.offered_amount.toLocaleString("cs")} Kč na ${targetCz}.`,
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

// Admin: jednorázový seed officials pro všechny obce s aktivním human týmem.
// Spustí se po prod deployi, aby brigády hned měly offered_by_official_id.
// Idempotentní (lazy seed přeskočí už existující).
villagesRouter.post("/admin/seed-all-officials", requireAdmin, async (c) => {
  const villages = await c.env.DB.prepare(
    `SELECT DISTINCT v.id FROM villages v
     JOIN teams t ON t.village_id = v.id
     WHERE t.user_id != 'ai'`
  ).all<{ id: string }>();
  const { ensureVillageOfficials: ensure } = await import("../villages/officials-store");
  let seeded = 0;
  for (const v of villages.results ?? []) {
    const officials = await ensure(c.env.DB, v.id);
    if (officials.length === 4) seeded++;
  }
  return c.json({ ok: true, villagesProcessed: villages.results?.length ?? 0, seeded });
});

// POST /admin/run-elections — komunální volby: kompletní obměna vedení všech obcí
// (s lidským týmem), reset přízně na 50, článek do Zpravodaje a SMS klubům.
// Od 2026-10-20 je pouští i konec sezóny (season-rollover.ts).
villagesRouter.post("/admin/run-elections", requireAdmin, async (c) => {
  const { holdMunicipalElections } = await import("../villages/municipal-elections");
  return c.json({ ok: true, ...(await holdMunicipalElections(c.env.DB)) });
});

export { villagesRouter };

/** Koná se akce v obci? Místo je volný text („sokolovna Kunratice“), hledá se název obce jako celé slovo. */
function placeMentions(place: string, villageName: string): boolean {
  const esc = villageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s,])${esc}($|[\\s,])`, "i").test(place);
}
