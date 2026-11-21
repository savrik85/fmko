/**
 * Zpráva trenéra → zápis věci (plán Task 6). Model je zamockovaný, rozhodnutí o zmínce dává test.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Miniflare } from "miniflare";

vi.mock("./detect", () => ({ detectMentions: vi.fn() }));
vi.mock("../messaging/match-speech", () => ({ isPostSpeechWindow: vi.fn(async () => false) }));

import { createHearsayDb, resetHearsayDb } from "../test-support/hearsay-db";
import { detectMentions } from "./detect";
import { isPostSpeechWindow } from "../messaging/match-speech";
import { detectCoachMessage, handleCoachMessageForHearsay, processPendingDetections } from "./coach-message";

/** KV v paměti: jen to, co hearsay používá (put, get, delete, list podle prefixu). */
function memoryKv(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async (o?: { prefix?: string }) => ({
      keys: [...store.keys()].filter((k) => !o?.prefix || k.startsWith(o.prefix)).map((name) => ({ name })),
      list_complete: true, cacheStatus: null,
    }),
  } as unknown as KVNamespace & { store: Map<string, string> };
}

let miniflare: Miniflare;
let db: D1Database;
const NOW = new Date("2026-11-21T12:00:00Z");

beforeAll(async () => { ({ miniflare, db } = await createHearsayDb()); }, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => {
  await resetHearsayDb(db);
  vi.mocked(detectMentions).mockReset();
  await db.batch([
    db.prepare(`INSERT INTO teams (id, name, user_id, parent_team_id, game_date) VALUES
      ('club', 'TJ Dvory', 'u1', NULL, '2026-11-21'), ('club-u21', 'TJ Dvory U21', 'u1', 'club', '2026-11-21'),
      ('ai', 'SK Lhota', 'ai', NULL, '2026-11-21')`),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, life_context, coach_relationship, status) VALUES
      ('smejkal', 'club', 'Rostislav', 'Šmejkal', '{"morale":50}', 50, 'active'),
      ('sima', 'club', 'Radek', 'Šíma', '{"morale":50}', 50, NULL),
      ('kluk', 'club-u21', 'Tomáš', 'Malý', '{"morale":50}', 50, NULL),
      ('pryc', 'club', 'Petr', 'Odešel', '{"morale":50}', 50, 'released'),
      ('cizi', 'ai', 'Jan', 'Cizí', '{"morale":50}', 50, NULL)`),
    db.prepare("INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES ('r1', 'sima', 'smejkal', 'brothers', 80)"),
    db.prepare(`INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES
      ('c-sima', 'club', 'player', 'Radek Šíma', 'sima'), ('kabina', 'club', 'squad_group', 'Kabina', NULL),
      ('zapas', 'club', 'squad_group', '⚽ vs SK Lhota', NULL), ('c-ai', 'ai', 'player', 'Jan Cizí', 'cizi')`),
  ]);
});

const knowers = async () => (await db.prepare("SELECT player_id, via FROM squad_hearsay_knowledge ORDER BY player_id").all<{ player_id: string; via: string }>()).results;
const player = async (id: string) => db.prepare("SELECT coach_relationship AS rel, json_extract(life_context, '$.morale') AS morale FROM players WHERE id = ?").bind(id).first<{ rel: number; morale: number }>();

describe("zpráva trenéra o spoluhráči", () => {
  it("SMS Šímovi o Šmejkalovi zapíše věc, kterou zná jen Šíma", async () => {
    vi.mocked(detectMentions).mockResolvedValue([{ playerId: "smejkal", kind: "criticism", quote: "Se Šmejkalem si promluvím" }]);
    const n = await handleCoachMessageForHearsay(db, {}, {
      teamId: "club", convId: "c-sima", convType: "player", recipientPlayerId: "sima", text: "Se Šmejkalem si promluvím, flákání trpět nebudu.", now: NOW,
    });
    expect(n).toBe(1);
    const item = await db.prepare("SELECT club_team_id, subject_player_id, kind, origin, recipient_player_id FROM squad_hearsay").first();
    expect(item).toEqual({ club_team_id: "club", subject_player_id: "smejkal", kind: "criticism", origin: "coach_sms", recipient_player_id: "sima" });
    expect(await knowers()).toEqual([{ player_id: "sima", via: "direct" }]);
    expect(await player("smejkal")).toEqual({ rel: 50, morale: 50 });
    const call = vi.mocked(detectMentions).mock.calls[0][1];
    expect(call.excludeIds).toEqual(["sima"]);
    // Kádr pro síto: áčko i U21, ne hráč, který odešel.
    expect(call.club.map((p) => p.id).sort()).toEqual(["kluk", "sima", "smejkal"]);
    // Vazba na adresáta jde do modelu (rozliší „tvůj brácha Lukáš“ od jiného Lukáše).
    expect(call.club.find((p) => p.id === "smejkal")?.tieToRecipient).toBe("brothers");
    expect(call.club.find((p) => p.id === "kluk")?.tieToRecipient).toBeUndefined();
    expect(call.recipientName).toBe("Radek Šíma");
  });

  it("kritika v kabině: ví ji celá kabina a Šmejkalovi klesne nálada hned", async () => {
    vi.mocked(detectMentions).mockResolvedValue([{ playerId: "smejkal", kind: "criticism", quote: "Šmejkal se fláká" }]);
    await handleCoachMessageForHearsay(db, {}, {
      teamId: "club", convId: "kabina", convType: "squad_group", recipientPlayerId: null, text: "Šmejkal se fláká, takhle ne.", now: NOW,
    });
    expect(await knowers()).toEqual([{ player_id: "sima", via: "squad_chat" }, { player_id: "smejkal", via: "squad_chat" }]);
    expect(await player("smejkal")).toEqual({ rel: 45, morale: 46 });
    expect(vi.mocked(detectMentions).mock.calls[0][1].squadChat).toBe(true);
  });

  it("proslov po zápase: jmenovaným dopad dává proslov, hearsay jen zapíše, kdo co ví", async () => {
    vi.mocked(isPostSpeechWindow).mockResolvedValueOnce(true);
    vi.mocked(detectMentions).mockResolvedValue([{ playerId: "smejkal", kind: "criticism", quote: "Šmejkal se fláká" }]);
    await handleCoachMessageForHearsay(db, {}, {
      teamId: "club", convId: "kabina", convType: "squad_group", recipientPlayerId: null, text: "Šmejkal se fláká, takhle ne.", now: NOW,
    });
    expect(await knowers()).toHaveLength(2);
    expect(await player("smejkal")).toEqual({ rel: 50, morale: 50 });
  });

  it("zápasový chat ⚽ vs se nezpracuje", async () => {
    expect(await handleCoachMessageForHearsay(db, {}, {
      teamId: "club", convId: "zapas", convType: "squad_group", recipientPlayerId: null, text: "Šmejkal se fláká", now: NOW,
    })).toBe(0);
    expect(detectMentions).not.toHaveBeenCalled();
  });

  it("AI klub nic nezapíše", async () => {
    expect(await handleCoachMessageForHearsay(db, {}, {
      teamId: "ai", convId: "c-ai", convType: "player", recipientPlayerId: "cizi", text: "Šmejkal se fláká", now: NOW,
    })).toBe(0);
    expect(detectMentions).not.toHaveBeenCalled();
  });

  it("selhání modelu nic neshodí", async () => {
    vi.mocked(detectMentions).mockRejectedValue(new Error("model mimo provoz"));
    expect(await handleCoachMessageForHearsay(db, {}, {
      teamId: "club", convId: "c-sima", convType: "player", recipientPlayerId: "sima", text: "Šmejkal se fláká", now: NOW,
    })).toBe(0);
  });

  it("rozpoznání doběhne: čekající záznam v KV se smaže", async () => {
    const kv = memoryKv();
    vi.mocked(detectMentions).mockResolvedValue([{ playerId: "smejkal", kind: "criticism", quote: "Šmejkal se fláká" }]);
    await detectCoachMessage(db, { CACHE_KV: kv }, {
      teamId: "club", convId: "c-sima", convType: "player", recipientPlayerId: "sima", text: "Šmejkal se fláká", now: NOW,
    });
    expect(kv.store.size).toBe(0);
    expect(await knowers()).toEqual([{ player_id: "sima", via: "direct" }]);
  });

  it("rozpoznání utne limit nebo spadne model: hodinový běh ho dodělá a nic nezdvojí", async () => {
    const kv = memoryKv();
    vi.mocked(detectMentions).mockRejectedValueOnce(new Error("vypršel čas"));
    await detectCoachMessage(db, { CACHE_KV: kv }, {
      teamId: "club", convId: "kabina", convType: "squad_group", recipientPlayerId: null, text: "Šmejkal se fláká, takhle ne.", now: NOW,
    });
    expect(kv.store.size).toBe(1);
    expect(await knowers()).toEqual([]);

    vi.mocked(detectMentions).mockResolvedValue([{ playerId: "smejkal", kind: "criticism", quote: "Šmejkal se fláká" }]);
    // Hned po odeslání se nesahá (rozpoznání může ještě běžet), až po pár minutách.
    expect(await processPendingDetections(db, { CACHE_KV: kv }, new Date(NOW.getTime() + 60_000))).toBe(0);
    expect(await processPendingDetections(db, { CACHE_KV: kv }, new Date(NOW.getTime() + 10 * 60_000))).toBe(1);
    expect(kv.store.size).toBe(0);
    expect(await player("smejkal")).toEqual({ rel: 45, morale: 46 });
    const created = await db.prepare("SELECT created_at FROM squad_hearsay").first<{ created_at: string }>();
    expect(created?.created_at).toBe(NOW.toISOString());

    // Druhé zpracování téže zprávy (záznam se vrátil, třeba inline doběhl pozdě) nic nezdvojí.
    await detectCoachMessage(db, { CACHE_KV: kv }, {
      teamId: "club", convId: "kabina", convType: "squad_group", recipientPlayerId: null, text: "Šmejkal se fláká, takhle ne.", now: NOW,
    });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM squad_hearsay").first()).toEqual({ n: 1 });
    expect(await player("smejkal")).toEqual({ rel: 45, morale: 46 });
  });
});
