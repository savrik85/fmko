/**
 * Auth API routes: register, login, logout, me.
 */

import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "@okresni-masina/db";
import type { Bindings } from "../index";
import { hashPassword, verifyPassword, createSession, deleteSession, getTokenFromRequest, getSession } from "../auth";

const auth = new Hono<{ Bindings: Bindings }>();

auth.post("/register", async (c) => {
  const body = await c.req.json<{ email: string; password: string; displayName: string }>();
  const { email, password, displayName } = body;

  if (!email || !password || !displayName) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const db = drizzle(c.env.DB);

  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await hashPassword(password);

  const result = await db.insert(users).values({
    email,
    passwordHash,
    displayName,
    createdAt: new Date().toISOString(),
  }).returning();

  const user = result[0];
  const token = await createSession(c.env.SESSION_KV, user.id, user.email, user.teamId);

  return c.json({
    token,
    user: { id: user.id, email: user.email, displayName: user.displayName, teamId: user.teamId },
  }, 201);
});

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ error: "Missing email or password" }, 400);
  }

  const db = drizzle(c.env.DB);
  const user = await db.select().from(users).where(eq(users.email, email)).get();

  if (!user || !user.passwordHash) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await createSession(c.env.SESSION_KV, user.id, user.email, user.teamId);

  return c.json({
    token,
    user: { id: user.id, email: user.email, displayName: user.displayName, teamId: user.teamId },
  });
});

auth.post("/logout", async (c) => {
  const token = getTokenFromRequest(c);
  if (token) {
    await deleteSession(c.env.SESSION_KV, token);
  }
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Invalid session" }, 401);

  const db = drizzle(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user) return c.json({ error: "User not found" }, 404);

  return c.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    teamId: user.teamId,
  });
});

export { auth };
