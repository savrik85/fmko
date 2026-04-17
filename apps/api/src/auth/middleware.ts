/**
 * Auth middleware for Hono.
 */

import { createMiddleware } from "hono/factory";
import type { Bindings } from "../index";
import { getSession, getTokenFromRequest, type Session } from "./session";

/**
 * Middleware that requires a valid session.
 * Sets c.var.session with the session data.
 */
export const requireAuth = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  const token = getTokenFromRequest(c);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) {
    return c.json({ error: "Invalid session" }, 401);
  }

  c.set("session" as never, session as never);
  await next();
});

/**
 * Middleware that requires a valid session AND that the authenticated user
 * owns the team identified by the :teamId URL parameter.
 * Applies only to non-GET/HEAD/OPTIONS methods (write operations).
 */
export const requireTeamOwnership = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    return next();
  }

  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const teamId = c.req.param("teamId");
  if (!teamId) return c.json({ error: "Chybí teamId parametr" }, 400);

  const ownTeam = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE id = ? AND user_id = ?"
  ).bind(teamId, session.userId).first();
  if (!ownTeam) return c.json({ error: "Přístup odepřen" }, 403);

  c.set("session" as never, session as never);
  return next();
});

/**
 * Middleware that requires a valid session AND that the user has is_admin = 1.
 * Used for admin-only operations.
 */
export const requireAdmin = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const user = await c.env.DB.prepare(
    "SELECT is_admin FROM users WHERE id = ?"
  ).bind(session.userId).first<{ is_admin: number }>();
  if (!user?.is_admin) return c.json({ error: "Přístup odepřen" }, 403);

  c.set("session" as never, session as never);
  return next();
});