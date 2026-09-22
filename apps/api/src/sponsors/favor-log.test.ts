/**
 * Deník náklonnosti: každá změna se zapíše ve stejném batchi jako změna sama,
 * log vždy PŘED změnou (skutečnou deltu počítá z hodnoty před změnou).
 */
import { describe, it, expect } from "vitest";
import { applySponsorFavorDelta, favorDeltaStmts } from "./favor";
import { applyRiotFavorPenalty, rewardSeasonPartnerships, settleSponsorInvitations } from "./hooks";

interface FakeStmt { sql: string; args: unknown[] }

function fakeDb(opts: { selectRows?: unknown[]; batchChanges?: number[] } = {}) {
  const batches: FakeStmt[][] = [];
  const runs: FakeStmt[] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        sql,
        args: [] as unknown[],
        bind(...args: unknown[]) { stmt.args = args; return stmt; },
        async all() { return { results: opts.selectRows ?? [] }; },
        async run() { runs.push({ sql, args: stmt.args }); return { meta: { changes: 1 } }; },
      };
      return stmt;
    },
    async batch(stmts: FakeStmt[]) {
      batches.push(stmts.map((s) => ({ sql: s.sql, args: s.args })));
      return stmts.map((_, i) => ({ meta: { changes: opts.batchChanges?.[i] ?? 1 } }));
    },
  } as unknown as D1Database;
  return { db, batches, runs };
}

describe("favorDeltaStmts", () => {
  it("vrací [log, změna] se správnými parametry", () => {
    const { db } = fakeDb();
    const [log, upsert] = favorDeltaStmts(db, 7, "T1", 3, "pivo v hospodě") as unknown as FakeStmt[];
    expect(log.sql).toContain("INSERT INTO sponsor_favor_log");
    expect(log.args).toEqual([7, "T1", 3, "pivo v hospodě", 40]);
    expect(upsert.sql).toContain("INSERT INTO sponsor_team_favor");
    expect(upsert.args).toEqual([7, "T1", 40, 3, 3]);
  });
});

describe("applySponsorFavorDelta", () => {
  it("nulová změna nic nezapíše", async () => {
    const { db, batches, runs } = fakeDb();
    await applySponsorFavorDelta(db, 7, "T1", 0, "nic");
    expect(batches).toHaveLength(0);
    expect(runs).toHaveLength(0);
  });

  it("změna jde v jednom batchi s logem", async () => {
    const { db, batches } = fakeDb();
    await applySponsorFavorDelta(db, 7, "T1", 5, "přijal pozvání na zápas");
    expect(batches).toHaveLength(1);
    expect(batches[0][0].sql).toContain("INSERT INTO sponsor_favor_log");
    expect(batches[0][0].args[3]).toBe("přijal pozvání na zápas");
    expect(batches[0][1].sql).toContain("INSERT INTO sponsor_team_favor");
  });
});

describe("háčky zapisují do deníku", () => {
  it("výtržnost: log hromadně před UPDATE, opatrný -4, ostatní -2", async () => {
    const { db, batches } = fakeDb();
    await applyRiotFavorPenalty(db, "T1");
    expect(batches).toHaveLength(1);
    const [log, update] = batches[0];
    expect(log.sql).toContain("INSERT INTO sponsor_favor_log");
    expect(log.sql).toContain("FROM sponsor_team_favor f");
    expect(log.args).toEqual([-4, -2, "T1", "výtržnost fanoušků"]);
    expect(update.sql).toContain("UPDATE sponsor_team_favor");
    expect(update.args).toEqual([-4, -2, "T1"]);
  });

  it("sezóna spolupráce: log před upsertem, vrací počet změněných z upsertu", async () => {
    const { db, batches } = fakeDb({ batchChanges: [3, 7] });
    const n = await rewardSeasonPartnerships(db);
    expect(n).toBe(7);
    const [log, upsert] = batches[0];
    expect(log.sql).toContain("INSERT INTO sponsor_favor_log");
    expect(log.args).toEqual([40, 5, "sezóna spolupráce s hlavním sponzorem"]);
    expect(upsert.sql).toContain("INSERT INTO sponsor_team_favor");
  });

  it("pozvánka po zápase: důvod se skóre, fanoušek dvojnásob", async () => {
    const { db, batches } = fakeDb({ selectRows: [{ id: "inv1", sponsor_id: 9, personality: "fan" }] });
    await settleSponsorInvitations(db, "M1", "T1", 3, 1);
    expect(batches).toHaveLength(1);
    const [log, upsert] = batches[0];
    expect(log.args).toEqual([9, "T1", 8, "viděl výhru 3:1", 40]);
    expect(upsert.args).toEqual([9, "T1", 40, 8, 8]);
  });
});
