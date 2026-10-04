/**
 * Jednání s cizími kluby o přestupu (Přestupy → Nabídky → Jednání s cizími kluby).
 * Logika žije v transfers/ai-negotiation.ts, tady je jen HTTP vrstva.
 */

import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { requireAdmin, requireOwnedTeamRead, requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { resolveClubTeamId } from "../transfers/offer-club-scope";
import {
  counterAiNegotiation, estimateWillingness, expireAiNegotiations, negotiationOnTurn, revealDueAiReplies,
  signAiNegotiation, termsOf, withdrawAiNegotiation, SQUAD_CAP, type AiNegotiationRow, type PushEnv,
} from "../transfers/ai-negotiation";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";
import { transferSchedule, willingnessFromChance, SCOUT_WILLINGNESS_LABELS, type TransferTerms } from "@okresni-masina/shared";

export const negotiationsRouter = new Hono<{ Bindings: Bindings }>();

negotiationsRouter.use("/teams/:teamId/*", requireTeamOwnership);
negotiationsRouter.use("/admin/negotiations/*", requireAdmin);

function pushEnv(env: Bindings): PushEnv {
  return { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT };
}

/** Jedná klub (áčko), ne dorost — stejně jako na trhu. */
async function buyerClub(c: Context<{ Bindings: Bindings }>, teamId: string): Promise<string | Response> {
  const club = await resolveClubTeamId(c.env.DB, teamId) ?? teamId;
  if (club !== teamId) return c.json({ error: "Jedná klub, ne dorost." }, 400);
  return club;
}

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch (e) {
    logger.warn({ module: "negotiations" }, "parse JSON", e);
    return fallback;
  }
}

const blur5 = (v: number) => Math.round(v / 5) * 5;

interface ListRow extends AiNegotiationRow {
  listing_data: string | null;
  report_data: string | null;
  rating_lo: number | null;
  rating_hi: number | null;
}

function summary(row: ListRow) {
  const data = parse<Partial<VirtualPlayerData>>(row.listing_data ?? row.report_data, {});
  const exact = row.listing_data ? data.overallRating ?? null : null;
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    playerName: row.player_name,
    position: row.player_position,
    age: row.player_age,
    avatar: data.avatar ?? {},
    ratingLo: exact ?? row.rating_lo,
    ratingHi: exact ?? row.rating_hi,
    clubName: row.club_name,
    clubCity: row.club_city,
    terms: termsOf(row),
    lastActionBy: row.last_action_by,
    waiting: !!row.pending_reply,
    onTurn: negotiationOnTurn(row),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    playerId: row.player_id,
  };
}

const LIST_SQL = `
  SELECT n.*, tl.ai_player_data AS listing_data, sr.player_data AS report_data, sr.rating_lo, sr.rating_hi
    FROM ai_negotiations n
    LEFT JOIN transfer_listings tl ON tl.id = n.listing_id
    LEFT JOIN scout_reports sr ON sr.id = n.scout_report_id`;

negotiationsRouter.get("/teams/:teamId/negotiations", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  await revealDueAiReplies(c.env.DB, pushEnv(c.env), { teamId })
    .catch((e) => logger.warn({ module: "negotiations" }, "doručení odpovědí při čtení", e));

  const active = await c.env.DB.prepare(`${LIST_SQL} WHERE n.team_id = ? AND n.status IN ('open','agreed') ORDER BY n.created_at DESC`)
    .bind(teamId).all<ListRow>();
  const closed = await c.env.DB.prepare(`${LIST_SQL} WHERE n.team_id = ? AND n.status NOT IN ('open','agreed') ORDER BY COALESCE(n.resolved_at, n.created_at) DESC LIMIT 20`)
    .bind(teamId).all<ListRow>();
  return c.json({ active: active.results.map(summary), closed: closed.results.map(summary) });
});

negotiationsRouter.get("/teams/:teamId/negotiations/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const id = c.req.param("id");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  await revealDueAiReplies(c.env.DB, pushEnv(c.env), { negotiationId: id })
    .catch((e) => logger.warn({ module: "negotiations" }, "doručení odpovědi při čtení", e));

  const row = await c.env.DB.prepare(`${LIST_SQL} WHERE n.id = ?`).bind(id).first<ListRow>();
  if (!row || row.team_id !== teamId) return c.json({ error: "Jednání nenalezeno" }, 404);

  const report = row.scout_report_id
    ? await c.env.DB.prepare(
      `SELECT sr.potential_lo, sr.potential_hi, sr.distance_km, sr.club_mean, sr.district, v.lat, v.lng
         FROM scout_reports sr LEFT JOIN villages v ON v.id = sr.village_id WHERE sr.id = ?`,
    ).bind(row.scout_report_id).first<{ potential_lo: number | null; potential_hi: number | null; distance_km: number; club_mean: number | null; district: string | null; lat: number | null; lng: number | null }>()
    : null;
  const data = parse<Partial<VirtualPlayerData>>(row.listing_data ?? row.report_data, {});

  const team = await c.env.DB.prepare(
    `SELECT id, name, primary_color, secondary_color, badge_pattern, badge_symbol, badge_initials, badge_primary_color,
            badge_secondary_color, budget, reputation FROM teams WHERE id = ?`,
  ).bind(teamId).first<Record<string, unknown>>();
  const manager = await c.env.DB.prepare(
    "SELECT id, name, avatar, coaching, motivation, tactics, reputation FROM managers WHERE team_id = ? LIMIT 1",
  ).bind(teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "negotiations" }, "trenér pro jednání", e); return null; });
  const squad = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM players WHERE team_id = ?").bind(teamId).first<{ n: number }>();
  const events = await c.env.DB.prepare(
    `SELECT id, actor, event_type, amount, upfront_pct, installments, message, created_at
       FROM ai_negotiation_events WHERE negotiation_id = ? ORDER BY created_at ASC, id ASC`,
  ).bind(id).all<Record<string, unknown>>();

  // Ochota hráče: jen u běžícího jednání, u uzavřeného už rozhodl.
  let willingness: { level: number; label: string } | null = null;
  if ((row.status === "open" || row.status === "agreed") && data.firstName) {
    let coords: { lat: number; lng: number } | null = report?.lat != null && report?.lng != null ? { lat: report.lat, lng: report.lng } : null;
    if (!coords && data.fromCity) {
      coords = await c.env.DB.prepare("SELECT lat, lng FROM villages WHERE name = ? OR name LIKE ? LIMIT 1")
        .bind(data.fromCity, `${data.fromCity}%`).first<{ lat: number; lng: number }>()
        .catch((e) => { logger.warn({ module: "negotiations" }, "souřadnice města klubu", e); return null; });
    }
    const chance = await estimateWillingness(c.env.DB, teamId, data as VirtualPlayerData, row.club_district, coords,
      report?.club_mean ?? null, row.listing_id ? 65 : undefined)
      .catch((e) => { logger.warn({ module: "negotiations" }, "odhad ochoty", e); return null; });
    if (chance != null) {
      const level = willingnessFromChance(chance);
      willingness = { level, label: SCOUT_WILLINGNESS_LABELS[level] };
    }
  }

  const terms: TransferTerms = termsOf(row);
  const payNow = transferSchedule(terms).upfront;
  const exact = row.listing_id ? data.overallRating ?? null : null;
  return c.json({
    negotiation: {
      ...summary(row),
      stance: row.stance,
      targetSquad: row.target_squad,
      clubDistrict: row.club_district,
      listingId: row.listing_id,
      scoutReportId: row.scout_report_id,
    },
    player: {
      firstName: data.firstName ?? row.player_name, lastName: data.lastName ?? "",
      age: row.player_age, position: row.player_position, nationality: data.nationality ?? "CZ",
      avatar: data.avatar ?? {},
      ratingLo: exact ?? row.rating_lo, ratingHi: exact ?? row.rating_hi,
      potentialLo: report?.potential_lo ?? null, potentialHi: report?.potential_hi ?? null,
      // Dovednosti cizího hráče jen zaokrouhlené na pětky (jako na trhu), z hlášení vůbec.
      skills: row.listing_id && data.skills
        ? Object.fromEntries(Object.entries(data.skills).map(([k, v]) => [k, typeof v === "number" ? blur5(v) : v]))
        : null,
      distanceKm: report?.distance_km ?? null,
      willingness,
    },
    myTeam: team ? {
      id: team.id, name: team.name,
      primary_color: team.badge_primary_color ?? team.primary_color,
      secondary_color: team.badge_secondary_color ?? team.secondary_color,
      badge_pattern: team.badge_pattern, badge_symbol: team.badge_symbol, initials: team.badge_initials,
      budget: team.budget, reputation: team.reputation,
    } : null,
    manager: manager ? { ...manager, avatar: parse(manager.avatar as string | null, {}) } : null,
    events: events.results,
    payNow,
    canAfford: ((team?.budget as number | undefined) ?? 0) >= payNow,
    squadCount: squad?.n ?? 0,
    squadCap: SQUAD_CAP,
  });
});

function readTerms(body: { amount?: number; upfrontPct?: number; installments?: number }): TransferTerms {
  return { amount: Number(body.amount), upfrontPct: body.upfrontPct ?? 100, installments: body.installments ?? 0, sellOnPct: 0 };
}

negotiationsRouter.post("/teams/:teamId/negotiations/:id/offer", async (c) => {
  const teamId = c.req.param("teamId");
  const club = await buyerClub(c, teamId);
  if (typeof club !== "string") return club;
  const body = await c.req.json<{ amount?: number; upfrontPct?: number; installments?: number }>();
  const res = await counterAiNegotiation(c.env.DB, { negotiationId: c.req.param("id"), buyerClubTeamId: club, terms: readTerms(body) });
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true });
});

negotiationsRouter.post("/teams/:teamId/negotiations/:id/sign", async (c) => {
  const teamId = c.req.param("teamId");
  const club = await buyerClub(c, teamId);
  if (typeof club !== "string") return club;
  const res = await signAiNegotiation(c.env.DB, pushEnv(c.env), { negotiationId: c.req.param("id"), buyerClubTeamId: club });
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json(res);
});

negotiationsRouter.delete("/teams/:teamId/negotiations/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const club = await buyerClub(c, teamId);
  if (typeof club !== "string") return club;
  const res = await withdrawAiNegotiation(c.env.DB, { negotiationId: c.req.param("id"), buyerClubTeamId: club });
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true });
});

// Testování: doručí odpovědi klubů hned, bez čekání na prodlevu.
negotiationsRouter.post("/admin/negotiations/reveal", async (c) => {
  const force = c.req.query("force") === "1";
  const delivered = await revealDueAiReplies(c.env.DB, pushEnv(c.env), {
    force, negotiationId: c.req.query("id") || undefined, teamId: c.req.query("teamId") || undefined,
  });
  const expired = await expireAiNegotiations(c.env.DB, pushEnv(c.env));
  return c.json({ ok: true, delivered, expired });
});
