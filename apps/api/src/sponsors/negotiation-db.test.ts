/**
 * DB vrstva jednání nad falešnou D1: kolo se zapisuje s optimistickým zámkem, expirace
 * a cooldown jedou v herním čase, rollover jednání uzavře.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import {
  closeNegotiationsForRollover, cooldownUntil, findActiveNegotiation, parseNegotiation, pendingTerms, saveRound,
  type NegotiationRound,
} from "./negotiation-db";
import type { Proposal } from "./negotiation";

const PROPOSAL: Proposal = {
  seasons: 2, promises: [],
  demands: { monthly: 5000, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false },
};

const ROW = {
  id: "n1", team_id: "t1", sponsor_id: 7, category: "main" as const, wishes: '["youth","attendance"]', budget_b: 10000,
  patience: 3, rounds: "[]", status: "open" as const, expires_game_date: "2026-09-30T00:00:00.000Z",
  cooldown_until: null, created_at: "2026-09-23 10:00:00",
};

function round(kind: NegotiationRound["response"]["kind"], counter?: Proposal): NegotiationRound {
  return { proposal: PROPOSAL, response: { kind, text: "x", gameDate: "2026-09-24T00:00:00.000Z", ...(counter ? { counter } : {}) } };
}

describe("parseNegotiation", () => {
  it("převede řádek, neznámá přání zahodí", () => {
    const n = parseNegotiation({ ...ROW, wishes: '["youth","nesmysl"]' });
    expect(n.wishes).toEqual(["youth"]);
    expect(n.rounds).toEqual([]);
    expect(n.roundsRaw).toBe("[]");
  });
});

describe("pendingTerms", () => {
  it("přijatý návrh: podepisuje se poslední návrh klubu", () => {
    const n = { ...parseNegotiation(ROW), status: "accepted" as const, rounds: [round("accept")] };
    expect(pendingTerms(n)).toEqual(PROPOSAL);
  });
  it("otevřené s protinabídkou: podepisuje se protinabídka", () => {
    const counter = { ...PROPOSAL, demands: { ...PROPOSAL.demands, monthly: 4500 } };
    const n = { ...parseNegotiation(ROW), rounds: [round("counter_money", counter)] };
    expect(pendingTerms(n)).toEqual(counter);
  });
  it("po odmítnutí není co podepsat", () => {
    const n = { ...parseNegotiation(ROW), rounds: [round("reject")] };
    expect(pendingTerms(n)).toBeNull();
  });
});

describe("saveRound", () => {
  it("zapisuje s podmínkou na původní kola a stav open", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET rounds/, changes: 1 }]);
    const ok = await saveRound(jakoD1(db), parseNegotiation(ROW), round("reject"), { status: "open", patience: 2, cooldownUntil: null });
    expect(ok).toBe(true);
    const q = db.dotazy.find((d) => /UPDATE sponsor_negotiations SET rounds/.test(d.sql))!;
    expect(q.sql).toContain("status = 'open' AND rounds = ?");
    expect(q.params[1]).toBe("open");
    expect(q.params[2]).toBe(2);
    expect(q.params[4]).toBe("n1");
    expect(q.params[5]).toBe("[]");
  });
  it("souběžný návrh prohraje zámek", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET rounds/, changes: 0 }]);
    expect(await saveRound(jakoD1(db), parseNegotiation(ROW), round("reject"), { status: "open", patience: 2, cooldownUntil: null })).toBe(false);
  });
});

describe("findActiveNegotiation", () => {
  it("prošlé jednání (herní čas) se označí expired a nevrátí se", async () => {
    const db = new FalesnaD1([{ sql: /FROM sponsor_negotiations WHERE team_id = \? AND sponsor_id = \? AND category/, first: ROW }]);
    const n = await findActiveNegotiation(jakoD1(db), "t1", 7, "main", "2026-10-02T00:00:00.000Z");
    expect(n).toBeNull();
    expect(db.pocet(/SET status = 'expired' WHERE id = \?/)).toBe(1);
  });
});

describe("cooldownUntil", () => {
  it("platí do data v herním čase", async () => {
    const db = new FalesnaD1([{ sql: /MAX\(cooldown_until\)/, first: { c: "2026-10-07T00:00:00.000Z" } }]);
    expect(await cooldownUntil(jakoD1(db), "t1", 7, "2026-10-01T00:00:00.000Z")).toBe("2026-10-07T00:00:00.000Z");
    expect(await cooldownUntil(jakoD1(db), "t1", 7, "2026-10-08T00:00:00.000Z")).toBeNull();
  });
});

describe("closeNegotiationsForRollover", () => {
  it("uzavře otevřená a přijatá jednání a smaže cooldowny", async () => {
    const db = new FalesnaD1();
    await closeNegotiationsForRollover(jakoD1(db));
    expect(db.davky).toHaveLength(1);
    expect(db.davky[0][0].sql).toContain("SET status = 'expired' WHERE status IN ('open','accepted')");
    expect(db.davky[0][1].sql).toContain("SET cooldown_until = NULL");
  });
});
