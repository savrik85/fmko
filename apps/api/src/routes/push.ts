/**
 * Push notification routes — subscribe, unsubscribe, preferences.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { getSession, getTokenFromRequest } from "../auth/session";
import {
  savePushSubscription,
  deletePushSubscription,
  getNotificationPreferences,
  saveNotificationPreferences,
  type PushSubscriptionData,
} from "../community/web-push";
import { logger } from "../lib/logger";

const pushRouter = new Hono<{ Bindings: Bindings }>();

/** GET /api/push/vapid-key — vrátí VAPID public key pro frontend */
pushRouter.get("/push/vapid-key", (c) => {
  const key = c.env.VAPID_PUBLIC_KEY;
  if (!key) return c.json({ error: "Push notifikace nejsou nakonfigurovány" }, 503);
  return c.json({ publicKey: key });
});

/** POST /api/push/subscribe — uloží push subscription */
pushRouter.post("/push/subscribe", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session?.teamId) return c.json({ error: "Nepřihlášen nebo bez týmu" }, 401);

  let body: PushSubscriptionData;
  try {
    body = await c.req.json();
  } catch (e) {
    logger.warn({ module: "push" }, "parse subscribe body", e);
    return c.json({ error: "Neplatné tělo požadavku" }, 400);
  }

  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return c.json({ error: "Chybí endpoint nebo klíče" }, 400);
  }

  await savePushSubscription(c.env.DB, session.teamId, body);
  logger.info({ module: "push" }, `Subscription uložena pro tým ${session.teamId}`);
  return c.json({ ok: true });
});

/** DELETE /api/push/unsubscribe — odstraní push subscription */
pushRouter.delete("/push/unsubscribe", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Nepřihlášen" }, 401);

  let body: { endpoint: string };
  try {
    body = await c.req.json();
  } catch (e) {
    logger.warn({ module: "push" }, "parse unsubscribe body", e);
    return c.json({ error: "Neplatné tělo požadavku" }, 400);
  }

  if (!body?.endpoint) return c.json({ error: "Chybí endpoint" }, 400);

  // Ověřit, že subscription patří přihlášenému uživateli — zabraňuje odhlášení cizích subscriptions.
  await c.env.DB.prepare(
    "DELETE FROM push_subscriptions WHERE endpoint = ? AND team_id IN (SELECT id FROM teams WHERE user_id = ?)"
  ).bind(body.endpoint, session.userId).run();
  return c.json({ ok: true });
});

/** GET /api/push/preferences — vrátí preference notifikací týmu */
pushRouter.get("/push/preferences", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session?.teamId) return c.json({ error: "Nepřihlášen nebo bez týmu" }, 401);

  const prefs = await getNotificationPreferences(c.env.DB, session.teamId);
  return c.json(prefs);
});

/** PUT /api/push/preferences — uloží preference notifikací */
pushRouter.put("/push/preferences", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session?.teamId) return c.json({ error: "Nepřihlášen nebo bez týmu" }, 401);

  let body: Partial<Record<string, boolean>>;
  try {
    body = await c.req.json();
  } catch (e) {
    logger.warn({ module: "push" }, "parse preferences body", e);
    return c.json({ error: "Neplatné tělo požadavku" }, 400);
  }

  await saveNotificationPreferences(c.env.DB, session.teamId, body);
  logger.info({ module: "push" }, `Preference uloženy pro tým ${session.teamId}`);
  return c.json({ ok: true });
});

/** POST /api/push/test — odešle testovací push na přihlášený tým */
pushRouter.post("/push/test", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session?.teamId) return c.json({ error: "Nepřihlášen nebo bez týmu" }, 401);

  if (!c.env.VAPID_PUBLIC_KEY || !c.env.VAPID_PRIVATE_KEY) {
    return c.json({ error: "VAPID klíče nejsou nastaveny" }, 503);
  }

  const { sendWebPushToTeam } = await import("../community/web-push");
  await sendWebPushToTeam(
    { DB: c.env.DB, VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT },
    session.teamId,
    "🏟 Test notifikace",
    "Prales FM push funguje!",
    "/dashboard",
  );

  return c.json({ ok: true });
});

export { pushRouter };
