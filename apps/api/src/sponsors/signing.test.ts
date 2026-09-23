/**
 * Podpis z jednání: zaplacená stavba a vybavení z podmínek, název stadionu podle sponzora,
 * zámek proti dvojímu podpisu, nová kontrola podmínek a vratka zálohy při výpovědi.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import { MONTHS_PER_SEASON } from "./ambition";
import type { NegotiationContext, Proposal } from "./negotiation";
import type { NegotiationRound, NegotiationState } from "./negotiation-db";
import {
  advanceItemsTotals, contractClawback, paidConstructionItems, signFromState, stadiumSponsorName, type AdvanceContract,
} from "./signing";

const CTX = {
  facilities: [{ facility: "vip_box", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] }],
  equipment: [{ category: "balls", currentLevel: 0, nextLevel: 1, cost: 6000, locked: false }],
} as unknown as NegotiationContext;

const P: Proposal = {
  seasons: 2, promises: [],
  demands: { monthly: 5000, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: "vip_box", equipment: "balls", payCurrentFee: false },
};

describe("paidConstructionItems", () => {
  it("stavba o úroveň výš a vybavení s cenou z ceníku", () => {
    expect(paidConstructionItems(P, CTX)).toEqual([
      { kind: "stadium", key: "vip_box", level: 2, cost: 170000 },
      { kind: "equipment", key: "balls", level: 1, cost: 6000 },
    ]);
  });
  it("bez požadavku nic", () => {
    expect(paidConstructionItems({ ...P, demands: { ...P.demands, construction: null, equipment: null } }, CTX)).toEqual([]);
  });
});

describe("stadiumSponsorName", () => {
  it("bez s.r.o., s Arenou", () => {
    expect(stadiumSponsorName("Truhlářství Novák s.r.o.")).toBe("Truhlářství Novák Arena");
  });
});

// ── Podpis nad falešnou D1 ──

const FULL_CTX: NegotiationContext = {
  category: "stadium", personality: "fan", wishes: [], budgetB: 10000, season: 3, leagueTeams: 14,
  expectedPosition: 7, cupTotalRounds: 7, lastAvgAttendance: 200, reputation: 50, licenceLevel: 1,
  sponsorType: "pub", sectorBannerActive: false,
  facilities: [{ facility: "vip_box", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] }],
  equipment: [{ category: "balls", currentLevel: 0, nextLevel: 1, cost: 6000, locked: false }],
  currentTerminationFee: 0,
};

const TERMS: Proposal = {
  seasons: 2, promises: [],
  demands: { monthly: 6000, winBonus: 0, signingBonus: 12000, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false },
};

function state(over: Partial<NegotiationState> = {}, negOver: Partial<NegotiationState["neg"]> = {}): NegotiationState {
  const rounds: NegotiationRound[] = [{ proposal: TERMS, response: { kind: "accept", text: "Beru.", gameDate: "2026-09-24T00:00:00.000Z" } }];
  return {
    neg: {
      id: "n1", teamId: "t1", sponsorId: 7, category: "stadium", wishes: [], budgetB: 10000, patience: 3,
      rounds, roundsRaw: JSON.stringify(rounds), status: "accepted", expiresGameDate: "2026-09-30T00:00:00.000Z", cooldownUntil: null,
      ...negOver,
    },
    team: {
      id: "t1", name: "SK Lhota", reputation: 50, budget: 100000, league_id: "l1", game_date: "2026-09-25T00:00:00.000Z",
      last_main_sponsor_change_season: null, district: "Prachatice", size: "obec",
    },
    sponsor: { id: 7, name: "Truhlářství Novák s.r.o.", type: "pub", district: "Prachatice", monthly_max: 3000 },
    owner: { sponsorId: 7, firstName: "Jan", lastName: "Novák", personality: "fan", faceConfig: {} } as unknown as NegotiationState["owner"],
    favor: 50,
    season: 3,
    ctx: FULL_CTX,
    isRenewal: false,
    contracts: { active: null, lastExpired: null },
    ...over,
  };
}

const CLAIM = /^UPDATE sponsor_negotiations SET status = 'signed'/;
const INSERT_CONTRACT = /INSERT INTO sponsor_contracts/;
const MONEY = /UPDATE teams SET budget = budget \+/;

function db(extra: Pravidlo[] = []): FalesnaD1 {
  return new FalesnaD1([...extra, { sql: MONEY, first: { budget: 1 } }]);
}

describe("signFromState", () => {
  it("podepíše přijatý návrh: smlouva s výpovědní pokutou a zálohou, příspěvek za podpis, název stadionu", async () => {
    const d = db();
    const res = await signFromState(jakoD1(d), state());
    expect(res).toMatchObject({ ok: true, newTeamName: null, reputationPenalty: 0 });
    const ins = d.dotazy.find((q) => INSERT_CONTRACT.test(q.sql))!;
    // monthly × sezóny × 2
    expect(ins.params[8]).toBe(6000 * 2 * 2);
    expect(ins.params[2]).toBe("Truhlářství Novák Arena");
    expect(ins.params[11]).toBe(12000);
    expect(d.pocet(MONEY)).toBe(1);
    expect(d.dotazy.some((q) => /UPDATE teams SET stadium_name/.test(q.sql) && q.params[0] === "Truhlářství Novák Arena")).toBe(true);
  });

  it("dvojklik: zámek neprojde, 409 a žádné peníze ani smlouva", async () => {
    const d = db([{ sql: CLAIM, changes: 0 }]);
    const res = await signFromState(jakoD1(d), state());
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(d.pocet(INSERT_CONTRACT)).toBe(0);
    expect(d.pocet(MONEY)).toBe(0);
  });

  it("firma mezitím podepsala jinde: jednání se vrátí do původního stavu, bez peněz", async () => {
    const d = db([{ sql: INSERT_CONTRACT, changes: 0 }]);
    const res = await signFromState(jakoD1(d), state());
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(d.dotazy.some((q) => /SET status = \? WHERE id = \? AND status = 'signed'/.test(q.sql) && q.params[0] === "accepted")).toBe(true);
    expect(d.pocet(MONEY)).toBe(0);
  });

  it("znovu ověří contractBlock: firma z jiného okresu, 409 bez zámku", async () => {
    const d = db();
    const st = state({ sponsor: { id: 7, name: "Madeta", type: "food", district: "Strakonice", monthly_max: 3000 } });
    const res = await signFromState(jakoD1(d), st);
    expect(res).toEqual({ ok: false, error: "Jednat jde jen s firmami z vlastního okresu", status: 409 });
    expect(d.pocet(CLAIM)).toBe(0);
  });

  it("znovu ověří podmínky: stavba, kterou už mezitím klub postavil, podepsat nejde", async () => {
    const withBuild: Proposal = { ...TERMS, demands: { ...TERMS.demands, construction: "vip_box" } };
    const rounds: NegotiationRound[] = [{ proposal: withBuild, response: { kind: "accept", text: "Beru.", gameDate: "2026-09-24T00:00:00.000Z" } }];
    const ctx = { ...FULL_CTX, facilities: [{ facility: "vip_box", currentLevel: 3, locked: true, costs: [0, 55000, 170000, 450000] }] };
    const d = db();
    const res = await signFromState(jakoD1(d), state({ ctx }, { rounds, roundsRaw: JSON.stringify(rounds) }));
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(d.pocet(CLAIM)).toBe(0);
  });

  it("vypršelé jednání 410, podepsané 409", async () => {
    expect(await signFromState(jakoD1(db()), state({}, { status: "expired" }))).toMatchObject({ ok: false, status: 410 });
    expect(await signFromState(jakoD1(db()), state({}, { status: "signed" }))).toMatchObject({ ok: false, status: 409 });
  });

  it("přechod od jiné firmy: pokutu zaplatí nový sponzor a stará záloha se vrací", async () => {
    const terms: Proposal = { ...TERMS, demands: { ...TERMS.demands, payCurrentFee: true } };
    const rounds: NegotiationRound[] = [{ proposal: terms, response: { kind: "accept", text: "Beru.", gameDate: "2026-09-24T00:00:00.000Z" } }];
    const old = { id: "c-old", sponsor_id: 3, sponsor_name: "Pila", monthly_amount: 3000, win_bonus: 0, seasons_remaining: 2, early_termination_fee: 18000, status: "active" as const };
    const d = db([{
      sql: /SELECT id, seasons_total, seasons_remaining, signing_bonus, paid_construction, negotiation_id FROM sponsor_contracts/,
      first: { id: "c-old", seasons_total: 3, seasons_remaining: 2, signing_bonus: 9000, paid_construction: null, negotiation_id: "n0" },
    }]);
    const res = await signFromState(jakoD1(d), state({
      ctx: { ...FULL_CTX, currentTerminationFee: 12000 },
      contracts: { active: old, lastExpired: null },
    }, { rounds, roundsRaw: JSON.stringify(rounds) }));
    expect(res.ok).toBe(true);
    const money = d.dotazy.filter((q) => MONEY.test(q.sql)).map((q) => q.params[0]);
    // zaplacená pokuta +12000, příspěvek +12000, pokuta −12000, vratka 9000 × 2/3 = −6000
    expect(money).toEqual([12000, 12000, -12000, -6000]);
    const ins = d.dotazy.find((q) => INSERT_CONTRACT.test(q.sql))!;
    expect(JSON.parse(ins.params[12] as string)).toEqual([{ kind: "current_fee", key: "c-old", level: 0, cost: 12000 }]);
  });
});

describe("vratka zálohy", () => {
  const base: AdvanceContract = {
    id: "c1", seasons_total: 2, seasons_remaining: 1, signing_bonus: 12000,
    paid_construction: JSON.stringify([{ kind: "stadium", key: "vip_box", level: 2, cost: 170000 }, { kind: "current_fee", key: "c0", level: 0, cost: 4000 }]),
    negotiation_id: "n1",
  };

  it("součty podle druhu", () => {
    expect(advanceItemsTotals(base.paid_construction, "c1")).toEqual({ construction: 170000, equipment: 0, paidFee: 4000 });
    expect(advanceItemsTotals("nesmysl", "c1")).toEqual({ construction: 0, equipment: 0, paidFee: 0 });
  });

  it("po jedné ze dvou sezón vrací klub polovinu, včetně vyplacených termínových bonusů", async () => {
    const d = new FalesnaD1([{ sql: /FROM sponsor_promises/, first: { total: 2000 } }]);
    expect(await contractClawback(jakoD1(d), base)).toBe(Math.round(((12000 + 170000 + 4000 + 2000) * MONTHS_PER_SEASON) / (2 * MONTHS_PER_SEASON)));
    const q = d.dotazy.find((x) => /FROM sponsor_promises/.test(x.sql))!;
    expect(q.params).toEqual(["c1", "coach_licence", "stadium_upgrade", "jersey_logo"]);
  });

  it("smlouva bez jednání nic nevrací", async () => {
    const d = new FalesnaD1();
    expect(await contractClawback(jakoD1(d), { ...base, negotiation_id: null })).toBe(0);
    expect(d.dotazy).toHaveLength(0);
  });

  it("smlouva podepsaná letos vrací všechno", async () => {
    const d = new FalesnaD1([{ sql: /FROM sponsor_promises/, first: { total: 0 } }]);
    expect(await contractClawback(jakoD1(d), { ...base, seasons_remaining: 2, paid_construction: null })).toBe(12000);
  });
});
