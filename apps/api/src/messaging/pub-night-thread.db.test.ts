/**
 * Vlákno z hospody další den (prod 22. 11.): na odpověď trenéra v 10:50 hráč po nočním pub_voice
 * psal zase opile a zval na jedno. Skutečná routa zprávy trenéra a odpověď hráče na D1 (Miniflare,
 * všechny migrace), model podvržený. Časy noci a rána hlídá pub-night.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(async () => JSON.stringify({ body: "Jo, trenére, včera jsem to přehnal.", conversation_complete: false })),
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
import type { Bindings } from "../index";

const TEAM = "team-pub";
const PLAYER = "player-pub";
const CONV = "conv-pub";
const GAME_DATE = "2026-11-22";
/** Hlasovka z hospody před 11 hodinami: noc v hospodě (nejvýš 8 h) je za ním, ať test běží kdykoli. */
const STARTED = new Date(Date.now() - 11 * 3600_000).toISOString();

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
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-pub', 'pub@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-pub', 'p06', 'FC Kávoviny', 50000, ?)").bind(TEAM, GAME_DATE),
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Petr', 'Hrdlička', 28, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active')`,
    ).bind(PLAYER, TEAM),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', 'Petr Hrdlička', ?)").bind(CONV, TEAM, PLAYER),
  ]);
  token = await createSession(env.SESSION_KV, "user-pub", "pub@example.test", null);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  vi.mocked(generateText).mockClear();
  await db.prepare("UPDATE teams SET phone_credit = 36, phone_credit_date = ? WHERE id = ?").bind(GAME_DATE, TEAM).run();
  await db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ? WHERE id = ?").bind(JSON.stringify({
    trigger: "pub_voice", scenario_id: "pub_voice", max_replies: 2, current_replies: 0, awaiting: "coach",
    initiated_at: STARTED, player_id: PLAYER, resolution: null,
  }), CONV).run();
  await db.prepare("DELETE FROM messages").run();
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES ('voice', ?, 'player', ?, 'Petr Hrdlička', ?, ?, ?, 1)",
  ).bind(CONV, PLAYER, "trenere ty jsi fakt dobrej trener, doraz za nama na jedno 🍺", JSON.stringify({ type: "voice", drunk: 1 }), STARTED).run();
});

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

describe("vlákno z hospody další den", () => {
  it("hráč je střízlivý, mluví o včerejšku, nezve a pokyn o opilé hlasovce není dvakrát", async () => {
    const prompt = await coachSays("Petře, tak co, jak se dneska máš po včerejšku?");
    expect(prompt).toContain("jsi střízlivý");
    expect(prompt).toContain("Do hospody teď nezveš");
    expect(prompt).not.toContain("máš v sobě dost piv");
    expect(prompt).not.toContain("Klidně ho pozvi, ať přijde na pivo");
    expect(prompt).not.toContain("OPILOU hlasovku nebo zprávu");
  }, 60_000);

  it("ráno potom: na druhou otázku trenéra hráč odpoví, není to vynucená poslední zpráva (E2E 22. 11.: 4/4 jen omluvy)", async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce(JSON.stringify({ body: "Dobrý, trenére, jen trochu bolí hlava.", conversation_complete: false }))
      .mockResolvedValueOnce(JSON.stringify({ body: "Kluci v kabině drží spolu, Jirka je teď nejlepší.", conversation_complete: false }));
    await coachSays("Kevine, co děláš? Všechno v pohodě?");
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Kluci v kabině drží spolu, Jirka je teď nejlepší.", conversation_complete: false }));
    const second = await coachSays("To rád slyším. Jak to vidíš s klukama v kabině?");
    expect(second).toContain("Jak to vidíš s klukama v kabině?");
    expect(second).not.toContain("TOTO JE TVOJE POSLEDNÍ ZPRÁVA");
    const conv = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = ?").bind(CONV).first<{ ai_thread_active: number; ai_thread_state: string }>();
    expect(conv?.ai_thread_active).toBe(1);
    expect(JSON.parse(conv!.ai_thread_state)).toMatchObject({ current_replies: 2, awaiting: "coach" });
  }, 60_000);
});
