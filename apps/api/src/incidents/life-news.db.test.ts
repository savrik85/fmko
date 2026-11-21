/**
 * Zpráva po skončení porodu a nemoci rodiče nad skutečnou D1 (Miniflare): kdy přijde, co
 * zapíše, pozvání zapít, předem napsaná varianta bez modelu a co o tom potom ví chat.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

vi.mock("../messaging/ai-player-chat", async (orig) => ({
  ...(await orig<typeof import("../messaging/ai-player-chat")>()),
  generateInitialMessage: vi.fn(),
}));
vi.mock("../lib/ai-provider", async (orig) => ({
  ...(await orig<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
}));
vi.mock("../messaging/ai-player-spawn", async (orig) => ({
  ...(await orig<typeof import("../messaging/ai-player-spawn")>()),
  loadTeamContext: vi.fn(async () => ({ teamName: "TJ Dvory", managerName: "Pepa" })),
  loadLastMatchContext: vi.fn(async () => undefined),
}));

import { GeminiUnavailableError, generateInitialMessage } from "../messaging/ai-player-chat";
import { getScenarioById } from "../messaging/ai-player-scenarios";
import { babyFacts, deliverLifeNews, formatWeight, loadRecentLifeEvent, type LifeNewsData } from "./life-news";

let miniflare: Miniflare;
let db: D1Database;
/** Sobota 21. 11. 2026, 13:00 v Praze. */
const NOW = new Date("2026-11-21T12:00:00Z");
const kv = { put: vi.fn(async () => undefined), get: vi.fn(async () => null), delete: vi.fn(async () => undefined) };
const env = { CACHE_KV: kv as unknown as KVNamespace };

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
  for (const t of ["teams", "players", "injuries", "conversations", "messages", "club_incidents"]) await db.prepare(`DELETE FROM ${t}`).run();
  vi.mocked(generateInitialMessage).mockReset();
  kv.put.mockClear();
  const life = JSON.stringify({ morale: 50, occupation: "Zedník" });
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, game_date) VALUES ('club', 'TJ Dvory', 'u1', '2026-11-21T16:00:00.000Z'), ('ai', 'SK AI', 'ai', '2026-11-21T16:00:00.000Z')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, age, position, personality, life_context, coach_relationship, status) VALUES
      ('p1', 'club', 'Petr', 'Novák', 29, 'MID', '{"alcohol":30}', ?, 60, 'active'),
      ('p2', 'club', 'Jan', 'Dvořák', 33, 'DEF', '{"alcohol":30}', ?, 60, 'active'),
      ('p3', 'ai', 'Karel', 'Bot', 30, 'GK', '{"alcohol":30}', ?, 60, 'active')`).bind(life, life, life),
    db.prepare("INSERT INTO conversations (id, team_id, type, participant_id, created_at) VALUES ('c1', 'club', 'player', 'p1', '2026-09-01'), ('c2', 'club', 'player', 'p2', '2026-09-01')"),
  ]);
});

const situation = (o: { id: string; kind: string; player: string; team?: string; resolvedOn?: string; data?: LifeNewsData; status?: string }) =>
  db.prepare(
    `INSERT INTO club_incidents (id, team_id, kind, category, status, resolution, resolution_data, subject_player_id, game_date, resolved_on)
     VALUES (?, ?, ?, 'zivotni', ?, 'skoncila', ?, ?, '2026-11-17T16:00:00.000Z', ?)`,
  ).bind(o.id, o.team ?? "club", o.kind, o.status ?? "uzavreny", o.data ? JSON.stringify(o.data) : null, o.player, o.resolvedOn ?? "2026-11-21T16:00:00.000Z").run();
const dataOf = async (id: string) => JSON.parse((await db.prepare("SELECT resolution_data FROM club_incidents WHERE id = ?").bind(id).first<{ resolution_data: string }>())!.resolution_data) as LifeNewsData;
const lastMessage = (conv: string) => db.prepare("SELECT body, metadata FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC, rowid DESC LIMIT 1").bind(conv).first<{ body: string; metadata: string }>();

describe("po porodu se hráč ozve", () => {
  it("jméno a váha z hry, pozvání zapít, vlákno otevřené a podruhé už nic", async () => {
    await situation({ id: "birth-1", kind: "narozeni_ditete", player: "p1" });
    const baby = babyFacts("birth-1");
    vi.mocked(generateInitialMessage).mockResolvedValue(`Trenére, jsme doma! ${baby.name}, ${formatWeight(baby.weightG)}. Stavte se zapít.`);
    expect(await deliverLifeNews(db, env, NOW)).toEqual({ sent: 1, waiting: 0, skipped: 0 });

    const scenario = vi.mocked(generateInitialMessage).mock.calls[0][2];
    expect(scenario.id).toBe("life_news_baby");
    expect(scenario.description).toContain(baby.name);
    expect(scenario.description).toContain(formatWeight(baby.weightG));
    // Model zná i fakt pro chat (čerstvý táta).
    expect(vi.mocked(generateInitialMessage).mock.calls[0][1].recentLifeEvent?.fact).toContain(baby.name);

    expect((await lastMessage("c1"))?.body).toContain(baby.name);
    const data = await dataOf("birth-1");
    expect(data.baby).toEqual(baby);
    expect(data.newsSentAt).toBe(NOW.toISOString());
    const conv = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = 'c1'").first<{ ai_thread_active: number; ai_thread_state: string }>();
    expect(conv?.ai_thread_active).toBe(1);
    expect(JSON.parse(conv!.ai_thread_state)).toMatchObject({ scenario_id: "life_news_baby", casual: true, awaiting: "coach" });
    // Na trenérovu odpověď vlákno odpoví podle tématu (bez něj by se vlákno zavřelo jako neznámé).
    expect(getScenarioById("life_news_baby")?.invite).toBe("baby");
    // Pozvání čeká na trenérovu odpověď; přijetí zapíše vztah a náladu (casual-messages.ts).
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((kv.put.mock.calls[0] as unknown[])[1]))).toMatchObject({ kind: "baby", topicId: "life_news_baby", playerId: "p1" });

    expect(await deliverLifeNews(db, env, new Date(NOW.getTime() + 3_600_000))).toEqual({ sent: 0, waiting: 0, skipped: 0 });
  });

  it("když model jméno vynechá nebo nejede, přijde předem napsaná zpráva se jménem", async () => {
    await situation({ id: "birth-2", kind: "narozeni_ditete", player: "p1" });
    vi.mocked(generateInitialMessage).mockResolvedValue("Trenére, máme malýho! Stavte se zapít.");
    await deliverLifeNews(db, env, NOW);
    const baby = babyFacts("birth-2");
    expect((await lastMessage("c1"))?.body).toContain(baby.name);
    expect(typeof (await dataOf("birth-2")).newsVariant).toBe("number");
  });

  it("v noci, u AI klubu a u starší situace nic", async () => {
    await situation({ id: "birth-3", kind: "narozeni_ditete", player: "p1" });
    await situation({ id: "ai-birth", kind: "narozeni_ditete", player: "p3", team: "ai" });
    await situation({ id: "old", kind: "nemocny_rodic", player: "p2", resolvedOn: "2026-11-15T16:00:00.000Z" });
    expect(await deliverLifeNews(db, env, new Date("2026-11-21T22:30:00Z"))).toEqual({ sent: 0, waiting: 0, skipped: 0 });
    vi.mocked(generateInitialMessage).mockImplementation(async () => `Trenére, ${babyFacts("birth-3").name} je na světě, zapijem to.`);
    expect(await deliverLifeNews(db, env, NOW)).toEqual({ sent: 1, waiting: 0, skipped: 1 });
    expect((await dataOf("ai-birth")).newsSkipped).toBe("ai_club");
    expect(await db.prepare("SELECT resolution_data FROM club_incidents WHERE id = 'old'").first<{ resolution_data: string | null }>()).toEqual({ resolution_data: null });
  });
});

describe("nemocný rodič", () => {
  it("bez modelu přijde varianta, kterou hráč ještě nedostal, s rodičem z úvodní SMS", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, metadata, sent_at) VALUES ('s1', 'c2', 'player', 'p2', 'Trenére, máma je v nemocnici. Musím být u ní.', ?, '2026-11-16T08:00:00Z')")
      .bind(JSON.stringify({ type: "incident", incidentId: "parent-2" })).run();
    // Dřív už dostal variantu 0 a 1.
    await situation({ id: "parent-0", kind: "nemocny_rodic", player: "p2", resolvedOn: "2026-10-01T16:00:00.000Z", data: { parent: "mother", newsSentAt: "x", newsVariant: 0 } });
    await situation({ id: "parent-1", kind: "nemocny_rodic", player: "p2", resolvedOn: "2026-10-20T16:00:00.000Z", data: { parent: "mother", newsSentAt: "x", newsVariant: 1 } });
    await situation({ id: "parent-2", kind: "nemocny_rodic", player: "p2" });
    vi.mocked(generateInitialMessage).mockRejectedValue(new GeminiUnavailableError("model nejede"));
    expect((await deliverLifeNews(db, env, NOW)).sent).toBe(1);
    const data = await dataOf("parent-2");
    expect(data.parent).toBe("mother");
    expect([0, 1]).not.toContain(data.newsVariant);
    expect((await lastMessage("c2"))?.body).toMatch(/mám/i);
    // Rodič pozvání nemá.
    expect(kv.put).not.toHaveBeenCalled();
  });
});

describe("co o tom ví chat", () => {
  it("čerstvý táta měsíc, uzdravený rodič deset dní", async () => {
    await situation({ id: "birth-4", kind: "narozeni_ditete", player: "p1", resolvedOn: "2026-11-01T16:00:00.000Z" });
    const event = await loadRecentLifeEvent(db, "club", "p1");
    expect(event?.kind).toBe("narozeni_ditete");
    expect(event?.fact).toContain(`Před 20 dny jste se vrátili z porodnice`);
    expect(event?.fact).toContain(babyFacts("birth-4").name);
    await situation({ id: "parent-5", kind: "nemocny_rodic", player: "p2", resolvedOn: "2026-11-05T16:00:00.000Z", data: { parent: "father" } });
    expect(await loadRecentLifeEvent(db, "club", "p2")).toBeUndefined();
    await db.prepare("UPDATE club_incidents SET resolved_on = '2026-11-19T16:00:00.000Z' WHERE id = 'parent-5'").run();
    expect((await loadRecentLifeEvent(db, "club", "p2"))?.fact).toBe("Tvůj táta byl v nemocnici, před 2 dny ho pustili domů a je to lepší.");
  });

  it("běžící situace ani cizí hráč se nepočítá", async () => {
    await situation({ id: "running", kind: "narozeni_ditete", player: "p1", status: "probiha" });
    expect(await loadRecentLifeEvent(db, "club", "p1")).toBeUndefined();
    expect(await loadRecentLifeEvent(db, "club", "p2")).toBeUndefined();
  });
});
