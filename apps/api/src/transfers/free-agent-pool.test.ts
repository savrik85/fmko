/**
 * Regrese na strop poolu volných hráčů: počítal se přes VŠECHNY řádky
 * `free_agents` v okresu, tedy i přes hráče, které do poolu vyhodili sami
 * manažeři (`source = 'released'` / `'quit'`). V Prachaticích, kde je 14
 * lidských klubů, běžné propouštění samo drželo pool trvale nad stropem 8 —
 * takže se tam nevygeneroval ani jediný nový hráč. Trh byl plný, ale jen
 * odloženými hráči, žádná čerstvá krev.
 */

import { describe, it, expect } from "vitest";
import { maintainFreeAgentPool } from "./free-agent-pool";
import { createRng } from "../generators/rng";

interface StubRule { match: RegExp; all?: unknown[]; first?: unknown }

/** Kolik řádků v poolu okresu je jakého původu. */
interface Pool { generated: number; released: number }

const COUNT_QUERY = /SELECT COUNT\(\*\) as cnt FROM free_agents/;

class FakeStatement {
  constructor(private sql: string, private db: FakeD1, private params: unknown[] = []) {}
  bind(...params: unknown[]): FakeStatement { return new FakeStatement(this.sql, this.db, params); }
  private rule(): StubRule | undefined { return this.db.rules.find((r) => r.match.test(this.sql)); }
  async first<T>(): Promise<T | null> {
    this.db.record(this.sql);
    // Strop se ptá DB — a je to právě znění dotazu, co rozhoduje, jestli se
    // propuštění hráči do stropu počítají. Fake proto odpovídá podle SQL.
    if (COUNT_QUERY.test(this.sql)) return { cnt: this.db.countFor(this.sql) } as T;
    return (this.rule()?.first ?? null) as T | null;
  }
  async all<T>(): Promise<{ results: T[] }> { this.db.record(this.sql); return { results: (this.rule()?.all ?? []) as T[] }; }
  async run(): Promise<{ meta: { changes: number } }> { this.db.record(this.sql); return { meta: { changes: 1 } }; }
}

class FakeD1 {
  queries: string[] = [];
  constructor(private pool: Pool, public rules: StubRule[] = []) {}
  prepare(sql: string): FakeStatement { return new FakeStatement(sql, this); }
  record(sql: string): void { this.queries.push(sql); }
  countFor(sql: string): number {
    return /source = 'generated'/.test(sql)
      ? this.pool.generated
      : this.pool.generated + this.pool.released;
  }
  count(pattern: RegExp): number { return this.queries.filter((q) => pattern.test(q)).length; }
}

function db(pool: Pool): FakeD1 {
  return new FakeD1(pool, [
    { match: /SELECT DISTINCT v\.district/, all: [{ district: "Prachatice" }] },
  ]);
}

// Se seedem 2 padne první rng.int(0, 2) na 2 — generují se dva hráči.
const SEED = 2;
const GAME_DATE = new Date("2026-09-09T03:00:00.000Z");

describe("maintainFreeAgentPool, strop poolu", () => {
  it("propuštění hráči neblokují generování nových", async () => {
    // Přesně stav Prachatic na produkci: 14 propuštěných, ani jeden vygenerovaný.
    const fake = db({ generated: 0, released: 14 });

    const generated = await maintainFreeAgentPool(fake as unknown as D1Database, createRng(SEED), GAME_DATE);

    // Jádro regrese: pool je "plný", ale nové hráče to zastavit nesmí.
    expect(generated).toBe(2);
    expect(fake.count(/INSERT INTO free_agents/)).toBe(2);
  });

  it("strop 8 na vygenerované hráče pořád platí", async () => {
    const fake = db({ generated: 8, released: 0 });

    const generated = await maintainFreeAgentPool(fake as unknown as D1Database, createRng(SEED), GAME_DATE);

    expect(generated).toBe(0);
    expect(fake.count(/INSERT INTO free_agents/)).toBe(0);
  });

  it("strop drží i když v poolu leží propuštění navíc", async () => {
    // Pojistka proti tomu, aby oprava strop nezrušila úplně.
    const fake = db({ generated: 8, released: 14 });

    const generated = await maintainFreeAgentPool(fake as unknown as D1Database, createRng(SEED), GAME_DATE);

    expect(generated).toBe(0);
    expect(fake.count(/INSERT INTO free_agents/)).toBe(0);
  });

  it("vypršelé záznamy se mažou vždy, nezávisle na stropu", async () => {
    const fake = db({ generated: 8, released: 14 });

    await maintainFreeAgentPool(fake as unknown as D1Database, createRng(SEED), GAME_DATE);

    expect(fake.count(/DELETE FROM free_agents WHERE expires_at/)).toBe(1);
  });
});
