/**
 * DB vrstva jednání nad falešnou D1: kolo se zapisuje s optimistickým zámkem, expirace
 * a cooldown jedou v herním čase, rollover jednání uzavře.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import {
  closeNegotiationsForRollover, contractBlock, cooldownUntil, findActiveNegotiation, openNegotiation, parseNegotiation,
  pendingTerms, saveRound, type CategoryContracts, type ContractRow, type NegotiationRound, type NegotiationSponsor,
  type NegotiationTeam,
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

describe("openNegotiation", () => {
  const TEAM_ROW = {
    id: "t1", name: "Klub", reputation: 60, budget: 100000, league_id: "l1",
    game_date: "2026-09-23T00:00:00.000Z", last_main_sponsor_change_season: null, district: "okres1", size: "mesto",
  };
  const SPONSOR_ROW = { id: 7, name: "Firma", type: "potraviny", district: "okres1", monthly_max: 5000 };
  const OWNER_ROW = { sponsor_id: 7, first_name: "Jan", last_name: "Novák", age: 45, face_config: "{}", personality: "businessman" };
  // Kotva na začátek: INSERT jednání má stejný fragment ve své WHERE NOT EXISTS podmínce,
  // bez ^SELECT by ho tenhle výraz taky omylem chytil.
  const NO_ACTIVE_NEGOTIATION = /^SELECT \* FROM sponsor_negotiations WHERE team_id = \? AND sponsor_id = \? AND category = \? AND status IN/;

  // Otevírá jednání v kategorii "stadium", aby netáhlo dotazy mainSponsorBlock (contractBlock je testován zvlášť).
  function baseRules(extra: Pravidlo[]): Pravidlo[] {
    return [
      { sql: /FROM teams t JOIN villages v ON v\.id = t\.village_id/, first: TEAM_ROW },
      { sql: /SELECT id, name, type, district, monthly_max FROM district_sponsors WHERE id = \?/, first: SPONSOR_ROW },
      { sql: /FROM seasons WHERE status = 'active'/, first: { number: 5 } },
      { sql: /status = 'active' AND COALESCE\(category/, first: null },
      { sql: /status = 'expired' AND COALESCE\(category/, first: null },
      { sql: NO_ACTIVE_NEGOTIATION, first: null },
      { sql: /MAX\(cooldown_until\)/, first: { c: null } },
      { sql: /FROM sponsor_owners WHERE sponsor_id IN/, all: [OWNER_ROW] },
      { sql: /FROM sponsor_team_favor WHERE sponsor_id = \? AND team_id = \?/, first: { favor: 50 } },
      ...extra,
    ];
  }

  it("otevře nové jednání podmíněným INSERTem", async () => {
    const db = new FalesnaD1(baseRules([{ sql: /^INSERT INTO sponsor_negotiations/, changes: 1 }]));
    const res = await openNegotiation(jakoD1(db), "t1", 7, "stadium");
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.id).toBe("string");
    const ins = db.dotazy.find((d) => /INSERT INTO sponsor_negotiations/.test(d.sql))!;
    expect(ins.sql).toContain("WHERE NOT EXISTS");
  });

  it("dvojklik: INSERT prohraje podmínku, vrátí id mezitím vzniklého jednání", async () => {
    const EXISTING_ID = "existing-neg-id";
    const db = new FalesnaD1(baseRules([{ sql: /^INSERT INTO sponsor_negotiations/, changes: 0 }]));
    // Availability check (1. dotaz) nic nenajde, otevře se INSERT; ten prohraje podmínku
    // (souběžný požadavek mezitím jednání založil) a openNegotiation se zeptá znovu (2. dotaz) —
    // FalesnaD1 nerozlišuje pořadí volání stejného SQL, proto počítáme volání ručně.
    let calls = 0;
    const original = db.pravidlo.bind(db);
    db.pravidlo = (sql: string): Pravidlo | undefined => {
      if (NO_ACTIVE_NEGOTIATION.test(sql)) {
        calls += 1;
        return calls === 1
          ? { sql: NO_ACTIVE_NEGOTIATION, first: null }
          : { sql: NO_ACTIVE_NEGOTIATION, first: { ...ROW, id: EXISTING_ID, sponsor_id: 7, category: "stadium" as const } };
      }
      return original(sql);
    };
    const res = await openNegotiation(jakoD1(db), "t1", 7, "stadium");
    expect(res).toEqual({ ok: true, id: EXISTING_ID });
    expect(db.dotazy.some((d) => /INSERT INTO sponsor_negotiations/.test(d.sql))).toBe(true);
  });
});

describe("contractBlock", () => {
  const TEAM: NegotiationTeam = {
    id: "t1", name: "Klub", reputation: 60, budget: 100000, league_id: "l1",
    game_date: "2026-09-23T00:00:00.000Z", last_main_sponsor_change_season: null, district: "okres1", size: "mesto",
  };
  const SPONSOR: NegotiationSponsor = { id: 7, name: "Firma", type: "potraviny", district: "okres1", monthly_max: 5000 };
  const NO_CONTRACTS: CategoryContracts = { active: null, lastExpired: null };
  const activeContract = (over: Partial<ContractRow>): ContractRow => ({
    id: "c1", sponsor_id: SPONSOR.id, sponsor_name: SPONSOR.name, monthly_amount: 1000, win_bonus: 0,
    seasons_remaining: 2, early_termination_fee: 100, status: "active", ...over,
  });

  it("cizí okres blokuje bez ohledu na smlouvy nebo kategorii, bez dotazu do DB", async () => {
    const db = new FalesnaD1();
    const sponsor = { ...SPONSOR, district: "jiny-okres" };
    const reason = await contractBlock(jakoD1(db), TEAM, sponsor, "main", 5, NO_CONTRACTS);
    expect(reason).toBe("Jednat jde jen s firmami z vlastního okresu");
    expect(db.dotazy).toHaveLength(0);
  });

  it("prodloužení se stejnou firmou dřív než v poslední sezóně smlouvy je blokované", async () => {
    const db = new FalesnaD1();
    const contracts: CategoryContracts = { active: activeContract({ seasons_remaining: 2 }), lastExpired: null };
    const reason = await contractBlock(jakoD1(db), TEAM, SPONSOR, "stadium", 5, contracts);
    expect(reason).toBe("Smlouvu s touhle firmou prodloužíš až v její poslední sezóně");
    expect(db.dotazy).toHaveLength(0);
  });

  it("hlavního sponzora jde změnit jen jednou za sezónu", async () => {
    const db = new FalesnaD1();
    const team: NegotiationTeam = { ...TEAM, last_main_sponsor_change_season: 5 };
    const reason = await contractBlock(jakoD1(db), team, SPONSOR, "main", 5, NO_CONTRACTS);
    expect(reason).toBe("Hlavního sponzora jde změnit jen jednou za sezónu");
    expect(db.dotazy).toHaveLength(0);
  });

  it("kategorie stadium neřeší exkluzivitu hlavního sponzora, žádný dotaz do DB", async () => {
    const db = new FalesnaD1();
    const reason = await contractBlock(jakoD1(db), TEAM, SPONSOR, "stadium", 5, NO_CONTRACTS);
    expect(reason).toBeNull();
    expect(db.dotazy).toHaveLength(0);
  });

  it("hlavní sponzor volný (mainSponsorBlock nic nenajde): jednat jde", async () => {
    const db = new FalesnaD1([
      { sql: /sc\.sponsor_id = \? AND sc\.status = 'active' AND sc\.category = 'main'/, first: null },
      { sql: /ds\.priority_team_id, t\.name AS team_name FROM district_sponsors ds/, first: null },
    ]);
    const reason = await contractBlock(jakoD1(db), TEAM, SPONSOR, "main", 5, NO_CONTRACTS);
    expect(reason).toBeNull();
  });

  it("hlavní sponzor drží jiný klub: důvod z mainSponsorBlock", async () => {
    const db = new FalesnaD1([
      {
        sql: /sc\.sponsor_id = \? AND sc\.status = 'active' AND sc\.category = 'main'/,
        first: { team_id: "t2", name: "Soupeř", sponsor_name: SPONSOR.name },
      },
    ]);
    const reason = await contractBlock(jakoD1(db), TEAM, SPONSOR, "main", 5, NO_CONTRACTS);
    expect(reason).toBe(`${SPONSOR.name} je hlavním sponzorem klubu Soupeř`);
  });
});
