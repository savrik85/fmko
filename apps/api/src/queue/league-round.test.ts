/**
 * Testy zpracování kola ligy a producenta front.
 *
 * Těžiště je idempotence: fronty doručují "aspoň jednou", takže duplicitní zpráva
 * NESMÍ kolo odsimulovat podruhé (jinak se zdvojí finance — incident 2026-04).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Minimální D1 stub ───────────────────────────────────────────────────────
// Odpovědi se registrují regulárním výrazem na SQL. Stub zaznamenává všechny
// dotazy, takže se dá tvrdit nejen "co to vrátilo", ale i "co to NEUDĚLALO".

interface StubRule {
  match: RegExp;
  first?: unknown;
  all?: unknown[];
  changes?: number;
}

class FakeStatement {
  constructor(
    private sql: string,
    private db: FakeD1,
    private params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): FakeStatement {
    return new FakeStatement(this.sql, this.db, params);
  }

  private rule(): StubRule | undefined {
    return this.db.rules.find((r) => r.match.test(this.sql));
  }

  async first<T>(): Promise<T | null> {
    this.db.record(this.sql, this.params);
    const r = this.rule();
    return (r?.first ?? null) as T | null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.db.record(this.sql, this.params);
    const r = this.rule();
    return { results: (r?.all ?? []) as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    this.db.record(this.sql, this.params);
    const r = this.rule();
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

  /** Kolikrát padl dotaz odpovídající vzoru. */
  count(pattern: RegExp): number {
    return this.queries.filter((q) => pattern.test(q.sql)).length;
  }
}

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

const LEAGUE = "liga-1";
const GAME_DATE = "2026-08-16T00:00:00.000Z";

/** Základní pravidla: liga má herní datum i splatné kolo. */
function baseRules(lockChanges: number): StubRule[] {
  return [
    { match: /MAX\(game_date\) AS game_date FROM teams/, first: { game_date: GAME_DATE } },
    { match: /SELECT id FROM season_calendar WHERE league_id = \? AND scheduled_at <= \?/, first: { id: "kalendar-1" } },
    { match: /UPDATE season_calendar SET status = 'lineup_locked'/, changes: lockChanges },
  ];
}

describe("processLeagueRound — idempotence", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("zamčené kolo (duplicitní zpráva) skončí jako 'skipped' a nic nesimuluje", async () => {
    const { processLeagueRound } = await import("../season/league-round");
    // changes === 0 → lock nezabral, kolo už drží někdo jiný
    const { db, env } = makeEnv(baseRules(0));

    const result = await processLeagueRound(env, LEAGUE);

    expect(result.status).toBe("skipped");
    expect(result.matches).toBe(0);
    // KLÍČOVÉ: žádné otevírání sestav, žádné dopsání výsledků, žádné finance.
    expect(db.count(/UPDATE matches SET status = 'lineups_open'/)).toBe(0);
    expect(db.count(/UPDATE season_calendar SET status = 'simulated'/)).toBe(0);
    expect(db.count(/INSERT INTO news/)).toBe(0);
  });

  it("liga bez herního data skončí jako 'no-round'", async () => {
    const { processLeagueRound } = await import("../season/league-round");
    const { db, env } = makeEnv([{ match: /MAX\(game_date\) AS game_date FROM teams/, first: { game_date: null } }]);

    const result = await processLeagueRound(env, LEAGUE);

    expect(result.status).toBe("no-round");
    expect(db.count(/UPDATE season_calendar/)).toBe(0);
  });

  it("liga bez splatného kola skončí jako 'no-round' a nezamyká", async () => {
    const { processLeagueRound } = await import("../season/league-round");
    const { db, env } = makeEnv([
      { match: /MAX\(game_date\) AS game_date FROM teams/, first: { game_date: GAME_DATE } },
      { match: /SELECT id FROM season_calendar WHERE league_id = \? AND scheduled_at <= \?/, first: null },
    ]);

    const result = await processLeagueRound(env, LEAGUE);

    expect(result.status).toBe("no-round");
    expect(db.count(/UPDATE season_calendar SET status = 'lineup_locked'/)).toBe(0);
  });
});

describe("processLeagueRound — zastaralá zpráva", () => {
  it("posunutý herní den zprávu zahodí ('stale') a kolo nezamkne", async () => {
    const { processLeagueRound } = await import("../season/league-round");
    const { db, env } = makeEnv(baseRules(1));

    const result = await processLeagueRound(env, LEAGUE, {
      expectedGameDate: "2026-08-10T00:00:00.000Z", // fronta se zasekla, den mezitím utekl
    });

    expect(result.status).toBe("stale");
    expect(db.count(/UPDATE season_calendar SET status = 'lineup_locked'/)).toBe(0);
    expect(db.count(/UPDATE matches/)).toBe(0);
  });

  it("shodný herní den projde dál (kolo se zamkne)", async () => {
    const { processLeagueRound } = await import("../season/league-round");
    // lock vrátí 0, ať test neběží do simulace — stačí ověřit, že se o lock POKUSIL
    const { db, env } = makeEnv(baseRules(0));

    const result = await processLeagueRound(env, LEAGUE, { expectedGameDate: GAME_DATE });

    expect(result.status).toBe("skipped");
    expect(db.count(/UPDATE season_calendar SET status = 'lineup_locked'/)).toBe(1);
  });
});

describe("processLeagueRound — měření", () => {
  it("vrací počet dotazů a dobu běhu (podklad pro důkaz škálování)", async () => {
    const { processLeagueRound } = await import("../season/league-round");
    const { env } = makeEnv(baseRules(0));

    const result = await processLeagueRound(env, LEAGUE);

    expect(result.queries).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.leagueId).toBe(LEAGUE);
  });
});

describe("findLeaguesWithDueRound", () => {
  it("vrátí jen ligy s vyplněným id i herním datem", async () => {
    const { findLeaguesWithDueRound } = await import("../season/league-round");
    const db = new FakeD1([
      {
        match: /FROM teams t JOIN leagues l/,
        all: [
          { league_id: "a", max_game_date: GAME_DATE },
          { league_id: null, max_game_date: GAME_DATE },
          { league_id: "c", max_game_date: null },
          { league_id: "d", max_game_date: GAME_DATE },
        ],
      },
    ]);

    const out = await findLeaguesWithDueRound(db as unknown as D1Database);

    expect(out.map((o) => o.leagueId)).toEqual(["a", "d"]);
  });

  it("bez legacy filtru NEVYLUČUJE žádnou ligu podle jména", async () => {
    const { findLeaguesWithDueRound } = await import("../season/league-round");
    const db = new FakeD1([{ match: /FROM teams t JOIN leagues l/, all: [] }]);

    await findLeaguesWithDueRound(db as unknown as D1Database);

    expect(db.queries[0].sql).not.toContain("NOT LIKE");
    expect(db.queries[0].params).toEqual([]);
  });

  it("s legacy filtrem doplní podmínku i parametr", async () => {
    const { findLeaguesWithDueRound } = await import("../season/league-round");
    const db = new FakeD1([{ match: /FROM teams t JOIN leagues l/, all: [] }]);

    await findLeaguesWithDueRound(db as unknown as D1Database, { legacyExcludeDistrictLike: "České Budějovice%" });

    // Filtruje se podle okresu, ne podle názvu — název se přejmenováním sponzorem mění.
    expect(db.queries[0].sql).toContain("l.district NOT LIKE ?");
    expect(db.queries[0].params).toEqual(["České Budějovice%"]);
  });
});

describe("enqueueMatchTick — producent", () => {
  it("pošle jednu zprávu na ligu se splatným kolem a údržbu na ligu s lidským týmem", async () => {
    const { enqueueMatchTick } = await import("./producer");
    const sent: Array<{ body: unknown }> = [];
    const db = new FakeD1([
      {
        match: /FROM teams t JOIN leagues l/,
        all: [
          { league_id: "liga-a", max_game_date: GAME_DATE },
          { league_id: "liga-b", max_game_date: GAME_DATE },
        ],
      },
      {
        match: /user_id != 'ai' AND t\.league_id IS NOT NULL GROUP BY/,
        all: [{ league_id: "liga-a", game_date: GAME_DATE }],
      },
    ]);
    const env = {
      DB: db as unknown as D1Database,
      MATCH_QUEUE: {
        sendBatch: async (batch: Array<{ body: unknown }>) => {
          sent.push(...batch);
        },
      },
    } as never;

    const result = await enqueueMatchTick(env);

    expect(result.rounds).toBe(2);
    expect(result.maintenance).toBe(1);

    const rounds = sent.map((s) => s.body as { kind: string; leagueId: string; gameDate: string });
    expect(rounds.filter((r) => r.kind === "league_round").map((r) => r.leagueId)).toEqual(["liga-a", "liga-b"]);
    expect(rounds.filter((r) => r.kind === "league_maintenance").map((r) => r.leagueId)).toEqual(["liga-a"]);
  });

  it("zpráva NIKDY nenese calendarId — kolo si musí najít a zamknout konzumer", async () => {
    const { enqueueMatchTick } = await import("./producer");
    const sent: Array<{ body: Record<string, unknown> }> = [];
    const db = new FakeD1([
      { match: /FROM teams t JOIN leagues l/, all: [{ league_id: "liga-a", max_game_date: GAME_DATE }] },
      { match: /user_id != 'ai' AND t\.league_id IS NOT NULL GROUP BY/, all: [] },
    ]);
    const env = {
      DB: db as unknown as D1Database,
      MATCH_QUEUE: { sendBatch: async (b: Array<{ body: Record<string, unknown> }>) => { sent.push(...b); } },
    } as never;

    await enqueueMatchTick(env);

    expect(sent).toHaveLength(1);
    expect(sent[0].body).not.toHaveProperty("calendarId");
    expect(sent[0].body).toHaveProperty("gameDate", GAME_DATE);
  });

  it("bez bindingu fronty nic neodešle a nespadne", async () => {
    const { enqueueMatchTick } = await import("./producer");
    const db = new FakeD1([]);
    const result = await enqueueMatchTick({ DB: db as unknown as D1Database } as never);
    expect(result).toEqual({ rounds: 0, maintenance: 0, leagues: [] });
  });
});

describe("readMatchTickMode — přepínač", () => {
  it("bez KV i s neznámou hodnotou drží 'loop' (bezpečný default)", async () => {
    const { readMatchTickMode } = await import("./messages");
    expect(await readMatchTickMode(undefined)).toBe("loop");
    const kv = { get: async () => "nesmysl" } as unknown as KVNamespace;
    expect(await readMatchTickMode(kv)).toBe("loop");
  });

  it("hodnota 'queue' přepne na frontu", async () => {
    const { readMatchTickMode } = await import("./messages");
    const kv = { get: async () => "queue" } as unknown as KVNamespace;
    expect(await readMatchTickMode(kv)).toBe("queue");
  });

  it("chyba čtení KV spadne zpět na 'loop', ne na výjimku", async () => {
    const { readMatchTickMode } = await import("./messages");
    const kv = { get: async () => { throw new Error("KV mimo provoz"); } } as unknown as KVNamespace;
    expect(await readMatchTickMode(kv)).toBe("loop");
  });
});
