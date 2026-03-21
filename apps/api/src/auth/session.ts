/**
 * Session management using Cloudflare KV.
 */

import type { Context } from "hono";
import type { Bindings } from "../index";

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

export interface Session {
  userId: string;
  email: string;
  teamId: string | null;
  createdAt: string;
}

/**
 * Generate a random session token.
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a new session and store it in KV.
 */
export async function createSession(
  kv: KVNamespace,
  userId: string,
  email: string,
  teamId: string | null,
): Promise<string> {
  const token = generateToken();
  const session: Session = {
    userId,
    email,
    teamId,
    createdAt: new Date().toISOString(),
  };
  await kv.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
  return token;
}

/**
 * Get session from KV by token.
 */
export async function getSession(
  kv: KVNamespace,
  token: string,
): Promise<Session | null> {
  const data = await kv.get(`session:${token}`);
  if (!data) return null;
  return JSON.parse(data) as Session;
}

/**
 * Delete a session.
 */
export async function deleteSession(
  kv: KVNamespace,
  token: string,
): Promise<void> {
  await kv.delete(`session:${token}`);
}

/**
 * Extract session token from Authorization header or cookie.
 */
export function getTokenFromRequest(c: Context<{ Bindings: Bindings }>): string | null {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookie = c.req.header("Cookie");
  if (cookie) {
    const match = cookie.match(/session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}
