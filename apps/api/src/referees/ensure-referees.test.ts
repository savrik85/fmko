/**
 * Regrese na jednu konkrétní past: `ensureReferees` rozhodovalo o založení poolu
 * podle počtu AKTIVNÍCH sudích. Po prvním vyškrtnutí sudího by tak podmínka byla
 * trvale nesplněná a plná generace poolu (batch patnácti INSERTů) by běžela při
 * každé jediné delegaci — navždy, a bez efektu, protože ID jsou deterministická.
 */

import { describe, it, expect } from "vitest";
import { ensureReferees, REFEREES_PER_DISTRICT, type RefereeRow } from "./referee-generator";

interface StubRule { match: RegExp; all?: unknown[]; first?: unknown }

class FakeStatement {
  constructor(private sql: string, private db: FakeD1, private params: unknown[] = []) {}
  bind(...params: unknown[]): FakeStatement { return new FakeStatement(this.sql, this.db, params); }
  private rule(): StubRule | undefined { return this.db.rules.find((r) => r.match.test(this.sql)); }
  async first<T>(): Promise<T | null> { this.db.record(this.sql); return (this.rule()?.first ?? null) as T | null; }
  async all<T>(): Promise<{ results: T[] }> { this.db.record(this.sql); return { results: (this.rule()?.all ?? []) as T[] }; }
  async run(): Promise<{ meta: { changes: number } }> { this.db.record(this.sql); return { meta: { changes: 1 } }; }
}

class FakeD1 {
  queries: string[] = [];
  constructor(public rules: StubRule[] = []) {}
  prepare(sql: string): FakeStatement { return new FakeStatement(sql, this); }
  record(sql: string): void { this.queries.push(sql); }
  async batch(stmts: unknown[]): Promise<unknown[]> {
    this.queries.push(`BATCH:${stmts.length}`);
    return [];
  }
  count(pattern: RegExp): number { return this.queries.filter((q) => pattern.test(q)).length; }
}

function row(i: number, status: "active" | "retired"): RefereeRow {
  return {
    id: `ref-${i}`, district: "Prachatice", first_name: "Jan", last_name: `Sudí${i}`,
    nickname: null, gender: "m", age: 40, occupation: "zedník", archetype: "pohodar",
    strictness: 50, card_happiness: 50, experience: 50, home_bias: 50, advantage: 50,
    fitness: 50, avatar: "{}", bio: "", hlaska: "", status,
  };
}

const POOL_QUERY = /SELECT \* FROM referees WHERE district = \? ORDER BY id/;

describe("ensureReferees", () => {
  it("s plnou listinou nic negeneruje a vrátí jen aktivní", async () => {
    const all = Array.from({ length: REFEREES_PER_DISTRICT }, (_, i) => row(i, "active"));
    const db = new FakeD1([{ match: POOL_QUERY, all }]);

    const out = await ensureReferees(db as unknown as D1Database, "Prachatice");

    expect(out).toHaveLength(REFEREES_PER_DISTRICT);
    expect(db.count(/BATCH:/)).toBe(0);
  });

  it("vyškrtnutý sudí NEspustí regeneraci poolu", async () => {
    // Patnáct řádků, ale jeden mimo listinu — přesně stav po vyškrtnutí.
    const all = Array.from({ length: REFEREES_PER_DISTRICT }, (_, i) =>
      row(i, i === 3 ? "retired" : "active"));
    const db = new FakeD1([{ match: POOL_QUERY, all }]);

    const out = await ensureReferees(db as unknown as D1Database, "Prachatice");

    expect(out).toHaveLength(REFEREES_PER_DISTRICT - 1);
    expect(out.every((r) => r.status === "active")).toBe(true);
    // Tohle je jádro regrese: žádný batch, žádné generování.
    expect(db.count(/BATCH:/)).toBe(0);
  });

  it("opakovaná volání po vyškrtnutí negenerují pool ani jednou", async () => {
    const all = Array.from({ length: REFEREES_PER_DISTRICT }, (_, i) =>
      row(i, i < 2 ? "retired" : "active"));
    const db = new FakeD1([{ match: POOL_QUERY, all }]);

    for (let i = 0; i < 5; i++) await ensureReferees(db as unknown as D1Database, "Prachatice");

    expect(db.count(/BATCH:/)).toBe(0);
    expect(db.count(POOL_QUERY)).toBe(5);
  });

  it("prázdný okres pool založí", async () => {
    const db = new FakeD1([
      { match: POOL_QUERY, all: [] },
      { match: /FROM district_surnames|SELECT .* surnames/i, all: [] },
    ]);

    await ensureReferees(db as unknown as D1Database, "Prachatice");

    expect(db.count(/BATCH:/)).toBe(1);
  });

  it("U21 sdílí listinu se seniory (sufix se ořezává)", async () => {
    const all = Array.from({ length: REFEREES_PER_DISTRICT }, (_, i) => row(i, "active"));
    const db = new FakeD1([{ match: POOL_QUERY, all }]);

    await ensureReferees(db as unknown as D1Database, "Prachatice U21");

    expect(db.count(/BATCH:/)).toBe(0);
  });
});
