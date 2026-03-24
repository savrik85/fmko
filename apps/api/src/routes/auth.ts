/**
 * Auth API — register, login, logout, me.
 * PBKDF2 hashování, KV sessions.
 */

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
    `SELECT t.id, t.name, t.primary_color, t.secondary_color, t.badge_pattern, v.name as village_name, v.district, t.budget, t.league_id,
     (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) as player_count,
     (SELECT s.number FROM seasons s WHERE s.status='active' LIMIT 1) as season,
     (SELECT COUNT(*) FROM season_calendar sc WHERE sc.league_id = t.league_id AND sc.status='completed') as season_day,
     (SELECT COUNT(*) FROM season_calendar sc WHERE sc.league_id = t.league_id) as season_total
     FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.user_id = ? LIMIT 1`
  ).bind(user.id).first<Record<string, unknown>>();

  const teamId = team?.id as string | null ?? null;

  // Calculate league position (include all teams, even with 0 matches)
  let leaguePosition: number | null = null;
  if (teamId && team?.league_id) {
    const leagueTeams = await c.env.DB.prepare(
      `SELECT id FROM teams WHERE league_id = ?`
    ).bind(team.league_id).all();
    const pts: Record<string, number> = {};
    for (const t of leagueTeams.results ?? []) pts[t.id as string] = 0;
    const matches = await c.env.DB.prepare(
      `SELECT home_team_id, away_team_id, home_score, away_score FROM matches WHERE league_id = ? AND status = 'simulated'`
    ).bind(team.league_id).all();
    for (const m of matches.results ?? []) {
      const h = m.home_team_id as string, a = m.away_team_id as string;
      const hs = m.home_score as number, as_ = m.away_score as number;
      pts[h] = (pts[h] ?? 0) + (hs > as_ ? 3 : hs === as_ ? 1 : 0);
      pts[a] = (pts[a] ?? 0) + (as_ > hs ? 3 : as_ === hs ? 1 : 0);
    }
    const sorted = Object.entries(pts).sort((a, b) => b[1] - a[1]);
    leaguePosition = sorted.findIndex(([id]) => id === teamId) + 1;
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
      seasonDay: (team?.season_day as number) ?? null,
      seasonTotal: (team?.season_total as number) ?? null,
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
    `SELECT t.id, t.name, t.primary_color, t.secondary_color, t.badge_pattern, v.name as village_name, v.district, t.budget, t.league_id,
     (SELECT s.number FROM seasons s WHERE s.status='active' LIMIT 1) as season,
     (SELECT COUNT(*) FROM season_calendar sc WHERE sc.league_id = t.league_id AND sc.status='completed') as season_day,
     (SELECT COUNT(*) FROM season_calendar sc WHERE sc.league_id = t.league_id) as season_total
     FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.user_id = ? LIMIT 1`
  ).bind(session.userId).first<Record<string, unknown>>();

  let leaguePosition: number | null = null;
  if (team?.id && team?.league_id) {
    const leagueTeams = await c.env.DB.prepare(
      `SELECT id FROM teams WHERE league_id = ?`
    ).bind(team.league_id).all();
    const pts: Record<string, number> = {};
    for (const t of leagueTeams.results ?? []) pts[t.id as string] = 0;
    const matches = await c.env.DB.prepare(
      `SELECT home_team_id, away_team_id, home_score, away_score FROM matches WHERE league_id = ? AND status = 'simulated'`
    ).bind(team.league_id).all();
    for (const m of matches.results ?? []) {
      const h = m.home_team_id as string, a = m.away_team_id as string;
      const hs = m.home_score as number, as_ = m.away_score as number;
      pts[h] = (pts[h] ?? 0) + (hs > as_ ? 3 : hs === as_ ? 1 : 0);
      pts[a] = (pts[a] ?? 0) + (as_ > hs ? 3 : as_ === hs ? 1 : 0);
    }
    const sorted = Object.entries(pts).sort((a, b) => b[1] - a[1]);
    leaguePosition = sorted.findIndex(([id]) => id === (team.id as string)) + 1;
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
    seasonDay: (team?.season_day as number) ?? null,
    seasonTotal: (team?.season_total as number) ?? null,
  });
});

export { authRouter };
