/**
 * Vůdci fanoušků v hospodě.
 *
 * Hlídá hlavně to, že scéna odpovídá stavu: naštvaný kotel nezaplatí rundu a
 * hospodský vůdce večer před zápasem neuvidí plný stůl hráčů bez reakce.
 */
import { describe, it, expect } from "vitest";
import {
  dorazilDoHospody, scenaSVudcem, scenaSTrenerem, HRACU_UZ_MOC,
  type VudceVHospode,
} from "./pub-fan-leaders";

const v = (o: Partial<VudceVHospode> = {}): VudceVHospode => ({
  leaderId: "l1", groupId: "g1", groupKind: "kotel",
  jmeno: "Tomáš „Sysel“ Řepka", archetype: "hospodsky_vudce",
  radikalnost: 40, vyjednavani: 50, mood: 55, heat: 10, sentiment: 0, ...o,
});

const hraci = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, jmeno: `Hráč ${i}` }));

describe("kdo do hospody chodí", () => {
  it("hospodský vůdce skoro vždycky, organizátorka skoro nikdy", () => {
    expect(dorazilDoHospody(v({ archetype: "hospodsky_vudce" }), 0.5)).toBe(true);
    expect(dorazilDoHospody(v({ archetype: "organizatorka" }), 0.5)).toBe(false);
  });

  it("naštvaná parta posílá svého člověka spíš", () => {
    const klid = v({ archetype: "predseda_fanklubu", heat: 0, mood: 60 });
    const zloba = v({ archetype: "predseda_fanklubu", heat: 90, mood: 15 });
    // Hodnota, kterou klidný nepřekoná a naštvaný ano.
    expect(dorazilDoHospody(klid, 0.45)).toBe(false);
    expect(dorazilDoHospody(zloba, 0.45)).toBe(true);
  });
});

describe("co se v hospodě semele", () => {
  it("plný stůl den před zápasem vůdce nenechá být", () => {
    const s = scenaSVudcem(v({ mood: 80 }), hraci(HRACU_UZ_MOC), {
      predZapasem: true, roll: 0.9, vyberHrace: 0,
    });
    expect(s?.type).toBe("vudce_vytka");
    expect(s!.moraleDelta).toBeLessThan(0);
    expect(s!.fan.heat).toBeGreaterThan(0);
  });

  it("radikál vytkne ostřeji než vyjednavač", () => {
    const ostry = scenaSVudcem(v({ radikalnost: 80 }), hraci(5), { predZapasem: true, roll: 0.5, vyberHrace: 0 });
    const mirny = scenaSVudcem(v({ radikalnost: 20 }), hraci(5), { predZapasem: true, roll: 0.5, vyberHrace: 0 });
    expect(ostry!.moraleDelta).toBeLessThan(mirny!.moraleDelta);
  });

  it("pár hráčů den před zápasem ještě problém není", () => {
    const s = scenaSVudcem(v({ mood: 80 }), hraci(HRACU_UZ_MOC - 1), {
      predZapasem: true, roll: 0.2, vyberHrace: 0,
    });
    expect(s?.type).not.toBe("vudce_vytka");
  });

  it("naštvaná parta si to s hráčem vyříká a trochu jí to uleví", () => {
    const s = scenaSVudcem(v({ heat: 70, mood: 30 }), hraci(2), {
      predZapasem: false, roll: 0.1, vyberHrace: 0,
    });
    expect(s?.type).toBe("vudce_konfrontace");
    expect(s!.moraleDelta).toBeLessThan(0);
    expect(s!.fan.heat).toBeLessThan(0);
  });

  it("spokojená parta platí rundu a hráčům to zvedne morálku", () => {
    const s = scenaSVudcem(v({ mood: 80, heat: 0 }), hraci(3), {
      predZapasem: false, roll: 0.1, vyberHrace: 0,
    });
    expect(s?.type).toBe("vudce_runda");
    expect(s!.moraleDelta).toBeGreaterThan(0);
    expect(s!.fan.sentiment).toBeGreaterThan(0);
  });

  it("prázdná hospoda a klidná parta znamená ticho", () => {
    expect(scenaSVudcem(v({ heat: 10 }), [], { predZapasem: false, roll: 0.5, vyberHrace: 0 })).toBeNull();
  });

  it("prázdná hospoda a naštvaná parta znamená nadávání u výčepu", () => {
    const s = scenaSVudcem(v({ heat: 80 }), [], { predZapasem: false, roll: 0.5, vyberHrace: 0 });
    expect(s?.type).toBe("vudce_sam");
    expect(s!.playerIds).toHaveLength(0);
  });

  it("scéna nikdy nesahá na hráče, které nezmínila", () => {
    for (const roll of [0, 0.3, 0.6, 0.9]) {
      for (const n of [0, 1, 3, 6]) {
        const s = scenaSVudcem(v({ heat: 70 }), hraci(n), { predZapasem: true, roll, vyberHrace: 2 });
        if (!s) continue;
        expect(s.playerIds.length).toBeLessThanOrEqual(n);
        if (s.moraleDelta !== 0) expect(s.playerIds.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("setkání s trenérem", () => {
  it("naštvaný vůdce si to vyříká a vztah to zhorší", () => {
    const s = scenaSTrenerem(v({ heat: 75 }), 0.5);
    expect(s?.type).toBe("vudce_trener_hadka");
    expect(s!.fan.sentiment).toBeLessThan(0);
  });

  it("v klidu si dají pivo a vztah se zlepší", () => {
    const s = scenaSTrenerem(v({ heat: 10 }), 0.1);
    expect(s?.type).toBe("vudce_trener_pivo");
    expect(s!.fan.sentiment).toBeGreaterThan(0);
    expect(s!.fan.heat).toBeLessThan(0);
  });
});
