/**
 * Sázková kancelář — HTTP rozhraní.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireTeamOwnership, requireAdmin } from "../auth/middleware";
import { getSession, getTokenFromRequest } from "../auth/session";
import { generateBoard, nextOpenRound, teamStandings } from "../betting/board";
import { placeTicket, limitsFor, canBet, type SelectionInput } from "../betting/tickets";
import { settleRound } from "../betting/settle";
import { knihaSazek, listinaPrestupu, muzeDoKnihy, muzeZablokovat } from "../competition/integrity";

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
  // Lístek nese rozpočet klubu a počet zbývajících tiketů, takže veřejný být
  // nesmí — requireTeamOwnership vědomě propouští GET, kontrola musí být tady.
  if (!(await ownsTeam(c as never, teamId))) return c.json({ error: "Cizí klub" }, 403);
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
      // Pořadí 1/X/2 je zažité ze sázkových lístků; řazení podle kurzu by ho
      // rozhodilo. U ostatních trhů rozhoduje kurz (od nejpravděpodobnějšího).
      `SELECT match_id, market, selection, odds_x100, label
         FROM bet_odds WHERE calendar_id = ?
        ORDER BY market,
                 CASE selection
                   WHEN '1' THEN 0 WHEN 'X' THEN 1 WHEN '2' THEN 2
                   WHEN '1X' THEN 0 WHEN '12' THEN 1 WHEN 'X2' THEN 2
                   ELSE 3 END,
                 odds_x100`
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

  // Jak si týmy stojí. Bez toho hráč sází naslepo, nebo musí odejít na tabulku
  // a zpátky — a to už si radši nevsadí.
  const tabulka = await teamStandings(c.env.DB, meta.league_id, round.season_number);

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
      const strana = (id: string, name: string, color: string) => {
        const st = tabulka.get(id);
        return {
          id, name, color,
          pos: st?.pos ?? 0,
          played: st?.played ?? 0,
          points: st?.points ?? 0,
          goalsFor: st?.goalsFor ?? 0,
          goalsAgainst: st?.goalsAgainst ?? 0,
          form: st?.form ?? [],
        };
      };

      return {
        matchId: m.id,
        home: strana(m.home_team_id, m.home_name, m.home_color),
        away: strana(m.away_team_id, m.away_name, m.away_color),
        ownMatch: vlastni,
        markets: vlastni ? null : {
          result: k.filter((x) => x.market === "1x2")
            .map((x) => ({ selection: x.selection, label: x.label, oddsX100: x.odds_x100 })),
          dchance: k.filter((x) => x.market === "dchance")
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
  if (!(await ownsTeam(c as never, teamId))) return c.json({ unseen: 0 });
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

// ── Komisař pro integritu soutěže ───────────────────────────────────────────

/** Liga a sezóna klubu — společný začátek všech endpointů komisaře. */
async function ligaASezona(
  db: D1Database, teamId: string,
): Promise<{ leagueId: string; seasonNumber: number } | null> {
  const row = await db.prepare(
    `SELECT t.league_id,
            (SELECT MAX(season_number) FROM season_calendar WHERE league_id = t.league_id) AS season_number
       FROM teams t WHERE t.id = ?`
  ).bind(teamId).first<{ league_id: string | null; season_number: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "liga klubu", e); return null; });
  if (!row?.league_id || !row.season_number) return null;
  return { leagueId: row.league_id, seasonNumber: row.season_number };
}

/** Kniha sázek celé soutěže. Vidí ji jen komisař a prezident. */
bettingRouter.get("/teams/:teamId/betting/book", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await ownsTeam(c as never, teamId))) return c.json({ error: "Cizí klub" }, 403);

  const kde = await ligaASezona(c.env.DB, teamId);
  if (!kde) return c.json({ error: "Klub nemá soutěž" }, 404);

  if (!(await muzeDoKnihy(c.env.DB, kde.leagueId, teamId, kde.seasonNumber))) {
    return c.json({ error: "Do knihy sázek vidí jen komisař pro integritu a prezident soutěže." }, 403);
  }

  const [kniha, prestupy] = await Promise.all([
    knihaSazek(c.env.DB, kde.leagueId, kde.seasonNumber),
    listinaPrestupu(c.env.DB, kde.leagueId, kde.seasonNumber),
  ]);
  return c.json({ tickets: kniha, transfers: prestupy });
});

/** Zákaz sázení uložený komisařem, bez hlasování. */
bettingRouter.post("/teams/:teamId/betting/bans", async (c) => {
  const teamId = c.req.param("teamId");
  const kde = await ligaASezona(c.env.DB, teamId);
  if (!kde) return c.json({ error: "Klub nemá soutěž" }, 404);

  let body: { targetTeamId?: unknown; rounds?: unknown; reason?: unknown };
  try { body = await c.req.json(); }
  catch (e) { logger.warn({ module: M }, "nečitelný požadavek na zákaz", e); return c.json({ error: "Nečitelný požadavek" }, 400); }

  const cil = String(body.targetTeamId ?? "");
  const kol = Math.max(1, Math.min(30, Number(body.rounds) || 5));
  const duvod = String(body.reason ?? "").trim();
  if (!cil) return c.json({ error: "Chybí klub." }, 400);
  if (duvod.length < 10) return c.json({ error: "Napiš, za co ten zákaz je. Aspoň větu." }, 400);

  const smi = await muzeZablokovat(c.env.DB, kde.leagueId, teamId, cil, kde.seasonNumber);
  if (!smi.ok) return c.json({ error: smi.reason }, 403);

  const kolo = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(game_week), 0) AS gw FROM season_calendar
      WHERE league_id = ? AND season_number = ? AND status = 'simulated'`
  ).bind(kde.leagueId, kde.seasonNumber).first<{ gw: number }>()
    .catch((e) => { logger.warn({ module: M }, "aktuální kolo", e); return null; });

  const doKola = (kolo?.gw ?? 0) + kol;
  const gameDate = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string }>().then((r) => r?.game_date ?? new Date().toISOString())
    .catch(() => new Date().toISOString());

  const { issueSanction } = await import("../competition/discipline");
  await issueSanction(c.env.DB, {
    leagueId: kde.leagueId, seasonNumber: kde.seasonNumber, teamId: cil,
    amount: 0, kind: "bet_manipulation", reason: duvod, evidence: null,
    issuedBy: "chair", issuedByTeamId: teamId, proposalId: null, gameDate,
  });

  await c.env.DB.prepare(
    `UPDATE competition_sanctions SET bet_ban_until_gw = ?
      WHERE league_id = ? AND team_id = ? AND season_number = ? AND kind = 'bet_manipulation'
        AND bet_ban_until_gw IS NULL`
  ).bind(doKola, kde.leagueId, cil, kde.seasonNumber).run()
    .catch((e) => logger.error({ module: M }, "zápis zákazu sázení", e));

  await c.env.DB.prepare(
    `UPDATE competition_officials SET used_bet_ban = used_bet_ban + 1
      WHERE league_id = ? AND role = 'integrita' AND season_number = ? AND status = 'active'`
  ).bind(kde.leagueId, kde.seasonNumber).run()
    .catch((e) => logger.error({ module: M }, "počítadlo zákazů", e));

  const { sendSystemSMS } = await import("../messaging/system-sms");
  await sendSystemSMS(c.env.DB, cil, "Komisař pro integritu",
    `Zakazuji ti sázet do ${doKola}. kola. Důvod: ${duvod} Proti rozhodnutí se můžeš odvolat k zasedání grémia.`)
    .catch((e) => logger.warn({ module: M }, "SMS o zákazu", e));

  return c.json({ ok: true, untilGameWeek: doKola });
});

/** Zabavení výhry. Peníze jdou z klubu do pokladny soutěže. */
bettingRouter.post("/teams/:teamId/betting/tickets/:ticketId/confiscate", async (c) => {
  const teamId = c.req.param("teamId");
  const ticketId = c.req.param("ticketId");
  const kde = await ligaASezona(c.env.DB, teamId);
  if (!kde) return c.json({ error: "Klub nemá soutěž" }, 404);

  const { actsFor } = await import("../competition/officials");
  const opravneni = await actsFor(c.env.DB, kde.leagueId, teamId, "integrita", kde.seasonNumber);
  if (!opravneni.ok) return c.json({ error: opravneni.reason ?? "Tuhle pravomoc nemáš." }, 403);

  let body: { reason?: unknown };
  try { body = await c.req.json(); } catch { body = {}; }
  const duvod = String(body.reason ?? "").trim();
  if (duvod.length < 10) return c.json({ error: "Napiš, proč tu výhru zabavuješ. Aspoň větu." }, 400);

  // Zámek: zabavit jde jen vyhraný tiket, a jen jednou.
  const tiket = await c.env.DB.prepare(
    `SELECT team_id, payout FROM bet_tickets
      WHERE id = ? AND league_id = ? AND status = 'won' AND payout > 0`
  ).bind(ticketId, kde.leagueId).first<{ team_id: string; payout: number }>()
    .catch((e) => { logger.error({ module: M }, "načtení tiketu k zabavení", e); return null; });

  if (!tiket) return c.json({ error: "Takový vyhraný tiket v téhle soutěži není." }, 404);
  if (tiket.team_id === teamId) return c.json({ error: "Vlastní výhru si zabavit nemůžeš." }, 403);

  const gate = await c.env.DB.prepare(
    "UPDATE bet_tickets SET status = 'confiscated' WHERE id = ? AND status = 'won'"
  ).bind(ticketId).run()
    .catch((e) => { logger.error({ module: M }, "zámek zabavení", e); return null; });
  if (!gate || (gate.meta?.changes ?? 0) === 0) {
    return c.json({ error: "Tenhle tiket už někdo vyřídil." }, 409);
  }

  const gameDate = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(tiket.team_id).first<{ game_date: string }>().then((r) => r?.game_date ?? new Date().toISOString())
    .catch(() => new Date().toISOString());

  const { recordTransaction } = await import("../season/finance-processor");
  const { recordCompetitionEntry } = await import("../competition/ledger");

  // Pořadí jako všude jinde: nejdřív ubrat klubu, pak připsat pokladně.
  await recordTransaction(c.env.DB, tiket.team_id, "bet_confiscated", -tiket.payout,
    "Zabavená výhra ze sázky", gameDate, `bet-confiscate-${ticketId}`);
  await recordCompetitionEntry(c.env.DB, {
    leagueId: kde.leagueId, seasonNumber: kde.seasonNumber, type: "bet_confiscated",
    amount: tiket.payout, description: "Zabavená výhra ze sázky", teamId: tiket.team_id,
    gameDate, referenceId: `bet-confiscate-${ticketId}`,
  });

  await c.env.DB.prepare(
    `UPDATE competition_officials SET used_bet_void = used_bet_void + 1
      WHERE league_id = ? AND role = 'integrita' AND season_number = ? AND status = 'active'`
  ).bind(kde.leagueId, kde.seasonNumber).run()
    .catch((e) => logger.error({ module: M }, "počítadlo zabavení", e));

  const { sendSystemSMS } = await import("../messaging/system-sms");
  await sendSystemSMS(c.env.DB, tiket.team_id, "Komisař pro integritu",
    `Výhru ${tiket.payout.toLocaleString("cs")} Kč z tiketu č. ${ticketId.slice(0, 4).toUpperCase()} zabavuji ve prospěch soutěže. Důvod: ${duvod}`)
    .catch((e) => logger.warn({ module: M }, "SMS o zabavení", e));

  return c.json({ ok: true, confiscated: tiket.payout });
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
