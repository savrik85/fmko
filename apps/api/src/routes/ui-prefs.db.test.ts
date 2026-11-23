/**
 * Předvolby zobrazení účtu (/api/me/ui-prefs) na skutečné D1 (Miniflare, všechny migrace):
 * výchozí Plánek, uložení Videa, odmítnutí neplatné hodnoty a oddělení účtů.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";
import { uiPrefsRouter } from "./ui-prefs";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", uiPrefsRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let mine: string;
let other: string;

function getPrefs(token?: string): Promise<Response> {
  return Promise.resolve(app.request("/api/me/ui-prefs", { headers: token ? { Authorization: `Bearer ${token}` } : {} }, env));
}

function putPrefs(token: string | undefined, body: string): Promise<Response> {
  return Promise.resolve(app.request("/api/me/ui-prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  }, env));
}

async function storedOf(userId: string): Promise<string | null> {
  const row = await db.prepare("SELECT ui_prefs FROM users WHERE id = ?").bind(userId).first<{ ui_prefs: string | null }>();
  return row?.ui_prefs ?? null;
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"], kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-mine', 'mine@example.test', 'x')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-other', 'other@example.test', 'x')"),
  ]);
  mine = await createSession(env.SESSION_KV, "u-mine", "mine@example.test", null);
  other = await createSession(env.SESSION_KV, "u-other", "other@example.test", null);
}, 120_000);

afterAll(async () => { await mf?.dispose(); });

beforeEach(async () => {
  await db.prepare("UPDATE users SET ui_prefs = NULL").run();
});

describe("/api/me/ui-prefs", () => {
  it("bez uložené předvolby je výchozí Plánek (2d)", async () => {
    const res = await getPrefs(mine);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ replayView: "2d" });
  });

  it("uloží Video a další čtení ho vrátí", async () => {
    const saved = await putPrefs(mine, JSON.stringify({ replayView: "3d" }));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ replayView: "3d" });
    expect(await (await getPrefs(mine)).json()).toEqual({ replayView: "3d" });
    expect(JSON.parse((await storedOf("u-mine"))!)).toEqual({ replayView: "3d" });
  });

  it("neplatná hodnota vrátí 400 a uložená předvolba zůstane", async () => {
    await putPrefs(mine, JSON.stringify({ replayView: "3d" }));
    for (const body of [JSON.stringify({ replayView: "x" }), JSON.stringify({}), JSON.stringify({ replayView: 3 }), "null", "{not json"]) {
      const res = await putPrefs(mine, body);
      expect(res.status, body).toBe(400);
    }
    expect(await (await getPrefs(mine)).json()).toEqual({ replayView: "3d" });
  });

  it("předvolba patří účtu: cizí uživatel ji nevidí ani nezmění", async () => {
    await putPrefs(mine, JSON.stringify({ replayView: "3d" }));
    expect(await (await getPrefs(other)).json()).toEqual({ replayView: "2d" });
    await putPrefs(other, JSON.stringify({ replayView: "2d" }));
    expect(await (await getPrefs(mine)).json()).toEqual({ replayView: "3d" });
    expect(await storedOf("u-other")).toBe(JSON.stringify({ replayView: "2d" }));
  });

  it("bez přihlášení 401 a nic se neuloží", async () => {
    expect((await getPrefs()).status).toBe(401);
    expect((await getPrefs("neznamy-token")).status).toBe(401);
    expect((await putPrefs(undefined, JSON.stringify({ replayView: "3d" }))).status).toBe(401);
    expect(await storedOf("u-mine")).toBeNull();
  });

  it("uložení zachová ostatní klíče JSONu", async () => {
    await db.prepare("UPDATE users SET ui_prefs = ? WHERE id = 'u-mine'").bind(JSON.stringify({ futureKey: 7, replayView: "2d" })).run();
    await putPrefs(mine, JSON.stringify({ replayView: "3d" }));
    expect(JSON.parse((await storedOf("u-mine"))!)).toEqual({ futureKey: 7, replayView: "3d" });
  });

  it("poškozený JSON v databázi znamená výchozí a uložení ho přepíše", async () => {
    await db.prepare("UPDATE users SET ui_prefs = '{broken' WHERE id = 'u-mine'").run();
    expect(await (await getPrefs(mine)).json()).toEqual({ replayView: "2d" });
    await db.prepare("UPDATE users SET ui_prefs = '[\"3d\"]' WHERE id = 'u-mine'").run();
    expect(await (await getPrefs(mine)).json()).toEqual({ replayView: "2d" });
    await putPrefs(mine, JSON.stringify({ replayView: "3d" }));
    expect(JSON.parse((await storedOf("u-mine"))!)).toEqual({ replayView: "3d" });
  });
});
