/**
 * Jednání se sponzorem přes routu: návrh jde poslat i do jednání ve stavu 'accepted' (nahradí
 * přijaté podmínky), zámek zápisu kola respektuje NAČTENÝ stav a dobrovolné ukončení jednání
 * (POST .../close) nesahá na náklonnost ani cooldown. DB vrstva (saveRound, closeNegotiation)
 * má vlastní testy v ../sponsors/negotiation-db.test.ts, tady se ověřuje routa jako celek.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import type { Bindings } from "../index";
import { sponsorsRouter } from "./sponsors";

function bindings(db: FalesnaD1): Bindings {
  return {
    DB: jakoD1(db),
    SESSION_KV: { get: async () => JSON.stringify({ userId: "u1" }) },
  } as unknown as Bindings;
}

const TEAM_ROW = {
  id: "t1", name: "Klub", reputation: 60, budget: 100000, league_id: null,
  game_date: "2026-09-23T00:00:00.000Z", last_main_sponsor_change_season: null, district: "okres1", size: "mesto",
};
const SPONSOR_ROW = { id: 7, name: "Firma", type: "potraviny", district: "okres1", monthly_max: 5000 };
const OWNER_ROW = { sponsor_id: 7, first_name: "Jan", last_name: "Novák", age: 45, face_config: "{}", personality: "businessman" };
// budget_b 10000, businessman (seasonMultiplier 1): ochota = min(1,1×10000, 2,0×10000) = 11000.
const NEG_ROW = {
  id: "n1", team_id: "t1", sponsor_id: 7, category: "main" as const, wishes: "[]", budget_b: 10000,
  patience: 3, rounds: "[]", status: "accepted" as const, expires_game_date: "2026-09-30T00:00:00.000Z",
  cooldown_until: null, created_at: "2026-09-23 10:00:00",
};

/** Vše, co loadNegotiationState (a jím volaný buildNegotiationContext) potřebuje; nezmíněné dotazy FalesnaD1 defaultuje na null/[]. */
function baseRules(negRow: Record<string, unknown>, extra: Pravidlo[] = []): Pravidlo[] {
  return [
    { sql: /SELECT id FROM teams WHERE id = \? AND user_id = \?/, first: { id: "t1" } },
    { sql: /^SELECT \* FROM sponsor_negotiations WHERE id = \? AND team_id = \?/, first: negRow },
    { sql: /FROM teams t JOIN villages v ON v\.id = t\.village_id/, first: TEAM_ROW },
    { sql: /SELECT id, name, type, district, monthly_max FROM district_sponsors WHERE id = \?/, first: SPONSOR_ROW },
    { sql: /FROM sponsor_owners WHERE sponsor_id IN/, all: [OWNER_ROW] },
    { sql: /FROM seasons WHERE status = 'active'/, first: { number: 5 } },
    { sql: /status = 'active' AND COALESCE\(category/, first: null },
    { sql: /status = 'expired' AND COALESCE\(category/, first: null },
    ...extra,
  ];
}

const AUTH = { Authorization: "Bearer tok" };

// Willingness (o) = 11000 (viz NEG_ROW): 5000 je pod ní (přijme), 12000 je nad ní, ale pod 1,15×o (protinabídka).
const acceptProposal = {
  seasons: 2, promises: [],
  demands: { monthly: 5000, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false },
};
const counterProposal = { ...acceptProposal, demands: { ...acceptProposal.demands, monthly: 12000 } };

describe("POST .../negotiations/:id/propose z jednání ve stavu accepted", () => {
  it("přijatý návrh (accept): dřív blokováno (409), teď povolené, zámek drží 'accepted'", async () => {
    const db = new FalesnaD1(baseRules(NEG_ROW, [{ sql: /^UPDATE sponsor_negotiations SET rounds/, changes: 1 }]));
    const res = await sponsorsRouter.request(
      "/teams/t1/sponsors/negotiations/n1/propose",
      { method: "POST", headers: { "Content-Type": "application/json", ...AUTH }, body: JSON.stringify(acceptProposal) },
      bindings(db),
    );
    expect(res.status).toBe(200);
    const upd = db.dotazy.find((d) => /^UPDATE sponsor_negotiations SET rounds/.test(d.sql))!;
    expect(upd).toBeTruthy();
    expect(upd.sql).toContain("status = ? AND rounds = ?");
    // Bind pořadí: rounds, next.status, patience, cooldownUntil, id, NAČTENÝ stav (zámek), roundsRaw.
    expect(upd.params[1]).toBe("accepted"); // přijato znovu: status zůstává accepted
    expect(upd.params[5]).toBe("accepted"); // zámek respektuje načtený stav (přijaté jednání), ne natvrdo 'open'
  });

  it("protinabídka z accepted: nový návrh nahradí přijaté podmínky, jednání se vrací do open", async () => {
    const db = new FalesnaD1(baseRules(NEG_ROW, [{ sql: /^UPDATE sponsor_negotiations SET rounds/, changes: 1 }]));
    const res = await sponsorsRouter.request(
      "/teams/t1/sponsors/negotiations/n1/propose",
      { method: "POST", headers: { "Content-Type": "application/json", ...AUTH }, body: JSON.stringify(counterProposal) },
      bindings(db),
    );
    expect(res.status).toBe(200);
    const upd = db.dotazy.find((d) => /^UPDATE sponsor_negotiations SET rounds/.test(d.sql))!;
    expect(upd.params[1]).toBe("open");
    expect(upd.params[5]).toBe("accepted");
  });

  it("dvojklik na přijaté jednání: zámek prohraje (rounds se mezitím změnily), 409", async () => {
    const db = new FalesnaD1(baseRules(NEG_ROW, [{ sql: /^UPDATE sponsor_negotiations SET rounds/, changes: 0 }]));
    const res = await sponsorsRouter.request(
      "/teams/t1/sponsors/negotiations/n1/propose",
      { method: "POST", headers: { "Content-Type": "application/json", ...AUTH }, body: JSON.stringify(acceptProposal) },
      bindings(db),
    );
    expect(res.status).toBe(409);
  });
});

describe("POST .../negotiations/:id/close", () => {
  it("klub jednání dobrovolně ukončí: status expired, bez cooldownu, bez pokuty na náklonnost", async () => {
    const db = new FalesnaD1(baseRules(NEG_ROW, [{ sql: /UPDATE sponsor_negotiations SET status = 'expired'/, changes: 1 }]));
    const res = await sponsorsRouter.request(
      "/teams/t1/sponsors/negotiations/n1/close",
      { method: "POST", headers: AUTH },
      bindings(db),
    );
    expect(res.status).toBe(200);
    const upd = db.dotazy.find((d) => /UPDATE sponsor_negotiations SET status = 'expired'/.test(d.sql))!;
    expect(upd).toBeTruthy();
    expect(upd.sql).toContain("cooldown_until = NULL");
    expect(upd.sql).toContain("status IN ('open','accepted')");
    expect(upd.params).toEqual(["n1", "t1"]);
    // Žádná dávka: dobrovolné ukončení nezapisuje do deníku náklonnosti ani ji nemění (na rozdíl od walked_away).
    expect(db.davky).toHaveLength(0);
  });

  it("na už podepsané (signed) jednání vrátí 409, bez pokusu o UPDATE", async () => {
    const db = new FalesnaD1(baseRules({ ...NEG_ROW, status: "signed" }));
    const res = await sponsorsRouter.request(
      "/teams/t1/sponsors/negotiations/n1/close",
      { method: "POST", headers: AUTH },
      bindings(db),
    );
    expect(res.status).toBe(409);
    expect(db.dotazy.some((d) => /UPDATE sponsor_negotiations SET status = 'expired'/.test(d.sql))).toBe(false);
  });

  it("souběžné zavření prohraje podmíněný UPDATE (mezitím uzavřeno jinak): 409", async () => {
    const db = new FalesnaD1(baseRules(NEG_ROW, [{ sql: /UPDATE sponsor_negotiations SET status = 'expired'/, changes: 0 }]));
    const res = await sponsorsRouter.request(
      "/teams/t1/sponsors/negotiations/n1/close",
      { method: "POST", headers: AUTH },
      bindings(db),
    );
    expect(res.status).toBe(409);
  });
});
