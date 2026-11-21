/**
 * Hodinové šíření nad skutečnou D1: Šmejkal se doslechne od bráchy, co o něm trenér psal.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import { createHearsayDb, resetHearsayDb } from "../test-support/hearsay-db";
import { recordHearsay } from "./store";
import { spreadHearsay } from "./spread";

let miniflare: Miniflare;
let db: D1Database;
const CREATED = "2026-11-21T08:00:00.000Z";

beforeAll(async () => { ({ miniflare, db } = await createHearsayDb()); }, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => {
  await resetHearsayDb(db);
  const talkative = JSON.stringify({ temper: 90, discipline: 10, leadership: 20 });
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, game_date) VALUES ('club', 'TJ Dvory', 'u1', '2026-11-21'), ('ai', 'SK Lhota', 'ai', '2026-11-21')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, personality, life_context, coach_relationship) VALUES
      ('sima', 'club', 'Radek', 'Šíma', ?, '{"morale":50}', 50),
      ('smejkal', 'club', 'Rostislav', 'Šmejkal', NULL, '{"morale":50}', 50),
      ('a1', 'ai', 'Jan', 'Cizí', ?, '{"morale":50}', 50),
      ('a2', 'ai', 'Petr', 'Cizí', NULL, '{"morale":50}', 50)`).bind(talkative, talkative),
    db.prepare("INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES ('r1', 'smejkal', 'sima', 'brothers', 100), ('r2', 'a1', 'a2', 'brothers', 100)"),
  ]);
});

const base = { kind: "criticism" as const, origin: "coach_sms" as const, conversationId: null, quote: "Šmejkal se fláká", createdAt: CREATED };

/** Pouští hodinový běh po hodinách od 9:00 UTC (10:00 v Praze), dokud podmínka neplatí. */
async function runUntil(done: () => Promise<boolean>, hours = 12): Promise<void> {
  for (let h = 0; h < hours && !(await done()); h++) {
    await spreadHearsay(db, new Date(Date.parse("2026-11-21T09:00:00Z") + h * 3_600_000));
  }
}

describe("hodinové šíření", () => {
  it("Šmejkal se to dozví od bráchy Šímy, má dopad a čekající zprávu", async () => {
    await recordHearsay(db, { ...base, clubTeamId: "club", subjectPlayerId: "smejkal", recipientPlayerId: "sima" }, [{ playerId: "sima", via: "direct" }]);
    const knows = async () => !!(await db.prepare("SELECT 1 FROM squad_hearsay_knowledge WHERE player_id = 'smejkal'").first());
    await runUntil(knows, 200);
    const row = await db.prepare("SELECT via, from_player_id, message_state FROM squad_hearsay_knowledge WHERE player_id = 'smejkal'")
      .first<{ via: string; from_player_id: string; message_state: string }>();
    expect(row).toMatchObject({ via: "brothers", from_player_id: "sima", message_state: "pending" });
    expect(await db.prepare("SELECT coach_relationship AS rel, json_extract(life_context, '$.morale') AS morale FROM players WHERE id = 'smejkal'").first())
      .toEqual({ rel: 46, morale: 47 });
  });

  it("AI klub se nešíří", async () => {
    await recordHearsay(db, { ...base, clubTeamId: "ai", subjectPlayerId: "a2", recipientPlayerId: "a1" }, [{ playerId: "a1", via: "direct" }]);
    await runUntil(async () => false, 48);
    expect(await db.prepare("SELECT 1 FROM squad_hearsay_knowledge WHERE player_id = 'a2'").first()).toBeNull();
  });

  it("v noci se nic nešíří", async () => {
    await recordHearsay(db, { ...base, clubTeamId: "club", subjectPlayerId: "smejkal", recipientPlayerId: "sima" }, [{ playerId: "sima", via: "direct" }]);
    expect(await spreadHearsay(db, new Date("2026-11-21T23:30:00Z"))).toEqual({ learned: 0, clubs: 0 });
  });
});
