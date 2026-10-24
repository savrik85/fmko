import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { coachStreak, markCoachMessagesRead } from "./left-on-read";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, body TEXT, metadata TEXT, sent_at TEXT)");
  await db.batch([
    db.prepare("INSERT INTO messages VALUES ('m1', 'c1', 'player', 'ahoj trenére', NULL, '2026-10-24T18:00:00Z')"),
    db.prepare("INSERT INTO messages VALUES ('m2', 'c1', 'user', 'čau', NULL, '2026-10-24T18:01:00Z')"),
    db.prepare("INSERT INTO messages VALUES ('m3', 'c1', 'user', 'jsi tam?', '{\"type\":\"voice\",\"audioKey\":\"voice/coach/x.webm\"}', '2026-10-24T18:02:00Z')"),
    db.prepare("INSERT INTO messages VALUES ('m4', 'c2', 'user', 'jiný hráč', NULL, '2026-10-24T18:03:00Z')"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

const metadata = async (id: string) => {
  const row = await db.prepare("SELECT metadata FROM messages WHERE id = ?").bind(id).first<{ metadata: string | null }>();
  return row?.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : null;
};

describe("přečteno v databázi", () => {
  it("počítá trenérovy zprávy od hráčovy poslední odpovědi, bez odpovědi všechny", async () => {
    expect(await coachStreak(db, "c1")).toBe(2);
    expect(await coachStreak(db, "c2")).toBe(1);
    expect(await coachStreak(db, "nic")).toBe(0);
  });

  it("označí trenérovy zprávy jako přečtené a nesmaže jim ostatní metadata", async () => {
    await markCoachMessagesRead(db, "c1", "2026-10-24T18:05:00Z");
    expect(await metadata("m2")).toEqual({ readAt: "2026-10-24T18:05:00Z" });
    expect(await metadata("m3")).toEqual({ type: "voice", audioKey: "voice/coach/x.webm", readAt: "2026-10-24T18:05:00Z" });
    expect(await metadata("m1")).toBeNull();
    expect(await metadata("m4")).toBeNull();
  });

  it("už přečtenou zprávu nepřepíše pozdějším časem", async () => {
    await markCoachMessagesRead(db, "c1", "2026-10-25T09:00:00Z");
    expect((await metadata("m2"))?.readAt).toBe("2026-10-24T18:05:00Z");
  });
});
