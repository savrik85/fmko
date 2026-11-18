/**
 * „Žádné omluvenky, chci tam všechny“ nad skutečnou D1: přemluvený hráč napíše do kabiny
 * zápasu „přijdu“ a omluvenky z kabiny (recordedExcuses) ho pak už nevedou jako chybějícího.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

vi.mock("../events/match-absences", async (importOriginal) => {
  const real = await importOriginal<typeof import("../events/match-absences")>();
  return {
    ...real,
    findUpcomingMatchContext: vi.fn(async () => ({ matchKey: "cal-1", isFriendly: false, scheduledAt: "2026-11-19T17:00:00Z", gameDate: "2026-11-18" })),
    getAbsentPlayersMap: vi.fn(async () => new Map([
      ["kocovina", { reason: "Kocovina", category: "hangover", emoji: "🍺", smsText: "Hlava jak střep" }],
      ["zraneny", { reason: "Zdraví", category: "health", emoji: "🤕", smsText: "Bolí mě koleno" }],
    ])),
  };
});

import { recordedExcuses } from "../events/match-absences";
import { persuadeAbsentees } from "./squad-talk";
import type { PlayerSnapshot } from "./ai-player-scenarios";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.prepare("CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT)").run();
  await db.prepare("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)").run();
  const no = (id: string, body: string) => db.prepare(
    "INSERT INTO messages VALUES (?, 'zapas', 'player', ?, ?, ?, ?, datetime('now', '-1 hour'), 0)",
  ).bind(`m-${id}`, id, id, body, JSON.stringify({ type: "attendance", response: "no", calendarId: "cal-1" }));
  await db.batch([
    db.prepare("INSERT INTO conversations VALUES ('zapas', 'tym', 'squad_group', '⚽ vs SK Lhota')"),
    db.prepare("INSERT INTO messages VALUES ('ann', 'zapas', 'user', 'tym', 'Trenér', '📋 Zítra hrajeme! Kdo může?', ?, datetime('now', '-2 hours'), 1)")
      .bind(JSON.stringify({ type: "match_announce", calendarId: "cal-1" })),
    no("kocovina", "Hlava jak střep"),
    no("zraneny", "Bolí mě koleno"),
    db.prepare("INSERT INTO messages VALUES ('coach', 'zapas', 'user', 'tym', 'Trenér', 'Žádné omluvenky, chci tam všechny!', NULL, datetime('now'), 1)"),
  ]);
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

const hrac = (id: string): PlayerSnapshot => ({
  id, firstName: id, lastName: "Test", age: 25, position: "MID", morale: 50, condition: 90, coachRelationship: 70,
  discipline: 60, patriotism: 50, alcohol: 50, temper: 50, leadership: 50, workRate: 50, aggression: 50,
  recentMinutes: 90, recentRatingAvg: 6.5, isCelebrity: false,
});

describe("přemlouvání omluvených", () => {
  it("kocovinu rozmluví, zraněného ne; podruhé už nikoho", async () => {
    const squad = [hrac("kocovina"), hrac("zraneny")];
    const before = await recordedExcuses(db, "tym", "cal-1");
    expect([...(before?.keys() ?? [])].sort()).toEqual(["kocovina", "zraneny"]);

    const persuaded = await persuadeAbsentees(db, { teamId: "tym", convId: "zapas", message: "Žádné omluvenky, chci tam všechny!", squad, rng: () => 0.1 });
    expect(persuaded).toEqual(["kocovina"]);
    const yes = await db.prepare("SELECT body, metadata FROM messages WHERE sender_id = 'kocovina' AND json_extract(metadata, '$.persuaded') = 1").first<{ body: string; metadata: string }>();
    expect(JSON.parse(yes?.metadata ?? "{}")).toMatchObject({ response: "yes", calendarId: "cal-1" });

    // Omluvenky z kabiny: platí poslední odpověď, přemluvený chybí jen zraněný.
    const after = await recordedExcuses(db, "tym", "cal-1");
    expect([...(after?.keys() ?? [])]).toEqual(["zraneny"]);

    expect(await persuadeAbsentees(db, { teamId: "tym", convId: "zapas", message: "Žádné omluvenky!", squad, rng: () => 0 })).toEqual([]);
  });
});
