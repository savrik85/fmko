/**
 * Dopady nad skutečnou D1: strop kladného za den, druhá stejná věc nic neudělá, nespokojenost
 * jen tomu, kdo ji má, a „trenér mu to řekl první“.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import { createHearsayDb, resetHearsayDb } from "../test-support/hearsay-db";
import { coachTalkedSince, learningEffectStmts } from "./effects";
import { hearsayItemStmt, knowledgeStmts, newHearsayItem } from "./store";
import type { HearsayItem, HearsayKind, KnowledgeVia } from "./types";

let miniflare: Miniflare;
let db: D1Database;
const NOW = new Date("2026-11-21T12:00:00Z");
const DAY = "2026-11-21";

beforeAll(async () => { ({ miniflare, db } = await createHearsayDb()); }, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => {
  await resetHearsayDb(db);
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, game_date) VALUES ('club', 'TJ Dvory', 'u1', ?)").bind(DAY),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, life_context, coach_relationship) VALUES
      ('smejkal', 'club', 'Rostislav', 'Šmejkal', '{"morale":50}', 50),
      ('kral', 'club', 'Patrik', 'Král', '{"morale":50,"transferUnrest":{"level":20}}', 50),
      ('sima', 'club', 'Radek', 'Šíma', '{"morale":50}', 50)`),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES ('c-smejkal', 'club', 'player', 'Rostislav Šmejkal', 'smejkal')"),
  ]);
});

const player = async (id: string) => db.prepare(
  "SELECT coach_relationship AS rel, json_extract(life_context, '$.morale') AS morale, json_extract(life_context, '$.transferUnrest.level') AS unrest FROM players WHERE id = ?",
).bind(id).first<{ rel: number; morale: number; unrest: number | null }>();

/** Zapíše věc o hráči a nechá ho ji „dozvědět se“ cestou `via`. */
async function learn(subject: string, kind: HearsayKind, via: KnowledgeVia, recipient = "sima", at = NOW): Promise<boolean> {
  const item: HearsayItem = newHearsayItem({
    clubTeamId: "club", subjectPlayerId: subject, kind, origin: "coach_sms", recipientPlayerId: recipient,
    conversationId: null, quote: "věta trenéra", createdAt: at.toISOString(),
  });
  const { stmts, message } = await learningEffectStmts(db, { item, playerId: subject, via, gameDay: DAY, now: at });
  await db.batch([
    hearsayItemStmt(db, item),
    ...knowledgeStmts(db, [{ hearsayId: item.id, playerId: subject, via, fromPlayerId: recipient, learnedAt: at.toISOString(), messageState: "none", messagedAt: null }]),
    ...stmts,
  ]);
  return message;
}

describe("dopad v databázi", () => {
  it("pět pochval za den zvedne vztah jednou", async () => {
    for (let i = 0; i < 5; i++) await learn("smejkal", "praise", "brothers", `p${i}`, new Date(NOW.getTime() + i * 60_000));
    expect(await player("smejkal")).toMatchObject({ rel: 53, morale: 52 });
  });

  it("druhá kritika do tří dnů nic neudělá", async () => {
    await learn("smejkal", "criticism", "brothers");
    await learn("smejkal", "criticism", "pub", "kral", new Date(NOW.getTime() + 86_400_000));
    expect(await player("smejkal")).toMatchObject({ rel: 46, morale: 47 });
  });

  it("nespokojenost roste jen hráči, který ji má", async () => {
    await learn("kral", "decision_against", "teammate");
    await learn("smejkal", "decision_against", "teammate");
    expect(await player("kral")).toMatchObject({ unrest: 30 });
    expect(await player("smejkal")).toMatchObject({ unrest: null });
  });

  it("věc o někom jiném posluchači nic neudělá", async () => {
    const item = newHearsayItem({
      clubTeamId: "club", subjectPlayerId: "smejkal", kind: "criticism", origin: "coach_sms", recipientPlayerId: "sima",
      conversationId: null, quote: "věta", createdAt: NOW.toISOString(),
    });
    expect(await learningEffectStmts(db, { item, playerId: "kral", via: "teammate", gameDay: DAY, now: NOW })).toEqual({ stmts: [], message: false });
  });

  it("„řekl mu to předem“ jen když mu psal o sestavě, pásce nebo lavičce", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES ('m0', 'c-smejkal', 'user', 'Trenér', 'Ahoj, jak se máš?', '2026-11-21T07:00:00Z')").run();
    expect(await coachTalkedSince(db, { clubTeamId: "club", playerId: "smejkal", sinceIso: "2026-11-20T12:00:00Z", about: "lineup" })).toBe(false);
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES ('m2', 'c-smejkal', 'user', 'Trenér', 'V neděli půjdeš na lavičku, nezlob se.', '2026-11-21T08:30:00Z')").run();
    expect(await coachTalkedSince(db, { clubTeamId: "club", playerId: "smejkal", sinceIso: "2026-11-20T12:00:00Z", about: "lineup" })).toBe(true);
  });

  it("když mu trenér den předtím psal, ví to coachTalkedSince", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES ('m1', 'c-smejkal', 'user', 'Trenér', 'Rosťo, musíš víc makat', '2026-11-21T08:00:00Z')").run();
    expect(await coachTalkedSince(db, { clubTeamId: "club", playerId: "smejkal", sinceIso: "2026-11-20T12:00:00Z" })).toBe(true);
    expect(await coachTalkedSince(db, { clubTeamId: "club", playerId: "smejkal", sinceIso: "2026-11-21T09:00:00Z" })).toBe(false);
  });

  it("u pásky platí „řekl předem“ jen zmínka o pásce nebo kapitánovi, lavička kvůli bráchovi ne", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES ('m5', 'c-smejkal', 'user', 'Trenér', 'Brácha Lukáš sedne na lavičku.', '2026-11-21T08:30:00Z')").run();
    expect(await coachTalkedSince(db, { clubTeamId: "club", playerId: "smejkal", sinceIso: "2026-11-20T12:00:00Z", about: "captaincy" })).toBe(false);
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES ('m6', 'c-smejkal', 'user', 'Trenér', 'Rosťo, pásku dám Lukášovi, nezlob se.', '2026-11-21T09:30:00Z')").run();
    expect(await coachTalkedSince(db, { clubTeamId: "club", playerId: "smejkal", sinceIso: "2026-11-20T12:00:00Z", about: "captaincy" })).toBe(true);
  });
});
