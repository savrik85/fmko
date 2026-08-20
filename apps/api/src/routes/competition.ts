/**
 * Grémium soutěže — pokladna, návrhy, hlasování, volby a zápisy ze zasedání.
 *
 * Hlasování je během otevřené schůze SKRYTÉ: klient se dozví jen kolik klubů už
 * hlasovalo, ne poměr ani jména. Po uzavření se zápis odkryje jmenovitě. Kdyby byl
 * poměr vidět průběžně, poslední hlasující rozhoduje s plnou informací a ostatní
 * jen dorovnávají vítěze.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { getSession, getTokenFromRequest } from "../auth/session";
import {
  DEFAULT_RULES, MIN_HUMAN_CLUBS, PROPOSAL_DEPOSIT, PROPOSAL_KINDS, ROLE_LABEL, ROLE_SCOPE,
  type CompetitionRules, type OfficialRole,
} from "../competition/defaults";
import { readBalance, recordCompetitionEntry, seasonSummary } from "../competition/ledger";
import {
  actsFor, canRunFor, openElections, presidentOf, resignOfficial, rolesFor, suspendOfficial,
} from "../competition/officials";
import {
  BOARD_MESSAGE_MAX, listForRole, listMessages, markRead, postMessage, seatOf, unreadCount,
} from "../competition/board";
import {
  CHAIR_FINE_LIMIT, FINE_MAX, FINE_MIN, OFFENCES,
  canChairFine, canFine, collectEvidence, issueSanction,
} from "../competition/discipline";
import {
  MIN_ACTIVE_REFEREES, canBanReferee, refereeStandings,
} from "../competition/referee-bans";
import {
  nextSeasonRules, proposalTitle, validateProposal, voterStats,
} from "../competition/proposals";
import {
  checkBudget, freeBalance, outstandingCommitments, placementReward, subsidyFor, teamImpact,
} from "../competition/projection";
import {
  countAllClubs, countHumanClubs, loadGovernance, loadLeagueMeta, playedMatches, resolveRules,
} from "../competition/rules";

const M = "competition";
const competitionRouter = new Hono<{ Bindings: Bindings }>();

competitionRouter.use("/teams/:teamId/competition/*", requireTeamOwnership);
competitionRouter.use("/admin/competition/*", requireAdmin);

/**
 * Jméno trenéra klubu. ZÁMĚRNĚ poddotaz, ne JOIN: v datech existují týmy se dvěma
 * řádky v `managers` a JOIN by takový klub v každém seznamu zdvojil.
 */
const MANAGER_NAME = (alias: string) =>
  `(SELECT mm.name FROM managers mm WHERE mm.team_id = ${alias} ORDER BY mm.created_at LIMIT 1)`;
const MANAGER_AVATAR = (alias: string) =>
  `(SELECT mm.avatar FROM managers mm WHERE mm.team_id = ${alias} ORDER BY mm.created_at LIMIT 1)`;

/**
 * Patří tenhle klub přihlášenému uživateli?
 *
 * `requireTeamOwnership` vědomě propouští GET, protože drtivá většina čtení
 * v aplikaci je veřejná. Kabinet vedení ale veřejný není — bez téhle kontroly
 * by si ho přečetl kdokoli, komu stačí opsat cizí teamId z URL. Ověřeno.
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

/** Tým přihlášeného uživatele, nebo null. Token je u čtecích endpointů nepovinný. */
async function currentTeam(c: { env: Bindings; req: Request }): Promise<string | null> {
  const token = getTokenFromRequest(c as never);
  if (!token) return null;
  const session = await getSession(c.env.SESSION_KV, token)
    .catch((e) => { logger.warn({ module: M }, "načtení session", e); return null; });
  if (!session) return null;
  const team = await c.env.DB.prepare("SELECT id FROM teams WHERE user_id = ?")
    .bind(session.userId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "tým uživatele", e); return null; });
  return team?.id ?? null;
}

/** Kolik hlasů zatím padlo — bez poměru, dokud je schůze otevřená. */
async function ballotCounts(db: D1Database, ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const rows = await db.prepare(
    `SELECT proposal_id, COUNT(*) AS n FROM competition_ballots
      WHERE proposal_id IN (${ids.map(() => "?").join(",")}) GROUP BY proposal_id`
  ).bind(...ids).all<{ proposal_id: string; n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počty hlasů", e); return { results: [] }; });
  const out: Record<string, number> = {};
  for (const r of rows.results) out[r.proposal_id] = r.n;
  return out;
}

/** Liga, ve které klub hraje. FE zná jen teamId, ne leagueId. */
async function leagueOfTeam(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "liga týmu", e); return null; });
  return row?.league_id ?? null;
}

// ── Stav soutěže ────────────────────────────────────────────────────────────
// Alias podle týmu — frontend nemá leagueId po ruce.
competitionRouter.get("/teams/:teamId/competition", async (c) => {
  const leagueId = await leagueOfTeam(c.env.DB, c.req.param("teamId"));
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  return competitionState(c as never, leagueId);
});

competitionRouter.get("/competition/:leagueId", async (c) => competitionState(c as never, c.req.param("leagueId")));

async function competitionState(c: { env: Bindings; json: (b: unknown, s?: number) => Response }, leagueId: string) {
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const gov = await loadGovernance(c.env.DB, leagueId);
  const rules = await resolveRules(c.env.DB, leagueId, meta.season_number);
  const [humans, teams, balance] = await Promise.all([
    countHumanClubs(c.env.DB, leagueId),
    countAllClubs(c.env.DB, leagueId),
    readBalance(c.env.DB, leagueId),
  ]);

  const officials = await c.env.DB.prepare(
    `SELECT o.role, o.team_id, o.status, o.used_suspend, t.name AS team_name,
            ${MANAGER_NAME("o.team_id")} AS manager_name
       FROM competition_officials o
       JOIN teams t ON t.id = o.team_id
      WHERE o.league_id = ? AND o.season_number = ? AND o.status IN ('active','suspended')`
  ).bind(leagueId, meta.season_number).all<{
    role: string; team_id: string; status: string; used_suspend: number;
    team_name: string; manager_name: string | null;
  }>()
    .catch((e) => { logger.warn({ module: M }, "funkcionáři", e); return { results: [] }; });

  const stats = await voterStats(c.env.DB, leagueId);
  const played = await playedMatches(c.env.DB, leagueId);
  const outstanding = outstandingCommitments(rules, teams, meta.level, played);
  const free = freeBalance(balance, rules, teams, meta.level, played);
  // Projekce i strop musí počítat se sazebníkem, který bude PŘÍŠTÍ sezónu platit,
  // ne s dnešním — jinak by o už odhlasovaných změnách nevěděly.
  const pristiRules = await nextSeasonRules(c.env.DB, leagueId, rules, meta.season_number + 1);
  const projection = checkBudget({ rules: pristiRules, teams, level: meta.level, balance: free });

  return c.json({
    league: {
      id: meta.id, name: meta.name, district: meta.district,
      level: meta.level, seasonNumber: meta.season_number,
      sponsoredName: gov?.sponsor_name ? `${gov.sponsor_name} liga` : null,
      originalName: gov?.original_name ?? null,
    },
    enabled: !!gov?.enabled,
    threshold: MIN_HUMAN_CLUBS,
    humanClubs: humans,
    totalClubs: teams,
    balance,
    freeBalance: free,
    outstanding,
    playedMatches: played,
    subsidy: subsidyFor(teams, meta.level),
    rules,
    // Co bude platit příští sezónu, až se přijaté návrhy promítnou.
    nextRules: pristiRules,
    defaults: DEFAULT_RULES,
    projection: {
      cost: projection.cost, income: projection.income,
      projected: projection.projected, ok: projection.ok,
    },
    voters: stats.voters.length,
    activeVoters: stats.active.length,
    quorumNeeded: stats.quorumNeeded,
    officials: officials.results.map((o) => ({
      role: o.role,
      roleLabel: ROLE_LABEL[o.role as OfficialRole] ?? o.role,
      teamId: o.team_id, teamName: o.team_name, managerName: o.manager_name, status: o.status,
    })),
    // Kolikrát už prezident pravomoc pozastavil. Strop na to není, ale číslo je
    // vidět — ať kluby poznají prezidenta, který si vyřizuje účty.
    presidentUsedSuspend:
      officials.results.find((o) => o.role === "predseda")?.used_suspend ?? 0,
    // Které odbory v soutěži téhle velikosti vůbec existují.
    roles: rolesFor(humans).map((role) => {
      const holder = officials.results.find((o) => o.role === role);
      const scope = ROLE_SCOPE[role];
      return {
        role, label: ROLE_LABEL[role],
        agenda: scope.agenda, powers: scope.powers,
        holder: holder
          ? {
              teamId: holder.team_id, teamName: holder.team_name,
              managerName: holder.manager_name, status: holder.status,
            }
          : null,
      };
    }),
    presidentTeamId: (await presidentOf(c.env.DB, leagueId, meta.season_number))?.teamId ?? null,
    proposalKinds: Object.entries(PROPOSAL_KINDS).map(([kind, s]) => ({
      kind, label: s.label, gesce: s.gesce, majority: s.majority,
      min: s.min ?? null, max: s.max ?? null,
      nextSeason: s.nextSeason,
      current: s.rulesField ? rules[s.rulesField] : null,
      // Jednotka řídí, jak formulář hodnotu zobrazí i zeptá se na ni.
      unit: s.unit, note: s.note ?? null, counted: s.counted ?? null,
    })),
    deposit: PROPOSAL_DEPOSIT,
  });
}

// ── Pokladna ────────────────────────────────────────────────────────────────
competitionRouter.get("/competition/:leagueId/ledger", async (c) => {
  const leagueId = c.req.param("leagueId");
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const entries = await c.env.DB.prepare(
    `SELECT l.id, l.type, l.amount, l.balance_after, l.description, l.team_id, l.game_date, l.created_at,
            t.name AS team_name
       FROM competition_ledger l LEFT JOIN teams t ON t.id = l.team_id
      WHERE l.league_id = ? ORDER BY l.created_at DESC LIMIT 100`
  ).bind(leagueId).all()
    .catch((e) => { logger.warn({ module: M }, "výpis pokladny", e); return { results: [] }; });

  return c.json({
    balance: await readBalance(c.env.DB, leagueId),
    seasonNumber: meta.season_number,
    summary: await seasonSummary(c.env.DB, leagueId, meta.season_number),
    entries: entries.results,
  });
});

// ── Návrhy ──────────────────────────────────────────────────────────────────
competitionRouter.get("/competition/:leagueId/proposals", async (c) => {
  const leagueId = c.req.param("leagueId");
  const myTeam = await currentTeam(c as never);

  const rows = await c.env.DB.prepare(
    `SELECT p.*, t.name AS proposer_name
       FROM competition_proposals p LEFT JOIN teams t ON t.id = p.proposed_by_team_id
      WHERE p.league_id = ? ORDER BY
        CASE WHEN p.status = 'open' THEN 0 ELSE 1 END, p.created_at DESC LIMIT 60`
  ).bind(leagueId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "seznam návrhů", e); return { results: [] }; });

  const openIds = rows.results.filter((r) => r.status === "open").map((r) => r.id as string);
  const counts = await ballotCounts(c.env.DB, openIds);

  // Vlastní hlas vidí klub i u otevřené schůze — jen cizí zůstávají skryté.
  const myBallots: Record<string, string> = {};
  if (myTeam) {
    const mine = await c.env.DB.prepare(
      `SELECT b.proposal_id, b.answer FROM competition_ballots b
         JOIN competition_proposals p ON p.id = b.proposal_id
        WHERE p.league_id = ? AND b.team_id = ?`
    ).bind(leagueId, myTeam).all<{ proposal_id: string; answer: string }>()
      .catch((e) => { logger.warn({ module: M }, "moje hlasy", e); return { results: [] }; });
    for (const b of mine.results) myBallots[b.proposal_id] = b.answer;
  }

  const closedIds = rows.results.filter((r) => r.status !== "open").map((r) => r.id as string);
  const votersByProposal: Record<string, Array<{ teamId: string; teamName: string; answer: string }>> = {};
  if (closedIds.length > 0) {
    const vr = await c.env.DB.prepare(
      `SELECT b.proposal_id, b.team_id, b.answer, t.name AS team_name
         FROM competition_ballots b JOIN teams t ON t.id = b.team_id
        WHERE b.proposal_id IN (${closedIds.map(() => "?").join(",")})
        ORDER BY b.voted_at ASC`
    ).bind(...closedIds).all<{ proposal_id: string; team_id: string; answer: string; team_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "hlasující", e); return { results: [] }; });
    for (const r of vr.results) {
      (votersByProposal[r.proposal_id] ??= []).push({ teamId: r.team_id, teamName: r.team_name, answer: r.answer });
    }
  }

  return c.json({
    proposals: rows.results.map((p) => {
      const id = p.id as string;
      const open = p.status === "open";
      return {
        id,
        kind: p.kind, title: p.title, body: p.body, gesce: p.gesce,
        status: p.status, majority: p.majority,
        payload: safeJson(p.payload as string),
        proposedByTeamId: p.proposed_by_team_id, proposerName: p.proposer_name,
        openedGameDate: p.opened_game_date,
        closedGameDate: p.closed_game_date,
        effectiveFromSeason: p.effective_from_season,
        resultNote: p.result_note,
        myAnswer: myBallots[id] ?? null,
        // Otevřená schůze: jen počet odevzdaných hlasů. Poměr a jména až po uzavření.
        castCount: open ? (counts[id] ?? 0) : (p.votes_pro as number) + (p.votes_proti as number) + (p.votes_zdrzel as number),
        tally: open ? null : { pro: p.votes_pro, proti: p.votes_proti, zdrzel: p.votes_zdrzel },
        voters: open ? null : (votersByProposal[id] ?? []),
      };
    }),
  });
});

function safeJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch (e) { logger.warn({ module: M }, "parsování payloadu návrhu", e); return {}; }
}

// ── Zápisy ze schůzí ────────────────────────────────────────────────────────
competitionRouter.get("/competition/:leagueId/meetings", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, game_date, season_number, proposals_closed, proposals_passed,
            attendance, balance_after, summary
       FROM competition_meetings WHERE league_id = ?
      ORDER BY game_date DESC LIMIT 20`
  ).bind(c.req.param("leagueId")).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "zápisy ze schůzí", e); return { results: [] }; });

  return c.json({
    meetings: rows.results.map((m) => ({
      id: m.id, gameDate: m.game_date, seasonNumber: m.season_number,
      closed: m.proposals_closed, passed: m.proposals_passed,
      balanceAfter: m.balance_after,
      attendance: safeJson(m.attendance as string),
      items: JSON.parse((m.summary as string) || "[]") as unknown[],
    })),
  });
});

/**
 * Kolik bodů čeká na hlas tvého klubu. Drží odznak v menu, takže musí být levné —
 * dva COUNTy, žádné načítání celé agendy.
 */
competitionRouter.get("/teams/:teamId/competition/pending", async (c) => {
  const teamId = c.req.param("teamId");
  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ open: 0, toVote: 0 });

  const gov = await loadGovernance(c.env.DB, leagueId);
  if (!gov?.enabled) return c.json({ open: 0, toVote: 0 });

  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS open,
            SUM(CASE WHEN NOT EXISTS (
                  SELECT 1 FROM competition_ballots b
                   WHERE b.proposal_id = p.id AND b.team_id = ?
                ) THEN 1 ELSE 0 END) AS to_vote
       FROM competition_proposals p
      WHERE p.league_id = ? AND p.status = 'open'`
  ).bind(teamId, leagueId).first<{ open: number; to_vote: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "počet čekajících bodů", e); return null; });

  const elections = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM competition_elections e
      WHERE e.league_id = ? AND e.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM competition_election_ballots b
                         WHERE b.election_id = e.id AND b.team_id = ?)`
  ).bind(leagueId, teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet čekajících voleb", e); return null; });

  return c.json({
    open: row?.open ?? 0,
    toVote: (row?.to_vote ?? 0) + (elections?.n ?? 0),
  });
});

// ── Kalkulačka dopadu na klub ───────────────────────────────────────────────
competitionRouter.get("/teams/:teamId/competition/impact", async (c) => {
  const teamId = c.req.param("teamId");
  const kind = c.req.query("kind") ?? "";
  const value = Number(c.req.query("value"));

  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "liga týmu", e); return null; });
  if (!team?.league_id) return c.json({ error: "Tým není v soutěži" }, 404);

  const meta = await loadLeagueMeta(c.env.DB, team.league_id);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const spec = PROPOSAL_KINDS[kind];
  if (!spec?.rulesField || !Number.isFinite(value)) {
    return c.json({ error: "Neznámý typ návrhu nebo chybí hodnota" }, 400);
  }

  const rules = await resolveRules(c.env.DB, team.league_id, meta.season_number);
  const proposed: CompetitionRules = { ...rules, [spec.rulesField]: value };
  const teams = await countAllClubs(c.env.DB, team.league_id);

  const { calculateStandings } = await import("../stats/standings");
  const standings = await calculateStandings(c.env.DB, team.league_id);
  const me = standings.find((s) => s.teamId === teamId);

  // Extrapolace na celou sezónu podle dosavadní formy. Bez odehraných zápasů
  // se použije průměrný klub, ať kalkulačka něco ukáže i v prvním kole.
  const totalMatches = Math.max(1, (teams - 1) * 2);
  const played = me?.played ?? 0;
  const scale = played > 0 ? totalMatches / played : 1;
  const expectedWins = Math.round((me?.wins ?? totalMatches * 0.35) * (played > 0 ? scale : 1));
  const expectedDraws = Math.round((me?.draws ?? totalMatches * 0.25) * (played > 0 ? scale : 1));
  const expectedPos = me?.pos ?? Math.ceil(teams / 2);

  const base = { teams, level: meta.level, expectedPos, expectedWins, expectedDraws };
  const before = teamImpact({ ...base, rules });
  const after = teamImpact({ ...base, rules: proposed });

  return c.json({
    expectedPos, expectedWins, expectedDraws, played,
    before, after,
    delta: {
      matchBonus: after.matchBonus - before.matchBonus,
      placeReward: after.placeReward - before.placeReward,
      entryFee: after.entryFee - before.entryFee,
      net: after.net - before.net,
    },
    placeRewardTable: Array.from({ length: teams }, (_, i) => ({
      pos: i + 1,
      before: placementReward(rules, i + 1, meta.level),
      after: placementReward(proposed, i + 1, meta.level),
    })),
  });
});

// ── Podání návrhu ───────────────────────────────────────────────────────────
competitionRouter.post("/teams/:teamId/competition/proposals", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ kind?: string; value?: number; body?: string }>()
    .catch((e) => { logger.warn({ module: M }, "parsování těla návrhu", e); return null; });
  if (!body?.kind) return c.json({ error: "Chybí typ návrhu" }, 400);

  const team = await c.env.DB.prepare("SELECT league_id, budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null; budget: number }>()
    .catch((e) => { logger.warn({ module: M }, "tým", e); return null; });
  if (!team?.league_id) return c.json({ error: "Tým není v soutěži" }, 404);

  const leagueId = team.league_id;
  const gov = await loadGovernance(c.env.DB, leagueId);
  if (!gov?.enabled) return c.json({ error: "Tahle soutěž zatím samosprávu nemá." }, 403);

  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  // Hlasovat i navrhovat smí jen klub s hlasovacím právem (lidský A-tým).
  const voters = await voterStats(c.env.DB, leagueId);
  if (!voters.voters.includes(teamId)) {
    return c.json({ error: "Tvůj klub nemá v téhle soutěži hlasovací právo." }, 403);
  }

  // Jeden otevřený návrh na klub — jinak by se program schůze dal zahltit.
  const openMine = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM competition_proposals WHERE league_id = ? AND proposed_by_team_id = ? AND status = 'open'"
  ).bind(leagueId, teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet mých návrhů", e); return null; });
  if ((openMine?.n ?? 0) > 0) {
    return c.json({ error: "Máš na programu schůze už jeden návrh. Počkej, až se projedná." }, 409);
  }

  const rules = await resolveRules(c.env.DB, leagueId, meta.season_number);
  const teamsInLeague = await countAllClubs(c.env.DB, leagueId);
  const played = await playedMatches(c.env.DB, leagueId);
  // Do stropu vstupuje jen VOLNÝ zůstatek — letošní odměny za umístění se z pokladny
  // teprve zaplatí, takže se z nich nesmí financovat trvalé zvýšení sazeb.
  const free = freeBalance(
    await readBalance(c.env.DB, leagueId), rules, teamsInLeague, meta.level, played,
  );
  // Základ stropu je sazebník příští sezóny, ne ten dnešní: co už kluby
  // odhlasovaly, rozpočet zatěžuje, i když to zatím neplatí.
  const baseRules = await nextSeasonRules(c.env.DB, leagueId, rules, meta.season_number + 1);
  const v = await validateProposal({
    db: c.env.DB, leagueId, level: meta.level, seasonNumber: meta.season_number,
    currentRules: rules, budgetBase: baseRules,
    balance: free, kind: body.kind, value: Number(body.value),
  });
  if (!v.ok) return c.json({ error: v.error }, 400);

  if (team.budget < PROPOSAL_DEPOSIT) {
    return c.json({ error: `Na kauci ${PROPOSAL_DEPOSIT} Kč nemáš v rozpočtu.` }, 400);
  }

  const gameDate = await currentGameDate(c.env.DB, teamId);
  const id = crypto.randomUUID();
  const spec = v.spec;
  const current = spec.rulesField ? rules[spec.rulesField] : 0;

  await c.env.DB.prepare(
    `INSERT INTO competition_proposals
      (id, league_id, season_number, kind, gesce, title, body, payload, proposed_by_team_id,
       majority, quorum, opened_game_date, deposit, effective_from_season)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, leagueId, meta.season_number, body.kind, v.gesce,
    proposalTitle(body.kind, v.value, current),
    (body.body ?? "").slice(0, 500),
    JSON.stringify({ value: v.value, from: current, budgetNote: v.budgetNote }),
    teamId, v.majority, 0.5, gameDate, PROPOSAL_DEPOSIT, v.effectiveFromSeason,
  ).run();

  // Kauce se strhne hned a vrátí se, až návrh projde.
  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(
    c.env.DB, teamId, "competition_deposit", -PROPOSAL_DEPOSIT,
    "Kauce za návrh na schůzi vedení soutěže", gameDate, `dep-${id}`,
  ).catch((e) => logger.warn({ module: M }, "stržení kauce", e));

  await recordCompetitionEntry(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, type: "deposit",
    amount: PROPOSAL_DEPOSIT, description: "Kauce za podaný návrh",
    teamId, gameDate, referenceId: `dep-${id}`,
  });

  return c.json({ ok: true, id, budgetNote: v.budgetNote, effectiveFromSeason: v.effectiveFromSeason });
});

/** Herní datum týmu; fallback na globální hodiny, ať nikdy nevrátíme reálné „dnes". */
async function currentGameDate(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum týmu", e); return null; });
  if (row?.game_date) return row.game_date;
  const any = await db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL")
    .first<{ d: string | null }>()
    .catch(() => null);
  return any?.d ?? new Date().toISOString();
}

// ── Hlasování ───────────────────────────────────────────────────────────────
competitionRouter.post("/teams/:teamId/competition/proposals/:id/ballot", async (c) => {
  const teamId = c.req.param("teamId");
  const proposalId = c.req.param("id");
  const body = await c.req.json<{ answer?: string }>().catch(() => null);
  const answer = body?.answer;
  if (!answer || !["pro", "proti", "zdrzel"].includes(answer)) {
    return c.json({ error: "Neplatná odpověď" }, 400);
  }

  const p = await c.env.DB.prepare(
    "SELECT league_id, status, target_team_id FROM competition_proposals WHERE id = ?"
  ).bind(proposalId).first<{ league_id: string; status: string; target_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "návrh", e); return null; });
  if (!p) return c.json({ error: "Návrh nenalezen" }, 404);
  if (p.status !== "open") return c.json({ error: "O tomhle návrhu se už hlasovalo." }, 409);

  // Klub, o kterém se rozhoduje, nehlasuje — má místo toho právo na obhajobu.
  if (p.target_team_id === teamId) {
    return c.json({ error: "O návrhu, který se týká tvého klubu, nehlasuješ. Můžeš napsat obhajobu." }, 403);
  }

  const voters = await voterStats(c.env.DB, p.league_id);
  if (!voters.voters.includes(teamId)) {
    return c.json({ error: "Tvůj klub nemá v téhle soutěži hlasovací právo." }, 403);
  }

  await c.env.DB.prepare(
    `INSERT INTO competition_ballots (id, proposal_id, team_id, answer) VALUES (?,?,?,?)
     ON CONFLICT(proposal_id, team_id) DO UPDATE SET answer = excluded.answer,
       voted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
  ).bind(crypto.randomUUID(), proposalId, teamId, answer).run();

  return c.json({ ok: true, answer });
});

// ── Stažení vlastního návrhu ────────────────────────────────────────────────
competitionRouter.delete("/teams/:teamId/competition/proposals/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const proposalId = c.req.param("id");

  const res = await c.env.DB.prepare(
    `UPDATE competition_proposals SET status = 'withdrawn',
        closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), result_note = 'Navrhovatel návrh stáhl.'
      WHERE id = ? AND proposed_by_team_id = ? AND status = 'open'`
  ).bind(proposalId, teamId).run()
    .catch((e) => { logger.warn({ module: M }, "stažení návrhu", e); return null; });

  if (!res || (res.meta?.changes ?? 0) === 0) {
    return c.json({ error: "Návrh nejde stáhnout — buď není tvůj, nebo už se o něm hlasovalo." }, 409);
  }
  // Kauce propadá: stažení po rozjeté diskusi nesmí být zadarmo.
  return c.json({ ok: true });
});

// ── Admin ───────────────────────────────────────────────────────────────────
competitionRouter.post("/admin/competition/:leagueId/enable", async (c) => {
  const leagueId = c.req.param("leagueId");
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const humans = await countHumanClubs(c.env.DB, leagueId);
  const force = c.req.query("force") === "1";
  if (humans < MIN_HUMAN_CLUBS && !force) {
    return c.json({
      error: `Soutěž má jen ${humans} lidských klubů, potřeba je ${MIN_HUMAN_CLUBS}. Přepiš přes ?force=1.`,
    }, 400);
  }

  const teams = await countAllClubs(c.env.DB, leagueId);
  const subsidy = subsidyFor(teams, meta.level);
  const gameDate = await c.env.DB.prepare(
    "SELECT MAX(game_date) AS d FROM teams WHERE league_id = ?"
  ).bind(leagueId).first<{ d: string | null }>().then((r) => r?.d ?? new Date().toISOString())
    .catch(() => new Date().toISOString());

  await c.env.DB.prepare(
    `INSERT INTO competition_governance (league_id, enabled, enabled_from_season, original_name)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(league_id) DO UPDATE SET enabled = 1, enabled_from_season = COALESCE(competition_governance.enabled_from_season, excluded.enabled_from_season)`
  ).bind(leagueId, meta.season_number, meta.name).run();

  // Sazebník pro rozehranou sezónu založíme výchozí, aby se dalo hned testovat.
  // Za normálního provozu vzniká výhradně při rolloveru.
  const ruleFields = Object.keys(DEFAULT_RULES) as Array<keyof typeof DEFAULT_RULES>;
  const ruleCols = ["id", "league_id", "season_number", ...ruleFields, "subsidy_total"];
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO competition_rules (${ruleCols.join(", ")})
     VALUES (${ruleCols.map(() => "?").join(",")})`
  ).bind(
    crypto.randomUUID(), leagueId, meta.season_number,
    ...ruleFields.map((f) => DEFAULT_RULES[f]),
    subsidy,
  ).run();

  await recordCompetitionEntry(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, type: "subsidy", amount: subsidy,
    description: `Svazová dotace na ${meta.season_number}. sezónu`,
    gameDate, referenceId: `sub-${leagueId}-${meta.season_number}`,
  });

  // Startovné se vybírá stejně jako při rolloveru — bez něj by pokladna vypadala
  // chudší, než ve skutečnosti bude, a rozpočtový strop by zbytečně kousal.
  const clubs = await c.env.DB.prepare("SELECT id FROM teams WHERE league_id = ?")
    .bind(leagueId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "kluby soutěže", e); return { results: [] }; });

  const { recordTransaction } = await import("../season/finance-processor");
  let collected = 0;
  for (const club of clubs.results) {
    const refId = `fee-${meta.season_number}-${club.id}`;
    const entry = await recordCompetitionEntry(c.env.DB, {
      leagueId, seasonNumber: meta.season_number, type: "entry_fee",
      amount: DEFAULT_RULES.entry_fee, description: "Startovné do soutěže",
      teamId: club.id, gameDate, referenceId: refId,
    });
    if (!entry.written) continue;   // už zaplaceno v dřívějším běhu
    collected++;
    await recordTransaction(
      c.env.DB, club.id, "competition_fee", -DEFAULT_RULES.entry_fee,
      `Startovné do soutěže (${meta.season_number}. sezóna)`, gameDate, refId,
    ).catch((e) => logger.warn({ module: M }, `startovné klubu ${club.id}`, e));
  }

  // Bez vyhlášených voleb by soutěž zůstala napořád bez vedení.
  const electionsOpened = await openElections(c.env.DB, leagueId, meta.season_number, gameDate);

  return c.json({
    ok: true, humanClubs: humans, totalClubs: teams, subsidy,
    entryFeesCollected: collected, electionsOpened,
    balance: await readBalance(c.env.DB, leagueId),
  });
});

// ── Disciplinární rada ──────────────────────────────────────────────────────
competitionRouter.get("/competition/:leagueId/discipline", async (c) => {
  const leagueId = c.req.param("leagueId");
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const clubs = await c.env.DB.prepare(
    `SELECT t.id, t.name,
            ${MANAGER_NAME("t.id")} AS manager_name,
            ${MANAGER_AVATAR("t.id")} AS manager_avatar
       FROM teams t WHERE t.league_id = ? ORDER BY t.name`
  ).bind(leagueId).all<{ id: string; name: string; manager_name: string | null; manager_avatar: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "kluby soutěže", e); return { results: [] }; });

  // Důkazy se sbírají pro každý klub zvlášť — formulář pak nenabídne skutek,
  // který se nedá doložit.
  const targets = [];
  for (const club of clubs.results) {
    targets.push({
      teamId: club.id, teamName: club.name,
      managerName: club.manager_name,
      managerAvatar: safeJson(club.manager_avatar),
      evidence: await collectEvidence(c.env.DB, club.id),
    });
  }

  const sanctions = await c.env.DB.prepare(
    `SELECT s.*, t.name AS team_name, ${MANAGER_NAME("s.team_id")} AS manager_name
       FROM competition_sanctions s
       JOIN teams t ON t.id = s.team_id
      WHERE s.league_id = ? AND s.season_number = ?
      ORDER BY s.created_at DESC LIMIT 40`
  ).bind(leagueId, meta.season_number).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "seznam sankcí", e); return { results: [] }; });

  return c.json({
    offences: Object.values(OFFENCES).map((o) => ({
      kind: o.kind, label: o.label, evidenceLabel: o.evidenceLabel,
      majority: o.majority, freeText: !!o.freeText,
    })),
    limits: { min: FINE_MIN, max: FINE_MAX, chairLimit: CHAIR_FINE_LIMIT },
    targets,
    sanctions: sanctions.results.map((s) => ({
      id: s.id, teamId: s.team_id, teamName: s.team_name, managerName: s.manager_name,
      kind: s.kind, amount: s.amount, reason: s.reason, evidence: s.evidence,
      issuedBy: s.issued_by, status: s.status, gameDate: s.game_date,
    })),
  });
});

competitionRouter.post("/teams/:teamId/competition/sanctions", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ targetTeamId?: string; offence?: string; amount?: number; note?: string }>()
    .catch(() => null);
  if (!body?.targetTeamId || !body.offence) return c.json({ error: "Chybí klub nebo skutek" }, 400);

  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const gov = await loadGovernance(c.env.DB, leagueId);
  if (!gov?.enabled) return c.json({ error: "Tahle soutěž zatím samosprávu nemá." }, 403);

  const voters = await voterStats(c.env.DB, leagueId);
  if (!voters.voters.includes(teamId)) {
    return c.json({ error: "Tvůj klub nemá v téhle soutěži hlasovací právo." }, 403);
  }
  if (body.targetTeamId === teamId) {
    return c.json({ error: "Návrh na pokutu pro vlastní klub podat nejde." }, 400);
  }

  const offence = OFFENCES[body.offence];
  if (!offence) return c.json({ error: "Neznámý skutek" }, 400);

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount < FINE_MIN || amount > FINE_MAX) {
    return c.json({ error: `Pokuta musí být mezi ${FINE_MIN.toLocaleString("cs")} a ${FINE_MAX.toLocaleString("cs")} Kč.` }, 400);
  }

  const allowed = await canFine(c.env.DB, leagueId, body.targetTeamId, meta.season_number, body.offence);
  if (!allowed.ok) return c.json({ error: allowed.reason }, 409);

  // Bez důkazu se dá podat jen volná položka — a ta má tvrdší podmínky.
  let evidence: string | null = null;
  if (!offence.freeText) {
    const found = (await collectEvidence(c.env.DB, body.targetTeamId)).find((e) => e.kind === body.offence);
    if (!found) return c.json({ error: "Tenhle skutek se u toho klubu nedá doložit." }, 400);
    evidence = found.detail;
  } else if (!body.note || body.note.trim().length < 10) {
    return c.json({ error: "U nesportovního chování musíš napsat, co se stalo (aspoň 10 znaků)." }, 400);
  }

  const target = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(body.targetTeamId).first<{ name: string }>().catch(() => null);
  const gameDate = await currentGameDate(c.env.DB, teamId);
  const id = crypto.randomUUID();
  const reason = offence.freeText ? (body.note ?? "").slice(0, 200) : offence.label;

  await c.env.DB.prepare(
    `INSERT INTO competition_proposals
      (id, league_id, season_number, kind, gesce, title, body, payload, proposed_by_team_id,
       target_team_id, evidence, majority, quorum, opened_game_date, deposit)
     VALUES (?,?,?,'sanction','disciplinarni',?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, leagueId, meta.season_number,
    `Pokuta ${amount.toLocaleString("cs")} Kč — ${target?.name ?? "klub"} (${offence.label})`,
    reason,
    JSON.stringify({ offence: body.offence, amount, evidence, reason }),
    teamId, body.targetTeamId, evidence, offence.majority, 0.5, gameDate, PROPOSAL_DEPOSIT,
  ).run();

  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(
    c.env.DB, teamId, "competition_deposit", -PROPOSAL_DEPOSIT,
    "Kauce za návrh na pokutu", gameDate, `dep-${id}`,
  ).catch((e) => logger.warn({ module: M }, "stržení kauce", e));
  await recordCompetitionEntry(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, type: "deposit",
    amount: PROPOSAL_DEPOSIT, description: "Kauce za návrh na pokutu",
    teamId, gameDate, referenceId: `dep-${id}`,
  });

  return c.json({ ok: true, id, evidence });
});

/** Obhajoba dotčeného klubu — visí nad hlasovacími tlačítky a jde do zápisu. */
competitionRouter.post("/teams/:teamId/competition/proposals/:id/defence", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ text?: string }>().catch(() => null);
  const text = (body?.text ?? "").trim().slice(0, 150);
  if (!text) return c.json({ error: "Obhajoba nesmí být prázdná." }, 400);

  const res = await c.env.DB.prepare(
    "UPDATE competition_proposals SET defence = ? WHERE id = ? AND target_team_id = ? AND status = 'open'"
  ).bind(text, c.req.param("id"), teamId).run()
    .catch((e) => { logger.warn({ module: M }, "zápis obhajoby", e); return null; });
  if (!res || (res.meta?.changes ?? 0) === 0) {
    return c.json({ error: "Obhajobu můžeš napsat jen k otevřenému návrhu, který se týká tvého klubu." }, 409);
  }
  return c.json({ ok: true, text });
});

/** Odvolání proti uložené pokutě — otevře nový bod na programu. */
competitionRouter.post("/teams/:teamId/competition/sanctions/:id/appeal", async (c) => {
  const teamId = c.req.param("teamId");
  const sanctionId = c.req.param("id");

  const s = await c.env.DB.prepare(
    "SELECT * FROM competition_sanctions WHERE id = ? AND team_id = ?"
  ).bind(sanctionId, teamId).first<{
    id: string; league_id: string; season_number: number; amount: number; reason: string; status: string;
  }>().catch((e) => { logger.warn({ module: M }, "sankce k odvolání", e); return null; });
  if (!s) return c.json({ error: "Taková pokuta u tvého klubu není." }, 404);
  if (s.status !== "issued") return c.json({ error: "Proti téhle pokutě se už odvolat nedá." }, 409);

  const gameDate = await currentGameDate(c.env.DB, teamId);
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO competition_proposals
      (id, league_id, season_number, kind, gesce, title, body, payload, proposed_by_team_id,
       majority, quorum, opened_game_date, deposit)
     VALUES (?,?,?,'appeal','disciplinarni',?,?,?,?,?,?,?,0)`
  ).bind(
    id, s.league_id, s.season_number,
    `Odvolání proti pokutě ${s.amount.toLocaleString("cs")} Kč`,
    s.reason, JSON.stringify({ sanctionId: s.id }), teamId, 0.5, 0.5, gameDate,
  ).run();

  await c.env.DB.prepare("UPDATE competition_sanctions SET status = 'appealed', appeal_proposal_id = ? WHERE id = ?")
    .bind(id, sanctionId).run()
    .catch((e) => logger.warn({ module: M }, "označení sankce jako odvolané", e));

  // Odvolání je zadarmo — trestat obranu kaucí by bylo proti smyslu.
  return c.json({ ok: true, id });
});

/** Pokuta uložená předsedou disciplinární rady bez hlasování. */
competitionRouter.post("/teams/:teamId/competition/sanctions/direct", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ targetTeamId?: string; offence?: string; amount?: number; note?: string }>()
    .catch(() => null);
  if (!body?.targetTeamId || !body.offence) return c.json({ error: "Chybí klub nebo skutek" }, 400);

  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const govDirect = await loadGovernance(c.env.DB, leagueId);
  if (!govDirect?.enabled) return c.json({ error: "Tahle soutěž zatím samosprávu nemá." }, 403);

  // Prezident zastupuje neobsazenou disciplinární radu — nadřízenost v praxi.
  const act = await actsFor(c.env.DB, leagueId, teamId, "disciplinarni", meta.season_number);
  if (!act.ok) return c.json({ error: act.reason }, 403);

  const amount = Math.round(Number(body.amount));
  const chair = await canChairFine(c.env.DB, leagueId, teamId, body.targetTeamId, meta.season_number, amount, act.asPresident);
  if (!chair.ok) return c.json({ error: chair.reason }, 403);

  const allowed = await canFine(c.env.DB, leagueId, body.targetTeamId, meta.season_number, body.offence);
  if (!allowed.ok) return c.json({ error: allowed.reason }, 409);

  const offence = OFFENCES[body.offence];
  if (!offence) return c.json({ error: "Neznámý skutek" }, 400);

  let evidence: string | null = null;
  if (!offence.freeText) {
    const found = (await collectEvidence(c.env.DB, body.targetTeamId)).find((e) => e.kind === body.offence);
    if (!found) return c.json({ error: "Tenhle skutek se u toho klubu nedá doložit." }, 400);
    evidence = found.detail;
  }

  const gameDate = await currentGameDate(c.env.DB, teamId);
  const id = await issueSanction(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, teamId: body.targetTeamId, amount,
    kind: body.offence, reason: offence.freeText ? (body.note ?? offence.label).slice(0, 200) : offence.label,
    evidence, issuedBy: "chair", issuedByTeamId: teamId, proposalId: null, gameDate,
  });
  if (!id) return c.json({ error: "Pokutu se nepodařilo uložit." }, 500);

  await c.env.DB.prepare(
    `UPDATE competition_officials SET used_fines = used_fines + 1
      WHERE league_id = ? AND role = ? AND team_id = ? AND season_number = ? AND status = 'active'`
  ).bind(leagueId, act.asPresident ? "predseda" : "disciplinarni", teamId, meta.season_number).run()
    .catch((e) => logger.warn({ module: M }, "čerpání pravomoci předsedy", e));

  return c.json({ ok: true, id });
});

// ── Komise rozhodčích ───────────────────────────────────────────────────────
competitionRouter.get("/competition/:leagueId/referees", async (c) => {
  const leagueId = c.req.param("leagueId");
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const standings = await refereeStandings(c.env.DB, leagueId, meta.season_number, meta.district);
  const check = await canBanReferee(c.env.DB, leagueId, meta.season_number, meta.district);

  return c.json({
    minList: MIN_ACTIVE_REFEREES,
    canBan: check.ok, banReason: check.reason ?? null, usable: check.usable ?? standings.length,
    referees: standings,
  });
});

competitionRouter.post("/teams/:teamId/competition/referee-bans", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ refereeId?: string; note?: string }>().catch(() => null);
  if (!body?.refereeId) return c.json({ error: "Chybí rozhodčí" }, 400);

  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const gov = await loadGovernance(c.env.DB, leagueId);
  if (!gov?.enabled) return c.json({ error: "Tahle soutěž zatím samosprávu nemá." }, 403);

  const voters = await voterStats(c.env.DB, leagueId);
  if (!voters.voters.includes(teamId)) {
    return c.json({ error: "Tvůj klub nemá v téhle soutěži hlasovací právo." }, 403);
  }

  const check = await canBanReferee(c.env.DB, leagueId, meta.season_number, meta.district);
  if (!check.ok) return c.json({ error: check.reason }, 409);

  const already = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM competition_proposals WHERE league_id = ? AND kind = 'referee_ban' AND status = 'open'"
  ).bind(leagueId).first<{ n: number }>().catch(() => null);
  if ((already?.n ?? 0) > 0) {
    return c.json({ error: "Jeden návrh na vyškrtnutí už na programu je." }, 409);
  }

  const standings = await refereeStandings(c.env.DB, leagueId, meta.season_number, meta.district);
  const ref = standings.find((r) => r.refereeId === body.refereeId);
  if (!ref) return c.json({ error: "Takový rozhodčí na listině není." }, 404);

  const gameDate = await currentGameDate(c.env.DB, teamId);
  const id = crypto.randomUUID();
  const note = (body.note ?? "").slice(0, 200);

  await c.env.DB.prepare(
    `INSERT INTO competition_proposals
      (id, league_id, season_number, kind, gesce, title, body, payload, proposed_by_team_id,
       majority, quorum, opened_game_date, deposit, evidence)
     VALUES (?,?,?,'referee_ban','rozhodcich',?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, leagueId, meta.season_number,
    `Vyškrtnutí rozhodčího ${ref.name} z listiny`,
    note, JSON.stringify({ refereeId: ref.refereeId, refereeName: ref.name, reason: note }),
    teamId, 2 / 3, 0.5, gameDate, PROPOSAL_DEPOSIT,
    ref.avgGrade !== null ? `Průměrná známka ${ref.avgGrade.toFixed(2)} z ${ref.matches} zápasů.` : null,
  ).run();

  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(
    c.env.DB, teamId, "competition_deposit", -PROPOSAL_DEPOSIT,
    "Kauce za návrh na vyškrtnutí rozhodčího", gameDate, `dep-${id}`,
  ).catch((e) => logger.warn({ module: M }, "stržení kauce", e));
  await recordCompetitionEntry(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, type: "deposit",
    amount: PROPOSAL_DEPOSIT, description: "Kauce za návrh na vyškrtnutí rozhodčího",
    teamId, gameDate, referenceId: `dep-${id}`,
  });

  return c.json({ ok: true, id });
});

/**
 * Komisař rozhodčích škrtne sudího sám, bez hlasování.
 *
 * Sezónní strop tu vědomě NENÍ — stejně jako u vyškrtnutí hlasováním. Brzdou je
 * minimální velikost listiny a to, že se vyškrtnutý sudí po sezóně vrátí
 * a pamatuje si, kdo ho škrtl.
 */
competitionRouter.post("/teams/:teamId/competition/referee-bans/direct", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ refereeId?: string; note?: string }>().catch(() => null);
  if (!body?.refereeId) return c.json({ error: "Chybí rozhodčí" }, 400);
  const note = (body.note ?? "").trim();
  if (note.length < 10) {
    return c.json({ error: "Napiš důvod (aspoň 10 znaků). Uvidí ho celá soutěž." }, 400);
  }

  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);
  const gov = await loadGovernance(c.env.DB, leagueId);
  if (!gov?.enabled) return c.json({ error: "Tahle soutěž zatím samosprávu nemá." }, 403);

  // Neobsazenou komisi zastupuje prezident — čerpá ale vlastní počítadlo.
  const act = await actsFor(c.env.DB, leagueId, teamId, "rozhodcich", meta.season_number);
  if (!act.ok) return c.json({ error: act.reason }, 403);

  const slot = await c.env.DB.prepare(
    `SELECT used_ban FROM competition_officials
      WHERE league_id = ? AND role = ? AND team_id = ? AND season_number = ? AND status = 'active'`
  ).bind(leagueId, act.asPresident ? "predseda" : "rozhodcich", teamId, meta.season_number)
    .first<{ used_ban: number }>()
    .catch((e) => { logger.warn({ module: M }, "čerpání pravomoci komisaře", e); return null; });
  if (!slot) return c.json({ error: "Tuhle pravomoc má jen komisař rozhodčích." }, 403);

  const check = await canBanReferee(c.env.DB, leagueId, meta.season_number, meta.district);
  if (!check.ok) return c.json({ error: check.reason }, 409);

  const standings = await refereeStandings(c.env.DB, leagueId, meta.season_number, meta.district);
  const ref = standings.find((r) => r.refereeId === body.refereeId);
  if (!ref) return c.json({ error: "Takový rozhodčí na listině není." }, 404);

  const gameDate = await currentGameDate(c.env.DB, teamId);
  const { applyRefereeBan } = await import("../competition/referee-bans");
  const done = await applyRefereeBan(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, refereeId: ref.refereeId,
    reason: note, source: "komise", proposalId: null, gameDate,
  });
  if (!done) return c.json({ error: "Tenhle rozhodčí už letos vyškrtnutý je." }, 409);

  await c.env.DB.prepare(
    `UPDATE competition_officials SET used_ban = used_ban + 1
      WHERE league_id = ? AND role = ? AND team_id = ? AND season_number = ? AND status = 'active'`
  ).bind(leagueId, act.asPresident ? "predseda" : "rozhodcich", teamId, meta.season_number).run()
    .catch((e) => logger.warn({ module: M }, "čerpání pravomoci komisaře", e));

  return c.json({ ok: true });
});

// ── Pravomoci prezidenta ────────────────────────────────────────────────────
competitionRouter.post("/teams/:teamId/competition/officials/:role/suspend", async (c) => {
  const teamId = c.req.param("teamId");
  const role = c.req.param("role");
  const body = await c.req.json<{ reason?: string }>().catch(() => null);
  const reason = (body?.reason ?? "").trim();
  if (reason.length < 10) {
    return c.json({ error: "Napiš, proč mu pravomoc bereš (aspoň 10 znaků). Uvidí to celé grémium." }, 400);
  }

  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const gameDate = await currentGameDate(c.env.DB, teamId);
  const out = await suspendOfficial(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, presidentTeamId: teamId,
    role: role as never, reason, gameDate,
  });
  if (!out.ok) return c.json({ error: out.reason }, 403);
  return c.json({ ok: true, proposalId: out.proposalId });
});

/**
 * Demise. Bez hlasování a hned — jen ten, kdo funkci sám zastává.
 *
 * Kdo rezignuje ve chvíli, kdy už se o jeho odvolání hlasuje, odchází se stejným
 * postihem jako odvolaný; odpověď to říká na rovinu, ať to hráč vidí i potom.
 */
competitionRouter.post("/teams/:teamId/competition/officials/:role/resign", async (c) => {
  const teamId = c.req.param("teamId");
  const role = c.req.param("role") as OfficialRole;

  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const gameDate = await currentGameDate(c.env.DB, teamId);
  const out = await resignOfficial(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, teamId, role, gameDate,
  });
  if (!out.ok) return c.json({ error: out.reason }, 403);
  return c.json({ ok: true, jakoOdvolani: !!out.jakoOdvolani });
});

// ── Kabinet — interní vlákno vedení ─────────────────────────────────────────
// Čte i píše JEN ten, kdo v soutěži zastává funkci. Pozastavený předseda přístup
// neztrácí — dokud ho kluby neodvolají, do vedení pořád patří.
competitionRouter.get("/teams/:teamId/competition/board", async (c) => {
  const teamId = c.req.param("teamId");
  // Neveřejné vlákno — čte ho jen majitel klubu, který v grémiu sedí.
  if (!(await ownsTeam(c as never, teamId))) return c.json({ error: "Přístup odepřen" }, 403);
  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  // Nástěnku vidí každý klub soutěže, kabinet jen ten, kdo v grémiu sedí,
  // a vzkazy odboru jen jeho předseda, prezident a odesílatel.
  const seat = await seatOf(c.env.DB, leagueId, teamId, meta.season_number);
  const publicMessages = await listMessages(c.env.DB, leagueId, "verejne");
  const voters = await voterStats(c.env.DB, leagueId);
  const humans = await countHumanClubs(c.env.DB, leagueId);

  const inbox: Record<string, unknown[]> = {};
  for (const role of rolesFor(humans)) {
    inbox[role] = await listForRole(c.env.DB, {
      leagueId, role, viewerTeamId: teamId,
      viewerSeesAll: seat?.role === "predseda" || seat?.role === role,
    });
  }

  const base = {
    publicMessages, inbox,
    canPost: voters.voters.includes(teamId),
    maxLength: BOARD_MESSAGE_MAX,
  };

  if (!seat) return c.json({ ...base, seat: null, messages: [], unread: 0 });

  const messages = await listMessages(c.env.DB, leagueId, "kabinet");
  const unread = await unreadCount(c.env.DB, leagueId, teamId);
  await markRead(c.env.DB, leagueId, teamId);

  return c.json({ ...base, seat, messages, unread });
});

competitionRouter.post("/teams/:teamId/competition/board", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ text?: string; scope?: string; targetRole?: string }>().catch(() => null);
  const text = (body?.text ?? "").trim();
  if (!text) return c.json({ error: "Zpráva nesmí být prázdná." }, 400);
  const scope = body?.scope === "verejne" ? "verejne"
    : body?.scope === "odbor" ? "odbor" : "kabinet";
  const targetRole = body?.targetRole as OfficialRole | undefined;

  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const seat = await seatOf(c.env.DB, leagueId, teamId, meta.season_number);
  if (scope === "kabinet" && !seat) {
    return c.json({ error: "Do kabinetu píše jen vedení soutěže." }, 403);
  }
  if (scope === "verejne" || scope === "odbor") {
    // Na nástěnku i odboru píše každý klub s hlasovacím právem — stížnost je jeho
    // zbraň, i když v grémiu nesedí. AI kluby se do soutěže nepletou.
    const voters = await voterStats(c.env.DB, leagueId);
    if (!voters.voters.includes(teamId)) {
      return c.json({ error: "Tvůj klub nemá v téhle soutěži hlasovací právo." }, 403);
    }
  }
  if (scope === "odbor") {
    const humans = await countHumanClubs(c.env.DB, leagueId);
    if (!targetRole || !rolesFor(humans).includes(targetRole)) {
      return c.json({ error: "Takový odbor v téhle soutěži není." }, 400);
    }
  }

  const who = await c.env.DB.prepare(
    `SELECT t.name AS team_name, ${MANAGER_NAME("t.id")} AS manager_name
       FROM teams t WHERE t.id = ?`
  ).bind(teamId).first<{ team_name: string; manager_name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "jméno pisatele", e); return null; });

  const id = await postMessage(c.env.DB, {
    leagueId, seasonNumber: meta.season_number, teamId,
    senderName: who?.manager_name ?? "neznámý trenér",
    teamName: who?.team_name ?? "klub", scope, seat,
    targetRole: scope === "odbor" ? targetRole : null,
    body: text,
  });
  if (!id) return c.json({ error: "Zprávu se nepodařilo uložit." }, 500);
  return c.json({ ok: true, id });
});

// ── Volby předsedů ──────────────────────────────────────────────────────────
competitionRouter.get("/competition/:leagueId/elections", async (c) => {
  const leagueId = c.req.param("leagueId");
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT e.*, t.name AS winner_name, ${MANAGER_NAME("e.winner_team_id")} AS winner_manager
       FROM competition_elections e
       LEFT JOIN teams t ON t.id = e.winner_team_id
      WHERE e.league_id = ? AND e.season_number = ?
      ORDER BY CASE WHEN e.status = 'open' THEN 0 ELSE 1 END, e.role`
  ).bind(leagueId, meta.season_number).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "seznam voleb", e); return { results: [] }; });

  const ids = rows.results.map((r) => r.id as string);
  // Kandidují TRENÉŘI, ne kluby — klub je jen adresa, na které se dá zastihnout.
  // V datech zůstává klíčem team_id (jeden trenér = jeden klub), zobrazuje se jméno.
  const candidates: Record<string, Array<{ teamId: string; teamName: string; managerName: string | null }>> = {};
  if (ids.length > 0) {
    const cr = await c.env.DB.prepare(
      `SELECT c.election_id, c.team_id, t.name AS team_name,
              ${MANAGER_NAME("c.team_id")} AS manager_name
         FROM competition_candidacies c
         JOIN teams t ON t.id = c.team_id
        WHERE c.election_id IN (${ids.map(() => "?").join(",")}) AND c.withdrawn = 0
        ORDER BY manager_name, t.name`
    ).bind(...ids).all<{ election_id: string; team_id: string; team_name: string; manager_name: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "kandidáti", e); return { results: [] }; });
    for (const r of cr.results) {
      (candidates[r.election_id] ??= []).push({
        teamId: r.team_id, teamName: r.team_name, managerName: r.manager_name,
      });
    }
  }

  // Účast: kolik klubů už hlasovalo. Číslo ano, jména ne — stejně jako u návrhů.
  // U uzavřené volby je v řádku, u otevřené se musí spočítat živě.
  const turnout: Record<string, number> = {};
  if (ids.length > 0) {
    const tr = await c.env.DB.prepare(
      `SELECT election_id, COUNT(*) AS n FROM competition_election_ballots
        WHERE election_id IN (${ids.map(() => "?").join(",")}) GROUP BY election_id`
    ).bind(...ids).all<{ election_id: string; n: number }>()
      .catch((e) => { logger.warn({ module: M }, "účast ve volbě", e); return { results: [] }; });
    for (const r of tr.results) turnout[r.election_id] = r.n;
  }

  // Vlastní hlas vidí jen ten, kdo ho odevzdal. Volba je tajná i po uzavření.
  const myTeam = await currentTeam(c as never);
  const myVote: Record<string, string> = {};
  if (myTeam && ids.length > 0) {
    const mv = await c.env.DB.prepare(
      `SELECT election_id, candidate_team_id FROM competition_election_ballots
        WHERE team_id = ? AND election_id IN (${ids.map(() => "?").join(",")})`
    ).bind(myTeam, ...ids).all<{ election_id: string; candidate_team_id: string }>()
      .catch((e) => { logger.warn({ module: M }, "můj hlas ve volbě", e); return { results: [] }; });
    for (const r of mv.results) myVote[r.election_id] = r.candidate_team_id;
  }

  return c.json({
    elections: rows.results.map((e) => ({
      id: e.id, role: e.role,
      roleLabel: ROLE_LABEL[e.role as OfficialRole] ?? e.role,
      status: e.status,
      winnerTeamId: e.winner_team_id, winnerName: e.winner_name,
      winnerManager: e.winner_manager,
      votesCast: turnout[e.id as string] ?? e.votes_cast,
      resultNote: e.result_note,
      candidates: candidates[e.id as string] ?? [],
      myVote: myVote[e.id as string] ?? null,
    })),
  });
});

competitionRouter.post("/teams/:teamId/competition/elections/:id/candidacy", async (c) => {
  const teamId = c.req.param("teamId");
  const electionId = c.req.param("id");

  const el = await c.env.DB.prepare(
    "SELECT league_id, role, season_number, status FROM competition_elections WHERE id = ?"
  ).bind(electionId).first<{ league_id: string; role: string; season_number: number; status: string }>()
    .catch((e) => { logger.warn({ module: M }, "volba", e); return null; });
  if (!el) return c.json({ error: "Volba nenalezena" }, 404);
  if (el.status !== "open") return c.json({ error: "Volba už je uzavřená." }, 409);

  const check = await canRunFor(c.env.DB, el.league_id, teamId, el.role as OfficialRole, el.season_number);
  if (!check.ok) return c.json({ error: check.reason }, 403);

  await c.env.DB.prepare(
    `INSERT INTO competition_candidacies (id, election_id, team_id) VALUES (?,?,?)
     ON CONFLICT(election_id, team_id) DO UPDATE SET withdrawn = 0`
  ).bind(crypto.randomUUID(), electionId, teamId).run();

  await c.env.DB.prepare(
    "UPDATE competition_elections SET candidates = (SELECT COUNT(*) FROM competition_candidacies WHERE election_id = ? AND withdrawn = 0) WHERE id = ?"
  ).bind(electionId, electionId).run()
    .catch((e) => logger.warn({ module: M }, "počet kandidátů", e));

  return c.json({ ok: true });
});

competitionRouter.delete("/teams/:teamId/competition/elections/:id/candidacy", async (c) => {
  const electionId = c.req.param("id");
  // `AND withdrawn = 0` je podstatné: SQLite počítá řádky, které WHERE trefil,
  // ne ty, kde se hodnota změnila. Bez toho hlásilo druhé stažení „ok".
  const res = await c.env.DB.prepare(
    "UPDATE competition_candidacies SET withdrawn = 1 WHERE election_id = ? AND team_id = ? AND withdrawn = 0"
  ).bind(electionId, c.req.param("teamId")).run()
    .catch((e) => { logger.warn({ module: M }, "stažení kandidatury", e); return null; });
  if (!res || (res.meta?.changes ?? 0) === 0) return c.json({ error: "Kandidaturu nemáš podanou." }, 409);

  await c.env.DB.prepare(
    "UPDATE competition_elections SET candidates = (SELECT COUNT(*) FROM competition_candidacies WHERE election_id = ? AND withdrawn = 0) WHERE id = ?"
  ).bind(electionId, electionId).run()
    .catch((e) => logger.warn({ module: M }, "počet kandidátů po stažení", e));

  return c.json({ ok: true });
});

competitionRouter.post("/teams/:teamId/competition/elections/:id/vote", async (c) => {
  const teamId = c.req.param("teamId");
  const electionId = c.req.param("id");
  const body = await c.req.json<{ candidateTeamId?: string }>().catch(() => null);
  if (!body?.candidateTeamId) return c.json({ error: "Chybí kandidát" }, 400);

  const el = await c.env.DB.prepare(
    "SELECT league_id, status FROM competition_elections WHERE id = ?"
  ).bind(electionId).first<{ league_id: string; status: string }>()
    .catch((e) => { logger.warn({ module: M }, "volba", e); return null; });
  if (!el) return c.json({ error: "Volba nenalezena" }, 404);
  if (el.status !== "open") return c.json({ error: "Volba už je uzavřená." }, 409);

  const voters = await voterStats(c.env.DB, el.league_id);
  if (!voters.voters.includes(teamId)) {
    return c.json({ error: "Tvůj klub nemá v téhle soutěži hlasovací právo." }, 403);
  }

  const isCandidate = await c.env.DB.prepare(
    "SELECT 1 FROM competition_candidacies WHERE election_id = ? AND team_id = ? AND withdrawn = 0"
  ).bind(electionId, body.candidateTeamId).first()
    .catch((e) => { logger.warn({ module: M }, "ověření kandidáta", e); return null; });
  if (!isCandidate) return c.json({ error: "Tenhle klub ve volbě nekandiduje." }, 400);

  await c.env.DB.prepare(
    `INSERT INTO competition_election_ballots (id, election_id, team_id, candidate_team_id)
     VALUES (?,?,?,?)
     ON CONFLICT(election_id, team_id) DO UPDATE SET candidate_team_id = excluded.candidate_team_id,
       voted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
  ).bind(crypto.randomUUID(), electionId, teamId, body.candidateTeamId).run();

  return c.json({ ok: true });
});

competitionRouter.get("/teams/:teamId/competition/candidacy-check", async (c) => {
  const teamId = c.req.param("teamId");
  const leagueId = await leagueOfTeam(c.env.DB, teamId);
  if (!leagueId) return c.json({ error: "Tým není v soutěži" }, 404);
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const humans = await countHumanClubs(c.env.DB, leagueId);
  const out: Record<string, { ok: boolean; reason?: string }> = {};
  for (const role of rolesFor(humans)) {
    const r = await canRunFor(c.env.DB, leagueId, teamId, role, meta.season_number);
    out[role] = { ok: r.ok, reason: r.reason };
  }
  return c.json({ roles: out });
});

competitionRouter.post("/admin/competition/:leagueId/elections", async (c) => {
  const leagueId = c.req.param("leagueId");
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);
  const gameDate = await c.env.DB.prepare("SELECT MAX(game_date) AS d FROM teams WHERE league_id = ?")
    .bind(leagueId).first<{ d: string | null }>().then((r) => r?.d ?? new Date().toISOString())
    .catch(() => new Date().toISOString());
  const opened = await openElections(c.env.DB, leagueId, meta.season_number, gameDate);
  return c.json({ ok: true, opened });
});

/**
 * Ruční svolání schůze. Za provozu ji spouští denní tick ve středu; tenhle
 * endpoint existuje pro ověřování a pro případ, kdy tick schůzi zmešká.
 * Idempotence je stejná jako u ticku — druhé volání týž herní den nic neudělá.
 */
competitionRouter.post("/admin/competition/:leagueId/meeting", async (c) => {
  const leagueId = c.req.param("leagueId");
  const gameDate = await c.env.DB.prepare(
    "SELECT MAX(game_date) AS d FROM teams WHERE league_id = ?"
  ).bind(leagueId).first<{ d: string | null }>().then((r) => r?.d)
    .catch((e) => { logger.warn({ module: M }, "herní datum ligy", e); return null; });
  if (!gameDate) return c.json({ error: "Soutěž nemá herní datum" }, 400);

  const { runOneMeeting } = await import("../competition/meeting");
  const out = await runOneMeeting(c.env.DB, leagueId, gameDate);
  if (!out) {
    return c.json({ ok: true, held: false, reason: "Žádný bod na programu, nebo dnes už schůze proběhla." });
  }
  return c.json({ ok: true, held: true, ...out });
});

export default competitionRouter;
