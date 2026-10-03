/**
 * Smluvní závazky klubu (Přestupy → Závazky) a hráče (profil, prodejní dialogy).
 *
 * Splátky přestupů, procenta z příštího přestupu a hostování na jednom místě. Závazky
 * hráče vidí jen strany obchodu, cizímu klubu se neukazují.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireOwnedTeamRead } from "../auth/middleware";
import { logger } from "../lib/logger";

export const obligationsRouter = new Hono<{ Bindings: Bindings }>();

interface DealRow {
  id: string; player_id: string; player_name: string; other_team_id: string; other_team_name: string | null;
  total_amount: number; upfront_amount: number; installment_amount: number;
  installments_total: number; installments_paid: number; remaining: number;
  buyer_game_date: string | null;
}
interface ClauseRow { id: string; player_id: string; player_name: string; other_team_id: string; other_team_name: string | null; pct: number }

export interface Deal {
  id: string; playerId: string; playerName: string; otherTeamId: string; otherTeamName: string;
  totalAmount: number; upfrontAmount: number; installmentAmount: number;
  installmentsTotal: number; installmentsPaid: number; remaining: number;
  /** Kolik se strhne příští pondělí. */
  nextPayment: number;
  /** Datum příštího pondělí podle herního data kupujícího (YYYY-MM-DD). */
  nextDue: string | null;
}
export interface Clause { id: string; playerId: string; playerName: string; otherTeamId: string; otherTeamName: string; pct: number }

/** Příští pondělí po herním datu (splátka v pondělí už proběhla, další je za týden). */
function nextMonday(gameDate: string | null): string | null {
  if (!gameDate) return null;
  const d = new Date(gameDate);
  if (Number.isNaN(d.getTime())) return null;
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

function toDeal(r: DealRow): Deal {
  const isLast = r.installments_paid + 1 >= r.installments_total;
  return {
    id: r.id, playerId: r.player_id, playerName: r.player_name,
    otherTeamId: r.other_team_id, otherTeamName: r.other_team_name ?? "neznámý klub",
    totalAmount: r.total_amount, upfrontAmount: r.upfront_amount, installmentAmount: r.installment_amount,
    installmentsTotal: r.installments_total, installmentsPaid: r.installments_paid, remaining: r.remaining,
    nextPayment: isLast ? r.remaining : Math.min(r.remaining, r.installment_amount),
    nextDue: nextMonday(r.buyer_game_date),
  };
}

function toClause(r: ClauseRow): Clause {
  return { id: r.id, playerId: r.player_id, playerName: r.player_name, otherTeamId: r.other_team_id, otherTeamName: r.other_team_name ?? "neznámý klub", pct: r.pct };
}

const DEAL_COLUMNS = `d.id, d.player_id, d.player_name, d.total_amount, d.upfront_amount, d.installment_amount,
  d.installments_total, d.installments_paid, d.remaining, buyer.game_date AS buyer_game_date`;

async function deals(db: D1Database, side: "buyer" | "seller", teamId: string, playerId?: string): Promise<Deal[]> {
  const mine = side === "buyer" ? "d.buyer_team_id" : "d.seller_team_id";
  const other = side === "buyer" ? "d.seller_team_id" : "d.buyer_team_id";
  const rows = await db.prepare(
    `SELECT ${DEAL_COLUMNS}, ${other} AS other_team_id, COALESCE(o.name, d.seller_name) AS other_team_name
       FROM transfer_installments d
       JOIN teams buyer ON buyer.id = d.buyer_team_id
       LEFT JOIN teams o ON o.id = ${other}
      WHERE ${mine} = ? AND d.status = 'active'${playerId ? " AND d.player_id = ?" : ""}
      ORDER BY d.created_at`,
  ).bind(...(playerId ? [teamId, playerId] : [teamId])).all<DealRow>()
    .catch((e) => { logger.warn({ module: "obligations" }, `load ${side} deals`, e); return { results: [] as DealRow[] }; });
  return rows.results.map(toDeal);
}

async function clauses(db: D1Database, side: "owner" | "beneficiary", teamId: string, playerId?: string): Promise<Clause[]> {
  const mine = side === "owner" ? "c.owner_team_id" : "c.beneficiary_team_id";
  const other = side === "owner" ? "c.beneficiary_team_id" : "c.owner_team_id";
  const rows = await db.prepare(
    `SELECT c.id, c.player_id, c.player_name, c.pct, ${other} AS other_team_id, o.name AS other_team_name
       FROM sell_on_clauses c
       LEFT JOIN teams o ON o.id = ${other}
      WHERE ${mine} = ? AND c.status = 'active'${playerId ? " AND c.player_id = ?" : ""}
      ORDER BY c.created_at`,
  ).bind(...(playerId ? [teamId, playerId] : [teamId])).all<ClauseRow>()
    .catch((e) => { logger.warn({ module: "obligations" }, `load ${side} clauses`, e); return { results: [] as ClauseRow[] }; });
  return rows.results.map(toClause);
}

interface LoanRow { player_id: string; first_name: string; last_name: string; other_team_id: string | null; other_team_name: string | null; loan_until: string | null; fee: number | null }

async function loans(db: D1Database, teamId: string, direction: "out" | "in") {
  const where = direction === "out"
    ? "p.loan_from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)"
    : "p.team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?) AND p.loan_from_team_id IS NOT NULL";
  const otherCol = direction === "out" ? "p.team_id" : "p.loan_from_team_id";
  const rows = await db.prepare(
    `SELECT p.id AS player_id, p.first_name, p.last_name, COALESCE(ot.parent_team_id, ot.id) AS other_team_id,
            COALESCE(otp.name, ot.name) AS other_team_name, p.loan_until,
            (SELECT pc.fee FROM player_contracts pc WHERE pc.player_id = p.id AND pc.join_type = 'loan' AND pc.is_active = 1 LIMIT 1) AS fee
       FROM players p
       LEFT JOIN teams ot ON ot.id = ${otherCol}
       LEFT JOIN teams otp ON otp.id = ot.parent_team_id
      WHERE ${where}
      ORDER BY p.loan_until`,
  ).bind(teamId, teamId).all<LoanRow>()
    .catch((e) => { logger.warn({ module: "obligations" }, `load loans ${direction}`, e); return { results: [] as LoanRow[] }; });
  return rows.results.map((r) => ({
    playerId: r.player_id, playerName: `${r.first_name} ${r.last_name}`,
    otherTeamId: r.other_team_id, otherTeamName: r.other_team_name ?? "neznámý klub",
    until: r.loan_until, fee: r.fee ?? 0,
  }));
}

// GET /api/teams/:teamId/obligations — všechny smluvní závazky klubu
obligationsRouter.get("/teams/:teamId/obligations", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const db = c.env.DB;

  const [paying, receiving, sellOnOwed, sellOnClaims, loansOut, loansIn] = await Promise.all([
    deals(db, "buyer", teamId), deals(db, "seller", teamId),
    clauses(db, "owner", teamId), clauses(db, "beneficiary", teamId),
    loans(db, teamId, "out"), loans(db, teamId, "in"),
  ]);
  const sum = (list: Deal[], key: "nextPayment" | "remaining") => list.reduce((s, d) => s + d[key], 0);
  return c.json({
    paying, receiving, sellOnOwed, sellOnClaims, loansOut, loansIn,
    totals: {
      payThisWeek: sum(paying, "nextPayment"),
      receiveThisWeek: sum(receiving, "nextPayment"),
      owedTotal: sum(paying, "remaining"),
      receivableTotal: sum(receiving, "remaining"),
    },
  });
});

// GET /api/teams/:teamId/players/:playerId/obligations — závazky k jednomu hráči z pohledu klubu
obligationsRouter.get("/teams/:teamId/players/:playerId/obligations", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const db = c.env.DB;

  const [paying, receiving, sellOnOwed, sellOnClaim] = await Promise.all([
    deals(db, "buyer", teamId, playerId), deals(db, "seller", teamId, playerId),
    clauses(db, "owner", teamId, playerId), clauses(db, "beneficiary", teamId, playerId),
  ]);
  return c.json({
    paying: paying[0] ?? null,
    receiving: receiving[0] ?? null,
    sellOnOwed: sellOnOwed[0] ?? null,
    sellOnClaim: sellOnClaim[0] ?? null,
  });
});
