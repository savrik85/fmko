/**
 * U21 endpointy — squad, přesuny A↔U21, povýšení.
 * Read endpointy pro tabulku/rozpis využívají existing /api/leagues/:id.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";

const u21Router = new Hono<{ Bindings: Bindings }>();

u21Router.use("/teams/:teamId/u21/*", requireTeamOwnership);
u21Router.use("/teams/:teamId/players/:playerId/send-to-u21", requireTeamOwnership);

/**
 * Discovery: ke kterému U21 týmu a U21 lize patří daný A-tým.
 */
u21Router.get("/teams/:teamId/u21", async (c) => {
  const teamId = c.req.param("teamId");

  const u21Team = await c.env.DB.prepare(
    "SELECT id, league_id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
  ).bind(teamId).first<{ id: string; league_id: string | null }>();

  if (!u21Team) return c.json({ u21TeamId: null, u21LeagueId: null });
  return c.json({ u21TeamId: u21Team.id, u21LeagueId: u21Team.league_id });
});

/**
 * Squad U21 týmu — všichni hráči s flagem o návratu.
 */
u21Router.get("/teams/:teamId/u21/players", async (c) => {
  const teamId = c.req.param("teamId");

  const u21Team = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
  ).bind(teamId).first<{ id: string }>();
  if (!u21Team) return c.json({ error: "U21 tým neexistuje" }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT id, first_name, last_name, nickname, age, position, overall_rating,
            skills, physical, personality, life_context, avatar, weekly_wage, status,
            parent_club_id, next_match_return
       FROM players
      WHERE team_id = ?
      ORDER BY overall_rating DESC`
  ).bind(u21Team.id).all<Record<string, unknown>>();

  const players = rows.results.map((row) => ({
    ...row,
    skills: row.skills ? JSON.parse(row.skills as string) : null,
    physical: row.physical ? JSON.parse(row.physical as string) : null,
    personality: row.personality ? JSON.parse(row.personality as string) : null,
    lifeContext: row.life_context ? JSON.parse(row.life_context as string) : null,
    avatar: row.avatar ? JSON.parse(row.avatar as string) : null,
  }));

  return c.json({ players });
});

/**
 * A → U21: pošle hráče (do 21 let) z A do U21.
 *  - mode='permanent': hráč zůstává v U21 dokud manažer nepovýší
 *  - mode='next_match': hráč se vrátí po nejbližším U21 zápase
 */
u21Router.post("/teams/:teamId/players/:playerId/send-to-u21", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  const body = await c.req.json<{ mode?: string }>().catch(() => ({} as { mode?: string }));
  const mode = body.mode === "next_match" ? "next_match" : "permanent";

  const player = await c.env.DB.prepare(
    "SELECT id, team_id, age, status, loan_from_team_id, next_match_return FROM players WHERE id = ?"
  ).bind(playerId).first<{ id: string; team_id: string; age: number; status: string | null; loan_from_team_id: string | null; next_match_return: number }>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);
  if (player.team_id !== teamId) return c.json({ error: "Hráč nepatří k tomuto týmu" }, 400);
  if (player.age > 21) return c.json({ error: "Hráč je starší 21 let" }, 400);
  if (player.loan_from_team_id) return c.json({ error: "Hostující hráč nemůže do U21" }, 400);
  if (player.next_match_return) return c.json({ error: "Hráč už čeká na návrat z U21" }, 400);

  const u21Team = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
  ).bind(teamId).first<{ id: string }>();
  if (!u21Team) return c.json({ error: "U21 tým neexistuje" }, 404);

  if (mode === "next_match") {
    await c.env.DB.prepare(
      "UPDATE players SET team_id = ?, parent_club_id = ?, next_match_return = 1 WHERE id = ?"
    ).bind(u21Team.id, teamId, playerId).run();
  } else {
    await c.env.DB.prepare(
      "UPDATE players SET team_id = ?, parent_club_id = NULL, next_match_return = 0 WHERE id = ?"
    ).bind(u21Team.id, playerId).run();
  }

  logger.info({ module: "u21", teamId, playerId, mode }, "player sent to U21");
  return c.json({ ok: true, mode });
});

/**
 * U21 → A: povýší hráče zpět do A-týmu (vždy trvale).
 */
u21Router.post("/teams/:teamId/u21/players/:playerId/promote", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const u21Team = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
  ).bind(teamId).first<{ id: string }>();
  if (!u21Team) return c.json({ error: "U21 tým neexistuje" }, 404);

  const player = await c.env.DB.prepare(
    "SELECT id, team_id FROM players WHERE id = ?"
  ).bind(playerId).first<{ id: string; team_id: string }>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);
  if (player.team_id !== u21Team.id) return c.json({ error: "Hráč není v U21" }, 400);

  await c.env.DB.prepare(
    "UPDATE players SET team_id = ?, parent_club_id = NULL, next_match_return = 0 WHERE id = ?"
  ).bind(teamId, playerId).run();

  logger.info({ module: "u21", teamId, playerId }, "player promoted from U21");
  return c.json({ ok: true });
});

/**
 * Růst hráčů U21 týmu za posledních N dní (default 30):
 *   - SUM(change) z training_log per player_id
 *   - filtruje aktuální U21 squad
 * Vrací jen totaly > 0.
 */
u21Router.get("/teams/:teamId/u21/growth", async (c) => {
  const teamId = c.req.param("teamId");
  const days = Math.max(1, Math.min(365, parseInt(c.req.query("days") ?? "30", 10) || 30));

  const u21Team = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
  ).bind(teamId).first<{ id: string }>();
  if (!u21Team) return c.json({ growth: [] });

  const rows = await c.env.DB.prepare(
    `SELECT tl.player_id, SUM(tl.change) as total
       FROM training_log tl
       JOIN players p ON p.id = tl.player_id
      WHERE p.team_id = ?
        AND tl.created_at > datetime('now', ?)
      GROUP BY tl.player_id
      HAVING total > 0`
  ).bind(u21Team.id, `-${days} days`).all<{ player_id: string; total: number }>();

  return c.json({
    days,
    growth: rows.results.map((r) => ({ playerId: r.player_id, totalChange: r.total })),
  });
});

export default u21Router;
