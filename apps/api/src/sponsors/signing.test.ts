/**
 * Podpis z jednání: zaplacená stavba a vybavení z podmínek, název stadionu podle sponzora,
 * zámek proti dvojímu podpisu, nová kontrola podmínek a vratka zálohy při výpovědi.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo, type ZaznamDotazu } from "../incidents/testovaci-d1";
import { MONTHS_PER_SEASON } from "./ambition";
import type { NegotiationContext, Proposal } from "./negotiation";
import type { NegotiationRound, NegotiationState } from "./negotiation-db";
import { MAIN_SPONSOR_FREE_SQL } from "./exclusivity";
import { effectiveContractMonths, openingOffer } from "./negotiation";
import {
  OTHER_ACTIVE_IN_CATEGORY_FREE_SQL, viewWithClawback,
  advanceItemsTotals, clawbackAmount, contractClawback, paidConstructionItems, parseAdvance, seasonProgressMonths, signFromState,
  stadiumSponsorName, type AdvanceContract,
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

const MPS = MONTHS_PER_SEASON;

const FULL_CTX: NegotiationContext = {
  category: "stadium", personality: "fan", wishes: [], budgetB: 10000, season: 3, leagueTeams: 14,
  expectedPosition: 7, cupTotalRounds: 7, lastAvgAttendance: 200, reputation: 50, licenceLevel: 1,
  sponsorType: "pub", sectorBannerActive: false, sleeveHeldBySponsor: false,
  facilities: [{ facility: "vip_box", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] }],
  equipment: [{ category: "balls", currentLevel: 0, nextLevel: 1, cost: 6000, locked: false }],
  currentTerminationFee: 0, seasonProgressMonths: 0,
};

const TERMS: Proposal = {
  seasons: 2, promises: [],
  demands: { monthly: 6000, winBonus: 0, signingBonus: 12000, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false },
};

const accepted = (p: Proposal): NegotiationRound[] => [{ proposal: p, response: { kind: "accept", text: "Beru.", gameDate: "2026-09-24T00:00:00.000Z" } }];

function state(over: Partial<NegotiationState> = {}, negOver: Partial<NegotiationState["neg"]> = {}, terms: Proposal = TERMS): NegotiationState {
  const rounds = accepted(terms);
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
const END_OLD = /^UPDATE sponsor_contracts SET status = \? WHERE id = \? AND status = 'active'/;
const NEW_GUARD = "EXISTS (SELECT 1 FROM sponsor_contracts WHERE id = ?)";
/** Herní datum přesně v půlce sezóny: postup = půl sezóny v měsících. */
const HALF = { game_date: "2026-10-01T00:00:00.000Z", season_start: "2026-09-01T00:00:00.000Z", season_end: "2026-10-31T00:00:00.000Z", league_id: "l1" };

function db(extra: Pravidlo[] = []): FalesnaD1 {
  return new FalesnaD1(extra);
}
const batchQueries = (d: FalesnaD1): ZaznamDotazu[] => d.davky.flat();
const money = (d: FalesnaD1): unknown[] => batchQueries(d).filter((q) => MONEY.test(q.sql)).map((q) => q.params[0]);
const insertOf = (d: FalesnaD1): ZaznamDotazu => batchQueries(d).find((q) => INSERT_CONTRACT.test(q.sql))!;

describe("signFromState", () => {
  it("podepíše přijatý návrh: smlouva s výpovědní pokutou a zálohou, příspěvek za podpis, název stadionu", async () => {
    const d = db();
    const res = await signFromState(jakoD1(d), state({ ctx: { ...FULL_CTX, seasonProgressMonths: MPS / 2 } }));
    expect(res).toMatchObject({ ok: true, newTeamName: null, reputationPenalty: 0 });
    const ins = insertOf(d);
    // monthly × sezóny × 2
    expect(ins.params[8]).toBe(6000 * 2 * 2);
    expect(ins.params[2]).toBe("Truhlářství Novák Arena");
    expect(ins.params[11]).toBe(12000);
    expect(JSON.parse(ins.params[12] as string)).toEqual({ items: [], startOffsetMonths: MPS / 2 });
    expect(money(d)).toEqual([12000]);
    expect(batchQueries(d).filter((q) => /INSERT INTO transactions/.test(q.sql))).toHaveLength(1);
    // Všechno v jedné dávce, peníze jen se smlouvou.
    expect(d.davky).toHaveLength(1);
    expect(batchQueries(d).filter((q) => MONEY.test(q.sql)).every((q) => q.sql.includes(NEW_GUARD))).toBe(true);
    expect(d.dotazy.some((q) => /UPDATE teams SET stadium_name/.test(q.sql) && q.params[0] === "Truhlářství Novák Arena")).toBe(true);
  });

  it("dvojklik: zámek neprojde, 409 a žádné peníze ani smlouva", async () => {
    const d = db([{ sql: CLAIM, changes: 0 }]);
    const res = await signFromState(jakoD1(d), state());
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(d.davky).toHaveLength(0);
  });

  it("firma mezitím podepsala jinde: jednání se vrátí do původního stavu", async () => {
    const d = db([{ sql: INSERT_CONTRACT, changes: 0 }]);
    const res = await signFromState(jakoD1(d), state());
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(d.dotazy.some((q) => /SET status = \? WHERE id = \? AND status = 'signed'/.test(q.sql) && q.params[0] === "accepted")).toBe(true);
  });

  it("dva souběžné podpisy v kategorii: INSERT hlídá jinou aktivní smlouvu klubu v kategorii", async () => {
    const d = db();
    await signFromState(jakoD1(d), state());
    const ins = insertOf(d);
    expect(ins.sql).toContain(`AND ${OTHER_ACTIVE_IN_CATEGORY_FREE_SQL}`);
    // Bez nahrazované smlouvy: id != '' (nic se nevylučuje).
    expect(ins.params.slice(-3)).toEqual(["t1", "stadium", ""]);
  });

  it("souběžný podpis v kategorii vyhrál: 409 s jeho jménem, jednání se vrátí, žádné peníze", async () => {
    const d = db([{ sql: INSERT_CONTRACT, changes: 0 }, { sql: /^SELECT sponsor_name FROM sponsor_contracts/, first: { sponsor_name: "Pila Arena" } }]);
    const res = await signFromState(jakoD1(d), state());
    expect(res).toEqual({ ok: false, error: "Mezitím jsi podepsal smlouvu s Pila Arena, načti stránku znovu", status: 409 });
    expect(d.dotazy.some((q) => /SET status = \? WHERE id = \? AND status = 'signed'/.test(q.sql) && q.params[0] === "accepted")).toBe(true);
  });

  it("pád dávky: jednání se vrátí a chyba letí dál", async () => {
    const d = db();
    d.batch = async () => { throw new Error("D1 down"); };
    await expect(signFromState(jakoD1(d), state())).rejects.toThrow("D1 down");
    expect(d.dotazy.some((q) => /AND status = 'signed'/.test(q.sql) && q.params[0] === "accepted")).toBe(true);
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
    const ctx = { ...FULL_CTX, facilities: [{ facility: "vip_box", currentLevel: 3, locked: true, costs: [0, 55000, 170000, 450000] }] };
    const d = db();
    const res = await signFromState(jakoD1(d), state({ ctx }, {}, withBuild));
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(d.pocet(CLAIM)).toBe(0);
  });

  it("vypršelé jednání 410, podepsané 409", async () => {
    expect(await signFromState(jakoD1(db()), state({}, { status: "expired" }))).toMatchObject({ ok: false, status: 410 });
    expect(await signFromState(jakoD1(db()), state({}, { status: "signed" }))).toMatchObject({ ok: false, status: 409 });
  });

  it("protinabídka majitele se podepisuje ze stavu open", async () => {
    const counter: Proposal = { ...TERMS, demands: { ...TERMS.demands, monthly: 5500, signingBonus: 8000 } };
    const rounds: NegotiationRound[] = [{ proposal: TERMS, response: { kind: "counter_money", text: "Tolik ne.", counter, gameDate: "2026-09-24T00:00:00.000Z" } }];
    const d = db();
    const res = await signFromState(jakoD1(d), state({}, { status: "open", rounds, roundsRaw: JSON.stringify(rounds) }));
    expect(res.ok).toBe(true);
    const claim = d.dotazy.find((q) => CLAIM.test(q.sql))!;
    expect(claim.params).toEqual(["n1", "t1", "open", JSON.stringify(rounds)]);
    expect(insertOf(d).params[4]).toBe(5500);
    expect(money(d)).toEqual([8000]);
  });

  it("úvodní nabídka majitele se podepisuje hned ze stavu open", async () => {
    const ctx: NegotiationContext = { ...FULL_CTX, wishes: ["youth", "no_riots"], seasonProgressMonths: 1 };
    const offer = openingOffer(ctx);
    expect(offer.promises.map((p) => p.kind)).toEqual(["youth", "no_riots"]);
    const rounds: NegotiationRound[] = [{
      proposal: offer,
      response: { kind: "offer", text: "Tady je, co ti dám.", counter: offer, gameDate: "2026-09-24T00:00:00.000Z", progressMonths: 1 },
    }];
    const d = db();
    const res = await signFromState(jakoD1(d), state({ ctx }, { status: "open", rounds, roundsRaw: JSON.stringify(rounds) }));
    expect(res.ok).toBe(true);
    const claim = d.dotazy.find((q) => CLAIM.test(q.sql))!;
    expect(claim.params).toEqual(["n1", "t1", "open", JSON.stringify(rounds)]);
    expect(insertOf(d).params[4]).toBe(offer.demands.monthly);
    expect(offer.demands.signingBonus).toBeGreaterThan(0);
    expect(money(d)).toEqual([offer.demands.signingBonus]);
  });

  const OLD = { id: "c-old", sponsor_id: 3, sponsor_name: "Pila", monthly_amount: 3000, win_bonus: 0, seasons_remaining: 2, early_termination_fee: 18000, status: "active" as const, negotiation_id: "n0" };
  const OLD_ADVANCE: Pravidlo = {
    sql: /SELECT id, seasons_total, seasons_remaining, signing_bonus, paid_construction, negotiation_id FROM sponsor_contracts/,
    first: { id: "c-old", seasons_total: 3, seasons_remaining: 2, signing_bonus: 9000, paid_construction: JSON.stringify({ items: [], startOffsetMonths: 0 }), negotiation_id: "n0" },
  };
  const switchState = () => state({ ctx: { ...FULL_CTX, currentTerminationFee: 12000 }, contracts: { active: OLD, lastExpired: null } }, {},
    { ...TERMS, demands: { ...TERMS.demands, payCurrentFee: true } });

  it("přechod od jiné firmy: pokutu zaplatí nový sponzor, stará záloha se vrací, stará smlouva končí až po platbách", async () => {
    const d = db([OLD_ADVANCE]);
    const res = await signFromState(jakoD1(d), switchState());
    expect(res.ok).toBe(true);
    // zaplacená pokuta +12000, příspěvek +12000, pokuta −12000, vratka 9000 × 2/3 = −6000
    expect(money(d)).toEqual([12000, 12000, -12000, -6000]);
    expect(JSON.parse(insertOf(d).params[12] as string).items).toEqual([{ kind: "current_fee", key: "c-old", level: 0, cost: 12000 }]);
    const q = batchQueries(d);
    const endIdx = q.findIndex((x) => END_OLD.test(x.sql));
    expect(endIdx).toBe(q.length - 1);
    expect(q[endIdx].params.slice(0, 2)).toEqual(["terminated", "c-old"]);
    // Platby za starou smlouvu jen dokud je aktivní.
    const oldMoney = q.filter((x) => MONEY.test(x.sql) && x.params[0] !== 12000 || (MONEY.test(x.sql) && x.params.includes("c-old")));
    expect(oldMoney.every((x) => x.params.includes("c-old") && /status = 'active'/.test(x.sql))).toBe(true);
  });

  it("pohled na jednání ukazuje vratku zálohy současné smlouvy a skutečné délky smlouvy", async () => {
    const d = db([OLD_ADVANCE]);
    const st = switchState();
    // Stará smlouva na 3 sezóny, zbývají 2, půlka sezóny: uplynulo 1,5 z 3 sezón, vrací se 9000 / 2.
    const view = await viewWithClawback(jakoD1(d), { ...st, ctx: { ...st.ctx, seasonProgressMonths: MPS / 2 } });
    expect(view.current).toMatchObject({ sponsorName: "Pila", clawback: 4500, sameSponsor: false, isLegacy: false });
    expect(view.contractMonths).toHaveLength(3);
    view.contractMonths.forEach((m, i) => expect(m).toBeCloseTo((i + 1) * MPS - MPS / 2, 9));
  });

  const OLD_LEGACY = { ...OLD, negotiation_id: null };
  const OLD_LEGACY_ADVANCE: Pravidlo = {
    sql: OLD_ADVANCE.sql,
    first: { id: "c-old", seasons_total: 3, seasons_remaining: 2, signing_bonus: 9000, paid_construction: JSON.stringify({ items: [], startOffsetMonths: 0 }), negotiation_id: null },
  };

  it("přechod od legacy smlouvy (bez jednání): žádná výpovědní pokuta, žádná záloha, žádná ztráta reputace", async () => {
    const d = db([OLD_LEGACY_ADVANCE]);
    // payCurrentFee: server validateProposal ho u legacy (currentTerminationFee 0) rovnou odmítne —
    // nic k zaplacení není, přesně požadavek "hide/disable it when the current contract is legacy".
    const st = state(
      { ctx: { ...FULL_CTX, category: "main", currentTerminationFee: 0 }, contracts: { active: OLD_LEGACY, lastExpired: null } },
      { category: "main" },
      TERMS,
    );
    const res = await signFromState(jakoD1(d), st);
    expect(res).toMatchObject({ ok: true, reputationPenalty: 0 });
    // Jen podpisový příspěvek, žádná pokuta zaplacená sponzorem, žádná strhnutá pokuta, žádná vratka.
    expect(money(d)).toEqual([12000]);
    expect(JSON.parse(insertOf(d).params[12] as string).items).toEqual([]);
    // Přejmenování klubu proběhne, jen bez pokuty za reputaci.
    expect(res.ok && res.newTeamName).toBeTruthy();
  });

  it("pohled na jednání: legacy smlouva má výpovědní pokutu 0 a příznak isLegacy", async () => {
    const d = db([OLD_LEGACY_ADVANCE]);
    const st = state({ ctx: { ...FULL_CTX, currentTerminationFee: 0 }, contracts: { active: OLD_LEGACY, lastExpired: null } }, {}, TERMS);
    const view = await viewWithClawback(jakoD1(d), st);
    expect(view.current).toMatchObject({ sponsorName: "Pila", terminationFee: 0, isLegacy: true, sameSponsor: false, clawback: 0 });
  });

  it("stará smlouva mezitím skončila (výpověď, rollover): záloha bez zaplacené pokuty", async () => {
    const d = db([OLD_ADVANCE, { sql: END_OLD, changes: 0 }]);
    const res = await signFromState(jakoD1(d), switchState());
    expect(res.ok).toBe(true);
    const fix = d.dotazy.find((x) => /^UPDATE sponsor_contracts SET paid_construction/.test(x.sql))!;
    expect(JSON.parse(fix.params[0] as string).items).toEqual([]);
  });

  it("prodloužení hned po podpisu: klub si ve výsledku nechá jen novou zálohu", async () => {
    const one: Proposal = { ...TERMS, seasons: 1 };
    // Obojí ve čtvrtině sezóny: prodloužení hned po podpisu, nic z první smlouvy neuplynulo.
    const quarter = { ...FULL_CTX, seasonProgressMonths: MPS / 4 };
    const d1 = db();
    const first = await signFromState(jakoD1(d1), state({ ctx: quarter }, {}, one));
    expect(first.ok).toBe(true);
    const ins = insertOf(d1);
    const signed = {
      id: ins.params[0] as string, seasons_total: 1, seasons_remaining: 1, signing_bonus: ins.params[11] as number,
      paid_construction: ins.params[12] as string, negotiation_id: "n1",
    };
    const renewTerms: Proposal = { ...TERMS, seasons: 2, demands: { ...TERMS.demands, signingBonus: 8000 } };
    const d2 = db([{ sql: OLD_ADVANCE.sql, first: signed }]);
    const active = { id: signed.id, sponsor_id: 7, sponsor_name: "Truhlářství Novák Arena", monthly_amount: 6000, win_bonus: 0, seasons_remaining: 1, early_termination_fee: 12000, status: "active" as const, negotiation_id: "n1" };
    const renewal = await signFromState(jakoD1(d2), state({ ctx: quarter, isRenewal: true, contracts: { active, lastExpired: null } }, { id: "n2" }, renewTerms));
    expect(renewal.ok).toBe(true);
    expect(money(d2)).toEqual([8000, -12000]);
    const net = [...money(d1), ...money(d2)].reduce((s: number, v) => s + (v as number), 0);
    expect(net).toBe(8000);
    const end = batchQueries(d2).find((x) => END_OLD.test(x.sql))!;
    expect(end.params.slice(0, 2)).toEqual(["expired", signed.id]);
  });

  describe("podmínky přijaté na hraně nejkratší délky smlouvy", () => {
    // 1 sezóna jde podepsat, jen dokud do konce sezóny zbývá aspoň měsíc (minContractSeasons).
    const P0 = MPS - 1;
    const ONE_DAY = MPS / 112;
    const floorTerms: Proposal = { ...TERMS, seasons: 1 };
    const acceptedAt = (progressMonths?: number): NegotiationRound[] => [{
      proposal: floorTerms,
      response: { kind: "accept", text: "Beru.", gameDate: "2026-09-24T00:00:00.000Z", ...(progressMonths !== undefined ? { progressMonths } : {}) },
    }];
    const later = { ...FULL_CTX, seasonProgressMonths: P0 + ONE_DAY };

    it("o herní den později se podepíše: cena se ověřuje s postupem z kola, záloha začíná dnes", async () => {
      const rounds = acceptedAt(P0);
      const d = db();
      const res = await signFromState(jakoD1(d), state({ ctx: later }, { rounds, roundsRaw: JSON.stringify(rounds) }, floorTerms));
      expect(res).toMatchObject({ ok: true });
      expect(JSON.parse(insertOf(d).params[12] as string).startOffsetMonths).toBeCloseTo(P0 + ONE_DAY, 9);
    });

    it("starší kolo bez uloženého postupu se ověřuje s čerstvým postupem", async () => {
      const rounds = acceptedAt();
      const d = db();
      const res = await signFromState(jakoD1(d), state({ ctx: later }, { rounds, roundsRaw: JSON.stringify(rounds) }, floorTerms));
      expect(res).toMatchObject({ ok: false, status: 409 });
      expect(d.davky).toHaveLength(0);
    });

    it("stavební kontroly zůstávají čerstvé: zamčená stavba neprojde ani s uloženým postupem", async () => {
      const build: Proposal = { ...floorTerms, demands: { ...floorTerms.demands, construction: "vip_box" } };
      const rounds: NegotiationRound[] = [{ proposal: build, response: { kind: "accept", text: "Beru.", gameDate: "2026-09-24T00:00:00.000Z", progressMonths: P0 } }];
      const ctx = { ...later, facilities: [{ facility: "vip_box", currentLevel: 3, locked: true, costs: [0, 55000, 170000, 450000] }] };
      const res = await signFromState(jakoD1(db()), state({ ctx }, { rounds, roundsRaw: JSON.stringify(rounds) }, build));
      expect(res).toMatchObject({ ok: false, status: 409 });
    });
  });

  it("první hlavní sponzor vůbec (žádná dosavadní smlouva): přejmenování bez ztráty reputace", async () => {
    const d = db();
    const st = state(
      { ctx: { ...FULL_CTX, category: "main" }, contracts: { active: null, lastExpired: null } },
      { category: "main" },
      TERMS,
    );
    const res = await signFromState(jakoD1(d), st);
    expect(res).toMatchObject({ ok: true, reputationPenalty: 0 });
    expect(res.ok && res.newTeamName).toBeTruthy();
    // applyReputationDelta (rename penalty) se vůbec nezavolal.
    expect(d.dotazy.some((q) => /reputation_log/.test(q.sql))).toBe(false);
  });

  it("pohled na jednání: první hlavní sponzor vůbec nemá v náhledu pokutu za přejmenování", async () => {
    const d = db();
    const st = state({ ctx: { ...FULL_CTX, category: "main" }, contracts: { active: null, lastExpired: null } }, { category: "main" }, TERMS);
    const view = await viewWithClawback(jakoD1(d), st);
    expect(view.current).toBeNull();
    expect(view.pending).toMatchObject({ renamesClub: true, reputationPenalty: 0 });
  });

  it("podepíše majitelovu nabídku i po mezitímním odmítnutí klubu (pendingTerms hledá zpětně)", async () => {
    const counter: Proposal = { ...TERMS, demands: { ...TERMS.demands, monthly: 5500, signingBonus: 8000 } };
    const rounds: NegotiationRound[] = [
      { proposal: TERMS, response: { kind: "counter_money", text: "Tolik ne.", counter, gameDate: "2026-09-24T00:00:00.000Z" } },
      { proposal: { ...TERMS, demands: { ...TERMS.demands, monthly: 100 } }, response: { kind: "reject", text: "To ne.", gameDate: "2026-09-25T00:00:00.000Z" } },
    ];
    const d = db();
    const res = await signFromState(jakoD1(d), state({}, { status: "open", rounds, roundsRaw: JSON.stringify(rounds) }));
    expect(res.ok).toBe(true);
    const claim = d.dotazy.find((q) => CLAIM.test(q.sql))!;
    expect(claim.params).toEqual(["n1", "t1", "open", JSON.stringify(rounds)]);
    expect(insertOf(d).params[4]).toBe(5500);
    expect(money(d)).toEqual([8000]);
  });

  it("prodloužení hlavního sponzora: zápis hlídá exkluzivitu, klub se nepřejmenuje", async () => {
    const active = { id: "c-main", sponsor_id: 7, sponsor_name: "Truhlářství Novák s.r.o.", monthly_amount: 6000, win_bonus: 0, seasons_remaining: 1, early_termination_fee: 12000, status: "active" as const, negotiation_id: "n0" };
    const d = db();
    const res = await signFromState(jakoD1(d), state({
      ctx: { ...FULL_CTX, category: "main" }, isRenewal: true, contracts: { active, lastExpired: null },
    }, { category: "main" }));
    expect(res).toMatchObject({ ok: true, newTeamName: null, reputationPenalty: 0 });
    const ins = insertOf(d);
    expect(ins.sql).toContain(MAIN_SPONSOR_FREE_SQL);
    expect(ins.params.slice(-6, -3)).toEqual(["main", 7, "t1"]);
    // Jiná aktivní smlouva v kategorii než ta prodlužovaná zápis zastaví.
    expect(ins.sql).toContain(OTHER_ACTIVE_IN_CATEGORY_FREE_SQL);
    expect(ins.params.slice(-3)).toEqual(["t1", "main", "c-main"]);
    expect(ins.params[2]).toBe("Truhlářství Novák s.r.o.");
    expect(d.dotazy.some((q) => /UPDATE teams SET name/.test(q.sql))).toBe(false);
  });
});

describe("vratka zálohy", () => {
  const base: AdvanceContract = {
    id: "c1", seasons_total: 2, seasons_remaining: 1, signing_bonus: 12000,
    paid_construction: JSON.stringify({
      items: [{ kind: "stadium", key: "vip_box", level: 2, cost: 170000 }, { kind: "current_fee", key: "c0", level: 0, cost: 4000 }],
      startOffsetMonths: 0,
    }),
    negotiation_id: "n1",
  };

  it("součty podle druhu, starý tvar pole i nesmysl", () => {
    expect(advanceItemsTotals(parseAdvance(base.paid_construction, "c1").items)).toEqual({ construction: 170000, equipment: 0, paidFee: 4000 });
    expect(parseAdvance(JSON.stringify([{ kind: "equipment", key: "balls", level: 1, cost: 6000 }]), "c1").items).toHaveLength(1);
    expect(parseAdvance("nesmysl", "c1")).toEqual({ items: [], startOffsetMonths: 0 });
  });

  it("postup sezóny v měsících", () => {
    expect(seasonProgressMonths({ start: HALF.season_start, end: HALF.season_end }, HALF.game_date)).toBeCloseTo(MPS / 2, 6);
    expect(seasonProgressMonths({ start: HALF.season_start, end: HALF.season_end }, "2026-08-01T00:00:00.000Z")).toBe(0);
    expect(seasonProgressMonths({ start: HALF.season_start, end: HALF.season_end }, "2027-01-01T00:00:00.000Z")).toBe(MPS);
    expect(seasonProgressMonths(null, HALF.game_date)).toBe(0);
  });

  it("podpis těsně před rolloverem: po rolloveru je skoro celá záloha nesplacená", () => {
    const offset = MPS * 0.98;
    const r = clawbackAmount({ oneTimeTotal: 10000, seasonsTotal: 2, seasonsRemaining: 1, startOffsetMonths: offset, progressMonths: 0 });
    // smlouva trvá 2 × MPS − offset, uplynulo MPS − offset = 0,02 MPS
    expect(r).toBe(Math.round((10000 * MPS) / (2 * MPS - offset)));
    expect(r).toBeGreaterThan(9800);
  });

  it("výpověď pozdě v sezóně podpisu: vrací se jen zbytek od podpisu", () => {
    const offset = MPS * 0.2;
    const progress = MPS * 0.9;
    const r = clawbackAmount({ oneTimeTotal: 10000, seasonsTotal: 1, seasonsRemaining: 1, startOffsetMonths: offset, progressMonths: progress });
    const length = MPS - offset;
    expect(r).toBe(Math.round((10000 * (length - (progress - offset))) / length));
    expect(r).toBe(1250);
  });

  it("délka smlouvy pro vratku = délka, na kterou jednání zálohu rozpočítalo", () => {
    for (const [seasons, offset] of [[1, 0], [1, MPS * 0.6], [2, MPS * 0.3], [3, MPS]] as const) {
      const m = effectiveContractMonths(seasons, offset);
      // Uplynulo přesně m / 2 měsíců smlouvy → vrací se polovina.
      const playedSeasons = Math.floor((offset + m / 2) / MPS);
      const progress = offset + m / 2 - playedSeasons * MPS;
      const r = clawbackAmount({ oneTimeTotal: 10000, seasonsTotal: seasons, seasonsRemaining: seasons - playedSeasons, startOffsetMonths: offset, progressMonths: progress });
      expect(r).toBe(5000);
    }
  });

  it("na konci smlouvy nic, před podpisem (hodiny zpět) celá záloha", () => {
    expect(clawbackAmount({ oneTimeTotal: 10000, seasonsTotal: 2, seasonsRemaining: 1, startOffsetMonths: 1, progressMonths: MPS })).toBe(0);
    expect(clawbackAmount({ oneTimeTotal: 10000, seasonsTotal: 2, seasonsRemaining: 2, startOffsetMonths: 1, progressMonths: 0 })).toBe(10000);
  });

  it("po jedné ze dvou sezón (podpis na startu) vrací klub polovinu, včetně vyplacených termínových bonusů", async () => {
    const d = new FalesnaD1([{ sql: /FROM sponsor_promises/, first: { total: 2000 } }]);
    expect(await contractClawback(jakoD1(d), base, 0)).toBe(Math.round((12000 + 170000 + 4000 + 2000) / 2));
    const q = d.dotazy.find((x) => /FROM sponsor_promises/.test(x.sql))!;
    expect(q.params).toEqual(["c1", "coach_licence", "stadium_upgrade", "jersey_logo"]);
  });

  it("smlouva bez jednání nic nevrací", async () => {
    const d = new FalesnaD1();
    expect(await contractClawback(jakoD1(d), { ...base, negotiation_id: null }, 0)).toBe(0);
    expect(d.dotazy).toHaveLength(0);
  });
});

describe("sliby staré smlouvy při podpisu (prodloužení a přechod)", () => {
  const OLD = { id: "c-old", sponsor_id: 3, sponsor_name: "Pila", monthly_amount: 3000, win_bonus: 0, seasons_remaining: 1, early_termination_fee: 18000, status: "active" as const, negotiation_id: "n0" };
  const FORFEIT_SELECT = /FROM sponsor_promises p WHERE p\.contract_id = \?/;
  const FORFEIT_ROWS: Pravidlo = { sql: FORFEIT_SELECT, all: [
    { id: "pr-season", contract_id: "c-old", sponsor_id: 3, kind: "reputation", params: '{"reputation":60}', season: 3, penalty: 5000 },
    { id: "pr-deadline", contract_id: "c-old", sponsor_id: 3, kind: "coach_licence", params: '{"level":2}', season: null, penalty: 2000 },
  ] };
  const FORFEIT_CLAIM = /^UPDATE sponsor_promises SET status = 'broken', resolved_at = \?/;
  const MOVE = /^UPDATE sponsor_promises SET contract_id = \?/;
  const switchSt = (budget = 100000) => state({
    team: { ...state().team, budget }, contracts: { active: OLD, lastExpired: null },
  });

  it("prodloužení: čekající sliby (kromě exkluzivity oboru) přejdou na novou smlouvu, nic nepropadá", async () => {
    const d = db([FORFEIT_ROWS]);
    const active = { ...OLD, sponsor_id: 7, sponsor_name: "Truhlářství Novák Arena" };
    const res = await signFromState(jakoD1(d), state({ isRenewal: true, contracts: { active, lastExpired: null } }));
    expect(res.ok).toBe(true);
    const q = batchQueries(d);
    const moveIdx = q.findIndex((x) => MOVE.test(x.sql));
    expect(moveIdx).toBeGreaterThan(-1);
    const move = q[moveIdx];
    expect(move.sql).toContain("status = 'pending'");
    expect(move.sql).toContain("kind != 'sector_exclusivity'");
    // Nová smlouva, stará smlouva a hlídání: nová existuje a stará je pořád aktivní.
    const newId = insertOf(d).params[0];
    expect(move.params).toEqual([newId, "c-old", newId, "c-old"]);
    expect(move.sql).toContain("status = 'active'");
    // Přesun před koncem staré smlouvy (jinak by hlídání „stará aktivní" neprošlo).
    expect(moveIdx).toBeLessThan(q.findIndex((x) => END_OLD.test(x.sql)));
    // Prodloužení nic nepropadá.
    expect(d.pocet(FORFEIT_SELECT)).toBe(0);
    expect(d.pocet(FORFEIT_CLAIM)).toBe(0);
  });

  it("přechod k jiné firmě: sliby aktuální sezóny a termínové propadnou s plnou pokutou, bez porušení", async () => {
    const d = db([FORFEIT_ROWS]);
    const res = await signFromState(jakoD1(d), switchSt());
    expect(res.ok).toBe(true);
    // Výběr: aktuální sezóna (3) a termínové druhy.
    const sel = d.dotazy.find((x) => FORFEIT_SELECT.test(x.sql))!;
    expect(sel.params).toEqual(["c-old", 3]);
    expect(sel.sql).toContain("p.season = ?");
    expect(sel.sql).toContain("'coach_licence', 'stadium_upgrade', 'jersey_logo'");
    const q = batchQueries(d);
    const claims = q.filter((x) => FORFEIT_CLAIM.test(x.sql));
    expect(claims.map((c) => c.params[1])).toEqual(["pr-season", "pr-deadline"]);
    // Nárok jen dokud je stará smlouva aktivní a nová existuje.
    const newId = insertOf(d).params[0];
    for (const c of claims) {
      expect(c.sql).toContain("status = 'pending'");
      expect(c.params.slice(2)).toEqual([newId, "c-old"]);
    }
    // Plná pokuta, transakce s referencí promise:<id>, podmíněná značkou nároku.
    expect(money(d)).toEqual([12000, -6000, -5000, -2000]);
    const tx = q.filter((x) => /INSERT INTO transactions/.test(x.sql) && String(x.params[6]).startsWith("promise:"));
    expect(tx.map((x) => [x.params[2], x.params[6]])).toEqual([["sponsor_penalty", "promise:pr-season"], ["sponsor_penalty", "promise:pr-deadline"]]);
    expect(tx.every((x) => x.sql.includes("resolved_at = ?"))).toBe(true);
    // Náklonnost −8 s důvodem porušeného slibu, počítadlo porušení se nemění.
    const favorLog = q.filter((x) => /INSERT INTO sponsor_favor_log/.test(x.sql));
    expect(favorLog).toHaveLength(2);
    expect(favorLog[0].params.slice(0, 3)).toEqual([3, "t1", -8]);
    expect(String(favorLog[0].params[3])).toMatch(/^porušený slib: /);
    expect(d.pocet(/breaches_season/)).toBe(0);
    // Sliby propadají před koncem staré smlouvy.
    const lastClaim = q.map((x) => FORFEIT_CLAIM.test(x.sql)).lastIndexOf(true);
    expect(lastClaim).toBeLessThan(q.findIndex((x) => END_OLD.test(x.sql)));
    // Značka nároku se na konci přepíše na herní datum.
    expect(q.filter((x) => /^UPDATE sponsor_promises SET resolved_at = \? WHERE id = \? AND resolved_at = \?/.test(x.sql))).toHaveLength(2);
  });

  it("přechod: na pokuty za propadlé sliby musí být peníze", async () => {
    // pokuta 18000 × 1/3 = 6000 + propadlé sliby 7000 = 13000; příspěvek za podpis 12000
    expect((await signFromState(jakoD1(db([FORFEIT_ROWS])), switchSt(1500))).ok).toBe(true);
    // 500 + 12000 < 13000 → neprojde a řekne proč (bez slibů by na pokutu 6000 stačilo)
    const d = db([FORFEIT_ROWS]);
    const res = await signFromState(jakoD1(d), switchSt(500));
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect((res as { error: string }).error).toContain("pokuty za propadlé sliby");
    expect((res as { error: string }).error).toContain("13");
    expect(d.pocet(CLAIM)).toBe(0);
  });

  it("pohled na jednání: pokuta za propadlé sliby jen u přechodu, u prodloužení 0", async () => {
    const view = await viewWithClawback(jakoD1(db([FORFEIT_ROWS])), switchSt());
    expect(view.current).toMatchObject({ sponsorName: "Pila", forfeitPenalty: 7000 });
    const active = { ...OLD, sponsor_id: 7 };
    const renewal = await viewWithClawback(jakoD1(db([FORFEIT_ROWS])), state({ isRenewal: true, contracts: { active, lastExpired: null } }));
    expect(renewal.current).toMatchObject({ sameSponsor: true, forfeitPenalty: 0 });
  });
});
