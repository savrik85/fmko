import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { getOrCreatePlayerConversation } from "./ai-player-spawn";

let miniflare: Miniflare;
let db: D1Database;

const PLAYER = { id: "p1", firstName: "Karel", lastName: "Rychlý", nickname: null, avatar: '{"head":1}' };

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  // Bez unikátního indexu (team_id, type, participant_id), stejně jako na produkci.
  await db.prepare(
    `CREATE TABLE conversations (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      participant_id TEXT, participant_avatar TEXT, last_message_text TEXT, last_message_at TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM conversations").run();
});

async function playerConversations(teamId = "team-a") {
  const rows = await db.prepare(
    "SELECT id, title, participant_avatar FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = 'p1'",
  ).bind(teamId).all<{ id: string; title: string; participant_avatar: string }>();
  return rows.results;
}

describe("konverzace s hráčem", () => {
  it("první zpráva konverzaci založí, další ji jen najde", async () => {
    const first = await getOrCreatePlayerConversation(db, "team-a", PLAYER);
    const again = await getOrCreatePlayerConversation(db, "team-a", PLAYER);
    expect(again).toBe(first);
    expect(await playerConversations()).toEqual([{ id: first, title: "Karel Rychlý", participant_avatar: '{"head":1}' }]);
  });

  it("rychlé klikání na SMS (souběžné požadavky) založí jen jednu konverzaci", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => getOrCreatePlayerConversation(db, "team-a", PLAYER)));
    const rows = await playerConversations();
    expect(rows).toHaveLength(1);
    expect(new Set(ids)).toEqual(new Set([rows[0].id]));
  });

  it("starší zdvojené konverzace: vždy ta nejstarší, žádná další nepřibude", async () => {
    await db.batch([
      db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id, created_at) VALUES ('newer', 'team-a', 'player', 'K', 'p1', '2026-10-20T10:00:00.000Z')"),
      db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id, created_at) VALUES ('older', 'team-a', 'player', 'K', 'p1', '2026-10-01T10:00:00.000Z')"),
    ]);
    expect(await getOrCreatePlayerConversation(db, "team-a", PLAYER)).toBe("older");
    expect(await playerConversations()).toHaveLength(2);
  });

  it("každý tým má s hráčem vlastní konverzaci", async () => {
    const mine = await getOrCreatePlayerConversation(db, "team-a", PLAYER);
    const theirs = await getOrCreatePlayerConversation(db, "team-b", PLAYER);
    expect(theirs).not.toBe(mine);
    expect(await playerConversations("team-b")).toHaveLength(1);
  });
});
