/**
 * Počítadlo pokusů v KV: přihlášení (neúspěchy na e-mail a na IP) a registrace.
 *
 * KV neumí atomické přičtení, dva souběžné pokusy se můžou sečíst jako jeden.
 * Na brzdu hádání hesel to stačí: útočník tím získá jednotky pokusů navíc, ne tisíce.
 * V klíči je otisk, ne samotný e-mail nebo adresa.
 */

import { logger } from "../lib/logger";

export interface AttemptLimit {
  /** Kolik pokusů se v okně vejde. */
  max: number;
  /** Délka okna v sekundách. Okno začíná prvním pokusem. */
  windowSeconds: number;
}

/** 10 špatných hesel na jeden e-mail za 15 minut. */
export const LOGIN_EMAIL_LIMIT: AttemptLimit = { max: 10, windowSeconds: 15 * 60 };
/** Z jedné adresy víc: za jednou IP sedí celá domácnost nebo mobilní síť. */
export const LOGIN_IP_LIMIT: AttemptLimit = { max: 20, windowSeconds: 15 * 60 };
/** Požadavek bez hlavičky s adresou (mimo Cloudflare) se počítá do společného koše. */
export const UNKNOWN_IP = "unknown";

/** KV nepřijme kratší lhůtu než 60 s. */
const MIN_KV_TTL_SECONDS = 60;

interface AttemptState {
  count: number;
  /** Konec okna, unix čas v sekundách. */
  resetAt: number;
}

async function fingerprint(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function attemptKey(scope: string, subject: string): Promise<string> {
  return `attempts:${scope}:${await fingerprint(subject)}`;
}

async function readState(kv: KVNamespace, key: string, nowSeconds: number): Promise<AttemptState | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as AttemptState;
    if (!Number.isFinite(state.count) || !Number.isFinite(state.resetAt) || state.resetAt <= nowSeconds) return null;
    return state;
  } catch (e) {
    logger.warn({ module: "attempt-limiter" }, "nečitelné počítadlo pokusů", e);
    return null;
  }
}

/** Za kolik sekund se okno uvolní. 0 = pod limitem. */
export async function blockedForSeconds(kv: KVNamespace, key: string, limit: AttemptLimit, nowMs = Date.now()): Promise<number> {
  const nowSeconds = Math.floor(nowMs / 1000);
  // Výpadek KV nesmí zamknout přihlášení všem: bez počítadla se pokus pustí.
  const state = await readState(kv, key, nowSeconds).catch((e) => {
    logger.warn({ module: "attempt-limiter" }, "čtení počítadla pokusů", e);
    return null;
  });
  if (!state || state.count < limit.max) return 0;
  return state.resetAt - nowSeconds;
}

/** Připíše pokus. Selhání zápisu jen zaloguje, přihlášení kvůli němu nespadne. */
export async function recordAttempt(kv: KVNamespace, key: string, limit: AttemptLimit, nowMs = Date.now()): Promise<void> {
  const nowSeconds = Math.floor(nowMs / 1000);
  try {
    const current = await readState(kv, key, nowSeconds);
    const next: AttemptState = current
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: nowSeconds + limit.windowSeconds };
    // Těsně před koncem okna už KV zápis nevezme a počítadlo stejně za chvíli zmizí.
    if (next.resetAt - nowSeconds < MIN_KV_TTL_SECONDS) return;
    await kv.put(key, JSON.stringify(next), { expiration: next.resetAt });
  } catch (e) {
    logger.warn({ module: "attempt-limiter" }, "zápis počítadla pokusů", e);
  }
}

export async function clearAttempts(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key).catch((e) => logger.warn({ module: "attempt-limiter" }, "smazání počítadla pokusů", e));
}
