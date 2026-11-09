/**
 * Oznámení a push o zranění v zápase nad skutečnou D1 (Miniflare).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const push = vi.hoisted(() => ({ delivered: [] as string[], prefs: {} as Record<string, Record<string, boolean>> }));

vi.mock("../community/web-push", () => ({
  getNotificationPreferences: vi.fn(async (_db: unknown, teamId: string) => ({ event: true, ...(push.prefs[teamId] ?? {}) })),
  sendWebPushToTeam: vi.fn(async (_env: unknown, teamId: string, title: string, _body: string, url: string) => {
    push.delivered.push(`${teamId}|${title}|${url}`);
  }),
}));

import { injuryAlertText, injuryDaysText, notifyMatchInjuries } from "./match-injury-alerts";

let miniflare: Miniflare;
let db: D1Database;
const pushEnv = () => ({ VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:test@prales.fun", DB: db });

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, parent_team_id TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT)",
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, description TEXT, days_total INTEGER, match_id TEXT,
      osobni_volno INTEGER NOT NULL DEFAULT 0, is_fake INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE notifications (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, action_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  ]) await db.prepare(sql).run();
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('club', 'u1', NULL), ('club-u21', 'u1', 'club'), ('ai-club', 'ai', NULL), ('muted', 'u2', NULL)"),
    db.prepare("INSERT INTO players VALUES ('p1', 'Jakub', 'Jelínek'), ('p2', 'Uršul', 'Dorostenec'), ('p3', 'Robot', 'Automat'), ('p4', 'Tichý', 'Hráč')"),
  ]);
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  push.delivered = [];
  push.prefs = {};
  await db.batch([db.prepare("DELETE FROM injuries"), db.prepare("DELETE FROM notifications")]);
});

const addInjury = (id: string, playerId: string, teamId: string, matchId: string | null, days = 9, flags: { volno?: number; fake?: number } = {}) =>
  db.prepare("INSERT INTO injuries (id, player_id, team_id, description, days_total, match_id, osobni_volno, is_fake) VALUES (?, ?, ?, 'Natažený sval', ?, ?, ?, ?)")
    .bind(id, playerId, teamId, days, matchId, flags.volno ?? 0, flags.fake ?? 0).run();
const notes = async () =>
  (await db.prepare("SELECT id, team_id, type, title, body, action_url FROM notifications ORDER BY id").all<Record<string, string>>()).results;

describe("notifyMatchInjuries", () => {
  it("zranění hráče áčka: oznámení a push s odkazem na hráče", async () => {
    await addInjury("i1", "p1", "club", "m1");
    expect(await notifyMatchInjuries(db, "m1", pushEnv())).toBe(1);
    expect(await notes()).toEqual([{
      id: "injury-i1", team_id: "club", type: "event", title: "🚑 Jakub Jelínek se v zápase zranil",
      body: "Natažený sval. Mimo hru bude na 9 dní.", action_url: "/hrac/p1",
    }]);
    expect(push.delivered).toEqual(["club|🚑 Jakub Jelínek se v zápase zranil|/hrac/p1"]);
  });

  it("opakované volání (recovery kola) nic nezdvojí", async () => {
    await addInjury("i1", "p1", "club", "m1");
    await notifyMatchInjuries(db, "m1", pushEnv());
    expect(await notifyMatchInjuries(db, "m1", pushEnv())).toBe(0);
    expect(await notes()).toHaveLength(1);
    expect(push.delivered).toHaveLength(1);
  });

  it("zranění v U21 jde mateřskému klubu, AI klub a jiný zápas nic nedostanou", async () => {
    await addInjury("i2", "p2", "club-u21", "m1", 3);
    await addInjury("i3", "p3", "ai-club", "m1");
    await addInjury("i4", "p1", "club", "m-other");
    await addInjury("i5", "p1", "club", null);
    expect(await notifyMatchInjuries(db, "m1", pushEnv())).toBe(1);
    expect(await notes()).toMatchObject([{ id: "injury-i2", team_id: "club", body: "Natažený sval. Mimo hru bude na 3 dny (hráč U21)." }]);
  });

  it("vypnutý přepínač Události: oznámení v aplikaci ano, push ne", async () => {
    push.prefs = { muted: { event: false } };
    await addInjury("i6", "p4", "muted", "m1");
    expect(await notifyMatchInjuries(db, "m1", pushEnv())).toBe(1);
    expect(await notes()).toHaveLength(1);
    expect(push.delivered).toHaveLength(0);
  });

  it("bez push klíčů jen oznámení; osobní volno a předstírané zranění se neoznamují", async () => {
    await addInjury("i7", "p1", "club", "m1", 2, { volno: 1 });
    await addInjury("i8", "p1", "club", "m1", 2, { fake: 1 });
    await addInjury("i9", "p1", "club", "m1", 1);
    expect(await notifyMatchInjuries(db, "m1")).toBe(1);
    expect((await notes()).map((n) => n.id)).toEqual(["injury-i9"]);
    expect(push.delivered).toHaveLength(0);
  });

  it("skloňování dnů a text bez popisu", () => {
    expect([1, 2, 4, 5, 21].map(injuryDaysText)).toEqual(["na 1 den", "na 2 dny", "na 4 dny", "na 5 dní", "na 21 dní"]);
    expect(injuryAlertText({ first_name: "Jan", last_name: "Novák", description: "", days_total: 1, is_u21: 0 }))
      .toEqual({ title: "🚑 Jan Novák se v zápase zranil", body: "Mimo hru bude na 1 den." });
  });
});
