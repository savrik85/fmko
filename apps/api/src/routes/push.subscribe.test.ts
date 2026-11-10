/**
 * Odběr oznámení přijal libovolnou adresu (server na ni pak sám posílá požadavky)
 * a počet odběrů na klub nebyl omezený.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { isAllowedPushEndpoint, MAX_SUBSCRIPTIONS_PER_TEAM } from "../community/web-push";
import { pushRouter } from "./push";

let miniflare: Miniflare;
let db: D1Database;
let env: Bindings;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV"],
  });
  db = await miniflare.getD1Database("DB");
  const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  // Stejné schéma jako migrace 0060 (bez cizího klíče na teams).
  await db.prepare(
    `CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  ).run();
  const now = new Date().toISOString();
  await sessionKv.put("session:tok", JSON.stringify({ userId: "u1", email: "u1@test.local", teamId: "t1", createdAt: now, renewedAt: now, indexed: true }));
  await sessionKv.put("session:other", JSON.stringify({ userId: "u2", email: "u2@test.local", teamId: "t2", createdAt: now, renewedAt: now, indexed: true }));
  env = { DB: db, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM push_subscriptions").run();
});

async function subscribe(endpoint: unknown, token = "tok", keys: unknown = { p256dh: "BPubKey", auth: "authSecret" }): Promise<Response> {
  return pushRouter.request("/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint, keys }),
  }, env);
}

async function endpointsOf(teamId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT endpoint FROM push_subscriptions WHERE team_id = ? ORDER BY endpoint").bind(teamId).all<{ endpoint: string }>();
  return rows.results.map((r) => r.endpoint);
}

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc123",
    "https://web.push.apple.com/QGh1abc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://db5p.notify.windows.com/w/?token=abc",
  ])("%s projde", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://evil.example/collect",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilfcm.googleapis.com/x",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/x",
    "https://user:pass@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://push.services.mozilla.com.evil.example/x",
    "javascript:alert(1)",
    "not a url",
    `https://fcm.googleapis.com/${"a".repeat(3000)}`,
    42,
    null,
  ])("%s neprojde", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

describe("POST /push/subscribe", () => {
  it("odběr u známé push služby uloží", async () => {
    const res = await subscribe("https://web.push.apple.com/device-1");
    expect(res.status).toBe(200);
    expect(await endpointsOf("t1")).toEqual(["https://web.push.apple.com/device-1"]);
  });

  it("cizí adresu odmítne a nic neuloží", async () => {
    const res = await subscribe("https://evil.example/collect");
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).not.toMatch(/[—–]/);
    expect(await endpointsOf("t1")).toEqual([]);
  });

  it("odmítne i klíče, které nejsou krátký text", async () => {
    expect((await subscribe("https://fcm.googleapis.com/fcm/send/a", "tok", { p256dh: "x".repeat(600), auth: "a" })).status).toBe(400);
    expect((await subscribe("https://fcm.googleapis.com/fcm/send/a", "tok", { p256dh: { nested: true }, auth: "a" })).status).toBe(400);
    expect(await endpointsOf("t1")).toEqual([]);
  });

  it("bez přihlášení vrací 401", async () => {
    const res = await pushRouter.request("/push/subscribe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://web.push.apple.com/x", keys: { p256dh: "a", auth: "b" } }),
    }, env);
    expect(res.status).toBe(401);
  });

  it("jedenáctý odběr klubu vytlačí nejstarší, cizí klub se nedotkne", async () => {
    await subscribe("https://web.push.apple.com/other-club", "other");
    for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_TEAM; i++) {
      // Stáří se řídí created_at; test ho nastaví ručně, datetime('now') má rozlišení na sekundy.
      expect((await subscribe(`https://fcm.googleapis.com/fcm/send/device-${String(i).padStart(2, "0")}`)).status).toBe(200);
      await db.prepare("UPDATE push_subscriptions SET created_at = ? WHERE endpoint LIKE ?")
        .bind(`2026-11-01 10:00:${String(i).padStart(2, "0")}`, `%device-${String(i).padStart(2, "0")}`).run();
    }
    expect(await endpointsOf("t1")).toHaveLength(MAX_SUBSCRIPTIONS_PER_TEAM);

    expect((await subscribe("https://fcm.googleapis.com/fcm/send/device-new")).status).toBe(200);
    const endpoints = await endpointsOf("t1");
    expect(endpoints).toHaveLength(MAX_SUBSCRIPTIONS_PER_TEAM);
    expect(endpoints).toContain("https://fcm.googleapis.com/fcm/send/device-new");
    expect(endpoints).not.toContain("https://fcm.googleapis.com/fcm/send/device-00");
    expect(endpoints).toContain("https://fcm.googleapis.com/fcm/send/device-01");
    expect(await endpointsOf("t2")).toEqual(["https://web.push.apple.com/other-club"]);
  });

  it("opakované přihlášení téhož zařízení odběr jen obnoví", async () => {
    await subscribe("https://web.push.apple.com/device-1");
    await db.prepare("UPDATE push_subscriptions SET created_at = '2026-01-01 00:00:00'").run();
    await subscribe("https://web.push.apple.com/device-1", "tok", { p256dh: "NewKey", auth: "newAuth" });
    const rows = (await db.prepare("SELECT p256dh, created_at FROM push_subscriptions").all<{ p256dh: string; created_at: string }>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("NewKey");
    expect(rows[0].created_at > "2026-01-01 00:00:00").toBe(true);
  });
});
