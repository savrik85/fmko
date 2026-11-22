/**
 * Odpověď po výpadku modelu (`retry_reply`) nad D1 se všemi migracemi: opakovaný pokus nezakládá
 * nový řádek, čas i pokusy běží od prvního, a po vyčerpání se kredit za SMS vrátí.
 *
 * E2E 22. 11. (run 4, 7 řádků): retryReply zavolal startCoachThread, ten při výpadku naplánoval
 * nový retry_reply s čerstvým `created_at`, znovuotevření původního řádku spadlo na unikátním
 * indexu (`idx_player_follow_ups_open`) a strop 36 h se počítal vždy od posledního pokusu.
 * Odpověď se tak zkoušela pořád dokola a `refundCoachSms` nenastal nikdy.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  // Výpadek: model nevrací nic (callModel z toho udělá GeminiUnavailableError).
  generateText: vi.fn(async () => ""),
}));
vi.mock("./chat-kontext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-kontext")>()),
  zpozdeniOdpovedi: () => 0,
}));
vi.mock("./left-on-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./left-on-read")>()),
  leftOnReadChance: () => 0,
}));

import { deliverDueFollowUps } from "./follow-ups";
import type { Bindings } from "../index";

const TEAM = "team-retry";
const PLAYER = "player-retry";
const CONV = "conv-retry";
const T0 = Date.parse("2026-11-22T14:00:00.000Z");

let mf: Miniflare;
let db: D1Database;
let env: Bindings;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-retry', 'retry@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-retry', 'p06', 'Agrokat', 50000, '2026-11-22')").bind(TEAM),
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Tomáš', 'Šmíd', 27, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active')`,
    ).bind(PLAYER, TEAM),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', 'Tomáš Šmíd', ?)").bind(CONV, TEAM, PLAYER),
  ]);
}, 120_000);

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM messages"),
    db.prepare("DELETE FROM player_follow_ups"),
    // Kredit po zaplacené SMS (36 − 3).
    db.prepare("UPDATE teams SET phone_credit = 33, phone_credit_date = '2026-11-22' WHERE id = ?").bind(TEAM),
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read)
       VALUES ('coach-1', ?, 'user', ?, 'Agrokat', 'Tomáši, dorazíš v úterý na trénink?', ?, 1)`,
    ).bind(CONV, TEAM, new Date(T0 - 60 * 60_000).toISOString()),
    db.prepare(
      `INSERT INTO player_follow_ups (id, team_id, player_id, conversation_id, kind, due_at, payload, created_at)
       VALUES ('fu-1', ?, ?, ?, 'retry_reply', ?, '{}', ?)`,
    ).bind(TEAM, PLAYER, CONV, new Date(T0 - 5 * 60_000).toISOString(), new Date(T0 - 55 * 60_000).toISOString()),
  ]);
});

const openRows = async () => (await db.prepare(
  "SELECT id, created_at, attempts, due_at FROM player_follow_ups WHERE conversation_id = ? AND kind = 'retry_reply' AND done_at IS NULL",
).bind(CONV).all<{ id: string; created_at: string; attempts: number; due_at: string }>()).results;
const credit = async () => (await db.prepare("SELECT phone_credit FROM teams WHERE id = ?").bind(TEAM).first<{ phone_credit: number }>())!.phone_credit;

describe("odpověď po výpadku modelu", () => {
  it("model pořád nejde: zůstane jeden původní řádek, čas a pokusy od prvního pokusu", async () => {
    const out = await deliverDueFollowUps(db, env as never, new Date(T0));
    expect(out).toMatchObject({ retried: 1, cancelled: 0 });
    const rows = await openRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "fu-1", created_at: new Date(T0 - 55 * 60_000).toISOString(), attempts: 1 });
    expect(Date.parse(rows[0].due_at)).toBeGreaterThan(T0);
    expect(await credit()).toBe(33);
  }, 60_000);

  it("po 36 hodinách od prvního pokusu se vzdá, kredit vrátí a zprávu nechá bez odpovědi", async () => {
    // Pokusy se dělají ve dne (v noci by se odpověď jen odložila, hráč spí).
    const late = T0 + 42 * 3600_000;
    // Pokusy každou hodinu: řádek se jen odkládá, nový nevzniká.
    for (let h = 0; h < 3; h++) {
      await db.prepare("UPDATE player_follow_ups SET due_at = ? WHERE id = 'fu-1'").bind(new Date(T0 + h * 3600_000).toISOString()).run();
      await deliverDueFollowUps(db, env as never, new Date(T0 + h * 3600_000));
    }
    expect((await openRows()).map((r) => r.id)).toEqual(["fu-1"]);
    await db.prepare("UPDATE player_follow_ups SET due_at = ? WHERE id = 'fu-1'").bind(new Date(late).toISOString()).run();
    const out = await deliverDueFollowUps(db, env as never, new Date(late));
    expect(out).toMatchObject({ cancelled: 1, retried: 0 });
    expect(await openRows()).toEqual([]);
    expect(await credit()).toBe(36);
    const coach = await db.prepare("SELECT json_extract(metadata, '$.creditRefunded') AS r FROM messages WHERE id = 'coach-1'").first<{ r: number }>();
    expect(coach?.r).toBe(1);
    const replies = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender_type = 'player'").first<{ n: number }>();
    expect(replies?.n).toBe(0);
  }, 120_000);

  it("strop pokusů platí i dřív než 36 hodin", async () => {
    await db.prepare("UPDATE player_follow_ups SET attempts = 47 WHERE id = 'fu-1'").run();
    expect(await deliverDueFollowUps(db, env as never, new Date(T0))).toMatchObject({ cancelled: 1 });
    expect(await openRows()).toEqual([]);
    expect(await credit()).toBe(36);
  }, 60_000);
});
