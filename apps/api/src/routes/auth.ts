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

  // Find team
  const team = await c.env.DB.prepare(
    "SELECT id, name FROM teams WHERE user_id = ? LIMIT 1"
  ).bind(user.id).first<Record<string, unknown>>();

  const teamId = team?.id as string | null ?? null;
  const token = await createSession(c.env.SESSION_KV, user.id as string, body.email.toLowerCase(), teamId);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      teamId,
      teamName: team?.name ?? null,
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
    "SELECT id, name FROM teams WHERE user_id = ? LIMIT 1"
  ).bind(session.userId).first<Record<string, unknown>>();

  return c.json({
    id: session.userId,
    email: session.email,
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
  });
});

export { authRouter };
