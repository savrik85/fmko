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
  willingnessFromChance,
} from "@okresni-masina/shared";
import {
  cancelScoutAssignment, createScoutAssignment, loadActiveAssignment, loadTeamScout, maintainScoutReports, requestRevisit,
  runScoutWork, scoutEffectiveness,
} from "../scouting/scout-work";
import { estimateWillingness, startAiNegotiation } from "../transfers/ai-negotiation";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";
import { blurredWillingness } from "../scouting/fog";

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
  const scout = await loadTeamScout(db, teamId);
  const assignment = await loadActiveAssignment(db, teamId);
  const last = assignment ? null : await db.prepare(
    "SELECT * FROM scout_assignments WHERE team_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(teamId).first<Record<string, unknown>>();
  const active = await db.prepare(
    `SELECT ${REPORT_COLS} FROM scout_reports WHERE team_id = ? AND status IN ('active','negotiating') ORDER BY created_at DESC`,
  ).bind(teamId).all<ReportRow>();
  const older = await db.prepare(
    `SELECT ${REPORT_COLS} FROM scout_reports WHERE team_id = ? AND status NOT IN ('active','negotiating') ORDER BY created_at DESC LIMIT 15`,
  ).bind(teamId).all<ReportRow>();

  return c.json({
    scout: scout ? { id: scout.id, name: `${scout.first_name} ${scout.last_name}`, eff: Math.round(scoutEffectiveness(scout) * 10) / 10 } : null,
    assignment,
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
  const body = await c.req.json<{ position?: string | null; ageMin?: number; ageMax?: number; radiusKm?: number; weeks?: number }>();
  const res = await createScoutAssignment(c.env.DB, {
    teamId: clubId, position: body.position ?? null, ageMin: Number(body.ageMin), ageMax: Number(body.ageMax),
    radiusKm: Number(body.radiusKm), weeks: Number(body.weeks), gameDate: await gameDateOf(c.env.DB, clubId),
  });
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, id: res.id });
});

scoutingRouter.delete("/teams/:teamId/scout/assignment", async (c) => {
  const teamId = c.req.param("teamId");
  const clubId = await club(c, teamId);
  if (typeof clubId !== "string") return clubId;
  const done = await cancelScoutAssignment(c.env.DB, clubId, "manager");
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
