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
  /** Session má záznam v seznamu relací uživatele (`user-session:`). Starší ho dostanou při prodloužení. */
  indexed?: boolean;
}

/**
 * Seznam relací uživatele: jeden klíč na session, hledá se podle předpony. Čtení session
 * tím nezdraží (žádný dotaz navíc), platí se jedním zápisem při přihlášení. Slouží ke
 * zneplatnění všech relací po změně hesla.
 */
function userSessionKey(userId: string, token: string): string {
  return `user-session:${userId}:${token}`;
}

async function indexSession(kv: KVNamespace, userId: string, token: string, ttlSeconds: number): Promise<void> {
  await kv.put(userSessionKey(userId, token), "1", { expirationTtl: Math.max(MIN_KV_TTL_S, ttlSeconds) });
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
    indexed: true,
  };
  await kv.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
  // Záznam žije tak dlouho, jak nejdéle může žít session (prodlužování do 90 dní).
  await indexSession(kv, userId, token, SESSION_MAX_AGE_MS / 1000);
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
    indexed: true,
  };
  try {
    // Odhlášená session se nesmí zápisem vrátit (souběh s odhlášením v jiné instanci).
    if (await kv.get(`revoked:${token}`)) return;
    // Session z doby před seznamem relací se do něj zapíše při prvním prodloužení. Dřív než
    // session sama: kdyby zápis seznamu selhal, příznak `indexed` se neuloží a zkusí se to zítra.
    if (!session.indexed) await indexSession(kv, session.userId, token, remainingS);
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
  // Odhlášená session nemá v seznamu relací uživatele co dělat. Úklid nesmí odhlášení shodit.
  try {
    const data = await kv.get(`session:${token}`);
    if (data) await kv.delete(userSessionKey((JSON.parse(data) as Session).userId, token));
  } catch (e) {
    logger.warn({ module: "session" }, "úklid seznamu relací při odhlášení", e);
  }
  await kv.delete(`session:${token}`);
}

/**
 * Odhlásí uživatele ze všech zařízení: po změně hesla nesmí zůstat platný token,
 * který někdo získal se starým heslem. Vrací počet zneplatněných relací.
 *
 * Session vzniklé před zavedením seznamu se do něj dostanou až při prvním
 * prodloužení (do dne od použití); do té doby je tahle funkce nevidí.
 */
export async function deleteAllUserSessions(kv: KVNamespace, userId: string): Promise<number> {
  const prefix = userSessionKey(userId, "");
  let revoked = 0;
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const key of page.keys) {
      const token = key.name.slice(prefix.length);
      await deleteSession(kv, token);
      await kv.delete(key.name);
      revoked++;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return revoked;
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
