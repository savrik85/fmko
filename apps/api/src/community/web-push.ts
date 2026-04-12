/**
 * Web Push API — VAPID push notifikace přes Cloudflare Workers (nodejs_compat).
 */

import webpush from "web-push";
import { logger } from "../lib/logger";

export interface PushEnv {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  DB: D1Database;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function initVapid(env: PushEnv): void {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

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

  initVapid(env);

  const payload = JSON.stringify({ title, body, url: url ?? "/dashboard" });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 60 * 60 * 24 },
      ),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      const err = r.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        // Subscription vypršela — smazat
        await deletePushSubscription(env.DB, subs[i].endpoint).catch((e) =>
          logger.warn({ module: "web-push" }, "Failed to delete expired subscription", e),
        );
      } else {
        logger.warn({ module: "web-push" }, "Push send failed", r.reason);
      }
    }
  }
}
