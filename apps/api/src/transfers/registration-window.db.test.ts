import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { REGISTRATION_DAYS, registrationLockError, registrationLockedUntil, registrationLockMessage } from "./registration-window";

/**
 * Volný hráč nebo tip z hospody stojí 500 Kč a šel hned prodat: na produ od 15. 8.
 * 18 takových hráčů prodaných za 287 tis. Kč, hráči z hospody průměrně po 1,8 dne.
 */
describe("registrační lhůta levně získaného hráče", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  const NOW = new Date("2026-11-01T12:00:00.000Z");

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"],
    });
    db = await miniflare.getD1Database("DB");
    await db.prepare("CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT)").run();
    await db.prepare(
      `CREATE TABLE player_contracts (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, join_type TEXT,
        is_active INTEGER, joined_at TEXT DEFAULT (datetime('now')))`,
    ).run();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  beforeEach(async () => {
    await db.prepare("DELETE FROM players").run();
    await db.prepare("DELETE FROM player_contracts").run();
  });

  async function signed(id: string, joinType: string, joinedAt: string, active = 1) {
    await db.prepare("INSERT OR IGNORE INTO players VALUES (?, 'Jan', 'Novák')").bind(id).run();
    await db.prepare("INSERT INTO player_contracts VALUES (?, ?, 'club', ?, ?, ?)").bind(`${id}-${joinType}-${joinedAt}`, id, joinType, active, joinedAt).run();
  }

  it("hráč z hospody podepsaný předevčírem se prodat nedá, text řekne od kdy", async () => {
    await signed("pub", "pub", "2026-10-30 18:37:25");
    expect(await registrationLockedUntil(db, "pub", NOW)).toBe("2026-11-13T18:37:25Z");
    expect(await registrationLockError(db, ["pub"], NOW))
      .toBe("Jan Novák je v klubu teprve krátce. Prodat, vyměnit nebo půjčit ho půjde od 13. 11.");
  });

  it(`po ${REGISTRATION_DAYS} dnech lhůta skončí`, async () => {
    await signed("old", "free_agent", "2026-10-18 11:59:00");
    expect(await registrationLockedUntil(db, "old", NOW)).toBeNull();
  });

  it("koupený, vlastní odchovanec ani hráč z dřívější smlouvy lhůtu nemají", async () => {
    await signed("bought", "transfer", "2026-10-31T16:00:00.000Z");
    await signed("youth", "youth", "2026-10-31 15:16:53");
    await signed("gone", "friend", "2026-10-31 07:33:20", 0);
    expect(await registrationLockError(db, ["bought", "youth", "gone"], NOW)).toBeNull();
  });

  it("ve výměně se ozve první hráč v lhůtě", async () => {
    await signed("ok", "generated", "2026-03-29 09:27:24");
    await signed("tip", "recommendation", "2026-10-31 23:40:56");
    expect(await registrationLockError(db, ["ok", "tip"], NOW)).toContain("od 15. 11.");
  });

  it("text bez jména se nerozpadne", () => {
    expect(registrationLockMessage(null, "2026-11-13T18:37:25Z")).toBe("Hráč je v klubu teprve krátce. Prodat, vyměnit nebo půjčit ho půjde od 13. 11.");
  });
});
