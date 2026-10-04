/**
 * Skaut na úkolu a jeho hlášení (Zaměstnanci → Skaut). Logika v scouting/scout-work.ts,
 * jednání z hlášení v transfers/ai-negotiation.ts. Všechno jen pro vlastní klub.
 */

import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { requireAdmin, requireOwnedTeamRead, requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { resolveClubTeamId } from "../transfers/offer-club-scope";
import {
  SCOUT_AGE_MAX, SCOUT_AGE_MIN, SCOUT_RADIUS_TIERS, SCOUT_WEEKS_OPTIONS, SCOUT_WILLINGNESS_LABELS, SCOUT_YOUTH_AGE_MAX,
  maxScoutsForLicence, willingnessFromChance,
} from "@okresni-masina/shared";
import {
  assignmentPositions, cancelScoutAssignment, createLeagueScoutAssignment, createMatchScoutAssignment,
  createPlayerScoutAssignment, createScoutAssignment, loadActiveAssignment, loadActiveAssignments,
  loadTeamScout, loadTeamScouts, maintainScoutReports, requestRevisit, runScoutWork, scoutEffectiveness,
} from "../scouting/scout-work";
import { estimateWillingness, startAiNegotiation } from "../transfers/ai-negotiation";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";
import { blurredWillingness } from "../scouting/fog";

/** Avatar zaměstnance je v DB JSON text; neplatný se bere jako bez obličeje. */
function parseAvatar(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch (e) { logger.warn({ module: "scouting" }, "parse scout avatar", e); return {}; }
}

export const scoutingRouter = new Hono<{ Bindings: Bindings }>();

scoutingRouter.use("/teams/:teamId/*", requireTeamOwnership);
scoutingRouter.use("/admin/scout/*", requireAdmin);

/** Skauta má klub (áčko), ne dorost. */
async function club(c: Context<{ Bindings: Bindings }>, teamId: string): Promise<string | Response> {
  const clubId = await resolveClubTeamId(c.env.DB, teamId) ?? teamId;
  if (clubId !== teamId) return c.json({ error: "Skauta má klub, ne dorost." }, 400);
  return clubId;
}

async function gameDateOf(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "scouting" }, "herní datum", e); return null; });
  return row?.game_date ?? new Date().toISOString();
}

interface ReportRow {
  id: string; source: "village_club" | "free_agent"; club_name: string | null; club_city: string | null; district: string | null;
  distance_km: number; free_agent_id: string | null; player_data: string; first_name: string; last_name: string; age: number;
  position: string; rating_lo: number; rating_hi: number; potential_lo: number | null; potential_hi: number | null; visits: number;
  ask_hint: number | null; pros: string; cons: string; willingness: number | null; status: string; negotiation_id: string | null;
  expires_at: string; created_at: string; club_mean: number | null; village_id: string | null;
}

function parseList(raw: string | null): string[] {
  try { return raw ? JSON.parse(raw) as string[] : []; } catch (e) {
    logger.warn({ module: "scouting" }, "parse plusy/minusy", e);
    return [];
  }
}

function playerOf(raw: string): Partial<VirtualPlayerData> {
  try { return JSON.parse(raw) as VirtualPlayerData; } catch (e) {
    logger.warn({ module: "scouting" }, "parse hráče z hlášení", e);
    return {};
  }
}

function reportView(r: ReportRow) {
  const p = playerOf(r.player_data);
  return {
    id: r.id, source: r.source, status: r.status,
    firstName: r.first_name, lastName: r.last_name, age: r.age, position: r.position,
    avatar: p.avatar ?? {},
    // Volný hráč se podepisuje za svou mzdu (stejně jako v seznamu volných hráčů).
    weeklyWage: r.source === "free_agent" ? p.weeklyWage ?? null : null,
    clubName: r.club_name, clubCity: r.club_city, district: r.district, distanceKm: r.distance_km,
    ratingLo: r.rating_lo, ratingHi: r.rating_hi, potentialLo: r.potential_lo, potentialHi: r.potential_hi,
    visits: r.visits, askHint: r.ask_hint,
    pros: parseList(r.pros), cons: parseList(r.cons),
    willingness: r.willingness != null ? { level: r.willingness, label: SCOUT_WILLINGNESS_LABELS[r.willingness] } : null,
    negotiationId: r.negotiation_id, freeAgentId: r.free_agent_id,
    expiresAt: r.expires_at, createdAt: r.created_at,
  };
}

const REPORT_COLS = `id, source, club_name, club_city, district, distance_km, free_agent_id, player_data, first_name, last_name, age,
  position, rating_lo, rating_hi, potential_lo, potential_hi, visits, ask_hint, pros, cons, willingness, status, negotiation_id,
  expires_at, created_at, club_mean, village_id`;

scoutingRouter.get("/teams/:teamId/scout", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const db = c.env.DB;
  const allScouts = await loadTeamScouts(db, teamId);
  const assignments = await loadActiveAssignments(db, teamId);
  const selectedStaffId = c.req.query("staffId") || (allScouts[0]?.id ?? null);
  const scout = selectedStaffId ? allScouts.find((s) => s.id === selectedStaffId) ?? allScouts[0] ?? null : null;
  const assignment = scout ? assignments.find((a) => a.staff_id === scout.id) ?? null : null;

  const coachRow = await db.prepare(
    `SELECT m.licence_level FROM teams t
       JOIN managers m ON m.team_id = COALESCE(t.parent_team_id, t.id)
      WHERE t.id = ?`,
  ).bind(teamId).first<{ licence_level: number | null }>()
    .catch((e) => { logger.warn({ module: "scouting" }, "load coach licence", e); return null; });
  const coachLicence = coachRow?.licence_level ?? 0;
  const maxScouts = maxScoutsForLicence(coachLicence);

  // Načíst jména cílů (hráči / týmy / ligy) pro aktivní úkoly
  const targetPlayerIds = assignments.map((a) => a.target_player_id).filter(Boolean) as string[];
  const targetTeamIds = assignments.map((a) => a.target_team_id).filter(Boolean) as string[];
  const targetLeagueIds = assignments.map((a) => a.target_league_id).filter(Boolean) as string[];

  const playerNames = new Map<string, string>();
  if (targetPlayerIds.length > 0) {
    const placeholders = targetPlayerIds.map(() => "?").join(",");
    const pRows = await db.prepare(`SELECT id, first_name, last_name FROM players WHERE id IN (${placeholders})`)
      .bind(...targetPlayerIds).all<{ id: string; first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: "scouting" }, "load player names for assignments", e); return { results: [] }; });
    for (const p of pRows.results ?? []) {
      playerNames.set(p.id, `${p.first_name} ${p.last_name}`);
    }
  }

  const teamNames = new Map<string, string>();
  if (targetTeamIds.length > 0) {
    const placeholders = targetTeamIds.map(() => "?").join(",");
    const tRows = await db.prepare(`SELECT id, name FROM teams WHERE id IN (${placeholders})`)
      .bind(...targetTeamIds).all<{ id: string; name: string }>()
      .catch((e) => { logger.warn({ module: "scouting" }, "load team names for assignments", e); return { results: [] }; });
    for (const t of tRows.results ?? []) {
      teamNames.set(t.id, t.name);
    }
  }

  const leagueNames = new Map<string, string>();
  if (targetLeagueIds.length > 0) {
    const placeholders = targetLeagueIds.map(() => "?").join(",");
    const lRows = await db.prepare(`SELECT id, name FROM leagues WHERE id IN (${placeholders})`)
      .bind(...targetLeagueIds).all<{ id: string; name: string }>()
      .catch((e) => { logger.warn({ module: "scouting" }, "load league names for assignments", e); return { results: [] }; });
    for (const l of lRows.results ?? []) {
      leagueNames.set(l.id, l.name);
    }
  }

  const enrichAssignment = (a: typeof assignments[0]) => ({
    ...a,
    positions: assignmentPositions(a),
    targetPlayerName: a.target_player_id ? playerNames.get(a.target_player_id) ?? null : null,
    targetTeamName: a.target_team_id ? teamNames.get(a.target_team_id) ?? null : null,
    targetLeagueName: a.target_league_id ? leagueNames.get(a.target_league_id) ?? null : null,
  });

  const scoutList = allScouts.map((s) => {
    const asgn = assignments.find((a) => a.staff_id === s.id);
    return {
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      avatar: parseAvatar(s.avatar),
      eff: Math.round(scoutEffectiveness(s) * 10) / 10,
      judgement: s.judgement,
      communication: s.communication,
      assignment: asgn ? enrichAssignment(asgn) : null,
    };
  });

  const last = assignment ? null : await db.prepare(
    "SELECT * FROM scout_assignments WHERE team_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(teamId).first<Record<string, unknown>>();
  const active = await db.prepare(
    `SELECT ${REPORT_COLS} FROM scout_reports WHERE team_id = ? AND status IN ('active','negotiating') ORDER BY created_at DESC`,
  ).bind(teamId).all<ReportRow>();
  const older = await db.prepare(
    `SELECT ${REPORT_COLS} FROM scout_reports WHERE team_id = ? AND status NOT IN ('active','negotiating') ORDER BY created_at DESC LIMIT 15`,
  ).bind(teamId).all<ReportRow>();

  // Soupeři v lize pro možnost taktického rozboru
  const leagueOpponents = await db.prepare(
    `SELECT t.id, t.name, t.city FROM teams t
     WHERE t.league_id = (SELECT league_id FROM teams WHERE id = ?)
       AND t.id != ?
     ORDER BY t.name ASC`,
  ).bind(teamId, teamId).all<{ id: string; name: string; city: string | null }>()
    .catch((e) => { logger.warn({ module: "scouting" }, "load league opponents", e); return { results: [] }; });

  // Načíst ligy klubu (senior a U21)
  const seniorLeague = await db.prepare(
    `SELECT l.id, l.name, l.district FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.id = ?`
  ).bind(teamId).first<{ id: string; name: string; district: string }>()
    .catch((e) => { logger.warn({ module: "scouting" }, "load senior league", e); return null; });

  const u21League = await db.prepare(
    `SELECT l.id, l.name, l.district FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.parent_team_id = ? AND t.team_type = 'u21'`
  ).bind(teamId).first<{ id: string; name: string; district: string }>()
    .catch((e) => { logger.warn({ module: "scouting" }, "load u21 league", e); return null; });

  return c.json({
    scouts: scoutList,
    maxScouts,
    coachLicence,
    scout: scout ? { id: scout.id, name: `${scout.first_name} ${scout.last_name}`, avatar: parseAvatar(scout.avatar), eff: Math.round(scoutEffectiveness(scout) * 10) / 10 } : null,
    assignment: assignment ? enrichAssignment(assignment) : null,
    opponents: leagueOpponents.results ?? [],
    leagues: {
      senior: seniorLeague ? { id: seniorLeague.id, name: seniorLeague.name } : null,
      u21: u21League ? { id: u21League.id, name: u21League.name } : null,
    },
    lastAssignment: last,
    options: {
      radiusTiers: SCOUT_RADIUS_TIERS, weeks: SCOUT_WEEKS_OPTIONS, ageMin: SCOUT_AGE_MIN, ageMax: SCOUT_AGE_MAX,
      youthAgeMax: SCOUT_YOUTH_AGE_MAX,
    },
    reports: active.results.map(reportView),
    pastReports: older.results.map(reportView),
  });
});

scoutingRouter.post("/teams/:teamId/scout/assignment", async (c) => {
  const teamId = c.req.param("teamId");
  const clubId = await club(c, teamId);
  if (typeof clubId !== "string") return clubId;
  const body = (await c.req.json().catch(() => ({}))) as {
    staffId?: string;
    type?: "area" | "player" | "match" | "u21_league" | "league";
    assignmentType?: "area" | "player" | "match" | "u21_league" | "league";
    targetPlayerId?: string;
    targetTeamId?: string;
    targetMatchId?: string;
    targetLeagueId?: string;
    positions?: unknown[] | null;
    position?: string | null;
    ageMin?: number;
    ageMax?: number;
    radiusKm?: number;
    weeks?: number;
  };

  const gameDate = await gameDateOf(c.env.DB, clubId);
  const type = body.type ?? body.assignmentType ?? "area";

  if (type === "player" && body.targetPlayerId) {
    const res = await createPlayerScoutAssignment(c.env.DB, {
      teamId: clubId, staffId: body.staffId, targetPlayerId: body.targetPlayerId, gameDate,
    });
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ ok: true, id: res.id });
  }

  if (type === "match" && body.targetTeamId) {
    const res = await createMatchScoutAssignment(c.env.DB, {
      teamId: clubId, staffId: body.staffId, targetTeamId: body.targetTeamId, targetMatchId: body.targetMatchId, gameDate,
    });
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ ok: true, id: res.id });
  }

  const positions = Array.isArray(body.positions) ? body.positions : body.position ? [body.position] : null;

  if (type === "u21_league" || type === "league") {
    const res = await createLeagueScoutAssignment(c.env.DB, {
      teamId: clubId, staffId: body.staffId, assignmentType: type, targetLeagueId: body.targetLeagueId,
      positions, weeks: Number(body.weeks ?? 4), gameDate,
    });
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ ok: true, id: res.id });
  }

  // Default: plošné hledání v okruhu
  const res = await createScoutAssignment(c.env.DB, {
    teamId: clubId, staffId: body.staffId, positions, ageMin: Number(body.ageMin), ageMax: Number(body.ageMax),
    radiusKm: Number(body.radiusKm), weeks: Number(body.weeks), gameDate,
  });
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, id: res.id });
});

scoutingRouter.delete("/teams/:teamId/scout/assignment", async (c) => {
  const teamId = c.req.param("teamId");
  const clubId = await club(c, teamId);
  if (typeof clubId !== "string") return clubId;
  const staffId = c.req.query("staffId") || (await c.req.json().catch(() => ({} as { staffId?: string }))).staffId;
  const done = await cancelScoutAssignment(c.env.DB, clubId, "manager", staffId);
  if (!done) return c.json({ error: "Skaut teď žádný úkol nemá." }, 409);
  return c.json({ ok: true });
});

scoutingRouter.get("/teams/:teamId/scout/reports/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const r = await c.env.DB.prepare(`SELECT ${REPORT_COLS} FROM scout_reports WHERE id = ? AND team_id = ?`)
    .bind(c.req.param("id"), teamId).first<ReportRow>();
  if (!r) return c.json({ error: "Hlášení nenalezeno" }, 404);
  const view = reportView(r);

  // Ochota se přepočítá čerstvě: mezitím se mohl změnit kádr, trenér nebo reputace.
  if (r.status === "active" || r.status === "negotiating") {
    const coords = r.village_id
      ? await c.env.DB.prepare("SELECT lat, lng FROM villages WHERE id = ?").bind(r.village_id).first<{ lat: number; lng: number }>()
      : null;
    try {
      const chance = await estimateWillingness(c.env.DB, teamId, JSON.parse(r.player_data) as VirtualPlayerData, r.district, coords, r.club_mean);
      if (chance != null) {
        // Ochotu vidíš očima skauta: slabší se může o stupeň splést.
        const scout = await loadTeamScout(c.env.DB, teamId);
        const level = blurredWillingness(willingnessFromChance(chance), scout ? scoutEffectiveness(scout) : 0, r.visits, r.id);
        view.willingness = { level, label: SCOUT_WILLINGNESS_LABELS[level] };
      }
    } catch (e) {
      logger.warn({ module: "scouting" }, "čerstvá ochota hráče", e);
    }
  }
  const assignment = await loadActiveAssignment(c.env.DB, teamId);
  return c.json({
    report: view,
    revisit: {
      available: !!assignment && !assignment.revisit_report_id && (r.status === "active" || r.status === "negotiating"),
      planned: assignment?.revisit_report_id === r.id,
      hasAssignment: !!assignment,
    },
  });
});

scoutingRouter.post("/teams/:teamId/scout/reports/:id/revisit", async (c) => {
  const teamId = c.req.param("teamId");
  const clubId = await club(c, teamId);
  if (typeof clubId !== "string") return clubId;
  const res = await requestRevisit(c.env.DB, clubId, c.req.param("id"));
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true });
});

scoutingRouter.post("/teams/:teamId/scout/reports/:id/dismiss", async (c) => {
  const teamId = c.req.param("teamId");
  const clubId = await club(c, teamId);
  if (typeof clubId !== "string") return clubId;
  const res = await c.env.DB.prepare(
    "UPDATE scout_reports SET status = 'dismissed', resolved_at = ? WHERE id = ? AND team_id = ? AND status = 'active'",
  ).bind(new Date().toISOString(), c.req.param("id"), clubId).run();
  if ((res.meta?.changes ?? 0) === 0) return c.json({ error: "Hlášení už neplatí." }, 409);
  return c.json({ ok: true });
});

scoutingRouter.post("/teams/:teamId/scout/reports/:id/negotiate", async (c) => {
  const teamId = c.req.param("teamId");
  const clubId = await club(c, teamId);
  if (typeof clubId !== "string") return clubId;
  const body = await c.req.json<{ amount?: number; upfrontPct?: number; installments?: number; targetSquad?: "senior" | "u21" }>();
  const res = await startAiNegotiation(c.env.DB, {
    buyerClubTeamId: clubId, source: "scout_report", sourceId: c.req.param("id"),
    terms: { amount: Number(body.amount), upfrontPct: body.upfrontPct ?? 100, installments: body.installments ?? 0, sellOnPct: 0 },
    targetSquad: body.targetSquad,
  });
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, negotiationId: res.negotiationId, existing: res.existing ?? false });
});

// Testování: skaut odpracuje týden hned (bez čekání na pondělí), případně údržba hlášení.
scoutingRouter.post("/admin/scout/run", async (c) => {
  const teamId = c.req.query("teamId") || undefined;
  const gameDate = teamId ? await gameDateOf(c.env.DB, teamId) : new Date().toISOString();
  const work = await runScoutWork(c.env, { gameDate, teamId, force: c.req.query("force") === "1" });
  const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT };
  const maintenance = c.req.query("maintain") === "1" ? await maintainScoutReports(c.env.DB, pushEnv) : null;
  return c.json({ ok: true, work, maintenance });
});
