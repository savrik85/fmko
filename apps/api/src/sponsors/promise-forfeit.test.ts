/**
 * Propadlé sliby při výpovědi smlouvy klubem: výběr slibů (aktuální sezóna a termínové, budoucí
 * sezóny ne), pokuta a náklonnost podmíněné nárokem, bez počítání porušení, a výpověď ve stejné
 * dávce (routes/game.ts terminate).
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import {
  forfeitPenaltiesByContract, forfeitPenaltyTotal, prepareForfeit, terminateWithForfeit, type ForfeitRow,
} from "./promise-forfeit";

const ROWS: ForfeitRow[] = [
  { id: "p-season", contract_id: "c1", sponsor_id: 7, kind: "league_position", params: '{"position":3}', season: 5, penalty: 8000 },
  { id: "p-logo", contract_id: "c1", sponsor_id: 7, kind: "jersey_logo", params: "{}", season: null, penalty: 3000 },
];
const SELECT = /FROM sponsor_promises p WHERE p\.contract_id = \?/;
const CLAIM = /^UPDATE sponsor_promises SET status = 'broken', resolved_at = \?/;
const END = /^UPDATE sponsor_contracts SET status = 'terminated'/;
const MONEY = /^UPDATE teams SET budget = budget \+/;

function db(extra: Pravidlo[] = []): FalesnaD1 {
  return new FalesnaD1([{ sql: SELECT, all: ROWS }, ...extra]);
}

describe("prepareForfeit", () => {
  it("vybere čekající sliby aktuální sezóny a termínové, sečte plné pokuty", async () => {
    const d = db();
    const f = await prepareForfeit(jakoD1(d), "c1", 5);
    expect(f.total).toBe(11000);
    expect(f.rows.map((r) => r.id)).toEqual(["p-season", "p-logo"]);
    const sel = d.dotazy.find((q) => SELECT.test(q.sql))!;
    expect(sel.params).toEqual(["c1", 5]);
    // Budoucí sezóny (season != aktuální) a exkluzivita oboru (season NULL, není termínová) nepropadají.
    expect(sel.sql).toContain("p.status = 'pending'");
    expect(sel.sql).toMatch(/p\.season = \? AND p\.kind IN \('league_position'/);
    expect(sel.sql).toContain("OR p.kind IN ('coach_licence', 'stadium_upgrade', 'jersey_logo')");
    expect(sel.sql).not.toContain("sector_exclusivity");
    // Bez pohárového slibu se počet kol poháru nenačítá.
    expect(d.pocet(/FROM cup_competitions/)).toBe(0);
  });

  it("součet bez záporných a nečíselných pokut", () => {
    expect(forfeitPenaltyTotal([{ ...ROWS[0], penalty: -5 }, { ...ROWS[1], penalty: 1200.4 }])).toBe(1200);
  });
});

describe("terminateWithForfeit", () => {
  it("sliby propadnou a smlouva skončí v jedné dávce, konec smlouvy poslední", async () => {
    const d = db();
    const forfeit = await prepareForfeit(jakoD1(d), "c1", 5);
    const ended = await terminateWithForfeit(jakoD1(d), { teamId: "t1", contractId: "c1", sponsorName: "Pivovar Lhota", forfeit, gameDate: "2026-10-10T00:00:00.000Z" });
    expect(ended).toBe(true);
    expect(d.davky).toHaveLength(1);
    const batch = d.davky[0];
    expect(END.test(batch[batch.length - 1].sql)).toBe(true);
    const claims = batch.filter((q) => CLAIM.test(q.sql));
    expect(claims.map((c) => c.params[1])).toEqual(["p-season", "p-logo"]);
    // Nárok jen u čekajícího slibu a jen dokud je smlouva aktivní.
    for (const c of claims) {
      expect(c.sql).toContain("status = 'pending'");
      expect(c.sql).toContain("FROM sponsor_contracts WHERE id = ? AND status = 'active'");
      expect(c.params[2]).toBe("c1");
    }
    // Plná pokuta s referencí promise:<id>, jen se značkou nároku (opakování nic nestrhne).
    expect(batch.filter((q) => MONEY.test(q.sql)).map((q) => q.params[0])).toEqual([-8000, -3000]);
    const tx = batch.filter((q) => /INSERT INTO transactions/.test(q.sql));
    expect(tx.map((q) => q.params[6])).toEqual(["promise:p-season", "promise:p-logo"]);
    const tokens = claims.map((c) => c.params[0] as string);
    expect(tokens.every((t) => t.startsWith("forfeit:"))).toBe(true);
    expect(tx.map((q) => q.params[q.params.length - 1])).toEqual(tokens);
    // Náklonnost −8 za každý slib, porušení se nepočítá.
    const favor = batch.filter((q) => /INSERT INTO sponsor_favor_log/.test(q.sql));
    expect(favor.map((q) => q.params[2])).toEqual([-8, -8]);
    expect(String(favor[0].params[3])).toBe("porušený slib: skončit do 3. místa");
    expect(batch.some((q) => /breaches_season/.test(q.sql))).toBe(false);
  });

  it("smlouvu už ukončil někdo jiný: false (nárok slibů hlídá aktivní smlouvu, nic se nestrhne)", async () => {
    const d = db([{ sql: END, changes: 0 }]);
    const forfeit = await prepareForfeit(jakoD1(d), "c1", 5);
    expect(await terminateWithForfeit(jakoD1(d), { teamId: "t1", contractId: "c1", sponsorName: "Pivovar Lhota", forfeit, gameDate: "2026-10-10" })).toBe(false);
  });

  it("bez propadajících slibů jen konec smlouvy", async () => {
    const d = new FalesnaD1();
    const forfeit = await prepareForfeit(jakoD1(d), "c1", 5);
    expect(forfeit).toEqual({ rows: [], total: 0, cupTotalRounds: undefined });
    expect(await terminateWithForfeit(jakoD1(d), { teamId: "t1", contractId: "c1", sponsorName: "X", forfeit, gameDate: "2026-10-10" })).toBe(true);
    expect(d.davky[0]).toHaveLength(1);
  });
});

describe("forfeitPenaltiesByContract", () => {
  it("součet po aktivních smlouvách klubu pro dialog výpovědi", async () => {
    const d = new FalesnaD1([{ sql: /JOIN sponsor_contracts sc ON sc\.id = p\.contract_id/, all: [
      ...ROWS, { ...ROWS[0], id: "p-x", contract_id: "c2", penalty: 1000 }, { ...ROWS[0], id: "p-0", contract_id: "c3", penalty: 0 },
    ] }]);
    const m = await forfeitPenaltiesByContract(jakoD1(d), "t1", 5);
    expect(m).toEqual(new Map([["c1", 11000], ["c2", 1000]]));
    const q = d.dotazy[0];
    expect(q.sql).toContain("sc.status = 'active'");
    expect(q.params).toEqual(["t1", 5]);
  });
});
