import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { OWN_LINES_LIMIT, loadOwnRecentLines } from "./repetition";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, participant_id TEXT, created_at TEXT)");
  await db.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, body TEXT, sent_at TEXT)");
  const stmts = [
    db.prepare("INSERT INTO conversations VALUES ('c1', 'team-a', 'player', 'p1', '2026-09-01T10:00:00Z')"),
    db.prepare("INSERT INTO conversations VALUES ('c2', 'team-a', 'player', 'p2', '2026-09-01T10:00:00Z')"),
    // Deset zpráv hráče: hlídá se jen posledních osm, i starších než šest zpráv historie.
    ...Array.from({ length: 10 }, (_, n) => db.prepare("INSERT INTO messages VALUES (?, 'c1', 'player', 'p1', ?, ?)")
      .bind(`p1-${n}`, `Zpráva hráče číslo ${n}.`, `2026-09-${String(10 + n).padStart(2, "0")}T18:00:00Z`)),
    db.prepare("INSERT INTO messages VALUES ('coach', 'c1', 'user', 'u1', 'Trenér píše.', '2026-09-25T18:00:00Z')"),
    db.prepare("INSERT INTO messages VALUES ('empty', 'c1', 'player', 'p1', '', '2026-09-26T18:00:00Z')"),
    db.prepare("INSERT INTO messages VALUES ('other', 'c2', 'player', 'p2', 'Cizí hráč.', '2026-09-27T18:00:00Z')"),
  ];
  await db.batch(stmts);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("poslední vlastní zprávy hráče", () => {
  it("vrací posledních osm jeho zpráv, nejstarší první, bez trenéra, cizích a prázdných", async () => {
    const lines = await loadOwnRecentLines(db, { playerId: "p1", convId: "c1" });
    expect(OWN_LINES_LIMIT).toBe(8);
    // Prázdná zpráva (jen fotka) místo nezabere.
    expect(lines).toEqual([2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Zpráva hráče číslo ${n}.`));
  });

  it("bez id konverzace ji dohledá podle týmu a hráče", async () => {
    expect(await loadOwnRecentLines(db, { playerId: "p2", teamId: "team-a" })).toEqual(["Cizí hráč."]);
    expect(await loadOwnRecentLines(db, { playerId: "p3", teamId: "team-a" })).toEqual([]);
    expect(await loadOwnRecentLines(db, { playerId: "p1" })).toEqual([]);
  });
});
