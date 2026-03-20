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
