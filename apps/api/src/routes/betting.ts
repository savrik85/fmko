/**
 * Sázková kancelář — HTTP rozhraní.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireTeamOwnership, requireAdmin } from "../auth/middleware";
import { getSession, getTokenFromRequest } from "../auth/session";
import { generateBoard, nextOpenRound } from "../betting/board";
import { placeTicket, limitsFor, canBet, type SelectionInput } from "../betting/tickets";
import { settleRound } from "../betting/settle";

const M = "betting";
const bettingRouter = new Hono<{ Bindings: Bindings }>();

bettingRouter.use("/teams/:teamId/bets/*", requireTeamOwnership);
bettingRouter.use("/teams/:teamId/bets", requireTeamOwnership);
bettingRouter.use("/admin/betting/*", requireAdmin);

/**
 * Patří klub přihlášenému uživateli?
 *
 * requireTeamOwnership vědomě propouští GET, takže bez téhle kontroly by si
 * cizí tikety přečetl každý, kdo opíše teamId z URL. Vzor z routes/competition.ts.
 */
async function ownsTeam(c: { env: Bindings; req: Request }, teamId: string): Promise<boolean> {
  const token = getTokenFromRequest(c as never);
  if (!token) return false;
  const session = await getSession(c.env.SESSION_KV, token)
    .catch((e) => { logger.warn({ module: M }, "načtení session", e); return null; });
  if (!session) return false;
  const own = await c.env.DB.prepare("SELECT id FROM teams WHERE id = ? AND user_id = ?")
    .bind(teamId, session.userId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "ověření vlastnictví klubu", e); return null; });
  return !!own;
}

interface TeamMeta {
  league_id: string | null;
  game_date: string | null;
  budget: number;
  user_id: string;
}

async function teamMeta(db: D1Database, teamId: string): Promise<TeamMeta | null> {
  return await db.prepare(
    "SELECT league_id, game_date, budget, user_id FROM teams WHERE id = ?"
  ).bind(teamId).first<TeamMeta>()
    .catch((e) => { logger.warn({ module: M }, `metadata klubu ${teamId}`, e); return null; });
}

// ── Kurzový lístek ──────────────────────────────────────────────────────────

/**
 * Lístek nejbližšího kola. Vlastní zápas se vrací také, ale označený —
 * skrýt ho by znamenalo, že hráč nechápe, proč v kole chybí zápas.
 */
bettingRouter.get("/teams/:teamId/bets/board", async (c) => {
  const teamId = c.req.param("teamId");
  const meta = await teamMeta(c.env.DB, teamId);
  if (!meta?.league_id) return c.json({ open: false, closedReason: "no_league" });

  const round = await nextOpenRound(c.env.DB, meta.league_id);
  if (!round) return c.json({ open: false, closedReason: "no_round" });

  // Kurzy se generují líně: první pohled na lístek je vypíše. UPSERT na
  // UNIQUE(match_id, market, selection) zajistí, že souběžné požadavky
  // nevyrobí dvě sady.
  const existuje = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM bet_odds WHERE calendar_id = ?"
  ).bind(round.calendar_id).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "kontrola lístku", e); return null; });

  if ((existuje?.n ?? 0) === 0) {
    await generateBoard(c.env.DB, meta.league_id, meta.game_date ?? new Date().toISOString())
      .catch((e) => logger.error({ module: M }, `generování lístku ligy ${meta.league_id}`, e));
  }

  const [odds, zapasy, limity, povoleno] = await Promise.all([
    c.env.DB.prepare(
      `SELECT match_id, market, selection, odds_x100, label
         FROM bet_odds WHERE calendar_id = ? ORDER BY market, odds_x100`
    ).bind(round.calendar_id).all<{
      match_id: string; market: string; selection: string; odds_x100: number; label: string;
    }>().catch((e) => { logger.error({ module: M }, "načtení kurzů", e); return { results: [] }; }),

    c.env.DB.prepare(
      `SELECT m.id, m.home_team_id, m.away_team_id,
              h.name AS home_name, h.primary_color AS home_color,
              a.name AS away_name, a.primary_color AS away_color
         FROM matches m
         JOIN teams h ON h.id = m.home_team_id
         JOIN teams a ON a.id = m.away_team_id
        WHERE m.calendar_id = ?`
    ).bind(round.calendar_id).all<{
      id: string; home_team_id: string; away_team_id: string;
      home_name: string; home_color: string; away_name: string; away_color: string;
    }>().catch((e) => { logger.error({ module: M }, "zápasy kola", e); return { results: [] }; }),

    limitsFor(c.env.DB, meta.league_id, round.season_number),
    canBet(c.env.DB, teamId, meta.league_id, round.season_number, round.game_week),
  ]);

  // Vlastní zápasy — přes user_id, aby to pokrylo i rezervu.
  const moje = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id = ?"
  ).bind(meta.user_id).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "vlastní týmy", e); return { results: [] }; });
  const mojeIds = new Set(moje.results.map((r) => r.id));

  const podleZapasu = new Map<string, typeof odds.results>();
  for (const o of odds.results) {
    const arr = podleZapasu.get(o.match_id) ?? [];
    arr.push(o);
    podleZapasu.set(o.match_id, arr);
  }

  const podano = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM bet_tickets WHERE team_id = ? AND calendar_id = ? AND status <> 'void'"
  ).bind(teamId, round.calendar_id).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet tiketů", e); return null; });

  return c.json({
    open: true,
    calendarId: round.calendar_id,
    gameWeek: round.game_week,
    scheduledAt: round.scheduled_at,
    seasonNumber: round.season_number,
    canBet: povoleno.ok,
    blockedReason: povoleno.ok ? null : povoleno.reason,
    budget: meta.budget,
    ticketsLeft: Math.max(0, limity.ticketsPerRound - (podano?.n ?? 0)),
    limits: limity,
    matches: zapasy.results.map((m) => {
      const vlastni = mojeIds.has(m.home_team_id) || mojeIds.has(m.away_team_id);
      const k = podleZapasu.get(m.id) ?? [];
      return {
        matchId: m.id,
        home: { id: m.home_team_id, name: m.home_name, color: m.home_color },
        away: { id: m.away_team_id, name: m.away_name, color: m.away_color },
        ownMatch: vlastni,
        markets: vlastni ? null : {
          result: k.filter((x) => x.market === "1x2")
            .map((x) => ({ selection: x.selection, label: x.label, oddsX100: x.odds_x100 })),
          totals: k.filter((x) => x.market === "totals")
            .map((x) => ({ selection: x.selection, label: x.label, oddsX100: x.odds_x100 })),
          scorers: k.filter((x) => x.market === "scorer")
            .map((x) => ({ selection: x.selection, label: x.label, oddsX100: x.odds_x100 })),
        },
      };
    }),
  });
});

// ── Tikety ──────────────────────────────────────────────────────────────────

bettingRouter.get("/teams/:teamId/bets", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await ownsTeam(c as never, teamId))) return c.json({ error: "Cizí klub" }, 403);

  const tikety = await c.env.DB.prepare(
    `SELECT t.id, t.stake, t.levy, t.total_odds_x100, t.potential_payout, t.capped,
            t.payout, t.status, t.placed_game_date, t.settled_game_date, t.seen_at,
            sc.game_week
       FROM bet_tickets t
       LEFT JOIN season_calendar sc ON sc.id = t.calendar_id
      WHERE t.team_id = ? AND t.status <> 'pending'
      ORDER BY t.created_at DESC LIMIT 40`
  ).bind(teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, `tikety klubu ${teamId}`, e); return { results: [] }; });

  const ids = tikety.results.map((t) => t.id as string);
  const legs = ids.length === 0 ? { results: [] } : await c.env.DB.prepare(
    `SELECT s.ticket_id, s.match_id, s.market, s.selection, s.odds_x100, s.label, s.result,
            m.home_score, m.away_score, h.name AS home_name, a.name AS away_name
       FROM bet_selections s
       JOIN matches m ON m.id = s.match_id
       JOIN teams h ON h.id = m.home_team_id
       JOIN teams a ON a.id = m.away_team_id
      WHERE s.ticket_id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, "tipy tiketů", e); return { results: [] }; });

  const podleTiketu = new Map<string, Array<Record<string, unknown>>>();
  for (const l of legs.results) {
    const arr = podleTiketu.get(l.ticket_id as string) ?? [];
    arr.push(l);
    podleTiketu.set(l.ticket_id as string, arr);
  }

  const bilance = await c.env.DB.prepare(
    `SELECT COUNT(*) AS tickets,
            COALESCE(SUM(stake), 0) AS staked,
            COALESCE(SUM(payout), 0) AS won,
            COALESCE(SUM(levy), 0) AS levy
       FROM bet_tickets WHERE team_id = ? AND status IN ('won','lost','void','confiscated')`
  ).bind(teamId).first<{ tickets: number; staked: number; won: number; levy: number }>()
    .catch((e) => { logger.warn({ module: M }, "bilance sázek", e); return null; });

  return c.json({
    tickets: tikety.results.map((t) => ({
      id: t.id,
      cislo: String(t.id).slice(0, 4).toUpperCase(),
      stake: t.stake,
      levy: t.levy,
      totalOddsX100: t.total_odds_x100,
      potentialPayout: t.potential_payout,
      capped: !!t.capped,
      payout: t.payout,
      status: t.status,
      gameWeek: t.game_week,
      selections: (podleTiketu.get(t.id as string) ?? []).map((l) => ({
        matchId: l.match_id,
        market: l.market,
        label: l.label,
        oddsX100: l.odds_x100,
        result: l.result,
        zapas: `${l.home_name} — ${l.away_name}`,
        vysledek: l.home_score === null ? null : `${l.home_score}:${l.away_score}`,
      })),
    })),
    summary: bilance
      ? { ...bilance, net: (bilance.won ?? 0) - (bilance.staked ?? 0) - (bilance.levy ?? 0) }
      : { tickets: 0, staked: 0, won: 0, levy: 0, net: 0 },
  });
});

bettingRouter.post("/teams/:teamId/bets", async (c) => {
  const teamId = c.req.param("teamId");
  const meta = await teamMeta(c.env.DB, teamId);
  if (!meta) return c.json({ error: "Klub nenalezen" }, 404);

  let body: { stake?: unknown; selections?: unknown };
  try {
    body = await c.req.json();
  } catch (e) {
    logger.warn({ module: M }, "nečitelné tělo požadavku", e);
    return c.json({ error: "Nečitelný požadavek" }, 400);
  }

  const stake = Number(body.stake);
  const raw = Array.isArray(body.selections) ? body.selections : [];
  const selections: SelectionInput[] = raw.map((s: Record<string, unknown>) => ({
    matchId: String(s.matchId ?? ""),
    market: String(s.market ?? ""),
    selection: String(s.selection ?? ""),
    oddsX100: Number(s.oddsX100 ?? 0),
  }));

  const res = await placeTicket(c.env.DB, {
    teamId, stake, selections, gameDate: meta.game_date ?? new Date().toISOString(),
  });

  if (!res.ok) {
    return c.json({ error: res.error, changed: res.changed }, res.status as 400);
  }
  return c.json({
    ok: true,
    ticketId: res.ticketId,
    cislo: res.ticketId.slice(0, 4).toUpperCase(),
    totalOddsX100: res.totalOddsX100,
    payout: res.payout,
    capped: res.capped,
    levy: res.levy,
  });
});

/** Odznak v menu — kolik vyhodnocených tiketů hráč ještě neviděl. */
bettingRouter.get("/teams/:teamId/bets/pending", async (c) => {
  const teamId = c.req.param("teamId");
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM bet_tickets
      WHERE team_id = ? AND status IN ('won','lost','void','confiscated') AND seen_at IS NULL`
  ).bind(teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "nepřečtené tikety", e); return null; });
  return c.json({ unseen: row?.n ?? 0 });
});

bettingRouter.post("/teams/:teamId/bets/seen", async (c) => {
  const teamId = c.req.param("teamId");
  await c.env.DB.prepare(
    `UPDATE bet_tickets SET seen_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE team_id = ? AND seen_at IS NULL AND status <> 'open' AND status <> 'pending'`
  ).bind(teamId).run()
    .catch((e) => logger.warn({ module: M }, "označení tiketů za přečtené", e));
  return c.json({ ok: true });
});

// ── Admin ───────────────────────────────────────────────────────────────────

bettingRouter.post("/admin/betting/:leagueId/board", async (c) => {
  const leagueId = c.req.param("leagueId");
  const gd = await c.env.DB.prepare(
    "SELECT MAX(game_date) AS gd FROM teams WHERE league_id = ?"
  ).bind(leagueId).first<{ gd: string }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum ligy", e); return null; });

  const res = await generateBoard(c.env.DB, leagueId, gd?.gd ?? new Date().toISOString());
  return c.json({ ok: true, ...res });
});

bettingRouter.post("/admin/betting/settle", async (c) => {
  const calendarId = c.req.query("calendarId");
  if (calendarId) {
    const res = await settleRound(c.env.DB, calendarId);
    return c.json({ ok: true, ...res });
  }

  // Bez parametru se zametou všechna kola, kde ještě visí otevřený tiket.
  const kola = await c.env.DB.prepare(
    `SELECT DISTINCT t.calendar_id FROM bet_tickets t
       JOIN season_calendar sc ON sc.id = t.calendar_id
      WHERE t.status = 'open' AND sc.status = 'simulated'`
  ).all<{ calendar_id: string }>()
    .catch((e) => { logger.error({ module: M }, "kola k dovypořádání", e); return { results: [] }; });

  let tickets = 0, paidOut = 0;
  for (const k of kola.results) {
    const r = await settleRound(c.env.DB, k.calendar_id);
    tickets += r.tickets;
    paidOut += r.paidOut;
  }
  return c.json({ ok: true, rounds: kola.results.length, tickets, paidOut });
});

export default bettingRouter;
