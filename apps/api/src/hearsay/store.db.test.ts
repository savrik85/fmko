/**
 * Úložiště „kdo co ví“ nad skutečnou D1: zápis věci, znalost bez zdvojení, platnost.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import { createHearsayDb, resetHearsayDb } from "../test-support/hearsay-db";
import { knowledgeStmts, loadClubHearsay, loadPlayerHearsay, recordHearsay } from "./store";

let miniflare: Miniflare;
let db: D1Database;
const NOW = new Date("2026-11-21T12:00:00Z");

beforeAll(async () => { ({ miniflare, db } = await createHearsayDb()); }, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => { await resetHearsayDb(db); });

const base = {
  clubTeamId: "club", subjectPlayerId: "smejkal", kind: "criticism" as const, origin: "coach_sms" as const,
  recipientPlayerId: "sima", conversationId: "c1", quote: "Šmejkal se fláká", createdAt: NOW.toISOString(),
};

describe("úložiště hearsay", () => {
  it("zapíše věc a adresát ji ví přímo", async () => {
    await recordHearsay(db, base, [{ playerId: "sima", via: "direct" }]);
    const known = await loadPlayerHearsay(db, "sima", NOW);
    expect(known).toHaveLength(1);
    expect(known[0].knowledge.via).toBe("direct");
    expect(known[0].subjectPlayerId).toBe("smejkal");
    expect(Date.parse(known[0].expiresAt) - Date.parse(known[0].createdAt)).toBe(21 * 86_400_000);
  });

  it("dvojí zápis znalosti nic nezdvojí", async () => {
    const id = await recordHearsay(db, base, [{ playerId: "sima", via: "direct" }]);
    const row = (via: "brothers" | "pub") => ({
      hearsayId: id, playerId: "smejkal", via, fromPlayerId: "sima", learnedAt: NOW.toISOString(),
      messageState: "none" as const, messagedAt: null,
    });
    await db.batch(knowledgeStmts(db, [row("brothers")]));
    await db.batch(knowledgeStmts(db, [row("pub")]));
    const rows = await db.prepare("SELECT via FROM squad_hearsay_knowledge WHERE player_id = 'smejkal'").all<{ via: string }>();
    expect(rows.results.map((r) => r.via)).toEqual(["brothers"]);
  });

  it("vypršelé věci klub nenačte", async () => {
    await recordHearsay(db, { ...base, createdAt: "2026-10-01T12:00:00Z" }, [{ playerId: "sima", via: "direct" }]);
    await recordHearsay(db, base, [{ playerId: "sima", via: "direct" }]);
    const club = await loadClubHearsay(db, "club", NOW);
    expect(club.items).toHaveLength(1);
    expect(club.knowledge).toHaveLength(1);
    expect(await loadPlayerHearsay(db, "sima", NOW)).toHaveLength(1);
  });
});
