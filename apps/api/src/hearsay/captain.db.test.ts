/**
 * Kapitáni (plán Task 10): starý kapitán má věc na svůj úkor, kterou zatím ví jen nový;
 * kapitán zápasu jiný než klubový kapitán v základu se zapíše jednou na zápas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import { createHearsayDb, resetHearsayDb } from "../test-support/hearsay-db";
import { recordArmbandSnub, recordCaptainChange } from "./captain";

let miniflare: Miniflare;
let db: D1Database;
const NOW = new Date("2026-11-21T12:00:00Z");

beforeAll(async () => { ({ miniflare, db } = await createHearsayDb()); }, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => {
  await resetHearsayDb(db);
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, game_date) VALUES ('club', 'TJ Dvory', 'u1', '2026-11-21'), ('ai', 'SK Lhota', 'ai', '2026-11-21')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name) VALUES
      ('straka', 'club', 'Michal', 'Straka'), ('daniel', 'club', 'David', 'Daniel'), ('a1', 'ai', 'Jan', 'A'), ('a2', 'ai', 'Petr', 'B')`),
  ]);
});

const items = async () => (await db.prepare("SELECT subject_player_id, kind, origin, quote FROM squad_hearsay").all()).results;
const knowers = async () => (await db.prepare("SELECT player_id, via FROM squad_hearsay_knowledge").all()).results;

describe("kapitáni", () => {
  it("nová páska: starý kapitán má věc na úkor a ví ji zatím jen nový", async () => {
    await recordCaptainChange(db, { teamId: "club", oldCaptainId: "straka", newCaptainId: "daniel", now: NOW });
    expect(await items()).toEqual([{ subject_player_id: "straka", kind: "decision_against", origin: "captain_change", quote: "Kapitánem je teď David Daniel" }]);
    expect(await knowers()).toEqual([{ player_id: "daniel", via: "teammate" }]);
    // Dvojklik na uložení rolí nic nezdvojí.
    await recordCaptainChange(db, { teamId: "club", oldCaptainId: "straka", newCaptainId: "daniel", now: NOW });
    expect(await items()).toHaveLength(1);
  });

  it("stejný kapitán ani první jmenování nic", async () => {
    await recordCaptainChange(db, { teamId: "club", oldCaptainId: "straka", newCaptainId: "straka", now: NOW });
    await recordCaptainChange(db, { teamId: "club", oldCaptainId: null, newCaptainId: "daniel", now: NOW });
    expect(await items()).toEqual([]);
  });

  it("kapitán zápasu jiný než klubový v základu zapíše jednou na zápas", async () => {
    const snub = { teamId: "club", clubCaptainId: "straka", matchCaptainId: "daniel", starterIds: ["straka", "daniel"], matchKey: "cal-24", now: NOW };
    await recordArmbandSnub(db, snub);
    await recordArmbandSnub(db, snub);
    expect(await items()).toEqual([{ subject_player_id: "straka", kind: "decision_against", origin: "lineup_armband", quote: "Pásku na zápas má David Daniel" }]);
    // Klubový kapitán na lavičce: o pásku nepřišel, sedí (to řeší truc za vynechání).
    await recordArmbandSnub(db, { ...snub, matchKey: "cal-25", starterIds: ["daniel"] });
    expect(await items()).toHaveLength(1);
  });

  it("AI klub nic", async () => {
    await recordCaptainChange(db, { teamId: "ai", oldCaptainId: "a1", newCaptainId: "a2", now: NOW });
    await recordArmbandSnub(db, { teamId: "ai", clubCaptainId: "a1", matchCaptainId: "a2", starterIds: ["a1", "a2"], matchKey: "x", now: NOW });
    expect(await items()).toEqual([]);
  });
});
