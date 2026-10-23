/**
 * Session management using Cloudflare KV.
 *
 * Session platí 30 dní od posledního prodloužení. Používaná session se prodlužuje
 * v `getSession` (volá ho každá přihlášená routa i middleware), nejvýš jednou za den,
 * takže aktivní hráč se znovu přihlašovat nemusí a do KV jde nejvýš jeden zápis na hráče a den.
 * Nejdéle ale 90 dní od přihlášení: pak se session přestane prodlužovat a hráč se přihlásí znovu.
 * Odhlášení zanechá v KV záznam `revoked:<token>`, aby souběžné prodloužení session nevzkřísilo.
 */

import type { Context } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
/** Jak dlouho po posledním prodloužení se session při použití prodlouží znovu. */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
/** Nejdelší život session od přihlášení. Ukradený token se tak nedá prodlužovat donekonečna. */
export const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/** KV nepřijme kratší lhůtu než 60 s. */
const MIN_KV_TTL_S = 60;

export interface Session {
  userId: string;
  email: string;
  teamId: string | null;
  createdAt: string;
  /** Kdy se session naposledy prodloužila na plných 30 dní. Starší session ho nemají, pak platí createdAt. */
  renewedAt?: string;
}

/**
 * Tokeny, které tahle instance workeru už prodlužovala. Stránka posílá víc požadavků najednou
 * a všechny by jinak zapsaly stejnou session (KV snese jeden zápis klíče za sekundu).
 */
const renewalAttempts = new Map<string, number>();
const MAX_TRACKED_RENEWALS = 10_000;

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
  const now = new Date().toISOString();
  const session: Session = {
    userId,
    email,
    teamId,
    createdAt: now,
    renewedAt: now,
  };
  await kv.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
  return token;
}

/** Je session od posledního prodloužení (u starých od vzniku) starší než den? Nečitelné datum = ano. */
export function sessionNeedsRenewal(session: Session, nowMs: number): boolean {
  const last = Date.parse(session.renewedAt ?? session.createdAt);
  return !Number.isFinite(last) || nowMs - last >= SESSION_RENEW_AFTER_MS;
}

/** Prodlouží session na plných 30 dní, když je to potřeba a tahle instance to dnes ještě nezkusila. */
async function renewIfStale(kv: KVNamespace, token: string, session: Session): Promise<void> {
  const now = Date.now();
  if (!sessionNeedsRenewal(session, now)) return;
  const attempted = renewalAttempts.get(token);
  if (attempted !== undefined && now - attempted < SESSION_RENEW_AFTER_MS) return;
  if (renewalAttempts.size >= MAX_TRACKED_RENEWALS) renewalAttempts.clear();
  renewalAttempts.set(token, now);

  // Horní hranice od přihlášení: prodlužuje se nejvýš do ní, pak session dožije.
  const created = Date.parse(session.createdAt);
  const remainingS = Number.isFinite(created)
    ? Math.floor((created + SESSION_MAX_AGE_MS - now) / 1000)
    : SESSION_TTL;
  if (remainingS < MIN_KV_TTL_S) return;

  const renewed: Session = {
    ...session,
    // Session bez čitelného data vzniku začne počítat horní hranici odteď.
    createdAt: Number.isFinite(created) ? session.createdAt : new Date(now).toISOString(),
    renewedAt: new Date(now).toISOString(),
  };
  try {
    // Odhlášená session se nesmí zápisem vrátit (souběh s odhlášením v jiné instanci).
    if (await kv.get(`revoked:${token}`)) return;
    await kv.put(`session:${token}`, JSON.stringify(renewed), { expirationTtl: Math.min(SESSION_TTL, remainingS) });
  } catch (e) {
    // Prodloužení nesmí shodit požadavek, session platí dál s dosavadní lhůtou.
    logger.warn({ module: "session" }, "prodloužení session", e);
  }
}

/**
 * Get session from KV by token. Používanou session zároveň prodlouží (nejvýš jednou za den).
 */
export async function getSession(
  kv: KVNamespace,
  token: string,
): Promise<Session | null> {
  const data = await kv.get(`session:${token}`);
  if (!data) return null;
  const session = JSON.parse(data) as Session;
  await renewIfStale(kv, token, session);
  return session;
}

/**
 * Update session teamId after team creation (onboarding).
 */
export async function updateSessionTeamId(
  kv: KVNamespace,
  token: string,
  teamId: string,
): Promise<void> {
  const data = await kv.get(`session:${token}`);
  if (!data) return;
  const session = JSON.parse(data) as Session;
  session.teamId = teamId;
  // Zápis s plnou lhůtou je zároveň prodloužení.
  session.renewedAt = new Date().toISOString();
  await kv.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
}

/**
 * Delete a session.
 */
export async function deleteSession(
  kv: KVNamespace,
  token: string,
): Promise<void> {
  // Souběžný požadavek, který session načetl před odhlášením, ji v téhle instanci už
  // prodloužením nezapíše zpátky.
  renewalAttempts.set(token, Date.now());
  // Záznam o odhlášení vydrží, dokud by session mohla žít. Prodloužení v jiné instanci
  // ho před zápisem zkontroluje.
  await kv.put(`revoked:${token}`, "1", { expirationTtl: SESSION_TTL });
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
