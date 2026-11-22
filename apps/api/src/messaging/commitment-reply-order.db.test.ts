/**
 * Odpověď hráče nečeká na rozpoznání slibu (lokální E2E 22. 11.): skutečná routa zprávy trenéra
 * na D1 a KV (Miniflare, všechny migrace). Rozpoznání slibu je volání modelu navíc a se slabým
 * modelem (Workers AI, 12–21 s) sežralo rozpočet odpovědi: ~40 % odpovědí přišlo až ráno.
 * Teď běží souběžně, odpověď počká jen chvilku a o pomalu rozpoznaném slibu hráč ví od další zprávy.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(),
}));
// Hráč „píše“ odpověď podle délky textu, v testu bez čekání.
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
import { COMMITMENT_REPLY_WAIT_MS } from "./coach-commitments";
import type { Bindings } from "../index";

const TEAM = "team-order";
const PLAYER = "player-order";
const CONV = "conv-order";
const GAME_DATE = "2026-11-22";
const PROMISE = "Zítra hraješ v základu.";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let token: string;
/** Rozpoznání slibu visí, dokud ho test nepustí. */
let releaseDetection: ((json: string) => void) | null = null;
let background: Promise<unknown>[] = [];

const isDetection = (prompt: unknown) => String(prompt).includes("KONKRÉTNÍ slib");

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
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-order', 'order@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-order', 'p06', 'SK Pořadí', 50000, ?)").bind(TEAM, GAME_DATE),
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Franta', 'Novák', 27, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active')`,
    ).bind(PLAYER, TEAM),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', 'Franta Novák', ?)").bind(CONV, TEAM, PLAYER),
  ]);
  token = await createSession(env.SESSION_KV, "user-order", "order@example.test", null);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  releaseDetection = null;
  background = [];
  vi.mocked(generateText).mockReset();
  await db.prepare("UPDATE teams SET phone_credit = 36, phone_credit_date = ? WHERE id = ?").bind(GAME_DATE, TEAM).run();
  await db.prepare("UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ?").bind(CONV).run();
  await db.prepare("DELETE FROM messages").run();
  await db.prepare("DELETE FROM coach_commitments").run();
});

/** Zpráva trenéra přes routu. Práce na pozadí (waitUntil) se sbírá do `background`, nečeká se na ni. */
async function send(text: string) {
  const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
  const res = await app.request(`/api/teams/${TEAM}/conversations/${CONV}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body: text }),
  }, env, ctx as unknown as ExecutionContext);
  expect(res.status).toBe(200);
}

async function playerReplies(): Promise<string[]> {
  const rows = await db.prepare("SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player' ORDER BY sent_at")
    .bind(CONV).all<{ body: string }>();
  return rows.results.map((r) => r.body);
}

/** Čeká, až hráč odepíše `count` zpráv, nejvýš `ms`. */
async function waitForReplies(count: number, ms: number): Promise<string[]> {
  const until = Date.now() + ms;
  for (;;) {
    const replies = await playerReplies();
    if (replies.length >= count || Date.now() > until) return replies;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const replyPrompts = () => vi.mocked(generateText).mock.calls.map((c) => String(c[1])).filter((p) => !isDetection(p));

describe("odpověď hráče a rozpoznání slibu", () => {
  it("pomalé rozpoznání odpověď nezdrží, o slibu hráč ví od další zprávy", async () => {
    vi.mocked(generateText).mockImplementation(async (_ctx, prompt) => {
      if (isDetection(prompt)) return new Promise<string>((resolve) => { releaseDetection = resolve; });
      return JSON.stringify({ body: "Jasně, trenére, budu připravenej.", conversation_complete: false });
    });

    await send(PROMISE);
    // Rozpoznání pořád visí, a stejně hráč odepsal (dřív odpověď čekala, dokud nedoběhlo).
    const replies = await waitForReplies(1, COMMITMENT_REPLY_WAIT_MS + 5_000);
    expect(replies).toEqual(["Jasně, trenére, budu připravenej."]);
    expect(releaseDetection).not.toBeNull();
    // Odpověď vznikla bez slibu: ten ještě nebyl zapsaný.
    expect(replyPrompts()[0]).not.toContain("Trenér ti v SMS slíbil");

    // Rozpoznání doběhne po odpovědi a slib se zapíše.
    releaseDetection!(JSON.stringify({ kind: "start_next", quote: "Zítra hraješ v základu" }));
    await Promise.allSettled(background);
    const row = await db.prepare("SELECT kind, status FROM coach_commitments WHERE player_id = ?").bind(PLAYER).first<{ kind: string; status: string }>();
    expect(row).toEqual({ kind: "start_next", status: "active" });

    // Další odpověď už o slibu ví.
    await send("Tak se pořádně vyspi.");
    await waitForReplies(2, 10_000);
    await Promise.allSettled(background);
    expect(replyPrompts().at(-1)).toContain("Trenér ti v SMS slíbil: místo v základu v příštím zápase");
  }, 60_000);

  it("rychlé rozpoznání odpověď počká a hráč o slibu ví hned", async () => {
    vi.mocked(generateText).mockImplementation(async (_ctx, prompt) => {
      if (isDetection(prompt)) return JSON.stringify({ kind: "start_next", quote: "Zítra hraješ v základu" });
      return JSON.stringify({ body: "Díky, trenére, nezklamu.", conversation_complete: false });
    });

    await send(PROMISE);
    await waitForReplies(1, 10_000);
    await Promise.allSettled(background);
    expect(replyPrompts()[0]).toContain("Trenér ti v SMS slíbil: místo v základu v příštím zápase");
  }, 60_000);

  it("rozpoznání slibu má vlastní rozpočet, ne neomezený strop", async () => {
    vi.mocked(generateText).mockImplementation(async (_ctx, prompt) => {
      if (isDetection(prompt)) return JSON.stringify({ kind: "none", quote: "" });
      return JSON.stringify({ body: "Jasně.", conversation_complete: false });
    });
    await send(PROMISE);
    await waitForReplies(1, 10_000);
    await Promise.allSettled(background);
    const detectionCall = vi.mocked(generateText).mock.calls.find((c) => isDetection(c[1]));
    expect((detectionCall?.[2] as { timeoutMs?: number } | undefined)?.timeoutMs).toBeLessThanOrEqual(20_000);
  }, 60_000);
});
