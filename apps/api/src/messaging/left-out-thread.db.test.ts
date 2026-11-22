/**
 * Hráč na prodej v trucovém vlákně ví, proč nejede (lokální E2E 22. 11., Bílý ze Svaté Maří):
 * po SMS „Na prodej se holt nehraje“ se na první zprávu trenéra zeptal „Řekni rovnou, proč mě
 * nebereš na zápasy“. Popis scénáře `left_out` platil stejně pro všechny důvody nenominace.
 * Skutečná routa zprávy trenéra a odpověď hráče na D1 (Miniflare, všechny migrace), model podvržený.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(async () => JSON.stringify({ body: "Jasně, že vím, chcete mě prodat.", conversation_complete: false })),
}));
vi.mock("./chat-kontext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-kontext")>()),
  zpozdeniOdpovedi: () => 0,
}));

import { Hono } from "hono";
import { generateText } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { createSession } from "../auth/session";
import { leftOutScenario } from "./ai-player-scenarios";
import type { Bindings } from "../index";

const TEAM = "team-sulk";
const PLAYER = "player-sulk";
const CONV = "conv-sulk";
const GAME_DATE = "2026-11-22";
const SULK = { since: "2026-11-22", until: "2026-11-29", matchId: "m1", teamId: TEAM };

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
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-sulk', 'sulk@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-sulk', 'p06', 'TJ Svatá Maří', 50000, ?)").bind(TEAM, GAME_DATE),
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Eduard', 'Bílý', 27, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active')`,
    ).bind(PLAYER, TEAM),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', 'Eduard Bílý', ?)").bind(CONV, TEAM, PLAYER),
  ]);
  token = await createSession(env.SESSION_KV, "user-sulk", "sulk@example.test", null);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  vi.mocked(generateText).mockClear();
  await db.prepare("UPDATE teams SET phone_credit = 36, phone_credit_date = ? WHERE id = ?").bind(GAME_DATE, TEAM).run();
  await db.prepare("UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ?").bind(CONV).run();
  await db.prepare("UPDATE players SET life_context = json_object('leftOutSulk', json(?)) WHERE id = ?").bind(JSON.stringify(SULK), PLAYER).run();
  await db.prepare("DELETE FROM messages").run();
  await db.prepare("DELETE FROM transfer_listings").run();
});

/** Trucovitá SMS hráče po zápase (multiplayer/left-out.ts) a zpráva trenéra přes routu. */
async function sulkThenCoach(reason: string, coachText: string): Promise<string> {
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES ('sms', ?, 'player', ?, 'Eduard Bílý', ?, ?, ?, 1)",
  ).bind(CONV, PLAYER, "Doma koukám na výsledky. Na prodej se holt nehraje. Tak mě na tréninku nehledejte.",
    JSON.stringify({ type: "left_out", matchId: "m1", reason, sulk: true }), new Date(Date.now() - 60_000).toISOString()).run();
  const background: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
  const res = await app.request(`/api/teams/${TEAM}/conversations/${CONV}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body: coachText }),
  }, env, ctx as unknown as ExecutionContext);
  expect(res.status).toBe(200);
  for (let done = 0; done < background.length;) {
    const batch = background.slice(done);
    done = background.length;
    await Promise.allSettled(batch);
  }
  return String(vi.mocked(generateText).mock.calls.map((c) => String(c[1])).find((p) => p.includes("SCÉNÁŘ")) ?? "");
}

describe("truc po nenominaci podle důvodu", () => {
  it("hráč na listině ví, proč nejede, a neptá se na to (Bílý, E2E 22. 11.)", async () => {
    await db.prepare(
      `INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, status, expires_at, deal_type)
       VALUES ('l1', ?, ?, 5000, 'lg', 'active', '2026-12-31', 'transfer')`,
    ).bind(PLAYER, TEAM).run();
    const prompt = await sulkThenCoach("on_market", "Edo, víš, jak to s tebou v klubu teď je?");
    expect(prompt).toContain("přestupové listině");
    expect(prompt).not.toContain("Chceš vědět, proč jsi nejel");
    const state = await db.prepare("SELECT ai_thread_state FROM conversations WHERE id = ?").bind(CONV).first<{ ai_thread_state: string }>();
    expect(JSON.parse(state!.ai_thread_state)).toMatchObject({ scenario_id: "left_out", left_out_reason: "on_market" });
  }, 60_000);

  it("„nepočítám s tebou“ ví z SMS i bez listiny, bez důvodu původní popis", async () => {
    expect(await sulkThenCoach("told_out", "Vojto, jak to bereš?")).toContain("s tebou nepočítá");
    await db.prepare("UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ?").bind(CONV).run();
    await db.prepare("DELETE FROM messages").run();
    vi.mocked(generateText).mockClear();
    expect(await sulkThenCoach("streak", "Edo, co se děje?")).toContain("Chceš vědět, proč jsi nejel");
  }, 60_000);
});

describe("popis scénáře", () => {
  it("známý důvod nahradí otázku, proč nejel; neznámý nechá původní", () => {
    for (const reason of ["on_market", "on_loan", "told_out"]) {
      const s = leftOutScenario(reason)!;
      expect(s.id).toBe("left_out");
      expect(s.description, reason).not.toContain("Chceš vědět, proč jsi nejel");
      expect(s.description, reason).toContain("NEPTEJ");
    }
    expect(leftOutScenario("on_loan")!.description).toContain("hostování");
    expect(leftOutScenario(undefined)!.description).toContain("Chceš vědět, proč jsi nejel");
    expect(leftOutScenario("streak")!.description).toContain("Chceš vědět, proč jsi nejel");
  });
});
