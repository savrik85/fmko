/**
 * Zpráva „slyšel jsem…“ (plán Task 8): strop dvě na klub a den, přednost rozhodnutí,
 * jen aktivním trenérům, čekání při výpadku modelu a rozjetém rozhovoru, propadnutí po 48 h.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Miniflare } from "miniflare";

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
  loadTeamContext: vi.fn(async () => ({ teamName: "TJ Dvory", managerName: "Pepa", squadNames: ["Radek Šíma", "Rostislav Šmejkal"] })),
  loadLastMatchContext: vi.fn(async () => undefined),
}));

import { GeminiUnavailableError, generateInitialMessage } from "../messaging/ai-player-chat";
import { createHearsayDb, resetHearsayDb } from "../test-support/hearsay-db";
import { deliverHearsayMessages } from "./messages";
import { hearsayItemStmt, knowledgeStmts, newHearsayItem } from "./store";
import type { HearsayKind, KnowledgeVia } from "./types";

let miniflare: Miniflare;
let db: D1Database;
/** 13:00 v Praze. */
const NOW = new Date("2026-11-21T12:00:00Z");

beforeAll(async () => { ({ miniflare, db } = await createHearsayDb()); }, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => {
  await resetHearsayDb(db);
  vi.mocked(generateInitialMessage).mockReset();
  vi.mocked(generateInitialMessage).mockResolvedValue("Trenére, brácha mi říkal, žes o mně psal Šímovi. To mi řekni do očí.");
  const life = JSON.stringify({ morale: 50 });
  await db.batch([
    db.prepare("INSERT INTO users (id, last_activity_at) VALUES ('u1', '2026-11-21T08:00:00Z'), ('u2', '2026-11-01T08:00:00Z')"),
    db.prepare("INSERT INTO teams (id, name, user_id, game_date) VALUES ('club', 'TJ Dvory', 'u1', '2026-11-21'), ('lazy', 'SK Lhota', 'u2', '2026-11-21')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, age, position, life_context, coach_relationship) VALUES
      ('sima', 'club', 'Radek', 'Šíma', 28, 'DEF', ?, 50), ('smejkal', 'club', 'Rostislav', 'Šmejkal', 26, 'MID', ?, 50),
      ('kral', 'club', 'Patrik', 'Král', 24, 'FWD', ?, 50), ('nemec', 'club', 'Lukáš', 'Němec', 22, 'FWD', ?, 50),
      ('lhota1', 'lazy', 'Jan', 'Lhotský', 30, 'GK', ?, 50)`).bind(life, life, life, life, life),
  ]);
});

/** Věc o `subject`, kterou se dozvěděl od Šímy a čeká na zprávu. */
async function pending(subject: string, kind: HearsayKind, o: { club?: string; learnedAt?: string; via?: KnowledgeVia } = {}): Promise<string> {
  const item = newHearsayItem({
    clubTeamId: o.club ?? "club", subjectPlayerId: subject, kind, origin: "coach_sms", recipientPlayerId: "sima",
    conversationId: null, quote: "věta trenéra", createdAt: "2026-11-21T08:00:00.000Z",
  });
  await db.batch([
    hearsayItemStmt(db, item),
    ...knowledgeStmts(db, [
      { hearsayId: item.id, playerId: "sima", via: "direct", fromPlayerId: null, learnedAt: item.createdAt, messageState: "none", messagedAt: null },
      { hearsayId: item.id, playerId: subject, via: o.via ?? "brothers", fromPlayerId: "sima", learnedAt: o.learnedAt ?? "2026-11-21T10:00:00.000Z", messageState: "pending", messagedAt: null },
    ]),
  ]);
  return item.id;
}

const state = async (playerId: string) => (await db.prepare("SELECT message_state FROM squad_hearsay_knowledge WHERE player_id = ? AND from_player_id = 'sima'").bind(playerId).first<{ message_state: string }>())?.message_state;

describe("zpráva slyšel jsem", () => {
  it("pošle nejvýš dvě zprávy na klub a den, rozhodnutí první", async () => {
    await pending("smejkal", "criticism");
    await pending("kral", "decision_against");
    await pending("nemec", "praise");
    const r = await deliverHearsayMessages(db, {}, NOW);
    expect(r.sent).toBe(2);
    expect(await state("kral")).toBe("sent");
    expect(await state("smejkal")).toBe("sent");
    expect(await state("nemec")).toBe("pending");
    expect(vi.mocked(generateInitialMessage).mock.calls[0][2].id).toBe("heard_decision");
    // Další hodinu už nic, strop platí 24 hodin.
    expect((await deliverHearsayMessages(db, {}, new Date(NOW.getTime() + 3_600_000))).sent).toBe(0);
  });

  it("otevře vlákno se scénářem heard_criticism a hearsay_id", async () => {
    const id = await pending("smejkal", "criticism");
    await deliverHearsayMessages(db, {}, NOW);
    const conv = await db.prepare("SELECT ai_thread_active, ai_thread_state, unread_count FROM conversations WHERE participant_id = 'smejkal'")
      .first<{ ai_thread_active: number; ai_thread_state: string; unread_count: number }>();
    expect(conv?.ai_thread_active).toBe(1);
    expect(JSON.parse(conv!.ai_thread_state)).toMatchObject({ scenario_id: "heard_criticism", hearsay_id: id, awaiting: "coach", player_id: "smejkal" });
    expect(conv?.unread_count).toBe(1);
    const msg = await db.prepare("SELECT sender_type, body FROM messages").first<{ sender_type: string; body: string }>();
    expect(msg).toMatchObject({ sender_type: "player" });
    // Prompt ví, co trenér napsal, komu a kdo mu to řekl.
    const scenario = vi.mocked(generateInitialMessage).mock.calls[0][2];
    expect(scenario.description).toContain("věta trenéra");
    expect(scenario.description).toContain("Radek Šíma");
  });

  it("neaktivnímu manažerovi nepíše, dopad zůstává", async () => {
    await pending("lhota1", "criticism", { club: "lazy" });
    await deliverHearsayMessages(db, {}, NOW);
    expect(await state("lhota1")).toBe("skipped");
    expect(generateInitialMessage).not.toHaveBeenCalled();
  });

  it("v noci počká", async () => {
    await pending("smejkal", "criticism");
    expect((await deliverHearsayMessages(db, {}, new Date("2026-11-21T22:30:00Z"))).sent).toBe(0);
    expect(await state("smejkal")).toBe("pending");
  });

  it("po 48 hodinách propadne", async () => {
    await pending("smejkal", "criticism", { learnedAt: "2026-11-18T10:00:00.000Z" });
    const r = await deliverHearsayMessages(db, {}, NOW);
    expect(r.expired).toBe(1);
    expect(await state("smejkal")).toBe("expired");
  });

  it("výpadek modelu nechá zprávu čekat", async () => {
    vi.mocked(generateInitialMessage).mockRejectedValue(new GeminiUnavailableError("kredit došel"));
    await pending("smejkal", "criticism");
    expect((await deliverHearsayMessages(db, {}, NOW)).sent).toBe(0);
    expect(await state("smejkal")).toBe("pending");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM messages").first<{ n: number }>()).toEqual({ n: 0 });
  });

  it("hráč s rozjetým rozhovorem počká", async () => {
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id, created_at, ai_thread_active) VALUES ('c-sm', 'club', 'player', 'Rostislav Šmejkal', 'smejkal', '2026-11-01', 1)").run();
    await pending("smejkal", "criticism");
    expect((await deliverHearsayMessages(db, {}, NOW)).sent).toBe(0);
    expect(await state("smejkal")).toBe("pending");
  });
});
