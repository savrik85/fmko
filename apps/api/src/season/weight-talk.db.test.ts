import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { handleWeightTalk } from "./weight-talk";

let miniflare: Miniflare;
let db: D1Database;

async function lc(id: string): Promise<Record<string, unknown>> {
  const r = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(id).first<{ life_context: string }>();
  return JSON.parse(r!.life_context);
}

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, game_date TEXT)`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, age INTEGER, physical TEXT, personality TEXT, life_context TEXT)`,
    `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, ai_thread_state TEXT, ai_thread_active INTEGER DEFAULT 0)`,
    `CREATE TABLE weight_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, game_date TEXT, weight REAL, source TEXT)`,
  ]) await db.prepare(sql).run();
  const fat = JSON.stringify({ height: 180, weight: 92, naturalBase: 92 });
  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id, game_date) VALUES ('t1', 'u1', '2026-10-12T16:00:00.000Z')"),
    db.prepare("INSERT INTO players VALUES ('good', 't1', 25, ?, ?, ?)").bind(fat, JSON.stringify({ discipline: 100, temper: 0 }), JSON.stringify({ morale: 100 })),
    db.prepare("INSERT INTO players VALUES ('hothead', 't1', 25, ?, ?, ?)").bind(fat, JSON.stringify({ discipline: 0, temper: 100 }), JSON.stringify({ morale: 0 })),
    db.prepare("INSERT INTO players VALUES ('fit', 't1', 25, ?, ?, ?)").bind(JSON.stringify({ height: 180, weight: 76 }), JSON.stringify({ discipline: 100 }), JSON.stringify({ morale: 60 })),
    db.prepare("INSERT INTO conversations (id, team_id) VALUES ('c-good', 't1'), ('c-hot', 't1'), ('c-fit', 't1')"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("handleWeightTalk", () => {
  it("disciplinovaný hráč s nadváhou slíbí: slib na 14 dní a téma do konverzace", async () => {
    const r = await handleWeightTalk(db, { teamId: "t1", convId: "c-good", playerId: "good", text: "Musíš zhubnout, míň piva" });
    expect(r).toBe("pledge");
    const l = await lc("good");
    expect(l.dietPledgeUntil).toBe("2026-10-26");
    expect(l.dietTalkAt).toBe("2026-10-12");
    const conv = await db.prepare("SELECT ai_thread_state FROM conversations WHERE id = 'c-good'").first<{ ai_thread_state: string }>();
    expect(JSON.parse(conv!.ai_thread_state).weightTalk).toEqual({ outcome: "pledge", den: "2026-10-12" });
  });

  it("vznětlivý s mizernou náladou se urazí a klesne mu morálka", async () => {
    const r = await handleWeightTalk(db, { teamId: "t1", convId: "c-hot", playerId: "hothead", text: "Ten břich ti roste, zhubni" });
    expect(r).toBe("refused");
    const l = await lc("hothead");
    expect(l.morale).toBe(0);
    expect(l.dietPledgeUntil).toBeUndefined();
  });

  it("do 14 dní se znovu nerozhoduje", async () => {
    expect(await handleWeightTalk(db, { teamId: "t1", convId: "c-good", playerId: "good", text: "A co ta váha?" })).toBeNull();
  });

  it("hráč v normě: nic se nestane a pauza se nespotřebuje", async () => {
    expect(await handleWeightTalk(db, { teamId: "t1", convId: "c-fit", playerId: "fit", text: "Musíš zhubnout" })).toBeNull();
    expect((await lc("fit")).dietTalkAt).toBeUndefined();
  });

  it("zpráva bez řeči o váze se ignoruje", async () => {
    expect(await handleWeightTalk(db, { teamId: "t1", convId: "c-hot", playerId: "hothead", text: "Jak se máš?" })).toBeNull();
  });
});
