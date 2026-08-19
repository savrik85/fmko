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
  DEFAULT_RULES, MIN_HUMAN_CLUBS, PROPOSAL_DEPOSIT, PROPOSAL_KINDS, ROLE_LABEL,
  type CompetitionRules, type OfficialRole,
} from "../competition/defaults";
import { readBalance, recordCompetitionEntry, seasonSummary } from "../competition/ledger";
import { canRunFor, openElections, rolesFor } from "../competition/officials";
import { proposalTitle, validateProposal, voterStats } from "../competition/proposals";
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
    `SELECT o.role, o.team_id, o.status, t.name AS team_name, m.name AS manager_name
       FROM competition_officials o
       JOIN teams t ON t.id = o.team_id
       LEFT JOIN managers m ON m.team_id = o.team_id
      WHERE o.league_id = ? AND o.season_number = ? AND o.status IN ('active','suspended')`
  ).bind(leagueId, meta.season_number).all<{ role: string; team_id: string; status: string; team_name: string; manager_name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "funkcionáři", e); return { results: [] }; });

  const stats = await voterStats(c.env.DB, leagueId);
  const played = await playedMatches(c.env.DB, leagueId);
  const outstanding = outstandingCommitments(rules, teams, meta.level, played);
  const free = freeBalance(balance, rules, teams, meta.level, played);
  const projection = checkBudget({ rules, teams, level: meta.level, balance: free });

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
    // Které odbory v soutěži téhle velikosti vůbec existují.
    roles: rolesFor(humans).map((role) => {
      const holder = officials.results.find((o) => o.role === role);
      return {
        role, label: ROLE_LABEL[role],
        holder: holder
          ? { teamId: holder.team_id, teamName: holder.team_name, managerName: holder.manager_name }
          : null,
      };
    }),
    proposalKinds: Object.entries(PROPOSAL_KINDS).map(([kind, s]) => ({
      kind, label: s.label, gesce: s.gesce, majority: s.majority,
      min: s.min ?? null, max: s.max ?? null,
      nextSeason: s.nextSeason,
      current: s.rulesField ? rules[s.rulesField] : null,
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
  const v = await validateProposal({
    db: c.env.DB, leagueId, level: meta.level, seasonNumber: meta.season_number,
    currentRules: rules, balance: free, kind: body.kind, value: Number(body.value),
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
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO competition_rules
      (id, league_id, season_number, win_bonus, draw_bonus, place_top, place_decay, place_floor,
       entry_fee, referee_fee, fine_mult, interleague_fee_pct, subsidy_total)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    crypto.randomUUID(), leagueId, meta.season_number,
    DEFAULT_RULES.win_bonus, DEFAULT_RULES.draw_bonus, DEFAULT_RULES.place_top,
    DEFAULT_RULES.place_decay, DEFAULT_RULES.place_floor, DEFAULT_RULES.entry_fee,
    DEFAULT_RULES.referee_fee, DEFAULT_RULES.fine_mult, DEFAULT_RULES.interleague_fee_pct,
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

// ── Volby předsedů ──────────────────────────────────────────────────────────
competitionRouter.get("/competition/:leagueId/elections", async (c) => {
  const leagueId = c.req.param("leagueId");
  const meta = await loadLeagueMeta(c.env.DB, leagueId);
  if (!meta) return c.json({ error: "Soutěž nenalezena" }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT e.*, t.name AS winner_name, m.name AS winner_manager
       FROM competition_elections e
       LEFT JOIN teams t ON t.id = e.winner_team_id
       LEFT JOIN managers m ON m.team_id = e.winner_team_id
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
      `SELECT c.election_id, c.team_id, t.name AS team_name, m.name AS manager_name
         FROM competition_candidacies c
         JOIN teams t ON t.id = c.team_id
         LEFT JOIN managers m ON m.team_id = t.id
        WHERE c.election_id IN (${ids.map(() => "?").join(",")}) AND c.withdrawn = 0
        ORDER BY m.name, t.name`
    ).bind(...ids).all<{ election_id: string; team_id: string; team_name: string; manager_name: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "kandidáti", e); return { results: [] }; });
    for (const r of cr.results) {
      (candidates[r.election_id] ??= []).push({
        teamId: r.team_id, teamName: r.team_name, managerName: r.manager_name,
      });
    }
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
      votesCast: e.votes_cast, resultNote: e.result_note,
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
  const res = await c.env.DB.prepare(
    "UPDATE competition_candidacies SET withdrawn = 1 WHERE election_id = ? AND team_id = ?"
  ).bind(c.req.param("id"), c.req.param("teamId")).run()
    .catch((e) => { logger.warn({ module: M }, "stažení kandidatury", e); return null; });
  if (!res || (res.meta?.changes ?? 0) === 0) return c.json({ error: "Kandidaturu nemáš podanou." }, 409);
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
