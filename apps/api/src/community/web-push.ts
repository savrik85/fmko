/**
 * Web Push API — edge-compatible (Cloudflare Workers).
 * Uses Web Crypto API + fetch(). No Node.js dependencies.
 *
 * References:
 * - RFC 8291: Message Encryption for Web Push
 * - RFC 8188: Encrypted Content-Encoding for HTTP
 * - RFC 8292: Voluntary Application Server Identification (VAPID)
 */

import { logger } from "../lib/logger";

export interface PushEnv {
  VAPID_PUBLIC_KEY: string; // base64url, uncompressed P-256 (65 bytes starting with 0x04)
  VAPID_PRIVATE_KEY: string; // base64url, raw P-256 private key (32 bytes)
  VAPID_SUBJECT: string; // mailto: or https: URI
  DB: D1Database;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string; // base64url, uncompressed P-256 (65 bytes)
    auth: string; // base64url, 16 bytes
  };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function savePushSubscription(
  db: D1Database,
  teamId: string,
  sub: PushSubscriptionData,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO push_subscriptions (id, team_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET team_id = excluded.team_id, p256dh = excluded.p256dh, auth = excluded.auth",
    )
    .bind(crypto.randomUUID(), teamId, sub.endpoint, sub.keys.p256dh, sub.keys.auth)
    .run();
}

export async function deletePushSubscription(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

export async function getTeamSubscriptions(
  db: D1Database,
  teamId: string,
): Promise<PushSubscriptionData[]> {
  const result = await db
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE team_id = ?")
    .bind(teamId)
    .all();
  return result.results.map((r) => ({
    endpoint: r.endpoint as string,
    keys: { p256dh: r.p256dh as string, auth: r.auth as string },
  }));
}

export async function getNotificationPreferences(
  db: D1Database,
  teamId: string,
): Promise<Record<string, boolean>> {
  const row = await db
    .prepare("SELECT * FROM notification_preferences WHERE team_id = ?")
    .bind(teamId)
    .first<Record<string, number>>();

  const defaults = {
    match_reminder: true,
    match_result: true,
    transfer: true,
    challenge: true,
    event: true,
    season: true,
    system: true,
  };

  if (!row) return defaults;

  return {
    match_reminder: row.match_reminder === 1,
    match_result: row.match_result === 1,
    transfer: row.transfer === 1,
    challenge: row.challenge === 1,
    event: row.event === 1,
    season: row.season === 1,
    system: row.system === 1,
  };
}

export async function saveNotificationPreferences(
  db: D1Database,
  teamId: string,
  prefs: Partial<Record<string, boolean>>,
): Promise<void> {
  const cols = ["match_reminder", "match_result", "transfer", "challenge", "event", "season", "system"];
  const values = cols.map((c) => (prefs[c] !== undefined ? (prefs[c] ? 1 : 0) : 1));

  await db
    .prepare(
      `INSERT INTO notification_preferences (team_id, match_reminder, match_result, transfer, challenge, event, season, system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id) DO UPDATE SET
         match_reminder = excluded.match_reminder,
         match_result = excluded.match_result,
         transfer = excluded.transfer,
         challenge = excluded.challenge,
         event = excluded.event,
         season = excluded.season,
         system = excluded.system`,
    )
    .bind(teamId, ...values)
    .run();
}

// ─── Crypto primitives ───────────────────────────────────────────────────────

const te = new TextEncoder();

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const src = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const out = new Uint8Array(new ArrayBuffer(src.length));
  out.set(src);
  return out;
}

/** CF Workers crypto APIs require ArrayBuffer, not Uint8Array<ArrayBufferLike>. */
function buf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

function b64urlEncode(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function concat(...arrs: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(new ArrayBuffer(len));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

/** HKDF-Extract + HKDF-Expand (RFC 5869) */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array<ArrayBuffer>> {
  const saltKey = await crypto.subtle.importKey("raw", buf(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prkRaw = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, buf(ikm)));
  const prkKey = await crypto.subtle.importKey("raw", buf(prkRaw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

  const out = new Uint8Array(new ArrayBuffer(len));
  let prev = new Uint8Array(new ArrayBuffer(0));
  let offset = 0;
  for (let i = 1; offset < len; i++) {
    const chunk = concat(prev, info, new Uint8Array([i]));
    const block = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, buf(chunk)));
    const n = Math.min(block.length, len - offset);
    out.set(block.subarray(0, n), offset);
    offset += n;
    prev = new Uint8Array(new ArrayBuffer(block.length));
    prev.set(block);
  }
  return out;
}

// ─── VAPID JWT (RFC 8292) ────────────────────────────────────────────────────

async function generateVapidJwt(
  endpoint: string,
  subject: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const headerB64 = b64urlEncode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payloadB64 = b64urlEncode(
    te.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  );

  const sigInput = te.encode(`${headerB64}.${payloadB64}`);

  // Import private key via JWK — derive x,y from uncompressed public key
  const pubBytes = b64urlDecode(vapidPublicKey); // 0x04 || x(32) || y(32)
  const privKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: b64urlEncode(b64urlDecode(vapidPrivateKey)),
      x: b64urlEncode(pubBytes.slice(1, 33)),
      y: b64urlEncode(pubBytes.slice(33, 65)),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privKey, sigInput));
  return `${headerB64}.${payloadB64}.${b64urlEncode(sig)}`;
}

// ─── Payload encryption (RFC 8291 + RFC 8188, aes128gcm) ────────────────────

async function encryptPayload(
  plaintext: string,
  clientPublicKeyB64: string,
  clientAuthB64: string,
): Promise<Uint8Array> {
  const clientPublicKey = b64urlDecode(clientPublicKeyB64); // 65 bytes
  const authSecret = b64urlDecode(clientAuthB64); // 16 bytes

  // Ephemeral ECDH key pair
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey)); // 65 bytes

  // Import client public key for ECDH
  const clientPubKey = await crypto.subtle.importKey("raw", buf(clientPublicKey), { name: "ECDH", namedCurve: "P-256" }, true, []);

  // ECDH shared secret
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientPubKey }, ephemeral.privateKey, 256));

  // Random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 §3.3: IKM info = "WebPush: info\x00" || receiver_p256dh || sender_p256dh
  const keyInfo = concat(te.encode("WebPush: info\x00"), clientPublicKey, ephemeralPublicRaw);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  // CEK and nonce via HKDF
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\x00"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\x00"), 12);

  // AES-128-GCM encrypt: plaintext + 0x02 (last-record padding delimiter, RFC 8188 §2)
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concat(te.encode(plaintext), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  // RFC 8188 header: salt(16) || rs(4, big-endian) || idlen(1) || keyid(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);

  return concat(salt, rs, new Uint8Array([ephemeralPublicRaw.length]), ephemeralPublicRaw, ciphertext);
}

// ─── Send single push ────────────────────────────────────────────────────────

async function sendSinglePush(
  sub: PushSubscriptionData,
  payload: string,
  env: { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string },
): Promise<number> {
  const [body, jwt] = await Promise.all([
    encryptPayload(payload, sub.keys.p256dh, sub.keys.auth),
    generateVapidJwt(sub.endpoint, env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY),
  ]);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      Authorization: `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
      TTL: "86400",
    },
    body: buf(body),
  });

  return res.status;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Odeslat push všem týmům, které mají daného hráče ve watchlistu (kromě stávajícího týmu).
 * Respektuje notification_preferences.transfer.
 */
export async function sendWebPushToPlayerWatchers(
  env: PushEnv,
  playerId: string,
  excludeTeamId: string | null,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT DISTINCT w.team_id FROM player_watchlist w WHERE w.player_id = ?"
  ).bind(playerId).all<{ team_id: string }>().catch((e) => { logger.warn({ module: "web-push" }, "load watchers", e); return { results: [] }; });

  for (const r of rows.results) {
    const teamId = r.team_id;
    if (excludeTeamId && teamId === excludeTeamId) continue;
    const prefs = await getNotificationPreferences(env.DB, teamId).catch((e) => { logger.warn({ module: "web-push" }, `load prefs for team ${teamId}`, e); return null; });
    if (prefs && prefs.transfer === false) continue;
    await sendWebPushToTeam(env, teamId, title, body, url).catch((e) =>
      logger.warn({ module: "web-push" }, `watcher push failed for team ${teamId}`, e),
    );
  }
}

/**
 * Odeslat push notifikaci všem subscriptions týmu.
 * Fire-and-forget — nevolat await, nebo obalit try/catch.
 */
export async function sendWebPushToTeam(
  env: PushEnv,
  teamId: string,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  const subs = await getTeamSubscriptions(env.DB, teamId);
  if (subs.length === 0) return;

  const payload = JSON.stringify({ title, body, url: url ?? "/dashboard" });

  const results = await Promise.allSettled(subs.map((sub) => sendSinglePush(sub, payload, env)));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      logger.warn({ module: "web-push" }, "Push send failed", r.reason);
    } else if (r.value === 410 || r.value === 404) {
      await deletePushSubscription(env.DB, subs[i].endpoint).catch((e) =>
        logger.warn({ module: "web-push" }, "Failed to delete expired subscription", e),
      );
    } else if (r.value >= 400) {
      logger.warn({ module: "web-push" }, `Push returned HTTP ${r.value}`);
    }
  }
}
