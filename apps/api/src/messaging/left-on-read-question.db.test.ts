/**
 * Na otázku trenéra hráč odpoví, „přečteno“ jen u hodně špatného vztahu. Skutečná routa zprávy
 * trenéra a odpověď hráče na D1 (Miniflare, všechny migrace), model podvržený.
 *
 * E2E 22. 11. (final3 Chyba 2): v posledním tahu se hotová odpověď zahodila s pravděpodobností
 * 25–45 %, i když se trenér ptal. Kovalčuk na „A kolik tě stály?“ 2× ze 3 neodpověděl,
 * ráno po hospodě 4 z 9 posledních tahů, Zíka uprostřed vlákna.
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
vi.mock("./chat-kontext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-kontext")>()),
  zpozdeniOdpovedi: () => 0,
}));
// Kdykoli šance „přečteno“ není nulová, hráč trenéra na přečteno nechá. Odpověď přijde jen tam, kde musí.
vi.mock("./left-on-read", async (importOriginal) => {
  const real = await importOriginal<typeof import("./left-on-read")>();
  return {
    ...real,
    leftOnReadChance: (i: Parameters<typeof real.leftOnReadChance>[0]) => (real.leftOnReadChance(i) > 0 ? 1 : 0),
    readDelayMs: () => 0,
  };
});

import { Hono } from "hono";
import { generateText } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";

const TEAM = "eb9538ef-63ae-43b6-acfb-2b3a69159e1f";
const KOVALCUK = "p-kovalcuk";
const ZIKA = "p-zika";
const CONV_K = "conv-kovalcuk";
const CONV_Z = "conv-zika";
const GAME_DATE = "2026-11-29";
const BOOTS_REPLY = "Nu, trenér, kopačky stály 2500 korun. Djakuju za zájem, bylo to potřeba 😊";

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
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-rohlik', 'rohlik@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-rohlik', 'p06', 'FK Rohlík Vršovice', 50000, ?)").bind(TEAM, GAME_DATE),
    // Vztahy z kopie produ 22. 11.: Kovalčuk 50, Zíka 30.
    ...[[KOVALCUK, "Ivan", "Kovalčuk", 50, CONV_K], [ZIKA, "Jakub", "Zíka", 30, CONV_Z]].flatMap(([id, first, last, rel, conv]) => [
      db.prepare(
        `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status, coach_relationship)
         VALUES (?, ?, ?, ?, 27, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active', ?)`,
      ).bind(id, TEAM, first, last, rel),
      db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', ?, ?)").bind(conv, TEAM, `${first} ${last}`, id),
    ]),
  ]);
  token = await createSession(env.SESSION_KV, "user-rohlik", "rohlik@example.test", null);
}, 120_000);

afterAll(async () => { await mf.dispose(); });

/** Vlákno o nových kopačkách z E2E (r9, Kovalčuk): fotka, trenér, odpověď. Další odpověď je poslední. */
async function bootsThread(): Promise<void> {
  const started = new Date(Date.now() - 20 * 60_000).toISOString();
  await db.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(CONV_K).run();
  await db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ? WHERE id = ?").bind(JSON.stringify({
    trigger: "casual", scenario_id: "casual_new_boots", max_replies: 2, current_replies: 1, awaiting: "coach",
    initiated_at: started, player_id: KOVALCUK, resolution: null,
  }), CONV_K).run();
  const at = (min: number) => new Date(Date.parse(started) + min * 60_000).toISOString();
  await db.batch([
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES ('k1', ?, 'player', ?, 'Ivan Kovalčuk', ?, ?, 1)")
      .bind(CONV_K, KOVALCUK, "Nu, trenér, podívej se, co jsem si koupil! Nové kopačky na umělku 😊", at(0)),
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at, read) VALUES ('k2', ?, 'user', 'Trenér', ?, ?, 1)")
      .bind(CONV_K, "Ivane, to zní dobře, ať ti slouží.", at(2)),
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES ('k3', ?, 'player', ?, 'Ivan Kovalčuk', ?, ?, 1)")
      .bind(CONV_K, KOVALCUK, "Nu, trenér, djakuju za odpověď! Už se těším, až v nich nastoupím do zápasu proti Břevnovu 😊", at(3)),
  ]);
}

/** Ráno po hlasovce z hospody (r9, Zíka): tři výměny, trenér píše první otázku. */
async function morningThread(relationship: number): Promise<void> {
  const started = new Date(Date.now() - 11 * 3600_000).toISOString();
  await db.prepare("UPDATE players SET coach_relationship = ? WHERE id = ?").bind(relationship, ZIKA).run();
  await db.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(CONV_Z).run();
  await db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ? WHERE id = ?").bind(JSON.stringify({
    trigger: "pub_voice", scenario_id: "pub_voice", max_replies: 2, current_replies: 0, awaiting: "coach",
    initiated_at: started, player_id: ZIKA, resolution: null,
  }), CONV_Z).run();
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES ('z1', ?, 'player', ?, 'Jakub Zíka', ?, ?, ?, 1)",
  ).bind(CONV_Z, ZIKA, "trenere dneska to bylo dobry, dame si jeste jedno 🍺", JSON.stringify({ type: "voice", drunk: 1 }), started).run();
}

async function coachSays(conv: string, text: string): Promise<void> {
  const background: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
  const res = await app.request(`/api/teams/${TEAM}/conversations/${conv}`, {
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
}

const lastPlayerLine = async (conv: string) => (await db.prepare(
  "SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player' ORDER BY sent_at DESC LIMIT 1",
).bind(conv).first<{ body: string }>())?.body;

beforeEach(async () => {
  vi.mocked(generateText).mockReset();
  vi.mocked(generateText).mockImplementation(async (_ctx, prompt) => {
    if (String(prompt).includes("KONKRÉTNÍ slib")) return JSON.stringify({ kind: "none", quote: "" });
    return JSON.stringify({ body: BOOTS_REPLY, conversation_complete: true });
  });
  await db.prepare("UPDATE teams SET phone_credit = 36, phone_credit_date = ? WHERE id = ?").bind(GAME_DATE, TEAM).run();
});

describe("na otázku trenéra hráč odpoví, přečteno jen u naštvaného", () => {
  it("kontrola: poslední tah bez otázky nechá trenéra na přečteno", async () => {
    await bootsThread();
    await coachSays(CONV_K, "Tak ať ti dlouho vydrží.");
    expect(await lastPlayerLine(CONV_K)).not.toBe(BOOTS_REPLY);
  }, 60_000);

  it("Kovalčuk: na „A kolik tě stály?“ v posledním tahu odpověď odejde", async () => {
    await bootsThread();
    await coachSays(CONV_K, "A kolik tě stály?");
    expect(await lastPlayerLine(CONV_K)).toBe(BOOTS_REPLY);
  }, 60_000);

  it("Zíka (vztah 30): na otázku uprostřed vlákna ráno po hospodě odpoví", async () => {
    vi.mocked(generateText).mockImplementation(async () => JSON.stringify({ body: "Hraju od šesti let, trenére.", conversation_complete: false }));
    await morningThread(30);
    await coachSays(CONV_Z, "Kolik let už vlastně hraješ fotbal?");
    expect(await lastPlayerLine(CONV_Z)).toBe("Hraju od šesti let, trenére.");
  }, 60_000);

  it("naštvaný hráč (vztah 20) i otázku občas nechá na přečteno", async () => {
    vi.mocked(generateText).mockImplementation(async () => JSON.stringify({ body: "Hraju od šesti let, trenére.", conversation_complete: false }));
    await morningThread(20);
    await coachSays(CONV_Z, "Kolik let už vlastně hraješ fotbal?");
    expect(await lastPlayerLine(CONV_Z)).not.toBe("Hraju od šesti let, trenére.");
  }, 60_000);

  it("nové vlákno od trenéra: na otázku odpoví, na pozdrav bez otázky ne", async () => {
    vi.mocked(generateText).mockImplementation(async (_ctx, prompt) => {
      if (String(prompt).includes("KONKRÉTNÍ slib")) return JSON.stringify({ kind: "none", quote: "" });
      return JSON.stringify({ body: "Rodiče už moc nechodí, trenére.", conversation_complete: false });
    });
    await db.prepare("UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ?").bind(CONV_Z).run();
    await db.prepare("UPDATE players SET coach_relationship = 30 WHERE id = ?").bind(ZIKA).run();
    await db.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(CONV_Z).run();
    await coachSays(CONV_Z, "Ahoj Jakube, dobrá práce v sobotu.");
    expect(await lastPlayerLine(CONV_Z)).toBeUndefined();
    await coachSays(CONV_Z, "A co rodiče, chodí se na tebe dívat?");
    expect(await lastPlayerLine(CONV_Z)).toBe("Rodiče už moc nechodí, trenére.");
  }, 60_000);
});
