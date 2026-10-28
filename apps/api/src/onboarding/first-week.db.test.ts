import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { advanceFirstWeekGuide, GUIDE_REWARD, GUIDE_SENDER, GUIDE_STEPS, recordGuideVisit, startFirstWeekGuide } from "./first-week";

let miniflare: Miniflare;
let db: D1Database;
let kv: KVNamespace;
const T = "t1";

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["KV"],
  });
  db = await miniflare.getD1Database("DB");
  kv = await miniflare.getKVNamespace("KV") as unknown as KVNamespace;
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, budget INTEGER, game_date TEXT, training_days TEXT)",
    `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, pinned INTEGER, unread_count INTEGER,
      last_message_text TEXT, last_message_at TEXT, created_at TEXT, participant_id TEXT)`,
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER)",
    "CREATE TABLE lineups (id TEXT PRIMARY KEY, team_id TEXT, is_auto INTEGER, submitted_at TEXT)",
    "CREATE TABLE sponsor_contracts (id TEXT PRIMARY KEY, team_id TEXT, status TEXT)",
    "CREATE TABLE player_watchlist (id TEXT PRIMARY KEY, team_id TEXT, player_id TEXT, created_at TEXT)",
    "CREATE TABLE transfer_offers (id TEXT PRIMARY KEY, from_team_id TEXT, created_at TEXT)",
    "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
    "INSERT INTO teams VALUES ('t1', 20000, '2026-10-28T16:00:00Z', NULL)",
    // Sestava AI klubu z doby před převzetím se nepočítá.
    "INSERT INTO lineups VALUES ('old', 't1', 0, '2020-01-01T00:00:00Z')",
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

async function guideMessages(): Promise<Array<{ step: string; body: string }>> {
  const rows = await db.prepare(
    `SELECT json_extract(m.metadata, '$.step') AS step, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.title = ? ORDER BY m.rowid`,
  ).bind(T, GUIDE_SENDER).all<{ step: string; body: string }>();
  return rows.results;
}

describe("průvodce prvním týdnem", () => {
  it("bez startu nic nedělá, start pošle první úkol jen jednou", async () => {
    expect((await advanceFirstWeekGuide(db, T)).active).toBe(false);
    await startFirstWeekGuide(db, T);
    await startFirstWeekGuide(db, T);
    expect((await guideMessages()).map((m) => m.step)).toEqual(["lineup"]);
  });

  it("starou sestavu AI klubu nepočítá; nový úkol do druhého dne nepřijde, po splnění hned", async () => {
    const s1 = await advanceFirstWeekGuide(db, T);
    expect(s1.active).toBe(true);
    expect(s1.steps.find((s) => s.key === "lineup")?.done).toBe(false);
    expect((await guideMessages()).length).toBe(1);

    await db.prepare("INSERT INTO lineups VALUES ('new', 't1', 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+1 minute'))").run();
    await advanceFirstWeekGuide(db, T);
    expect((await guideMessages()).map((m) => m.step)).toEqual(["lineup", "training"]);
  });

  it("nesplněný úkol: další přijde po 20 hodinách", async () => {
    const later = new Date(Date.now() + 21 * 3_600_000);
    await advanceFirstWeekGuide(db, T, later);
    expect((await guideMessages()).map((m) => m.step)).toEqual(["lineup", "training", "sponsor"]);
  });

  it("po splnění všeho vyplatí odměnu jednou, karta zmizí a kapitán už nepíše", async () => {
    const soon = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+2 minutes')";
    for (const sql of [
      "UPDATE teams SET training_days = '[2,4]' WHERE id = 't1'",
      "INSERT INTO sponsor_contracts VALUES ('s', 't1', 'active')",
      "INSERT INTO conversations VALUES ('pc', 't1', 'player', 'Jan Novák', 0, 0, '', '', '', 'p1')",
      `INSERT INTO messages VALUES ('pm', 'pc', 'user', NULL, 'Trenér', 'Ahoj', NULL, ${soon}, 1)`,
      "INSERT INTO player_watchlist VALUES ('w', 't1', 'p9', '')",
    ]) await db.prepare(sql).run();

    // Stadion a vybavení stačí otevřít; neznámý krok se nezapíše.
    expect((await advanceFirstWeekGuide(db, T, new Date(), kv)).active).toBe(true);
    await recordGuideVisit(kv, T, "stadium");
    await recordGuideVisit(kv, T, "lineup");
    const partial = await advanceFirstWeekGuide(db, T, new Date(), kv);
    expect(partial.steps.find((s) => s.key === "stadium")?.done).toBe(true);
    expect(partial.steps.find((s) => s.key === "equipment")?.done).toBe(false);
    expect(partial.active).toBe(true);
    await recordGuideVisit(kv, T, "equipment");

    const done = await advanceFirstWeekGuide(db, T, new Date(), kv);
    expect(done.rewardPaid).toBe(true);
    expect(done.active).toBe(false);
    const again = await advanceFirstWeekGuide(db, T, new Date(), kv);
    expect(again.active).toBe(false);

    const paid = await db.prepare("SELECT COUNT(*) AS n, SUM(amount) AS s FROM transactions WHERE team_id = 't1'").first<{ n: number; s: number }>();
    expect(paid).toEqual({ n: 1, s: GUIDE_REWARD });
    const budget = await db.prepare("SELECT budget FROM teams WHERE id = 't1'").first<{ budget: number }>();
    expect(budget?.budget).toBe(20000 + GUIDE_REWARD);
    const msgs = await guideMessages();
    expect(msgs.at(-1)?.step).toBe("done");
    expect(msgs.filter((m) => m.step === "done")).toHaveLength(1);
    expect(GUIDE_STEPS.map((s) => s.key)).toEqual(["lineup", "training", "sponsor", "player_chat", "market", "stadium", "equipment"]);
    expect(GUIDE_STEPS.every((s) => s.hint.length > 20)).toBe(true);
  });
});
