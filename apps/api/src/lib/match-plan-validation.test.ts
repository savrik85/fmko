import { describe, it, expect } from "vitest";
import { validateMatchPlan, parseStoredPlan } from "./match-plan-validation";

/**
 * Hranice API. Co projde tudy, engine už nekontroluje — neplatná taktika by se
 * tam projevila až podivným průběhem zápasu, ne chybou.
 */

const ctx = {
  starterIds: new Set(["p1", "p2", "p3"]),
  squadIds: new Set(["p1", "p2", "p3", "p4", "p5"]),
};

function ok(raw: unknown) {
  const r = validateMatchPlan(raw, ctx);
  if (!r.ok) throw new Error(`čekal jsem platný plán, přišlo: ${r.error}`);
  return r.plan;
}

function chyba(raw: unknown): string {
  const r = validateMatchPlan(raw, ctx);
  if (r.ok) throw new Error("čekal jsem chybu, plán prošel");
  return r.error;
}

const pravidlo = (over: Record<string, unknown> = {}) => ({
  id: "r1", fromMinute: 60,
  trigger: { kind: "score", state: "losing" },
  action: { kind: "tactic", tactic: "offensive" },
  ...over,
});

describe("prázdný a chybějící plán", () => {
  it("chybějící plán projde jako prázdný — starší web o pokynech neví", () => {
    expect(ok(undefined)).toEqual([]);
    expect(ok(null)).toEqual([]);
  });

  it("prázdný seznam projde", () => {
    expect(ok([])).toEqual([]);
  });

  it("cokoli jiného než seznam je chyba", () => {
    expect(chyba({ kind: "tactic" })).toContain("seznam");
    expect(chyba("plán")).toContain("seznam");
  });
});

describe("limity", () => {
  it("víc než pět pokynů neprojde", () => {
    const seznam = Array.from({ length: 6 }, (_, i) => pravidlo({ id: `r${i}` }));
    expect(chyba(seznam)).toContain("nejvýš 5");
  });

  it("pět pokynů ještě projde", () => {
    expect(ok(Array.from({ length: 5 }, (_, i) => pravidlo({ id: `r${i}` })))).toHaveLength(5);
  });

  it("duplicitní id neprojde — engine podle něj hlídá jednorázovost", () => {
    expect(chyba([pravidlo(), pravidlo()])).toContain("duplicitní");
  });
});

describe("minuta", () => {
  it("mimo 1–90 neprojde", () => {
    expect(chyba([pravidlo({ fromMinute: 0 })])).toContain("minuta");
    expect(chyba([pravidlo({ fromMinute: 91 })])).toContain("minuta");
    expect(chyba([pravidlo({ fromMinute: 45.5 })])).toContain("minuta");
  });

  it("krajní hodnoty projdou", () => {
    expect(ok([pravidlo({ fromMinute: 1 })])[0].fromMinute).toBe(1);
    expect(ok([pravidlo({ fromMinute: 90 })])[0].fromMinute).toBe(90);
  });
});

describe("podmínky", () => {
  it("neznámá podmínka neprojde", () => {
    expect(chyba([pravidlo({ trigger: { kind: "pocasi" } })])).toContain("neznámá podmínka");
  });

  it("skóre bez rozdílu dostane výchozí jeden gól", () => {
    const p = ok([pravidlo({ trigger: { kind: "score", state: "winning" } })]);
    expect(p[0].trigger).toEqual({ kind: "score", state: "winning", byAtLeast: 1 });
  });

  it("remíza rozdíl gólů nenese", () => {
    const p = ok([pravidlo({ trigger: { kind: "score", state: "drawing", byAtLeast: 2 } })]);
    expect(p[0].trigger).toEqual({ kind: "score", state: "drawing" });
  });

  it("rozdíl gólů mimo 1–3 neprojde", () => {
    expect(chyba([pravidlo({ trigger: { kind: "score", state: "losing", byAtLeast: 4 } })])).toContain("rozdíl gólů");
    expect(chyba([pravidlo({ trigger: { kind: "score", state: "losing", byAtLeast: 0 } })])).toContain("rozdíl gólů");
  });

  it("kondice mimo 10–60 neprojde", () => {
    expect(chyba([pravidlo({ trigger: { kind: "condition", below: 5 } })])).toContain("kondice");
    expect(chyba([pravidlo({ trigger: { kind: "condition", below: 90 } })])).toContain("kondice");
    expect(ok([pravidlo({ trigger: { kind: "condition", below: 30 } })])).toHaveLength(1);
  });

  it("neplatný početní stav neprojde", () => {
    expect(chyba([pravidlo({ trigger: { kind: "men", state: "vedle" } })])).toContain("početní stav");
  });
});

describe("akce", () => {
  it("neplatná taktika neprojde", () => {
    expect(chyba([pravidlo({ action: { kind: "tactic", tactic: "beton" } })])).toContain("taktika");
  });

  it("neplatná tvrdost neprojde", () => {
    expect(chyba([pravidlo({ action: { kind: "hardness", hardness: "brutalne" } })])).toContain("tvrdost");
  });

  it("střídání musí mít hráče ze sestavy a z lavičky", () => {
    expect(ok([pravidlo({ action: { kind: "sub", outPlayerId: "p1", inPlayerId: "p4" } })])).toHaveLength(1);
  });

  it("střídaný hráč mimo základní sestavu neprojde", () => {
    expect(chyba([pravidlo({ action: { kind: "sub", outPlayerId: "p4", inPlayerId: "p5" } })]))
      .toContain("střídaný hráč není v základní sestavě");
  });

  it("střídající hráč mimo kádr neprojde", () => {
    expect(chyba([pravidlo({ action: { kind: "sub", outPlayerId: "p1", inPlayerId: "cizi" } })]))
      .toContain("není v kádru");
  });

  it("střídající hráč ze základní sestavy neprojde", () => {
    expect(chyba([pravidlo({ action: { kind: "sub", outPlayerId: "p1", inPlayerId: "p2" } })]))
      .toContain("už je v základní sestavě");
  });

  it("hráč nemůže střídat sám sebe", () => {
    expect(chyba([pravidlo({ action: { kind: "sub", outPlayerId: "p1", inPlayerId: "p1" } })]))
      .toContain("sám sebe");
  });
});

describe("čtení uloženého plánu", () => {
  it("prázdný sloupec je prázdný plán", () => {
    expect(parseStoredPlan(null)).toEqual([]);
    expect(parseStoredPlan("")).toEqual([]);
  });

  it("poškozené JSON nespadne, jen se plán zahodí", () => {
    expect(parseStoredPlan("{tohle není json")).toEqual([]);
    expect(parseStoredPlan('{"kind":"tactic"}')).toEqual([]);
  });

  it("platné pole se načte", () => {
    expect(parseStoredPlan('[{"id":"r1"}]')).toEqual([{ id: "r1" }]);
  });
});
