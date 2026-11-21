/**
 * Načtení paměti hráče nad D1: jména jen hráčů, kteří jsou pořád v klubu.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import { createHearsayDb, resetHearsayDb } from "../test-support/hearsay-db";
import { loadHearsayMemory } from "./prompt";
import { recordHearsay } from "./store";

let miniflare: Miniflare;
let db: D1Database;
const NOW = new Date("2026-11-21T12:00:00Z");

beforeAll(async () => { ({ miniflare, db } = await createHearsayDb()); }, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => {
  await resetHearsayDb(db);
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id) VALUES ('club', 'TJ Dvory', 'u1'), ('other', 'SK Lhota', 'u2')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name) VALUES
      ('sima', 'club', 'Radek', 'Šíma'), ('smejkal', 'club', 'Rostislav', 'Šmejkal'), ('odesel', 'other', 'Petr', 'Pryč')`),
  ]);
});

const at = "2026-11-21T10:00:00.000Z";

describe("paměť hráče z databáze", () => {
  it("jména v 1. pádě a o sobě", async () => {
    await recordHearsay(db, { clubTeamId: "club", subjectPlayerId: "smejkal", kind: "criticism", origin: "coach_sms", recipientPlayerId: "sima", conversationId: null, quote: "fláká se", createdAt: at },
      [{ playerId: "smejkal", via: "brothers" }]);
    const [line] = await loadHearsayMemory(db, "smejkal", "club", NOW);
    expect(line).toMatchObject({ aboutMe: true, subjectName: "Rostislav Šmejkal", recipientName: "Radek Šíma", quote: "fláká se", via: "brothers" });
  });

  it("věc o hráči, který odešel, vypadne a adresát mimo klub se nejmenuje", async () => {
    await recordHearsay(db, { clubTeamId: "club", subjectPlayerId: "odesel", kind: "criticism", origin: "coach_sms", recipientPlayerId: "sima", conversationId: null, quote: "a", createdAt: at },
      [{ playerId: "smejkal", via: "teammate" }]);
    await recordHearsay(db, { clubTeamId: "club", subjectPlayerId: "smejkal", kind: "praise", origin: "coach_sms", recipientPlayerId: "odesel", conversationId: null, quote: "b", createdAt: at },
      [{ playerId: "smejkal", via: "teammate" }]);
    const lines = await loadHearsayMemory(db, "smejkal", "club", NOW);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quote: "b", recipientName: null });
  });
});
