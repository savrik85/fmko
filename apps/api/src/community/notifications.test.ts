import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const push = vi.hoisted(() => ({
  delivered: [] as string[],
  prefs: {} as Record<string, boolean>,
  fail: false,
}));

vi.mock("./web-push", () => ({
  getNotificationPreferences: vi.fn(async () => ({
    match_reminder: true, match_result: true, transfer: true, challenge: true, event: true, season: true, system: true,
    ...push.prefs,
  })),
  // Doručení trvá déle než zápis oznámení, jako skutečný požadavek na push službu.
  sendWebPushToTeam: vi.fn(async (_env: unknown, teamId: string, title: string) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (push.fail) throw new Error("push služba neodpovídá");
    push.delivered.push(`${teamId}:${title}`);
  }),
}));

import { createNotification } from "./notifications";

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
  await db.prepare(
    `CREATE TABLE notifications (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, action_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  ).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  push.delivered = [];
  push.prefs = {};
  push.fail = false;
  await db.prepare("DELETE FROM notifications").run();
});

describe("createNotification — push na telefon", () => {
  it("push je doručený dřív, než createNotification vrátí (jinak ho Worker po konci požadavku utne)", async () => {
    await createNotification(db, "t1", "transfer", "🤝 Nová nabídka", "FK Kupec nabízí 10 000 Kč", "/prestupy", pushEnv());
    expect(push.delivered).toEqual(["t1:🤝 Nová nabídka"]);
  });

  it("selhání push nezruší oznámení v aplikaci a nevyhodí chybu", async () => {
    push.fail = true;
    await expect(createNotification(db, "t1", "match_result", "⚽ 2:1", "Vyhráli jste", "/zapas", pushEnv())).resolves.toBeUndefined();
    const row = await db.prepare("SELECT title FROM notifications WHERE team_id = 't1'").first<{ title: string }>();
    expect(row?.title).toBe("⚽ 2:1");
  });

  it("vypnutý druh oznámení v předvolbách se na telefon neposílá", async () => {
    push.prefs = { transfer: false };
    await createNotification(db, "t1", "transfer", "🤝 Nová nabídka", "…", "/prestupy", pushEnv());
    expect(push.delivered).toEqual([]);
  });
});
