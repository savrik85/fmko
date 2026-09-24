/**
 * DB vrstva jednání nad falešnou D1: kolo se zapisuje s optimistickým zámkem, expirace
 * a cooldown jedou v herním čase, rollover jednání uzavře.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import {
  categoryContracts, closeNegotiation, negotiationAvailability, closeNegotiationsForRollover, contractBlock, EXPIRED_RENEWAL_FACTS_SQL, expiredCountsAsRenewal, isRenewalOf, cooldownUntil, findActiveNegotiation, openNegotiation, parseNegotiation,
  pendingTerms, pendingTermsProgress, saveRound, type CategoryContracts, type ContractRow, type NegotiationRound, type NegotiationSponsor,
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
  it("úvodní nabídka majitele (offer) se podepisuje jako protinabídka", () => {
    const n = { ...parseNegotiation(ROW), rounds: [round("offer", PROPOSAL)] };
    expect(pendingTerms(n)).toEqual(PROPOSAL);
    expect(pendingTerms({ ...n, status: "accepted" as const })).toBeNull();
  });
  it("starší jednání bez úvodní nabídky: nic k podpisu, dokud klub nenavrhne", () => {
    expect(pendingTerms(parseNegotiation(ROW))).toBeNull();
  });
  it("po odmítnutí není co podepsat", () => {
    const n = { ...parseNegotiation(ROW), rounds: [round("reject")] };
    expect(pendingTerms(n)).toBeNull();
  });
  it("po odmítnutí zůstává na stole poslední protinabídka majitele (hledá se zpětně)", () => {
    const counter = { ...PROPOSAL, demands: { ...PROPOSAL.demands, monthly: 4500 } };
    const n = { ...parseNegotiation(ROW), rounds: [round("counter_money", counter), round("reject")] };
    expect(pendingTerms(n)).toEqual(counter);
  });
  it("i po urážce (insulted) zůstává v nabídce jeho úvodní nabídka", () => {
    const n = { ...parseNegotiation(ROW), rounds: [round("offer", PROPOSAL), round("insulted")] };
    expect(pendingTerms(n)).toEqual(PROPOSAL);
  });
  it("bez dřívější nabídky majitele (samá odmítnutí) pořád nic k podpisu", () => {
    const n = { ...parseNegotiation(ROW), rounds: [round("reject"), round("reject")] };
    expect(pendingTerms(n)).toBeNull();
  });
  it("stav mimo open/accepted nemá co podepsat, i kdyby předtím nabídka byla", () => {
    const n = { ...parseNegotiation(ROW), status: "walked_away" as const, rounds: [round("counter_money", PROPOSAL), round("walked_away")] };
    expect(pendingTerms(n)).toBeNull();
  });
  it("po přijetí klub navrhne víc, majitel to odmítne: platí dřívější PŘIJATÝ návrh klubu, ne úvodní nabídku majitele (offer 6900 → accept 7800 → reject 11500 → pending 7800)", () => {
    const offer6900 = { ...PROPOSAL, demands: { ...PROPOSAL.demands, monthly: 6900 } };
    const accepted7800 = { ...PROPOSAL, demands: { ...PROPOSAL.demands, monthly: 7800 } };
    const rejected11500 = { ...PROPOSAL, demands: { ...PROPOSAL.demands, monthly: 11500 } };
    const n = {
      ...parseNegotiation(ROW),
      status: "open" as const,
      rounds: [
        { proposal: offer6900, response: { kind: "offer" as const, text: "x", gameDate: "2026-09-24T00:00:00.000Z", counter: offer6900 } },
        { proposal: accepted7800, response: { kind: "accept" as const, text: "x", gameDate: "2026-09-24T00:00:00.000Z", progressMonths: 2 } },
        { proposal: rejected11500, response: { kind: "reject" as const, text: "x", gameDate: "2026-09-24T00:00:00.000Z" } },
      ],
    };
    // Klub po přijetí navrhl 11500, majitel odmítl (jednání zůstává 'open'): stůl se vrací
    // k dřívějším přijatým podmínkám klubu (7800), ne k úvodní nabídce majitele (6900).
    expect(pendingTerms(n)).toEqual(accepted7800);
    expect(pendingTermsProgress(n)).toBe(2);
  });
});

describe("pendingTermsProgress", () => {
  const withProgress = (r: NegotiationRound, progressMonths: number): NegotiationRound => ({ ...r, response: { ...r.response, progressMonths } });
  it("vrátí postup sezóny z kola, ve kterém majitel podmínky přijal nebo navrhl", () => {
    expect(pendingTermsProgress({ ...parseNegotiation(ROW), status: "accepted", rounds: [withProgress(round("accept"), 2.5)] })).toBe(2.5);
    const counter = { ...PROPOSAL, demands: { ...PROPOSAL.demands, monthly: 4500 } };
    expect(pendingTermsProgress({ ...parseNegotiation(ROW), rounds: [withProgress(round("counter_money", counter), 1.25)] })).toBe(1.25);
  });
  it("starší kolo bez postupu nebo nic k podpisu: null", () => {
    expect(pendingTermsProgress({ ...parseNegotiation(ROW), status: "accepted", rounds: [round("accept")] })).toBeNull();
    expect(pendingTermsProgress({ ...parseNegotiation(ROW), rounds: [withProgress(round("reject"), 1)] })).toBeNull();
  });
  it("po odmítnutí čte postup z kola nabídky, ne z posledního (odmítnutého) kola", () => {
    const counter = { ...PROPOSAL, demands: { ...PROPOSAL.demands, monthly: 4500 } };
    const n = {
      ...parseNegotiation(ROW),
      rounds: [withProgress(round("counter_money", counter), 1.5), withProgress(round("reject"), 2.9)],
    };
    expect(pendingTermsProgress(n)).toBe(1.5);
  });
});

describe("saveRound", () => {
  it("zapisuje s podmínkou na původní kola a stav open", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET rounds/, changes: 1 }]);
    const ok = await saveRound(jakoD1(db), parseNegotiation(ROW), round("reject"), { status: "open", patience: 2, cooldownUntil: null });
    expect(ok).toBe(true);
    const q = db.dotazy.find((d) => /UPDATE sponsor_negotiations SET rounds/.test(d.sql))!;
    expect(q.sql).toContain("status = ? AND rounds = ?");
    expect(q.params[1]).toBe("open");
    expect(q.params[2]).toBe(2);
    expect(q.params[4]).toBe("n1");
    expect(q.params[5]).toBe("open");
    expect(q.params[6]).toBe("[]");
  });
  it("souběžný návrh prohraje zámek", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET rounds/, changes: 0 }]);
    expect(await saveRound(jakoD1(db), parseNegotiation(ROW), round("reject"), { status: "open", patience: 2, cooldownUntil: null })).toBe(false);
  });
  it("z přijatého jednání (accepted) zapisuje s podmínkou na stav accepted, ne natvrdo open", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET rounds/, changes: 1 }]);
    const accepted = { ...parseNegotiation(ROW), status: "accepted" as const };
    // Nový návrh z 'accepted' se vrací do 'open' (odmítnutí/protinabídka), přesně jako z 'open'.
    const ok = await saveRound(jakoD1(db), accepted, round("reject"), { status: "open", patience: 2, cooldownUntil: null });
    expect(ok).toBe(true);
    const q = db.dotazy.find((d) => /UPDATE sponsor_negotiations SET rounds/.test(d.sql))!;
    expect(q.sql).toContain("status = ? AND rounds = ?");
    expect(q.sql).not.toContain("status = 'open'");
    // Bind pořadí: rounds, next.status, patience, cooldownUntil, id, NAČTENÝ stav (zámek), roundsRaw.
    expect(q.params[1]).toBe("open");
    expect(q.params[5]).toBe("accepted");
    expect(q.params[6]).toBe("[]");
  });
});

describe("closeNegotiation", () => {
  it("z open nebo accepted uzavře jednání bez cooldownu", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET status = 'expired'/, changes: 1 }]);
    const ok = await closeNegotiation(jakoD1(db), "t1", "n1");
    expect(ok).toBe(true);
    const q = db.dotazy.find((d) => /UPDATE sponsor_negotiations SET status = 'expired'/.test(d.sql))!;
    expect(q.sql).toContain("cooldown_until = NULL");
    expect(q.sql).toContain("status IN ('open','accepted')");
    expect(q.params).toEqual(["n1", "t1"]);
    // Dobrovolné ukončení nesahá na náklonnost ani deník: jediný dotaz, žádná dávka.
    expect(db.dotazy).toHaveLength(1);
    expect(db.davky).toHaveLength(0);
  });
  it("na už uzavřené jednání (podmínka neplatí) vrátí false", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET status = 'expired'/, changes: 0 }]);
    expect(await closeNegotiation(jakoD1(db), "t1", "n1")).toBe(false);
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

  it("úvodní nabídka majitele: jedno kolo \"offer\" v INSERTu, platné a k podpisu", async () => {
    const db = new FalesnaD1(baseRules([{ sql: /^INSERT INTO sponsor_negotiations/, changes: 1 }]));
    const res = await openNegotiation(jakoD1(db), "t1", 7, "stadium");
    expect(res.ok).toBe(true);
    const ins = db.dotazy.find((d) => /INSERT INTO sponsor_negotiations/.test(d.sql))!;
    expect(ins.sql).toMatch(/expires_game_date, rounds\)/);
    const rounds: NegotiationRound[] = JSON.parse(ins.params[8] as string);
    expect(rounds).toHaveLength(1);
    const r = rounds[0];
    expect(r.response.kind).toBe("offer");
    expect(r.response.counter).toEqual(r.proposal);
    expect(r.response.progressMonths).toBe(0);
    expect(r.response.text).not.toContain("—");
    expect(r.proposal.demands.monthly).toBeGreaterThan(0);
    expect(r.proposal.demands.signingBonus).toBeGreaterThan(0);
    // Majitel je obchodník: jeho přání (návštěva, logo na rukávu, exkluzivita oboru) jsou v nabídce jako sliby.
    expect(r.proposal.promises.length).toBeGreaterThan(0);
    // Trpělivost se nemění: 2 + náklonnost 50 / 25.
    expect(ins.params[6]).toBe(4);
    const n = { ...parseNegotiation({ ...ROW, rounds: ins.params[8] as string }) };
    expect(pendingTerms(n)).toEqual(r.proposal);
    expect(pendingTermsProgress(n)).toBe(0);
  });

  it("běžící jednání (dvojklik): vrátí jeho id a druhou nabídku nezapíše", async () => {
    const db = new FalesnaD1(baseRules([]));
    db.pravidla.unshift({ sql: NO_ACTIVE_NEGOTIATION, first: { ...ROW, id: "running", sponsor_id: 7, category: "stadium" as const } });
    const res = await openNegotiation(jakoD1(db), "t1", 7, "stadium");
    expect(res).toEqual({ ok: true, id: "running" });
    expect(db.pocet(/INSERT INTO sponsor_negotiations/)).toBe(0);
    expect(db.pocet(/UPDATE sponsor_negotiations SET rounds/)).toBe(0);
  });

  it("rukáv už nese logo tohohle sponzora: mezi přání majitele logo nedá (R: Task 5→7)", async () => {
    const db = new FalesnaD1(baseRules([
      { sql: /^INSERT INTO sponsor_negotiations/, changes: 1 },
      { sql: /SELECT 1 AS x FROM teams t\s+WHERE t\.id = \? AND t\.sleeve_sponsor_id = \?/, first: { x: 1 } },
    ]));
    const res = await openNegotiation(jakoD1(db), "t1", 7, "stadium");
    expect(res.ok).toBe(true);
    const ins = db.dotazy.find((d) => /INSERT INTO sponsor_negotiations/.test(d.sql))!;
    const wishes: string[] = JSON.parse(ins.params[4] as string);
    // PERSONALITY_WISHES.businessman bez jersey_logo má jen 2 kandidáty (attendance,
    // sector_exclusivity), oba se vezmou — bez ohledu na pořadí ze zamíchání.
    expect([...wishes].sort()).toEqual(["attendance", "sector_exclusivity"]);
    const sleeveCheck = db.dotazy.find((d) => /sleeve_sponsor_id = \?/.test(d.sql));
    expect(sleeveCheck?.params).toEqual(["t1", 7]);
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
    seasons_remaining: 2, early_termination_fee: 100, status: "active", negotiation_id: "n0", ...over,
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

describe("prodloužení vypršelé smlouvy (isRenewalOf přes categoryContracts)", () => {
  const EXPIRED = {
    id: "x1", sponsor_id: 7, sponsor_name: "Firma", monthly_amount: 1000, win_bonus: 0, seasons_remaining: 0,
    early_termination_fee: 100, status: "expired", negotiation_id: "n0", signed_before_window: 0, signed_since: 0,
  };
  // Bez aktivní smlouvy (FalesnaD1 bez shody vrací null), jen vypršelá.
  const dbWith = (expired: Record<string, unknown> | null) => new FalesnaD1([{ sql: /sc\.status = 'expired'/, first: expired }]);

  it("vypršela při posledním rolloveru a od té doby se nic nepodepsalo: prodloužení", async () => {
    const d = dbWith(EXPIRED);
    const c = await categoryContracts(jakoD1(d), "t1", "main");
    expect(c.lastExpired?.id).toBe("x1");
    expect(isRenewalOf(c, 7)).toBe(true);
    expect(isRenewalOf(c, 8)).toBe(false);
    const q = d.dotazy.find((x) => /sc\.status = 'expired'/.test(x.sql))!;
    expect(q.sql).toContain(EXPIRED_RENEWAL_FACTS_SQL);
    expect(q.params).toEqual(["t1", "main"]);
  });

  it("po ní klub podepsal jinou firmu (a hned ji vypověděl): staré firmě se neprodlužuje", async () => {
    const c = await categoryContracts(jakoD1(dbWith({ ...EXPIRED, signed_since: 1 })), "t1", "main");
    expect(c.lastExpired).toBeNull();
    expect(isRenewalOf(c, 7)).toBe(false);
  });

  it("vypršela o sezónu dřív než při posledním rolloveru: není prodloužení", async () => {
    const c = await categoryContracts(jakoD1(dbWith({ ...EXPIRED, signed_before_window: 1 })), "t1", "main");
    expect(isRenewalOf(c, 7)).toBe(false);
  });

  it("předaná prodloužením (zbývala jí sezóna), ne rolloverem: není prodloužení", () => {
    expect(expiredCountsAsRenewal({ seasons_remaining: 1, negotiation_id: "n0", signed_before_window: 0, signed_since: 0 })).toBe(false);
    expect(expiredCountsAsRenewal({ seasons_remaining: 0, negotiation_id: null, signed_before_window: 0, signed_since: 0 })).toBe(true);
  });

  it("okno vypršení i počet podepsaných potom se počítají v SQL nad sc", () => {
    expect(EXPIRED_RENEWAL_FACTS_SQL).toMatch(/s\.number = \(SELECT MAX\(number\) FROM seasons WHERE status = 'active'\) - sc\.seasons_total/);
    expect(EXPIRED_RENEWAL_FACTS_SQL).toMatch(/datetime\(sc\.signed_at\) < datetime\(s\.created_at\)/);
    expect(EXPIRED_RENEWAL_FACTS_SQL).toMatch(/o\.id != sc\.id AND datetime\(o\.signed_at\) >= datetime\(sc\.signed_at\)/);
  });
});

describe("sdílená firma z doby před exkluzivitou (kdo se dohodne první)", () => {
  const TEAM: NegotiationTeam = {
    id: "t1", name: "FK Löffler Spůle", reputation: 60, budget: 100000, league_id: "l1",
    game_date: "2026-09-23T00:00:00.000Z", last_main_sponsor_change_season: 5, district: "okres1", size: "mesto",
  };
  const SPONSOR: NegotiationSponsor = { id: 7, name: "Löffler", type: "potraviny", district: "okres1", monthly_max: 5000 };
  // Vlastní sdílená smlouva klubu: končí letos, nevznikla jednáním (migrace 0215).
  const OWN_SHARED: ContractRow = {
    id: "c1", sponsor_id: 7, sponsor_name: "Löffler", monthly_amount: 1000, win_bonus: 0,
    seasons_remaining: 1, early_termination_fee: 100, status: "active", negotiation_id: null,
  };
  const OWN_QUERY = /SELECT id FROM sponsor_contracts WHERE sponsor_id = \? AND team_id = \?/;
  const HOLDER = /sc\.sponsor_id = \? AND sc\.status = 'active' AND sc\.category = 'main'/;
  const EXEMPT = /sc\.team_id != \? AND NOT \(sc\.seasons_remaining <= 1 AND sc\.negotiation_id IS NULL\)/;
  const OTHER_SHARED = { team_id: "t2", name: "FK Löffler Hradčany", sponsor_name: "Löffler", negotiation_id: null };
  const OTHER_SIGNED = { ...OTHER_SHARED, negotiation_id: "n9" };
  /**
   * Falešná D1 napodobí SQL: dotaz s výjimkou pro sdílený zbytek vrátí jen smlouvu jiného klubu,
   * která zbytkem není (`signedByOther`), dotaz bez výjimky vrátí jakoukoli.
   */
  const dbFor = (o: { own: boolean; signedByOther: boolean }) => new FalesnaD1([
    { sql: /FROM sponsor_contracts WHERE team_id = \? AND status = 'active' AND COALESCE\(category, 'main'\) = \?/, first: o.own ? OWN_SHARED : null },
    { sql: OWN_QUERY, first: o.own ? { id: "c1" } : null },
    { sql: EXEMPT, first: o.signedByOther ? OTHER_SIGNED : null },
    { sql: HOLDER, first: o.signedByOther ? OTHER_SIGNED : OTHER_SHARED },
  ]);

  it("klub, který firmu sdílí: jednat o prodloužení jde, limit změny sponzora ho nebrzdí", async () => {
    const d = dbFor({ own: true, signedByOther: false });
    const a = await negotiationAvailability(jakoD1(d), TEAM, SPONSOR, "main", 5);
    expect(a).toEqual({ canOpen: true, reason: null, isRenewal: true, openId: null });
    const holderQ = d.dotazy.find((q) => HOLDER.test(q.sql))!;
    expect(holderQ.sql).toMatch(EXEMPT);
    expect(holderQ.params).toEqual([7, "t1"]);
  });

  it("stejný klub i v contractBlock (znovu při podpisu): bez blokace", async () => {
    const d = dbFor({ own: true, signedByOther: false });
    expect(await contractBlock(jakoD1(d), TEAM, SPONSOR, "main", 5, { active: OWN_SHARED, lastExpired: null })).toBeNull();
  });

  it("druhý klub podepsal dřív: sdílený klub je blokovaný s vysvětlením", async () => {
    const d = dbFor({ own: true, signedByOther: true });
    const a = await negotiationAvailability(jakoD1(d), TEAM, SPONSOR, "main", 5);
    expect(a.canOpen).toBe(false);
    expect(a.reason).toBe("Löffler už podepsal smlouvu s klubem FK Löffler Hradčany od příští sezóny");
    expect(a.reason).not.toContain("—");
  });

  it("klub, který firmu nesdílí: blokovaný jako dřív, výjimka se na něj nevztahuje", async () => {
    const team = { ...TEAM, last_main_sponsor_change_season: null };
    const d = dbFor({ own: false, signedByOther: false });
    const a = await negotiationAvailability(jakoD1(d), team, SPONSOR, "main", 5);
    expect(a.canOpen).toBe(false);
    expect(a.isRenewal).toBe(false);
    expect(a.reason).toBe("Löffler je hlavním sponzorem klubu FK Löffler Hradčany");
    expect(d.dotazy.find((q) => HOLDER.test(q.sql))!.sql).not.toMatch(EXEMPT);
  });
});
