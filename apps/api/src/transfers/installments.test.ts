/**
 * Splátky přestupů a procenta z příštího přestupu (spec 2026-10-03).
 * Těžiště: splátka se strhne i do minusu, nikdy dvakrát, poslední doplatí přesný zbytek,
 * prodej dál doplatí dluh a vyplatí procenta.
 */
import { describe, it, expect } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { processTransferInstallments, settleOnResale, lapseSellOnClauses } from "./installments";

const deal = (over: Record<string, unknown> = {}) => ({
  id: "d1", seller_team_id: "S", player_name: "Jan Novák",
  installment_amount: 10_500, installments_total: 4, installments_paid: 1, remaining: 31_500, ...over,
});
const transactions = (db: FalesnaD1) => db.dotazy.filter((d) => /INSERT INTO transactions/.test(d.sql)).map((d) => d.params);

describe("pondělní splátky", () => {
  it("strhne jednu splátku kupujícímu a připíše ji prodávajícímu, i do minusu", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE buyer_team_id = \? AND status = 'active'/, all: [deal()] },
      { sql: /UPDATE transfer_installments SET installments_paid/, changes: 1 },
      { sql: /UPDATE teams SET budget = budget \+ \?/, first: { budget: -5_000 } },
    ]);
    expect(await processTransferInstallments(jakoD1(db), "B", "2026-10-12")).toBe(1);
    const tx = transactions(db);
    expect(tx.map((p) => [p[1], p[2], p[3]])).toEqual([["B", "transfer_installment", -10_500], ["S", "transfer_installment_income", 10_500]]);
    expect(tx[0][6]).toBe("inst-d1-2");
    expect(tx[0][5]).toBe("Splátka za Jan Novák 2/4");
  });

  it("splátku, kterou mezitím zabral jiný běh, nestrhne podruhé", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE buyer_team_id/, all: [deal()] },
      { sql: /UPDATE transfer_installments SET installments_paid/, changes: 0 },
    ]);
    expect(await processTransferInstallments(jakoD1(db), "B", "2026-10-12")).toBe(0);
    expect(db.pocet(/INSERT INTO transactions/)).toBe(0);
  });

  it("druhý běh téhož pondělí ani dohoda uzavřená ten den nic nestrhnou", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE buyer_team_id/, all: [
        deal({ last_paid_game_date: "2026-10-12" }),
        deal({ id: "d2", created_game_date: "2026-10-12" }),
      ] },
    ]);
    expect(await processTransferInstallments(jakoD1(db), "B", "2026-10-12")).toBe(0);
    expect(db.pocet(/UPDATE transfer_installments/)).toBe(0);
    expect(db.pocet(/INSERT INTO transactions/)).toBe(0);
  });

  it("splátku zabírá jen řádek, který ten den ještě neplatil", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE buyer_team_id/, all: [deal({ last_paid_game_date: "2026-10-05" })] },
      { sql: /UPDATE transfer_installments SET installments_paid/, changes: 1 },
      { sql: /UPDATE teams SET budget = budget \+ \?/, first: { budget: 0 } },
    ]);
    await processTransferInstallments(jakoD1(db), "B", "2026-10-12");
    const upd = db.dotazy.find((d) => /UPDATE transfer_installments SET installments_paid/.test(d.sql))!;
    expect(upd.sql).toMatch(/COALESCE\(last_paid_game_date, ''\) != \?/);
    expect(upd.params).toEqual([2, 21_000, "active", null, "2026-10-12", "d1", 1, "2026-10-12"]);
  });

  it("poslední splátka doplatí přesný zbytek a dohodu uzavře", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE buyer_team_id/, all: [deal({ installments_paid: 3, remaining: 10_501 })] },
      { sql: /UPDATE transfer_installments SET installments_paid/, changes: 1 },
      { sql: /UPDATE teams SET budget = budget \+ \?/, first: { budget: 1 } },
    ]);
    await processTransferInstallments(jakoD1(db), "B", "2026-10-12");
    const upd = db.dotazy.find((d) => /UPDATE transfer_installments SET installments_paid/.test(d.sql))!;
    expect(upd.params.slice(0, 3)).toEqual([4, 0, "paid"]);
    expect(transactions(db)[0][3]).toBe(-10_501);
  });
});

describe("prodej hráče dál", () => {
  it("doplatí zbytek dluhu a vyplatí procenta z ceny, i když je prodávající v minusu", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments\s+WHERE player_id = \? AND buyer_team_id = \? AND status = 'active'/, first: { id: "d1", seller_team_id: "S", player_name: "X", remaining: 42_000 } },
      { sql: /FROM sell_on_clauses\s+WHERE player_id = \? AND owner_team_id = \? AND status = 'active'/, first: { id: "c1", beneficiary_team_id: "S", player_name: "X", pct: 15 } },
      { sql: /UPDATE transfer_installments SET status = 'settled'/, changes: 1 },
      { sql: /UPDATE sell_on_clauses SET status = 'paid'/, changes: 1 },
      { sql: /UPDATE teams SET budget = budget \+ \?/, first: { budget: -1 } },
    ]);
    expect(await settleOnResale(jakoD1(db), { playerId: "p", ownerClubTeamId: "B", saleAmount: 60_000, saleOfferId: "o2", gameDate: "2026-10-12" }))
      .toEqual({ settled: 42_000, sellOn: 9_000 });
    expect(transactions(db).map((p) => [p[1], p[2], p[3]])).toEqual([
      ["B", "transfer_installment_settlement", -42_000],
      ["S", "transfer_installment_settlement_income", 42_000],
      ["B", "sell_on_fee", -9_000],
      ["S", "sell_on_income", 9_000],
    ]);
  });

  it("bez dohody a doložky nedělá nic", async () => {
    const db = new FalesnaD1([]);
    expect(await settleOnResale(jakoD1(db), { playerId: "p", ownerClubTeamId: "B", saleAmount: 60_000, saleOfferId: "o2", gameDate: "d" }))
      .toEqual({ settled: 0, sellOn: 0 });
    expect(db.pocet(/INSERT INTO transactions/)).toBe(0);
  });

  it("dohodu, kterou mezitím vyrovnal jiný běh, nedoplácí podruhé", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments\s+WHERE player_id/, first: { id: "d1", seller_team_id: "S", player_name: "X", remaining: 42_000 } },
      { sql: /UPDATE transfer_installments SET status = 'settled'/, changes: 0 },
    ]);
    expect((await settleOnResale(jakoD1(db), { playerId: "p", ownerClubTeamId: "B", saleAmount: 1, saleOfferId: "o", gameDate: "d" })).settled).toBe(0);
    expect(db.pocet(/INSERT INTO transactions/)).toBe(0);
  });
});

describe("odchod bez peněz", () => {
  it("procenta propadnou", async () => {
    const db = new FalesnaD1([]);
    await lapseSellOnClauses(jakoD1(db), "p");
    expect(db.pocet(/UPDATE sell_on_clauses SET status = 'lapsed'/)).toBe(1);
  });
});
