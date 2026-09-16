/**
 * Vůdci fanoušků v hospodě.
 *
 * Hlídá hlavně to, že scéna odpovídá stavu: naštvaný kotel nezaplatí rundu a
 * hospodský vůdce večer před zápasem neuvidí plný stůl hráčů bez reakce.
 */
import { describe, it, expect } from "vitest";
import {
  dorazilDoHospody, scenaSVudcem, scenaSTrenerem, scenaOZapase, hracuAkuz,
  HRACU_UZ_MOC, type VudceVHospode, type PosledniZapas, type VykonHrace,
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

describe("aby se to neopakovalo", () => {
  const remiza: PosledniZapas = { vyhra: false, remiza: true, gf: 6, ga: 6, souper: "Dvory", doma: true };

  it("dva vůdci nad stejnou remízou neřeknou totéž", () => {
    // Přesně situace ze hry: tři vůdci v hospodě, jedna remíza, stejná větev.
    const texty = new Set<string>();
    for (let varianta = 0; varianta < 20; varianta++) {
      const s = scenaOZapase(v(), remiza, [], { roll: 0.1, vyber: 0, varianta });
      expect(s?.type).toBe("vudce_rozbor_remiza");
      texty.add(s!.text);
    }
    expect(texty.size).toBeGreaterThan(4);
  });

  it("stejná varianta dá stejnou větu, aby se běh dal zopakovat", () => {
    const a = scenaOZapase(v(), remiza, [], { roll: 0.1, vyber: 0, varianta: 7 });
    const b = scenaOZapase(v(), remiza, [], { roll: 0.1, vyber: 0, varianta: 7 });
    expect(a!.text).toBe(b!.text);
  });

  it("okresní kolorit se přidává, nenahrazuje", () => {
    const bezOkresu = new Set<string>();
    const sOkresem = new Set<string>();
    for (let varianta = 0; varianta < 30; varianta++) {
      bezOkresu.add(scenaOZapase(v(), remiza, [], { roll: 0.1, vyber: 0, varianta })!.text);
      sOkresem.add(scenaOZapase(v(), remiza, [], { roll: 0.1, vyber: 0, varianta, okres: "Prachatice" })!.text);
    }
    expect(sOkresem.size).toBeGreaterThan(bezOkresu.size);
  });

  it("scény s hráči vedle sebe střídají věty", () => {
    const texty = new Set<string>();
    for (let varianta = 0; varianta < 20; varianta++) {
      const s = scenaSVudcem(v({ mood: 80 }), hraci(3), {
        predZapasem: false, roll: 0.1, vyberHrace: 0, varianta,
      });
      texty.add(s!.text);
    }
    expect(texty.size).toBeGreaterThan(4);
  });

  it("i setkání s trenérem má víc podob", () => {
    const texty = new Set<string>();
    for (let varianta = 0; varianta < 20; varianta++) {
      texty.add(scenaSTrenerem(v({ heat: 75 }), 0.5, { varianta })!.text);
    }
    expect(texty.size).toBeGreaterThan(3);
  });
});

describe("počty hráčů česky", () => {
  it("skloňuje podle počtu", () => {
    expect(hracuAkuz(1)).toBe("jednoho hráče");
    expect(hracuAkuz(4)).toBe("4 hráče");
    expect(hracuAkuz(5)).toBe("5 hráčů");
    expect(hracuAkuz(11)).toBe("11 hráčů");
  });

  it("výtka za plnou hospodu použije správný tvar", () => {
    const ctyri = scenaSVudcem(v(), hraci(4), { predZapasem: true, roll: 0.5, vyberHrace: 0 });
    const sest = scenaSVudcem(v(), hraci(6), { predZapasem: true, roll: 0.5, vyberHrace: 0 });
    expect(ctyri!.text).toContain("4 hráče");
    expect(sest!.text).toContain("6 hráčů");
  });
});

describe("chvála a kárání", () => {
  const prohra: PosledniZapas = { vyhra: false, remiza: false, gf: 0, ga: 3, souper: "Dvory", doma: false };
  const vykon = (o: Partial<VykonHrace> = {}): VykonHrace => ({
    playerId: "p1", jmeno: "Jan Novák", odehral: true, goly: 0, asistence: 0,
    znamka: 6, cervena: false, ...o,
  });

  it("střelec dvou gólů dostane pivo a morálku", () => {
    const zapas: PosledniZapas = { ...prohra, vyhra: true, gf: 3, ga: 1 };
    const s = scenaOZapase(v(), zapas, [vykon({ goly: 2 })], { roll: 0.1, vyber: 0 });
    expect(s?.type).toBe("vudce_chvali_hrace");
    expect(s!.moraleDelta).toBeGreaterThan(0);
    expect(s!.text).toContain("Jan Novák");
  });

  it("červená po prohře se neodpouští a radikál je ostřejší", () => {
    const ostry = scenaOZapase(v({ radikalnost: 80 }), prohra, [vykon({ cervena: true })], { roll: 0.1, vyber: 0 });
    const mirny = scenaOZapase(v({ radikalnost: 20 }), prohra, [vykon({ cervena: true })], { roll: 0.1, vyber: 0 });
    expect(ostry?.type).toBe("vudce_kara_hrace");
    expect(ostry!.moraleDelta).toBeLessThan(mirny!.moraleDelta);
  });

  it("bez odehraného zápasu se o zápase nemluví", () => {
    expect(scenaOZapase(v(), null, [], { roll: 0.1, vyber: 0 })).toBeNull();
  });
});

describe("čeština v hospodských větách", () => {
  // Jména se nedají skloňovat, takže se hlídá, že se v šablonách nedostala za
  // předložku. Rozpoznatelná jména místo běžných, ať se dá hledat regulárem.
  const VUDCE = "XVUDCEX";
  const HRAC = "XHRACX";
  const PREDLOZKY = /(?:^|\s)(s|se|od|k|ke|pro|proti|u|bez|vedle|kolem|naproti|do|za|na|o|po|před)\s+X(?:VUDCE|HRAC|JMENA)X/;

  const vzorek = (): string[] => {
    const out: string[] = [];
    const hrac = [{ playerId: "p1", jmeno: HRAC }];
    const vice = [{ playerId: "p1", jmeno: HRAC }, { playerId: "p2", jmeno: "XJMENAX" }];
    const vykony: VykonHrace[] = [
      { playerId: "p1", jmeno: HRAC, odehral: true, goly: 2, asistence: 0, znamka: 9, cervena: false },
    ];
    const spatne: VykonHrace[] = [
      { playerId: "p1", jmeno: HRAC, odehral: true, goly: 0, asistence: 0, znamka: 3, cervena: true },
    ];
    const zapasy: PosledniZapas[] = [
      { vyhra: true, remiza: false, gf: 3, ga: 1, souper: "XSOUPERX", doma: true },
      { vyhra: false, remiza: true, gf: 1, ga: 1, souper: "XSOUPERX", doma: true },
      { vyhra: false, remiza: false, gf: 0, ga: 2, souper: "XSOUPERX", doma: false },
    ];
    for (const gender of ["m", "f"] as const) {
      for (let varianta = 0; varianta < 40; varianta++) {
        for (const okres of [undefined, "Prachatice", "Praha"]) {
          const o = { varianta, okres };
          const vud = (x: Partial<VudceVHospode> = {}) => v({ jmeno: VUDCE, gender, ...x });
          const scenky = [
            scenaSVudcem(vud({ heat: 80 }), [], { predZapasem: false, roll: 0.5, vyberHrace: 0, ...o }),
            scenaSVudcem(vud({ radikalnost: 80 }), hraci(5), { predZapasem: true, roll: 0.5, vyberHrace: 0, ...o }),
            scenaSVudcem(vud({ radikalnost: 20 }), hraci(6), { predZapasem: true, roll: 0.5, vyberHrace: 0, ...o }),
            scenaSVudcem(vud({ heat: 70, mood: 30 }), hrac, { predZapasem: false, roll: 0.1, vyberHrace: 0, ...o }),
            scenaSVudcem(vud({ mood: 80 }), vice, { predZapasem: false, roll: 0.1, vyberHrace: 0, ...o }),
            scenaSVudcem(vud({ mood: 80 }), hrac, { predZapasem: false, roll: 0.9, vyberHrace: 0, ...o }),
            scenaSVudcem(vud({ mood: 20, heat: 20 }), vice, { predZapasem: false, roll: 0.2, vyberHrace: 0, ...o }),
            scenaSTrenerem(vud({ heat: 75 }), 0.5, o),
            scenaSTrenerem(vud({ heat: 10 }), 0.1, o),
          ];
          for (const z of zapasy) {
            scenky.push(scenaOZapase(vud(), z, vykony, { roll: 0.1, vyber: 0, ...o }));
            scenky.push(scenaOZapase(vud({ radikalnost: 80 }), z, spatne, { roll: 0.5, vyber: 0, ...o }));
            scenky.push(scenaOZapase(vud({ radikalnost: 20 }), z, [], { roll: 0.5, vyber: 0, ...o }));
          }
          for (const x of scenky) if (x) out.push(x.text);
        }
      }
    }
    return out;
  };

  it("v žádné větě nezůstane nevyplněné místo", () => {
    for (const t of vzorek()) expect(t).not.toMatch(/[{}]/);
  });

  it("jméno nikdy nestojí za předložkou, skloňovat ho neumíme", () => {
    const spatne = vzorek().filter((t) => PREDLOZKY.test(t));
    expect(spatne).toEqual([]);
  });

  it("vůdkyně mluví v ženském rodě", () => {
    const zena = scenaSVudcem(v({ heat: 80, gender: "f" }), [], {
      predZapasem: false, roll: 0.5, vyberHrace: 0, varianta: 0,
    });
    const muz = scenaSVudcem(v({ heat: 80, gender: "m" }), [], {
      predZapasem: false, roll: 0.5, vyberHrace: 0, varianta: 0,
    });
    expect(zena!.text).toContain("seděla");
    expect(muz!.text).toContain("seděl ");
  });

  it("nikde nezůstane mužský tvar u vůdkyně", () => {
    // Mužské tvary, které by prozradily, že se koncovka zapomněla ohnout.
    for (const gender of ["f"] as const) {
      for (let varianta = 0; varianta < 40; varianta++) {
        const s = scenaSVudcem(v({ heat: 80, gender }), [], {
          predZapasem: false, roll: 0.5, vyberHrace: 0, varianta,
        });
        if (s) expect(s.text).not.toMatch(/(^|\s)(seděl|čekal|nechal|zůstal|obsadil|stěžoval|nadával|probíral|dostal)(\s|\.|,)/);
      }
    }
  });

  it("počet hráčů sedí se slovesem", () => {
    for (let varianta = 0; varianta < 20; varianta++) {
      for (const n of [4, 5, 6, 11]) {
        const s = scenaSVudcem(v({ radikalnost: 80 }), hraci(n), {
          predZapasem: true, roll: 0.5, vyberHrace: 0, varianta,
        });
        // „sedělo 4 hráče" i „seděli 5 hráčů" jsou obojí špatně.
        expect(s!.text).not.toMatch(/sedělo \d+ hráče/);
        expect(s!.text).not.toMatch(/seděli \d+ hráčů/);
      }
    }
  });

  it("jmenovci u stolu se nezdvojí", () => {
    const dvojnici = [
      { playerId: "p1", jmeno: "Ondřej Janoušek" },
      { playerId: "p2", jmeno: "Ondřej Janoušek" },
    ];
    const s = scenaSVudcem(v({ mood: 80 }), dvojnici, {
      predZapasem: false, roll: 0.1, vyberHrace: 0, varianta: 0,
    });
    expect(s!.text).not.toContain("Ondřej Janoušek a Ondřej Janoušek");
  });

  it("jeden hráč u stolu nedostane množné sloveso", () => {
    const jeden = [{ playerId: "p1", jmeno: "Tomáš Sedlák" }];
    for (let varianta = 0; varianta < 30; varianta++) {
      for (const roll of [0.1, 0.9]) {
        const s = scenaSVudcem(v({ mood: 80 }), jeden, {
          predZapasem: false, roll, vyberHrace: 0, varianta,
        });
        if (!s) continue;
        expect(s.text).not.toMatch(/Sedlák \S*(li|ly)(\s|\.|,)/);
        expect(s.text).not.toMatch(/(seděli|neprotestovali|připili|nepohrdli) /);
      }
    }
  });

  it("žádná dlouhá pomlčka", () => {
    for (const t of vzorek()) expect(t).not.toContain("—");
  });
});
