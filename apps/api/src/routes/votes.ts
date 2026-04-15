/**
 * Hlasování Předsedy Pralesu — celoligová hlasování (ANO/NE).
 * Vytváří a uzavírá admin, hlasovat může každý tým (dobrovolné).
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { getSession, getTokenFromRequest } from "../auth/session";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";

const votesRouter = new Hono<{ Bindings: Bindings }>();

votesRouter.use("/admin/*", requireAdmin);
votesRouter.use("/teams/:teamId/*", requireTeamOwnership);

// GET /api/votes — seznam všech hlasování + počty + můj hlas (token volitelný)
votesRouter.get("/votes", async (c) => {
  // Token nepovinný — bez tokenu vrátí my_answer: null pro všechna hlasování
  const token = getTokenFromRequest(c);
  const session = token ? await getSession(c.env.SESSION_KV, token).catch((e) => { logger.warn({ module: "votes" }, "get session failed", e); return null; }) : null;

  const team = session
    ? await c.env.DB.prepare("SELECT id FROM teams WHERE user_id = ?")
        .bind(session.userId).first<{ id: string }>()
        .catch((e) => { logger.warn({ module: "votes" }, "fetch team", e); return null; })
    : null;

  const votes = await c.env.DB.prepare(
    `SELECT v.id, v.title, v.description, v.status, v.created_at, v.closed_at,
     (SELECT COUNT(*) FROM prales_vote_ballots b WHERE b.vote_id = v.id AND b.answer = 'ano') as ano_count,
     (SELECT COUNT(*) FROM prales_vote_ballots b WHERE b.vote_id = v.id AND b.answer = 'ne') as ne_count,
     (SELECT COUNT(*) FROM teams WHERE user_id != 'ai' AND user_id IS NOT NULL) as total_teams
     FROM prales_votes v
     ORDER BY CASE WHEN v.status = 'open' THEN 0 ELSE 1 END, v.created_at DESC`
  ).all().catch((e) => { logger.warn({ module: "votes" }, "fetch votes", e); return { results: [] }; });

  // Načíst mé hlasy najednou (efektivněji než per-vote query)
  const myBallots: Record<string, string> = {};
  if (team) {
    const ballots = await c.env.DB.prepare(
      "SELECT vote_id, answer FROM prales_vote_ballots WHERE team_id = ?"
    ).bind(team.id).all().catch((e) => { logger.warn({ module: "votes" }, "fetch my ballots", e); return { results: [] }; });
    for (const b of ballots.results) {
      myBallots[b.vote_id as string] = b.answer as string;
    }
  }

  return c.json(votes.results.map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description,
    status: v.status,
    created_at: v.created_at,
    closed_at: v.closed_at,
    ano_count: v.ano_count ?? 0,
    ne_count: v.ne_count ?? 0,
    total_teams: v.total_teams ?? 0,
    my_answer: myBallots[v.id as string] ?? null,
  })));
});

// POST /api/admin/votes — vytvoření hlasování (jen admin — chráněno requireAdmin middleware)
votesRouter.post("/admin/votes", async (c) => {
  const session = await getSession(c.env.SESSION_KV, getTokenFromRequest(c)!);
  const body = await c.req.json<{ title: string; description?: string }>();
  if (!body.title?.trim()) return c.json({ error: "Název je povinný" }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO prales_votes (id, title, description, created_by) VALUES (?, ?, ?, ?)"
  ).bind(id, body.title.trim(), body.description?.trim() ?? null, session!.userId).run();

  logger.info({ module: "votes" }, `vote created: ${id} "${body.title.trim()}"`);
  return c.json({ id });
});

// POST /api/admin/votes/:voteId/close — ruční ukončení (jen admin — chráněno requireAdmin middleware)
votesRouter.post("/admin/votes/:voteId/close", async (c) => {
  const voteId = c.req.param("voteId");
  const result = await c.env.DB.prepare(
    "UPDATE prales_votes SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status = 'open'"
  ).bind(voteId).run();

  if (result.meta.changes === 0) return c.json({ error: "Hlasování neexistuje nebo je již ukončeno" }, 404);

  logger.info({ module: "votes" }, `vote closed: ${voteId}`);
  return c.json({ ok: true });
});

// POST /api/teams/:teamId/votes/:voteId/ballot — odevzdání hlasu (chráněno requireTeamOwnership middleware)
votesRouter.post("/teams/:teamId/votes/:voteId/ballot", async (c) => {
  const teamId = c.req.param("teamId");
  const voteId = c.req.param("voteId");

  // Ověřit, že hlasování existuje a je otevřené
  const vote = await c.env.DB.prepare(
    "SELECT status FROM prales_votes WHERE id = ?"
  ).bind(voteId).first<{ status: string }>();
  if (!vote) return c.json({ error: "Hlasování nenalezeno" }, 404);
  if (vote.status !== "open") return c.json({ error: "Hlasování je ukončeno" }, 409);

  // Ověřit answer
  const body = await c.req.json<{ answer: string }>();
  if (body.answer !== "ano" && body.answer !== "ne") return c.json({ error: "Neplatná odpověď (ano/ne)" }, 400);

  // Vložit hlas — UNIQUE constraint zabrání duplicitě
  try {
    await c.env.DB.prepare(
      "INSERT INTO prales_vote_ballots (id, vote_id, team_id, answer) VALUES (?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), voteId, teamId, body.answer).run();
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return c.json({ error: "Již jsi hlasoval" }, 409);
    logger.error({ module: "votes" }, "insert ballot failed", e);
    return c.json({ error: "Chyba při ukládání hlasu" }, 500);
  }

  return c.json({ ok: true });
});

export { votesRouter };
