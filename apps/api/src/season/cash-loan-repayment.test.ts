/**
 * Splátka hotovostní půjčky po zápase.
 *
 * Těžiště je idempotence: když zápas zpracují dva běhy (incident 2026-09-21,
 * konzumer z 16:00 + recovery z 16:05), smí se za jeden zápas strhnout
 * nejvýš jedna splátka.
 */

import { describe, it, expect } from "vitest";
import { processCashLoanRepayment } from "./finance-processor";

interface StubRule {
  match: RegExp;
  first?: unknown;
  changes?: number;
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
    this.db.queries.push({ sql: this.sql, params: this.params });
    return (this.rule()?.first ?? null) as T | null;
  }
  async run(): Promise<{ meta: { changes: number } }> {
    this.db.queries.push({ sql: this.sql, params: this.params });
    return { meta: { changes: this.rule()?.changes ?? 1 } };
  }
}

class FakeD1 {
  queries: Array<{ sql: string; params: unknown[] }> = [];
  constructor(public rules: StubRule[]) {}
  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }
  count(pattern: RegExp): number {
    return this.queries.filter((q) => pattern.test(q.sql)).length;
  }
}

const TEAM = "tym-1";
const MATCH = "zapas-1";
const LOAN = {
  id: "pujcka-1",
  remaining: 12_000,
  per_match_installment: 1_000,
  total_installments: 12,
  installments_paid: 4,
};

const loanRule: StubRule = { match: /FROM cash_loans WHERE team_id = \? AND status = 'active'/, first: LOAN };
const budgetRule: StubRule = { match: /UPDATE teams SET budget = budget \+ \?/, first: { budget: 50_000 } };

const run = (db: FakeD1) =>
  processCashLoanRepayment(db as unknown as D1Database, TEAM, MATCH, "2026-09-21T16:05:00.000Z");

describe("processCashLoanRepayment", () => {
  it("strhne jednu splátku a posune půjčku jen z očekávaného stavu", async () => {
    const db = new FakeD1([loanRule, budgetRule]);

    await run(db);

    expect(db.count(/UPDATE teams SET budget/)).toBe(1);
    const deducted = db.queries.find((q) => /UPDATE teams SET budget/.test(q.sql));
    expect(deducted?.params[0]).toBe(-1_000);

    const loanUpdate = db.queries.find((q) => /UPDATE cash_loans/.test(q.sql));
    expect(loanUpdate?.sql).toMatch(/installments_paid = \?/);
    expect(loanUpdate?.sql).toMatch(/WHERE id = \? AND installments_paid = \?/);
    expect(loanUpdate?.params).toContain(5); // nový počet splátek
    expect(loanUpdate?.params.at(-1)).toBe(4); // podmínka na původní počet
  });

  it("za zápas, za který už splátka proběhla, nestrhne nic", async () => {
    const db = new FakeD1([
      { match: /FROM transactions WHERE team_id = \? AND type = 'cash_loan_repayment' AND reference_id = \?/, first: { x: 1 } },
      loanRule,
      budgetRule,
    ]);

    await run(db);

    expect(db.count(/UPDATE teams SET budget/)).toBe(0);
    expect(db.count(/UPDATE cash_loans/)).toBe(0);
    expect(db.count(/INSERT INTO transactions/)).toBe(0);
  });

  it("když splátku mezitím zabral souběžný běh, peníze nestrhne", async () => {
    const db = new FakeD1([
      loanRule,
      { match: /UPDATE cash_loans/, changes: 0 },
      budgetRule,
    ]);

    await run(db);

    expect(db.count(/UPDATE teams SET budget/)).toBe(0);
    expect(db.count(/INSERT INTO transactions/)).toBe(0);
  });

  it("poslední splátka dorovná zbytek a půjčku uzavře", async () => {
    const db = new FakeD1([
      { ...loanRule, first: { ...LOAN, remaining: 1_004, installments_paid: 11 } },
      budgetRule,
    ]);

    await run(db);

    const deducted = db.queries.find((q) => /UPDATE teams SET budget/.test(q.sql));
    expect(deducted?.params[0]).toBe(-1_004);
    const loanUpdate = db.queries.find((q) => /UPDATE cash_loans/.test(q.sql));
    expect(loanUpdate?.params).toContain("paid");
  });
});
