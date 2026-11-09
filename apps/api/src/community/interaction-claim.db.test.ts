/**
 * Zabrání nároku na interakci trenérů nad skutečnou D1 (Miniflare):
 * ze souběžných požadavků smí projít právě jeden.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { claimInteraction, finishInteraction, releaseInteraction } from "./manager-relations";
import { claimInterviewAnswer } from "../routes/game";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.prepare(`CREATE TABLE manager_interactions (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, actor_team_id TEXT NOT NULL, target_team_id TEXT NOT NULL,
    match_id TEXT, payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'resolved',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`).run();
  await db.prepare(`CREATE TABLE coach_interviews (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending',
    answers TEXT, answer_tones TEXT)`).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  await db.prepare("DELETE FROM manager_interactions").run();
  await db.prepare("DELETE FROM coach_interviews").run();
});

const count = async (type: string) =>
  (await db.prepare("SELECT COUNT(*) AS n FROM manager_interactions WHERE type = ?").bind(type).first<{ n: number }>())!.n;

describe("claimInteraction", () => {
  it("z deseti souběžných inzerátů projde jeden", async () => {
    const claims = await Promise.all(Array.from({ length: 10 }, () =>
      claimInteraction(db, "ad", "t1", "t2", null, {}, "resolved", { kind: "cooldown", days: 7 })));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await count("ad")).toBe(1);
  });

  it("cooldown platí pro dvojici oběma směry a po uplynutí se uvolní", async () => {
    expect(await claimInteraction(db, "beer", "t1", "t2", null, {}, "resolved", { kind: "cooldown", days: 7 })).toBeTruthy();
    expect(await claimInteraction(db, "beer", "t2", "t1", null, {}, "resolved", { kind: "cooldown", days: 7 })).toBeNull();
    // Jiná dvojice a jiný typ se neblokují.
    expect(await claimInteraction(db, "beer", "t1", "t3", null, {}, "resolved", { kind: "cooldown", days: 7 })).toBeTruthy();
    expect(await claimInteraction(db, "praise", "t1", "t2", null, {}, "resolved", { kind: "cooldown", days: 7 })).toBeTruthy();

    await db.prepare(
      "UPDATE manager_interactions SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 days') WHERE type = 'beer'"
    ).run();
    expect(await claimInteraction(db, "beer", "t1", "t2", null, {}, "resolved", { kind: "cooldown", days: 7 })).toBeTruthy();
  });

  it("gesto jde jednou za zápas a aktéra, soupeř má vlastní", async () => {
    const claims = await Promise.all(Array.from({ length: 5 }, () =>
      claimInteraction(db, "gesture", "t1", "t2", "m1", { choice: "jab" }, "resolved", { kind: "match" })));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimInteraction(db, "gesture", "t2", "t1", "m1", {}, "resolved", { kind: "match" })).toBeTruthy();
    expect(await claimInteraction(db, "gesture", "t1", "t2", "m2", {}, "resolved", { kind: "match" })).toBeTruthy();
  });

  it("na zápas smí být jen jedna otevřená sázka, po odmítnutí jde nabídnout znovu", async () => {
    const claims = await Promise.all([
      claimInteraction(db, "bet", "t1", "t2", "m1", { amount: 500 }, "pending", { kind: "open_bet" }),
      claimInteraction(db, "bet", "t2", "t1", "m1", { amount: 500 }, "offered", { kind: "open_bet" }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const id = claims.find(Boolean)!;
    await finishInteraction(db, id, { declined: true }, "resolved");
    const row = await db.prepare("SELECT payload, status FROM manager_interactions WHERE id = ?").bind(id)
      .first<{ payload: string; status: string }>();
    expect(row).toEqual({ payload: '{"declined":true}', status: "resolved" });
    expect(await claimInteraction(db, "bet", "t1", "t2", "m1", {}, "offered", { kind: "open_bet" })).toBeTruthy();
  });

  it("finishInteraction bez stavu stav nemění a uvolněný nárok jde zabrat znovu", async () => {
    const id = (await claimInteraction(db, "statement", "t1", "t2", "m1", {}, "pending", { kind: "match" }))!;
    await finishInteraction(db, id, { tone: "humble" });
    expect((await db.prepare("SELECT status FROM manager_interactions WHERE id = ?").bind(id).first<{ status: string }>())!.status)
      .toBe("pending");
    await releaseInteraction(db, id);
    expect(await claimInteraction(db, "statement", "t1", "t2", "m1", {}, "pending", { kind: "match" })).toBeTruthy();
  });
});

describe("claimInterviewAnswer", () => {
  it("ze souběžných odeslání rozhovoru projde jedno", async () => {
    await db.prepare("INSERT INTO coach_interviews (id) VALUES ('i1')").run();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      claimInterviewAnswer(db, "i1", [`odpověď ${i}`], ["normal"])));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimInterviewAnswer(db, "i1", ["pozdě"], ["normal"])).toBe(false);
    expect(await claimInterviewAnswer(db, "missing", ["x"], ["normal"])).toBe(false);
  });
});
