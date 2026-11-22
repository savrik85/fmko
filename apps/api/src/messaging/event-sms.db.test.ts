/**
 * Zpráva hráče kvůli události ve hře nad skutečnou D1 (Miniflare): text od modelu s fakty,
 * bez modelu varianta, kterou hráč ještě neposlal, a poděkování za odmítnutou nabídku
 * nejvýš jednou za 30 dní.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

vi.mock("./ai-player-chat", async (orig) => ({
  ...(await orig<typeof import("./ai-player-chat")>()),
  generateFollowUpMessage: vi.fn(),
}));
vi.mock("../lib/ai-provider", async (orig) => ({
  ...(await orig<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
}));
vi.mock("./ai-player-spawn", async (orig) => ({
  ...(await orig<typeof import("./ai-player-spawn")>()),
  loadTeamContext: vi.fn(async () => ({ teamName: "FK Fezko Výškovice", managerName: "Krasomír" })),
  loadLastMatchContext: vi.fn(async () => undefined),
}));
vi.mock("./player-memory", async (orig) => ({
  ...(await orig<typeof import("./player-memory")>()),
  loadChatMemory: vi.fn(async () => ({ offerIds: [] })),
}));
vi.mock("../incidents/znalosti-db", () => ({ nactiZnalostiHrace: vi.fn(async () => []) }));

import { GeminiUnavailableError, generateFollowUpMessage } from "./ai-player-chat";
import { sendEventSms } from "./event-sms";
import { LOYAL_SCENARIO_ID, REJECTED_SMS_LOYAL, loyalThanksSentRecently } from "../transfers/offer-rejection-impact";

let miniflare: Miniflare;
let db: D1Database;
const env = {};
const player = { id: "p1", firstName: "Radek", lastName: "Turek" };

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB") as unknown as D1Database;
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, game_date TEXT)",
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT,
       nationality TEXT, age INTEGER, position TEXT, personality TEXT, life_context TEXT, coach_relationship INTEGER,
       is_celebrity INTEGER DEFAULT 0, status TEXT, loan_from_team_id TEXT)`,
    "CREATE TABLE injuries (player_id TEXT, description TEXT, days_remaining INTEGER, osobni_volno INTEGER, is_fake INTEGER)",
    `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT,
       last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT,
       ai_thread_active INTEGER DEFAULT 0, ai_thread_state TEXT, ai_thread_last_at TEXT)`,
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    `CREATE TABLE club_incidents (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, category TEXT, status TEXT, resolution TEXT,
       resolution_data TEXT, subject_player_id TEXT, game_date TEXT, ends_on TEXT, resolved_on TEXT)`,
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["teams", "players", "conversations", "messages"]) await db.prepare(`DELETE FROM ${t}`).run();
  vi.mocked(generateFollowUpMessage).mockReset();
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, game_date) VALUES ('club', 'FK Fezko Výškovice', 'u1', '2026-11-21T16:00:00.000Z')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, nationality, age, position, personality, life_context, coach_relationship, status)
      VALUES ('p1', 'club', 'Radek', 'Turek', NULL, 27, 'MID', '{"temper":70}', '{"morale":50}', 40, 'active')`),
    db.prepare("INSERT INTO conversations (id, team_id, type, participant_id, created_at) VALUES ('c1', 'club', 'player', 'p1', '2026-09-01')"),
  ]);
});

const messages = async () => (await db.prepare("SELECT body, metadata FROM messages WHERE conversation_id = 'c1' ORDER BY sent_at, rowid").all<{ body: string; metadata: string }>()).results;
const request = (over: Partial<Parameters<typeof sendEventSms>[2]> = {}) => ({
  clubTeamId: "club", player, instruction: "Trenér ti dal srážku 776 Kč za poháry.",
  fallback: ["Beru to, trenére.", "Dobře, strhněte mi to.", "Tak jo, zasloužil jsem si to."],
  seed: "trest|inc-1", scenarioId: "punishment_reaction", metadata: { incidentId: "inc-1" }, ...over,
});

describe("text od modelu", () => {
  it("zná historii a fakta, uloží se jako AI zpráva bez druhého lámání češtiny", async () => {
    await db.prepare("UPDATE players SET nationality = 'SK' WHERE id = 'p1'").run();
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, sent_at) VALUES ('m1', 'c1', 'player', 'p1', 'Seru na to!', '2026-11-21T10:00:00Z')").run();
    vi.mocked(generateFollowUpMessage).mockResolvedValue({ body: "No tak si to strhněte, trenére. Radost z toho nemám." });
    const sent = await sendEventSms(db, env, request());
    expect(sent).toMatchObject({ convId: "c1", aiGenerated: true, body: "No tak si to strhněte, trenére. Radost z toho nemám." });
    const [, , , history, instruction] = vi.mocked(generateFollowUpMessage).mock.calls[0];
    expect(history).toEqual([{ sender: "player", body: "Seru na to!" }]);
    expect(instruction).toContain("srážku 776 Kč");
    const last = (await messages()).at(-1)!;
    // Slovák: model píše slovensky sám, šablona by se lámala znovu.
    expect(last.body).toBe("No tak si to strhněte, trenére. Radost z toho nemám.");
    expect(JSON.parse(last.metadata)).toMatchObject({ ai_generated: true, scenario_id: "punishment_reaction", incidentId: "inc-1" });
  });

  it("text, který popírá událost, se nepoužije a jde předem napsaná varianta", async () => {
    vi.mocked(generateFollowUpMessage).mockResolvedValue({ body: "Nic platit nebudu." });
    const sent = await sendEventSms(db, env, request({ reject: (b) => (/nebudu/.test(b) ? "popírá trest" : null) }));
    expect(sent.aiGenerated).toBe(false);
    expect(request().fallback).toContain(sent.body);
    expect(JSON.parse((await messages()).at(-1)!.metadata).ai_generated).toBeUndefined();
  });
});

describe("bez modelu", () => {
  it("varianta, kterou hráč ještě neposlal, s číslem varianty v metadatech", async () => {
    vi.mocked(generateFollowUpMessage).mockRejectedValue(new GeminiUnavailableError("model nejede"));
    await db.batch(["Beru to, trenére.", "Dobře, strhněte mi to."].map((b, i) => db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, sent_at) VALUES (?, 'c1', 'player', 'p1', ?, ?)",
    ).bind(`old-${i}`, b, `2026-11-1${i}T10:00:00Z`)));
    const sent = await sendEventSms(db, env, request());
    expect(sent.aiGenerated).toBe(false);
    const last = (await messages()).at(-1)!;
    expect(JSON.parse(last.metadata)).toMatchObject({ scenario_id: "punishment_reaction", template: 2 });
    expect(last.body.toLowerCase()).toContain("zasloužil");
  });
});

describe("poděkování za odmítnutou nabídku", () => {
  const insert = (id: string, body: string, at: string, metadata: string | null = null) => db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, metadata, sent_at) VALUES (?, 'c1', 'player', 'p1', ?, ?, ?)",
  ).bind(id, body, metadata, at).run();
  const now = new Date("2026-11-21T12:00:00Z");

  it("staré poděkování z šablony do 30 dní: další se neposílá", async () => {
    await insert("l1", REJECTED_SMS_LOYAL[1], "2026-11-01T10:00:00Z");
    expect(await loyalThanksSentRecently(db, "club", "p1", "SK Dobrš", now)).toBe(true);
  });

  it("starší než 30 dní nebo jiná zpráva: poděkovat smí", async () => {
    await insert("l1", REJECTED_SMS_LOYAL[0], "2026-10-10T10:00:00Z");
    await insert("l2", "Díky, trenére.", "2026-11-20T10:00:00Z");
    expect(await loyalThanksSentRecently(db, "club", "p1", "SK Dobrš", now)).toBe(false);
  });

  it("poděkování od modelu se pozná podle scénáře", async () => {
    await insert("l1", "Jsem rád, že tu zůstávám.", "2026-11-15T10:00:00Z", JSON.stringify({ ai_generated: true, scenario_id: LOYAL_SCENARIO_ID }));
    expect(await loyalThanksSentRecently(db, "club", "p1", "SK Dobrš", now)).toBe(true);
  });
});
