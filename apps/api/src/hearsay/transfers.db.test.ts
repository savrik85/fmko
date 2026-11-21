/**
 * Reakce na prodej a nákup nad D1 (plán Task 11).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import { createHearsayDb, resetHearsayDb } from "../test-support/hearsay-db";
import { recordTransferReactions } from "./transfers";

let miniflare: Miniflare;
let db: D1Database;
const NOW = new Date("2026-11-21T12:00:00Z");

beforeAll(async () => { ({ miniflare, db } = await createHearsayDb()); }, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => {
  await resetHearsayDb(db);
  const life = '{"morale":50}';
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, game_date) VALUES ('club', 'TJ Dvory', 'u1', '2026-11-21'), ('ai', 'SK Lhota', 'ai', '2026-11-21')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, position, overall_rating, life_context, coach_relationship) VALUES
      ('grill', 'club', 'Ondřej', 'Grill', 'FWD', 50, ?, 50), ('erik', 'club', 'Erik', 'Grill', 'MID', 40, ?, 50),
      ('gk1', 'club', 'Jan', 'Brankář', 'GK', 48, ?, 50), ('novy', 'club', 'Petr', 'Nový', 'GK', 49, ?, 50),
      ('a1', 'ai', 'Jan', 'A', 'MID', 40, ?, 50), ('a2', 'ai', 'Petr', 'A', 'MID', 40, ?, 50)`).bind(life, life, life, life, life, life),
    db.prepare("INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES ('r1', 'grill', 'erik', 'brothers', 90), ('r2', 'a1', 'a2', 'brothers', 90)"),
  ]);
});

const player = async (id: string) => db.prepare("SELECT coach_relationship AS rel, json_extract(life_context, '$.morale') AS morale FROM players WHERE id = ?").bind(id).first();

describe("reakce na přestup", () => {
  it("prodej bráchy: Erik má věc, dopad a čekající zprávu", async () => {
    // Grill už je pryč (v jiném klubu), vazba na bráchu zůstala.
    await db.prepare("UPDATE players SET team_id = 'ai' WHERE id = 'grill'").run();
    expect(await recordTransferReactions(db, { playerId: "grill", clubTeamId: "club", direction: "left", otherClubName: "SK Lhota", now: NOW })).toBe(1);
    const row = await db.prepare(
      `SELECT h.kind, h.origin, h.quote, k.via, k.message_state FROM squad_hearsay h JOIN squad_hearsay_knowledge k ON k.hearsay_id = h.id WHERE h.subject_player_id = 'erik'`,
    ).first();
    expect(row).toEqual({ kind: "teammate_left", origin: "transfer", quote: "Ondřej Grill přestoupil do klubu SK Lhota", via: "brothers", message_state: "pending" });
    expect(await player("erik")).toEqual({ rel: 45, morale: 44 });
    // Druhé zavolání (obnova požadavku) nic nezdvojí.
    await recordTransferReactions(db, { playerId: "grill", clubTeamId: "club", direction: "left", otherClubName: "SK Lhota", now: NOW });
    expect(await player("erik")).toEqual({ rel: 45, morale: 44 });
  });

  it("nákup gólmana: brankář kádru znejistí", async () => {
    expect(await recordTransferReactions(db, { playerId: "novy", clubTeamId: "club", direction: "arrived", otherClubName: null, now: NOW })).toBe(1);
    const row = await db.prepare("SELECT h.subject_player_id, h.kind, h.quote, k.via FROM squad_hearsay h JOIN squad_hearsay_knowledge k ON k.hearsay_id = h.id").first();
    expect(row).toEqual({ subject_player_id: "gk1", kind: "teammate_arrived", quote: "Do klubu přišel Petr Nový", via: "competitor" });
    expect(await player("gk1")).toMatchObject({ morale: 47 });
  });

  it("AI klub nic", async () => {
    expect(await recordTransferReactions(db, { playerId: "a1", clubTeamId: "ai", direction: "left", otherClubName: null, now: NOW })).toBe(0);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM squad_hearsay").first()).toEqual({ n: 0 });
  });
});
