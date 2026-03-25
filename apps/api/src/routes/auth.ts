/**
 * Auth API — register, login, logout, me.
 * PBKDF2 hashování, KV sessions.
 */

async function getNextMatch(db: D1Database, teamId: string, leagueId: string, gameDate: string | null): Promise<{ opponent: string; daysUntil: number } | null> {
  if (!gameDate) return null;
  const gd = new Date(gameDate);
  const dayStart = new Date(gd); dayStart.setUTCHours(0, 0, 0, 0);

  const row = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, sc.scheduled_at,
     t1.name as home_name, t2.name as away_name
     FROM matches m
     JOIN season_calendar sc ON m.calendar_id = sc.id
     JOIN teams t1 ON m.home_team_id = t1.id
     JOIN teams t2 ON m.away_team_id = t2.id
     WHERE sc.league_id = ? AND m.status IN ('scheduled','lineups_open')
     AND (m.home_team_id = ? OR m.away_team_id = ?)
     AND sc.scheduled_at >= ?
     ORDER BY sc.scheduled_at LIMIT 1`
  ).bind(leagueId, teamId, teamId, dayStart.toISOString()).first<Record<string, unknown>>();

  if (!row) return null;
  const opponent = (row.home_team_id === teamId ? row.away_name : row.home_name) as string;
  const matchDate = new Date(row.scheduled_at as string);
  const daysUntil = Math.max(0, Math.round((matchDate.getTime() - gd.getTime()) / 86400000));
  return { opponent, daysUntil };
}

import { Hono } from "hono";
import type { Bindings } from "../index";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession, getSession, deleteSession, getTokenFromRequest } from "../auth/session";

const authRouter = new Hono<{ Bindings: Bindings }>();

function uuid(): string { return crypto.randomUUID(); }

// POST /auth/register
authRouter.post("/register", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();

  if (!body.email || !body.password) {
    return c.json({ error: "Vyplň email a heslo" }, 400);
  }
  if (body.password.length < 6) {
    return c.json({ error: "Heslo musí mít alespoň 6 znaků" }, 400);
  }

  // Check if email exists
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(body.email.toLowerCase()).first();

  if (existing) {
    return c.json({ error: "Tento email je už registrovaný" }, 409);
  }

  const userId = uuid();
  const passwordHash = await hashPassword(body.password);

  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  ).bind(userId, body.email.toLowerCase(), passwordHash).run();

  const token = await createSession(c.env.SESSION_KV, userId, body.email.toLowerCase(), null);

  return c.json({
    token,
    user: { id: userId, email: body.email.toLowerCase(), teamId: null },
  }, 201);
});

// POST /auth/login
authRouter.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();

  if (!body.email || !body.password) {
    return c.json({ error: "Vyplň email a heslo" }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).bind(body.email.toLowerCase()).first<Record<string, unknown>>();

  if (!user || !user.password_hash) {
    return c.json({ error: "Špatný email nebo heslo" }, 401);
  }

  const valid = await verifyPassword(body.password, user.password_hash as string);
  if (!valid) {
    return c.json({ error: "Špatný email nebo heslo" }, 401);
  }

  // Find team + season info
  const team = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.primary_color, t.secondary_color, t.badge_pattern, t.game_date, v.name as village_name, v.district, t.budget, t.league_id,
     (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) as player_count,
     (SELECT s.number FROM seasons s WHERE s.status='active' LIMIT 1) as season,
     (SELECT MIN(sc.scheduled_at) FROM season_calendar sc WHERE sc.league_id = t.league_id) as season_start,
     (SELECT MAX(sc.scheduled_at) FROM season_calendar sc WHERE sc.league_id = t.league_id) as season_end
     FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.user_id = ? LIMIT 1`
  ).bind(user.id).first<Record<string, unknown>>();

  const teamId = team?.id as string | null ?? null;

  // Calculate league position — uses shared standings utility
  let leaguePosition: number | null = null;
  if (teamId && team?.league_id) {
    const { getTeamPosition } = await import("../stats/standings");
    leaguePosition = await getTeamPosition(c.env.DB, team.league_id as string, teamId);
    if (leaguePosition === 0) leaguePosition = null;
  }

  const token = await createSession(c.env.SESSION_KV, user.id as string, body.email.toLowerCase(), teamId);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      teamId,
      teamName: team?.name ?? null,
      primaryColor: (team?.primary_color as string) ?? null,
      secondaryColor: (team?.secondary_color as string) ?? null,
      badgePattern: (team?.badge_pattern as string) ?? null,
      villageName: (team?.village_name as string) ?? null,
      district: (team?.district as string) ?? null,
      budget: (team?.budget as number) ?? null,
      leaguePosition,
      season: (team?.season as number) ?? null,
      seasonDay: team?.game_date && team?.season_start
        ? Math.max(0, Math.round((new Date(team.game_date as string).getTime() - new Date(team.season_start as string).getTime()) / 86400000))
        : null,
      seasonTotal: team?.season_start && team?.season_end
        ? Math.round((new Date(team.season_end as string).getTime() - new Date(team.season_start as string).getTime()) / 86400000)
        : null,
      gameDate: (team?.game_date as string) ?? null,
      nextMatch: teamId && team?.league_id
        ? await getNextMatch(c.env.DB, teamId, team.league_id as string, team.game_date as string | null)
        : null,
    },
  });
});

// POST /auth/logout
authRouter.post("/logout", async (c) => {
  const token = getTokenFromRequest(c);
  if (token) {
    await deleteSession(c.env.SESSION_KV, token);
  }
  return c.json({ ok: true });
});

// GET /auth/me — kdo jsem + mám tým?
authRouter.get("/me", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  // Refresh team info
  const team = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.primary_color, t.secondary_color, t.badge_pattern, t.game_date, v.name as village_name, v.district, t.budget, t.league_id,
     (SELECT s.number FROM seasons s WHERE s.status='active' LIMIT 1) as season,
     (SELECT MIN(sc.scheduled_at) FROM season_calendar sc WHERE sc.league_id = t.league_id) as season_start,
     (SELECT MAX(sc.scheduled_at) FROM season_calendar sc WHERE sc.league_id = t.league_id) as season_end
     FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.user_id = ? LIMIT 1`
  ).bind(session.userId).first<Record<string, unknown>>();

  let leaguePosition: number | null = null;
  if (team?.id && team?.league_id) {
    const { getTeamPosition } = await import("../stats/standings");
    leaguePosition = await getTeamPosition(c.env.DB, team.league_id as string, team.id as string);
    if (leaguePosition === 0) leaguePosition = null;
  }

  return c.json({
    id: session.userId,
    email: session.email,
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
    primaryColor: (team?.primary_color as string) ?? null,
    secondaryColor: (team?.secondary_color as string) ?? null,
    badgePattern: (team?.badge_pattern as string) ?? null,
    villageName: (team?.village_name as string) ?? null,
    district: (team?.district as string) ?? null,
    budget: (team?.budget as number) ?? null,
    leaguePosition,
    season: (team?.season as number) ?? null,
    seasonDay: team?.game_date && team?.season_start
      ? Math.max(0, Math.round((new Date(team.game_date as string).getTime() - new Date(team.season_start as string).getTime()) / 86400000))
      : null,
    seasonTotal: team?.season_start && team?.season_end
      ? Math.round((new Date(team.season_end as string).getTime() - new Date(team.season_start as string).getTime()) / 86400000)
      : null,
    gameDate: (team?.game_date as string) ?? null,
    nextMatch: team?.id && team?.league_id
      ? await getNextMatch(c.env.DB, team.id as string, team.league_id as string, team.game_date as string | null)
      : null,
  });
});

export { authRouter };
