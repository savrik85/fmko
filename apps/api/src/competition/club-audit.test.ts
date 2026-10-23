/**
 * Revize účetnictví: příznaky se poměřují se zbytkem soutěže, přestupy přebírají
 * příznaky z listiny přestupů a do účetnictví smí jen komisař nebo prezident.
 */
import { describe, expect, it } from "vitest";
import { auditFlags, noBuyerPrice, windowStart, CONCESSION_FLAG_RATIO } from "./club-audit";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import type { Bindings } from "../index";
import bettingRouter from "../routes/betting";

const NO_TRANSFERS: Array<{ hrac: string; zKlubu: string | null; doKlubu: string; priznaky: string[] }> = [];

describe("příznaky revize účetnictví", () => {
  it("bufet nad trojnásobkem mediánu soutěže je nápadný", () => {
    const concession = new Map([["t1", 90_000], ["t2", 20_000], ["t3", 25_000], ["t4", 30_000]]);
    const flags = auditFlags({ teamId: "t1", teamName: "FK Test", concession, betting: new Map(), transferFlags: NO_TRANSFERS });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toContain("Bufet");
    expect(flags[0]).toContain("3,6×");
  });

  it("bufet těsně pod hranicí ani běžný klub nápadné nejsou", () => {
    const concession = new Map([["t1", 74_000], ["t2", 20_000], ["t3", 25_000], ["t4", 30_000]]);
    expect(74_000 / 25_000).toBeLessThan(CONCESSION_FLAG_RATIO);
    expect(auditFlags({ teamId: "t1", teamName: "FK Test", concession, betting: new Map(), transferFlags: NO_TRANSFERS })).toEqual([]);
    expect(auditFlags({ teamId: "t2", teamName: "FK Jiný", concession, betting: new Map(), transferFlags: NO_TRANSFERS })).toEqual([]);
  });

  it("nejvyšší čistý zisk ze sázek v soutěži je nápadný, ztráta ne", () => {
    const betting = new Map([["t1", 120_000], ["t2", 30_000], ["t3", -50_000]]);
    const top = auditFlags({ teamId: "t1", teamName: "FK Test", concession: new Map(), betting, transferFlags: NO_TRANSFERS });
    expect(top.some((f) => f.includes("sázkách"))).toBe(true);
    expect(auditFlags({ teamId: "t2", teamName: "FK Jiný", concession: new Map(), betting, transferFlags: NO_TRANSFERS })).toEqual([]);
    expect(auditFlags({ teamId: "t3", teamName: "FK Třetí", concession: new Map(), betting, transferFlags: NO_TRANSFERS })).toEqual([]);
  });

  it("přestupy bere jen ty, kterých se klub účastnil a které mají příznak", () => {
    const transferFlags = [
      { hrac: "Jan Novák", zKlubu: "FK Test", doKlubu: "FK Kamarád", priznaky: ["Oba kluby patří témuž majiteli"] },
      { hrac: "Petr Malý", zKlubu: "FK Cizí", doKlubu: "FK Jiný", priznaky: ["Cena hluboko pod hodnotou hráče"] },
      { hrac: "Karel Velký", zKlubu: null, doKlubu: "FK Test", priznaky: [] },
    ];
    const flags = auditFlags({ teamId: "t1", teamName: "FK Test", concession: new Map(), betting: new Map(), transferFlags });
    expect(flags).toEqual(["Přestup Jan Novák (FK Test → FK Kamarád): Oba kluby patří témuž majiteli."]);
  });

  it("přemrštěná cena v bufetu je nápadná od hranice, kde podle vzorce nikdo nekoupí", () => {
    // Pivo L3 (Plzeň 12°) běžně 50 Kč, elasticita 0,8 → nikdo nekoupí od 112,50 Kč.
    expect(noBuyerPrice("beer", 3)).toBeCloseTo(112.5);
    const base = { teamId: "t1", teamName: "FK Test", concession: new Map(), betting: new Map(), transferFlags: NO_TRANSFERS };
    // Čeština odděluje tisíce nezlomitelnou mezerou.
    const flags = auditFlags({ ...base, prices: [{ productKey: "beer", qualityLevel: 3, sellPrice: 1000 }] })
      .map((f) => f.replace(/\u00a0/g, " "));
    expect(flags).toEqual(["Bufet: pivo za 1 000 Kč, běžně 50 Kč."]);
    expect(auditFlags({ ...base, prices: [{ productKey: "beer", qualityLevel: 3, sellPrice: 100 }] })).toEqual([]);
  });

  it("okno revize sahá 60 dní zpět", () => {
    expect(windowStart("2026-10-23T16:00:00.000Z")).toBe("2026-08-24");
  });
});

describe("revize účetnictví přes routu", () => {
  function bindings(db: FalesnaD1): Bindings {
    return {
      DB: jakoD1(db),
      SESSION_KV: { get: async () => JSON.stringify({ userId: "u1" }) },
    } as unknown as Bindings;
  }
  const AUTH = { Authorization: "Bearer tok" };
  const BASE_RULES = [
    { sql: /SELECT id FROM teams WHERE id = \? AND user_id = \?/, first: { id: "t1" } },
    { sql: /SELECT t\.league_id,/, first: { league_id: "l1", season_number: 3 } },
  ];

  it("běžný klub do účetnictví jiných nevidí", async () => {
    const db = new FalesnaD1([
      ...BASE_RULES,
      // Funkci komisaře drží jiný klub, prezidentem je taky někdo jiný.
      { sql: /FROM competition_officials\s+WHERE league_id = \? AND role = \?/, first: { team_id: "t9", status: "active" } },
    ]);
    const res = await bettingRouter.request("/teams/t1/integrity/audits/t2", { method: "POST", headers: AUTH }, bindings(db));
    expect(res.status).toBe(403);
    expect(db.dotazy.some((d) => /competition_audits/.test(d.sql))).toBe(false);
  });

  it("vlastní klub revidovat nejde", async () => {
    const db = new FalesnaD1(BASE_RULES);
    const res = await bettingRouter.request("/teams/t1/integrity/audits/t1", { method: "POST", headers: AUTH }, bindings(db));
    expect(res.status).toBe(400);
  });

  const COMMISSIONER_RULES = [
    ...BASE_RULES,
    { sql: /FROM competition_officials\s+WHERE league_id = \? AND role = \?/, first: { team_id: "t1", status: "active" } },
    { sql: /SELECT id, name FROM teams WHERE id = \? AND league_id = \? AND parent_team_id IS NULL/, first: { id: "t2", name: "FK Cíl" } },
    { sql: /SELECT game_date FROM teams WHERE id = \?/, first: { game_date: "2026-10-23T16:00:00.000Z" } },
    { sql: /SELECT id, name, budget FROM teams WHERE id = \? AND league_id = \?/, first: { id: "t2", name: "FK Cíl", budget: 12_000 } },
  ];

  it("první revize v sezóně pošle klubu SMS a vrátí účetnictví", async () => {
    const db = new FalesnaD1([...COMMISSIONER_RULES, { sql: /INSERT OR IGNORE INTO competition_audits/, changes: 1 }]);
    const res = await bettingRouter.request("/teams/t1/integrity/audits/t2", { method: "POST", headers: AUTH }, bindings(db));
    expect(res.status).toBe(200);
    expect((await res.json() as { teamName: string }).teamName).toBe("FK Cíl");
    expect(db.dotazy.some((d) => /INSERT INTO messages/.test(d.sql))).toBe(true);
  });

  it("opakovaná revize v téže sezóně už SMS neposílá", async () => {
    const db = new FalesnaD1([...COMMISSIONER_RULES, { sql: /INSERT OR IGNORE INTO competition_audits/, changes: 0 }]);
    const res = await bettingRouter.request("/teams/t1/integrity/audits/t2", { method: "POST", headers: AUTH }, bindings(db));
    expect(res.status).toBe(200);
    expect(db.dotazy.some((d) => /INSERT INTO messages/.test(d.sql))).toBe(false);
  });

  it("když se revize nezapíše, účetnictví se neukáže", async () => {
    const db = new FalesnaD1(COMMISSIONER_RULES);
    const real = jakoD1(db);
    const failingInsert = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop !== "prepare") return Reflect.get(target, prop, receiver);
        return (sql: string) => /INSERT OR IGNORE INTO competition_audits/.test(sql)
          ? { bind: () => ({ run: async () => { throw new Error("D1_ERROR: no such table: competition_audits"); } }) }
          : target.prepare(sql);
      },
    });
    const env = { DB: failingInsert, SESSION_KV: { get: async () => JSON.stringify({ userId: "u1" }) } } as unknown as Bindings;
    const res = await bettingRouter.request("/teams/t1/integrity/audits/t2", { method: "POST", headers: AUTH }, env);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(db.dotazy.some((d) => /FROM transactions/.test(d.sql))).toBe(false);
  });
});
