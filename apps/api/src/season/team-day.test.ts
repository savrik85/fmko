/**
 * Testy nároku na zpracování herního dne.
 *
 * Pondělní finance, náklad na trénink ani kabina nemají vlastní pojistku proti
 * dvojímu zaúčtování. Dokud běžel tick v jedné invokaci, chránil ho KV guard;
 * ve frontě (doručení "aspoň jednou") ho musí nahradit nárok per tým a den.
 */

import { describe, it, expect } from "vitest";

interface StubRule {
  match: RegExp;
  first?: unknown;
  all?: unknown[];
  changes?: number;
  throws?: boolean;
}

class FakeStatement {
  constructor(private sql: string, private db: FakeD1, private params: unknown[] = []) {}

  bind(...params: unknown[]): FakeStatement {
    return new FakeStatement(this.sql, this.db, params);
  }

  private rule(): StubRule | undefined {
    return this.db.rules.find((r) => r.match.test(this.sql));
  }

  async first<T>(): Promise<T | null> {
    this.db.record(this.sql, this.params);
    return (this.rule()?.first ?? null) as T | null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.db.record(this.sql, this.params);
    return { results: (this.rule()?.all ?? []) as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    this.db.record(this.sql, this.params);
    const r = this.rule();
    if (r?.throws) throw new Error("D1 mimo provoz");
    return { meta: { changes: r?.changes ?? 1 } };
  }
}

class FakeD1 {
  queries: Array<{ sql: string; params: unknown[] }> = [];
  constructor(public rules: StubRule[] = []) {}
  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }
  record(sql: string, params: unknown[]): void {
    this.queries.push({ sql, params });
  }
  count(pattern: RegExp): number {
    return this.queries.filter((q) => pattern.test(q.sql)).length;
  }
}

const GAME_DATE = "2026-08-17T16:00:00.000Z";
const TEAM = { id: "tym-1", user_id: "ai", league_id: "liga-1", game_date: GAME_DATE };

describe("claimTeamDay", () => {
  it("první nárok projde (changes > 0)", async () => {
    const { claimTeamDay } = await import("./team-day");
    const db = new FakeD1([{ match: /INSERT OR IGNORE INTO team_day_log/, changes: 1 }]);

    const ok = await claimTeamDay(db as unknown as D1Database, "tym-1", GAME_DATE);

    expect(ok).toBe(true);
    expect(db.queries[0].params).toEqual(["tym-1", GAME_DATE]);
  });

  it("druhý nárok na tentýž den neprojde (changes === 0)", async () => {
    const { claimTeamDay } = await import("./team-day");
    const db = new FakeD1([{ match: /INSERT OR IGNORE INTO team_day_log/, changes: 0 }]);

    expect(await claimTeamDay(db as unknown as D1Database, "tym-1", GAME_DATE)).toBe(false);
  });

  it("při chybě zápisu vrací false — radši nezpracovat než zdvojit finance", async () => {
    const { claimTeamDay } = await import("./team-day");
    const db = new FakeD1([{ match: /INSERT OR IGNORE INTO team_day_log/, throws: true }]);

    expect(await claimTeamDay(db as unknown as D1Database, "tym-1", GAME_DATE)).toBe(false);
  });
});

describe("processTeamDay — idempotence", () => {
  function makeEnv(rules: StubRule[]) {
    const db = new FakeD1(rules);
    return {
      db,
      env: {
        DB: db as unknown as D1Database,
        GEMINI_API_KEY: "",
        VAPID_PUBLIC_KEY: "",
        VAPID_PRIVATE_KEY: "",
        VAPID_SUBJECT: "",
      } as never,
    };
  }

  it("duplicitní zpráva den nezpracuje podruhé (žádné finance, žádný trénink)", async () => {
    const { processTeamDay } = await import("./team-day");
    const { db, env } = makeEnv([{ match: /INSERT OR IGNORE INTO team_day_log/, changes: 0 }]);

    const result = await processTeamDay(env, { ...TEAM }, GAME_DATE, { claim: true });

    expect(result.status).toBe("skipped");
    expect(result.events).toEqual([]);
    // Po neúspěšném nároku už nesmí padnout ŽÁDNÝ další dotaz.
    expect(db.queries).toHaveLength(1);
    expect(db.count(/INSERT INTO transactions/)).toBe(0);
  });

  it("bez claim se nárok vůbec neřeší (režim loop chrání KV guard ticku)", async () => {
    const { processTeamDay } = await import("./team-day");
    const { db, env } = makeEnv([]);

    await processTeamDay(env, { ...TEAM }, GAME_DATE);

    expect(db.count(/team_day_log/)).toBe(0);
  });

  it("bez herního data se nedělá nic", async () => {
    const { processTeamDay } = await import("./team-day");
    const { db, env } = makeEnv([]);

    const result = await processTeamDay(env, { ...TEAM, game_date: GAME_DATE }, null, { claim: true });

    expect(result.status).toBe("done");
    expect(db.count(/team_day_log/)).toBe(0);
  });
});

describe("enqueueTeamDays — producent denního ticku", () => {
  it("seskupí týmy do jedné zprávy na ligu", async () => {
    const { enqueueTeamDays } = await import("../queue/producer");
    const sent: Array<{ body: { kind: string; leagueId: string } }> = [];
    const env = {
      DB: new FakeD1([]) as unknown as D1Database,
      MATCH_QUEUE: { sendBatch: async (b: Array<{ body: { kind: string; leagueId: string } }>) => { sent.push(...b); } },
    } as never;

    const teams = [
      { id: "t1", league_id: "liga-a" },
      { id: "t2", league_id: "liga-a" },
      { id: "t3", league_id: "liga-b" },
    ];
    const result = await enqueueTeamDays(env, GAME_DATE, teams);

    // 3 týmy, 2 ligy → 2 zprávy, ne 3
    expect(result.leagues).toBe(2);
    expect(result.looseTeams).toBe(0);
    expect(sent.map((s) => s.body.leagueId).sort()).toEqual(["liga-a", "liga-b"]);
    expect(sent.every((s) => s.body.kind === "league_day")).toBe(true);
  });

  it("týmy bez ligy se spočítají zvlášť", async () => {
    const { enqueueTeamDays } = await import("../queue/producer");
    const env = {
      DB: new FakeD1([{ match: /INSERT OR IGNORE INTO team_day_log/, changes: 0 }]) as unknown as D1Database,
      MATCH_QUEUE: { sendBatch: async () => {} },
    } as never;

    const result = await enqueueTeamDays(env, GAME_DATE, [{ id: "t1", league_id: null }]);

    expect(result.leagues).toBe(0);
    expect(result.looseTeams).toBe(1);
  });
});
