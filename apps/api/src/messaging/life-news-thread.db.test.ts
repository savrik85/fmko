/**
 * Vlákno po porodu (lokální E2E 22. 11., C1): Lakatoš po „Jasně, rád přijdu zapít malýho“
 * i po poděkování za návštěvu zval trenéra znovu („Klidně přijď, Josef už spí“), Mráz po
 * „Dík, že jsi přišel zapít Kristýnku“ zase „čekám tě na pivo“. Scénář vlákna pořád zval.
 * Skutečná routa zprávy trenéra a odpověď hráče na D1 (Miniflare, všechny migrace), model podvržený.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(async () => JSON.stringify({ body: "Doma je to veselý, malej nespí.", conversation_complete: false })),
}));
vi.mock("./chat-kontext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-kontext")>()),
  zpozdeniOdpovedi: () => 0,
}));

// Hráč občas nechá trenéra „na přečteno“ (náhoda). V testu odpoví vždy.
vi.mock("./left-on-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./left-on-read")>()),
  leftOnReadChance: () => 0,
}));

import { Hono } from "hono";
import { generateText } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { createSession } from "../auth/session";
import { scenarioAfterInvite } from "./casual-messages";
import { getScenarioById } from "./ai-player-scenarios";
import type { Bindings } from "../index";

const TEAM = "team-baby";
const PLAYER = "player-baby";
const CONV = "conv-baby";
const GAME_DATE = "2026-11-22";
const T0 = new Date(Date.now() - 3 * 3600_000).toISOString();

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let token: string;

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
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  env = {
    DB: db,
    SESSION_KV: await mf.getKVNamespace("SESSION_KV"),
    CACHE_KV: await mf.getKVNamespace("CACHE_KV"),
  } as unknown as Bindings;
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-baby', 'baby@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-baby', 'p06', 'STS Čkyně', 50000, ?)").bind(TEAM, GAME_DATE),
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Denis', 'Lakatoš', 29, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active')`,
    ).bind(PLAYER, TEAM),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', 'Denis Lakatoš', ?)").bind(CONV, TEAM, PLAYER),
  ]);
  token = await createSession(env.SESSION_KV, "user-baby", "baby@example.test", null);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  vi.mocked(generateText).mockClear();
  await db.prepare("UPDATE teams SET phone_credit = 36, phone_credit_date = ? WHERE id = ?").bind(GAME_DATE, TEAM).run();
  await db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ? WHERE id = ?").bind(JSON.stringify({
    trigger: "life_news_baby", scenario_id: "life_news_baby", max_replies: 3, current_replies: 1, awaiting: "coach",
    initiated_at: T0, player_id: PLAYER, casual: true, resolution: null,
  }), CONV).run();
  await db.prepare("DELETE FROM messages").run();
  await db.prepare("DELETE FROM player_follow_ups").run();
  await env.CACHE_KV.delete(`open_invite:${CONV}`);
  const msg = (id: string, sender: "player" | "user", body: string, minutesAfter: number, metadata: object | null = null) =>
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES (?, ?, ?, ?, 'x', ?, ?, ?, 1)")
      .bind(id, CONV, sender, sender === "player" ? PLAYER : TEAM, body, metadata ? JSON.stringify(metadata) : null, new Date(Date.parse(T0) + minutesAfter * 60_000).toISOString());
  await db.batch([
    msg("news", "player", "Trenére, je to za námi! Narodil se mi syn Josef, vážil 2,96 kila. Přijď zapít malýho!", 0, { life_news: true }),
    msg("yes", "user", "Gratuluju, Denisi! Jasně, rád přijdu zapít malýho.", 5),
  ]);
});

/** Zpráva trenéra přes routu, vrací prompt odpovědi hráče. */
async function coachSays(text: string): Promise<string> {
  const background: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
  const res = await app.request(`/api/teams/${TEAM}/conversations/${CONV}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body: text }),
  }, env, ctx as unknown as ExecutionContext);
  expect(res.status).toBe(200);
  for (let done = 0; done < background.length;) {
    const batch = background.slice(done);
    done = background.length;
    await Promise.allSettled(batch);
  }
  return String(vi.mocked(generateText).mock.calls.map((c) => String(c[1])).find((p) => p.includes("SCÉNÁŘ")) ?? "");
}

describe("vlákno po porodu a pozvání", () => {
  it("po poděkování za návštěvu už nezve (Lakatoš)", async () => {
    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES ('thanks', ?, 'player', ?, 'x', 'Dík za návštěvu, trenére!', ?, ?, 1)",
    ).bind(CONV, PLAYER, JSON.stringify({ follow_up: "after_invite" }), new Date(Date.parse(T0) + 60 * 60_000).toISOString()).run();
    const prompt = await coachSays("Denisi, jak to doma zvládáte? Spíte vůbec?");
    expect(prompt).toContain("Trenér už u vás byl");
    expect(prompt).toContain("Znovu ho nezvi");
    expect(prompt).not.toContain("POZVÁNKA:");
  }, 60_000);

  it("po přijetí pozvání (poděkování teprve přijde) už nezve, jen se těší", async () => {
    await db.prepare(
      `INSERT INTO player_follow_ups (id, team_id, player_id, conversation_id, kind, due_at, payload, created_at)
       VALUES ('fu1', ?, ?, ?, 'after_invite', ?, '{"invite":"baby"}', ?)`,
    ).bind(TEAM, PLAYER, CONV, new Date(Date.now() + 30 * 3600_000).toISOString(), new Date(Date.parse(T0) + 6 * 60_000).toISOString()).run();
    const prompt = await coachSays("A co malej, papá?");
    expect(prompt).toContain("Trenér už slíbil, že přijde");
    expect(prompt).not.toContain("POZVÁNKA:");
  }, 60_000);

  it("dokud pozvání čeká na odpověď, zvát smí", async () => {
    await env.CACHE_KV.put(`open_invite:${CONV}`, JSON.stringify({ kind: "baby", topicId: "life_news_baby", teamId: TEAM, playerId: PLAYER, playerFirstName: "Denis" }));
    await db.prepare("DELETE FROM messages WHERE id = 'yes'").run();
    const prompt = await coachSays("Gratuluju, Denisi! To je krásná zpráva.");
    expect(prompt).toContain("POZVÁNKA:");
    expect(prompt).not.toContain("Znovu ho nezvi");
  }, 60_000);
});

describe("scénář po pozvání", () => {
  it("bez pozvání a s větou, co se stalo", () => {
    const base = getScenarioById("life_news_baby")!;
    expect(base.invite).toBe("baby");
    for (const status of ["accepted", "visited", "closed"] as const) {
      const s = scenarioAfterInvite(base, status);
      expect(s.invite, status).toBeUndefined();
      expect(s.description, status).toContain("Znovu ho nezvi");
      expect(s.id).toBe("life_news_baby");
    }
  });
});
