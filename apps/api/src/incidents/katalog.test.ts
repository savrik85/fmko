import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../generators/rng";
import { CINY_HRACE, cinHrace, KATALOG, KATALOG_PODLE_KIND, muzeOhlasit, sanceZproneveryPodleUsudku } from "./katalog";
import { hrac, PROBLEMOVY, stavKlubu } from "./testovaci-stav";
import type { StavKlubu } from "./typy";

const def = (kind: string) => {
  const d = KATALOG_PODLE_KIND.get(kind);
  if (!d) throw new Error(`chybí ${kind}`);
  return d;
};
const proSeedy = (fn: (rng: Rng) => void, pocet = 300) => {
  for (let s = 1; s <= pocet; s++) fn(createRng(s));
};

describe("katalog: každý typ je jednou a má popisek", () => {
  it("unikátní kindy", () => {
    const kindy = KATALOG.map((d) => d.kind);
    expect(new Set(kindy).size).toBe(kindy.length);
    for (const d of KATALOG) {
      expect(d.label.length, d.kind).toBeGreaterThan(0);
      expect(d.emoji.length, d.kind).toBeGreaterThan(0);
    }
  });
});

describe("katalog: nikdy se nesáhne na věc, kterou klub nemá", () => {
  it("vloupání jen s něčím ve skladu a vezme jen to, co klub má", () => {
    expect(def("vloupani_sklad").muze(stavKlubu())).toBe(false);
    const s = stavKlubu({ vybaveni: { jerseys: 2, jerseys_condition: 70 }, kadr: [PROBLEMOVY] });
    expect(def("vloupani_sklad").muze(s)).toBe(true);
    let kradezi = 0;
    proSeedy((rng) => {
      const n = def("vloupani_sklad").vytvor(s, rng);
      if (n?.kind !== "vloupani_sklad") return;
      kradezi++;
      expect(n.ztraty).toEqual([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]);
    });
    expect(kradezi).toBeGreaterThan(0);
  });

  it("zabezpečení areálu ani vitrína ze skladu nezmizí vloupáním", () => {
    const s = stavKlubu({ vybaveni: { balls: 1, area_security: 1, trophy_case: 3 } });
    proSeedy((rng) => {
      const n = def("vloupani_sklad").vytvor(s, rng);
      if (n?.ztraty[0]?.typ === "vybaveni") expect(n.ztraty[0].kategorie).toBe("balls");
    });
  });

  it("bez dodávky žádná dodávka", () => {
    expect(def("dodavka_pujcena").muze(stavKlubu({ kadr: [PROBLEMOVY] }))).toBe(false);
    expect(def("dodavka_ukradena").muze(stavKlubu())).toBe(false);
    const s = stavKlubu({ vybaveni: { team_van: 2, team_van_condition: 80 }, kadr: [PROBLEMOVY] });
    proSeedy((rng) => {
      const n = def("dodavka_pujcena").vytvor(s, rng);
      if (!n) return;
      const z = n.ztraty[0];
      expect(z.typ).toBe("vybaveni_stav");
      if (z.typ === "vybaveni_stav") expect(z.stavPo).toBeLessThan(80);
    });
  });

  it("vitrína až od úrovně 2 a přijde jen o jednu úroveň", () => {
    expect(def("vitrina").muze(stavKlubu({ vybaveni: { trophy_case: 1 } }))).toBe(false);
    const s = stavKlubu({ vybaveni: { trophy_case: 3 } });
    proSeedy((rng) => {
      const n = def("vitrina").vytvor(s, rng);
      if (n?.kind === "vitrina") expect(n.ztraty[0]).toMatchObject({ kategorie: "trophy_case", uroven: 3, urovniDolu: 1 });
    });
  });

  it("kamery jde ukrást jen se zabezpečením aspoň 2", () => {
    expect(def("kradez_kamery").muze(stavKlubu({ vybaveni: { area_security: 1 } }))).toBe(false);
    expect(def("kradez_kamery").muze(stavKlubu({ vybaveni: { area_security: 2 } }))).toBe(true);
  });

  it("traktůrek až od sekačky úrovně 2", () => {
    expect(def("koleje_trakturek").muze(stavKlubu({ vybaveni: { mower: 1 } }))).toBe(false);
    expect(def("koleje_trakturek").muze(stavKlubu({ vybaveni: { mower: 2 } }))).toBe(true);
  });

  it("požár jen s grilem, klubovka s krbem přijde jen o jednu úroveň", () => {
    expect(def("pozar_grilu").muze(stavKlubu())).toBe(false);
    const s = stavKlubu({ vybaveni: { club_grill: 3 }, stadion: { refreshments: 0, pitch_condition: 70 } });
    proSeedy((rng) => {
      const n = def("pozar_grilu").vytvor(s, rng);
      expect(n?.ztraty).toHaveLength(1);
      expect(n?.ztraty[0]).toMatchObject({ kategorie: "club_grill", urovniDolu: 1 });
    });
  });

  it("stánek při požáru shoří jen tomu, kdo stánek má", () => {
    const bezStanku = stavKlubu({ vybaveni: { club_grill: 1 } });
    proSeedy((rng) => expect(def("pozar_grilu").vytvor(bezStanku, rng)?.ztraty.some((z) => z.typ === "stadion")).toBe(false));
    const seStankem = stavKlubu({ vybaveni: { club_grill: 1 }, stadion: { refreshments: 1, pitch_condition: 70 } });
    let stanek = 0;
    proSeedy((rng) => { if (def("pozar_grilu").vytvor(seStankem, rng)?.ztraty.some((z) => z.typ === "stadion")) stanek++; });
    expect(stanek).toBeGreaterThan(0);
  });

  it("dodávka se nezmění v den zápasu ani den před ním", () => {
    const s = stavKlubu({ vybaveni: { team_van: 2, team_van_condition: 80 }, kadr: [PROBLEMOVY], zapasDnesNeboZitra: true });
    expect(def("dodavka_pujcena").muze(s)).toBe(false);
    expect(def("dodavka_ukradena").muze(s)).toBe(false);
    proSeedy((rng) => {
      expect(def("dodavka_pujcena").vytvor(s, rng)).toBeNull();
      expect(def("dodavka_ukradena").vytvor(s, rng)).toBeNull();
    });
  });

  it("kopnuté dveře a světlice jen po domácím zápase", () => {
    const vztekloun = hrac({ id: "k", jmeno: "Karel Vzteklý", temperament: 80 });
    const venku = stavKlubu({ stadion: { changing_rooms: 2, pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: true, doma: false, cervenaKarta: ["k"], zapasId: null, trzby: { kasa: 0, tombola: 0 } } });
    expect(def("kopnute_dvere").muze(venku)).toBe(false);
    expect(def("svetlice").muze(venku)).toBe(false);
  });

  it("kopnuté dveře potřebují šatny i červenou kartu", () => {
    const vztekloun = hrac({ id: "k", temperament: 80 });
    const bezSaten = stavKlubu({ stadion: { pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: false, doma: true, cervenaKarta: ["k"], zapasId: null, trzby: { kasa: 0, tombola: 0 } } });
    expect(def("kopnute_dvere").muze(bezSaten)).toBe(false);
    const bezCervene = stavKlubu({ stadion: { changing_rooms: 1, pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: false, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } } });
    expect(def("kopnute_dvere").muze(bezCervene)).toBe(false);
  });

  it("vandal rozbije jen venkovní zařízení, které klub má", () => {
    const s = stavKlubu({ stadion: { fence: 0, stands: 2, entrance_gate: 0, changing_rooms: 3, pitch_condition: 70 } });
    proSeedy((rng) => {
      const n = def("vandal").vytvor(s, rng);
      const z = n?.ztraty[0];
      if (z?.typ === "stadion") expect(z.zarizeni).toBe("stands");
    });
  });
});

describe("katalog: spouštěné incidenty", () => {
  const piti = [hrac({ id: "a", alkohol: 70 }), hrac({ id: "b", alkohol: 85 }), hrac({ id: "c", alkohol: 20 })];
  const zaklad = { stadion: { changing_rooms: 1, pitch_condition: 70 }, kadr: piti };

  it("oslava jen po výhře, se dvěma pijáky ze včerejší hospody a s kabinou", () => {
    const d = def("oslava_v_kabine");
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: true, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } }, hospodaVcera: ["a", "b"] }))).toBe(true);
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: false, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } }, hospodaVcera: ["a", "b"] }))).toBe(false);
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: true, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } }, hospodaVcera: ["a", "c"] }))).toBe(false);
    expect(d.muze(stavKlubu({ ...zaklad, stadion: { pitch_condition: 70 }, vcera: { vyhra: true, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } }, hospodaVcera: ["a", "b"] }))).toBe(false);
  });

  it("za oslavou stojí nejvíc pijící návštěvník hospody", () => {
    const s = stavKlubu({ ...zaklad, vcera: { vyhra: true, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } }, hospodaVcera: ["a", "b"] });
    expect(def("oslava_v_kabine").vytvor(s, createRng(1))?.culpritPlayerId).toBe("b");
  });

  it("kopnuté dveře jen vyloučený vzteklý hráč a pachatel je hned známý", () => {
    const vztekloun = hrac({ id: "k", jmeno: "Karel Vzteklý", temperament: 80 });
    const s = stavKlubu({ stadion: { changing_rooms: 2, pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: false, doma: true, cervenaKarta: ["k"], zapasId: null, trzby: { kasa: 0, tombola: 0 } } });
    const n = def("kopnute_dvere").vytvor(s, createRng(5));
    expect(n).toMatchObject({ culpritPlayerId: "k", culpritRevealed: true });
    expect(n?.text).toContain("Karel Vzteklý");
    const klidas = stavKlubu({ ...s, kadr: [hrac({ id: "k", temperament: 50 })] });
    expect(def("kopnute_dvere").muze(klidas)).toBe(false);
  });

  it("světlice jen po výhře", () => {
    expect(def("svetlice").muze(stavKlubu())).toBe(false);
    expect(def("svetlice").muze(stavKlubu({ vcera: { vyhra: true, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } } }))).toBe(true);
  });

  it("oslava nikdy nerozbije stánek, jen šatny, sprchy nebo sociálky", () => {
    const s = stavKlubu({
      stadion: { refreshments: 3, pitch_condition: 70 }, kadr: piti,
      vcera: { vyhra: true, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } }, hospodaVcera: ["a", "b"],
    });
    expect(def("oslava_v_kabine").muze(s)).toBe(false);
    const sKabinou = stavKlubu({ ...s, stadion: { refreshments: 3, showers: 1, pitch_condition: 70 } });
    proSeedy((rng) => {
      const n = def("oslava_v_kabine").vytvor(sKabinou, rng);
      expect(n?.ztraty[0]).toMatchObject({ typ: "stadion", zarizeni: "showers" });
    });
  });
});

describe("katalog: alarm", () => {
  it("bez zabezpečení areálu nikdy", () => {
    const s = stavKlubu({ vybaveni: { balls: 1 } });
    proSeedy((rng) => expect(def("vloupani_sklad").vytvor(s, rng)?.kind).not.toBe("alarm_vyplasil"));
  });

  it("se zabezpečením 2 v dobrém stavu někdy zloděje vyplaší", () => {
    const s = stavKlubu({ vybaveni: { balls: 1, area_security: 2, area_security_condition: 80 } });
    let alarmu = 0;
    proSeedy((rng) => { if (def("vloupani_sklad").vytvor(s, rng)?.kind === "alarm_vyplasil") alarmu++; });
    expect(alarmu).toBeGreaterThan(0);
  });

  it("sešlé zabezpečení alarm nespustí", () => {
    const s = stavKlubu({ vybaveni: { balls: 1, area_security: 3, area_security_condition: 20 } });
    proSeedy((rng) => expect(def("vloupani_sklad").vytvor(s, rng)?.kind).not.toBe("alarm_vyplasil"));
  });

  it("alarm sám se nelosuje", () => {
    expect(def("alarm_vyplasil").muze(stavKlubu({ vybaveni: { area_security: 3 } }))).toBe(false);
  });
});

describe("čin ohlášený v hospodě (spec 9a)", () => {
  const FRANTA = hrac({ id: "f", jmeno: "Franta Novák" });

  it("ohlásit jde jen čin, na který klub má", () => {
    const prazdny = stavKlubu();
    for (const kind of CINY_HRACE) expect(muzeOhlasit(kind, prazdny, true), kind).toBe(false);
    const vsechno = stavKlubu({
      vybaveni: { balls: 1, trophy_case: 2, team_van: 1, mower: 2 }, stadion: { changing_rooms: 1, pitch_condition: 70 },
    });
    for (const kind of CINY_HRACE) expect(muzeOhlasit(kind, vsechno, true), kind).toBe(true);
    expect(muzeOhlasit("vitrina", stavKlubu({ vybaveni: { trophy_case: 1 } }), false)).toBe(false);
    expect(muzeOhlasit("koleje_trakturek", stavKlubu({ vybaveni: { mower: 1 } }), false)).toBe(false);
  });

  it("kopnout do dveří ohlásí jen obviněný, červená karta ani domácí zápas potřeba není", () => {
    const s = stavKlubu({ stadion: { changing_rooms: 1, pitch_condition: 70 } });
    expect(muzeOhlasit("kopnute_dvere", s, false)).toBe(false);
    expect(muzeOhlasit("kopnute_dvere", s, true)).toBe(true);
    const n = cinHrace("kopnute_dvere", s, FRANTA, createRng(1));
    expect(n).toMatchObject({ kind: "kopnute_dvere", culpritPlayerId: "f", culpritRevealed: true });
    expect(n?.text).toContain("Franta Novák");
  });

  it("čin má pachatele, kterého ohlásil, a je hned známý", () => {
    const s = stavKlubu({ vybaveni: { jerseys: 2, jerseys_condition: 70 } });
    proSeedy((rng) => {
      const n = cinHrace("vloupani_sklad", s, FRANTA, rng);
      expect(n).toMatchObject({ kind: "vloupani_sklad", culpritType: "hrac", culpritPlayerId: "f", culpritRevealed: true });
      expect(n?.ztraty).toEqual([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]);
    }, 20);
  });

  it("v den činu platí podmínky znovu: bez věci nebo před zápasem se nestane", () => {
    expect(cinHrace("vitrina", stavKlubu({ vybaveni: { trophy_case: 1 } }), FRANTA, createRng(1))).toBeNull();
    expect(cinHrace("dodavka_pujcena", stavKlubu({ vybaveni: { team_van: 1, team_van_condition: 80 }, zapasDnesNeboZitra: true }), FRANTA, createRng(1))).toBeNull();
    expect(cinHrace("koleje_trakturek", stavKlubu({ vybaveni: { mower: 1 } }), FRANTA, createRng(1))).toBeNull();
  });
});

describe("peněžní krádeže ze zápasu (spec 4a)", () => {
  const sVcerejskem = (kasa: number, tombola: number, over: Partial<StavKlubu> = {}) =>
    stavKlubu({ vcera: { vyhra: true, zapasId: "m1", trzby: { kasa, tombola } } as StavKlubu["vcera"], ...over });

  it("bez včerejší tržby se kasa nekrade", () => {
    expect(def("kasa_obcerstveni").muze(sVcerejskem(0, 0))).toBe(false);
  });

  it("bez včerejší tomboly se tombola nekrade", () => {
    expect(def("tombola").muze(sVcerejskem(5000, 0))).toBe(false);
  });

  it("z kasy zmizí 20 až 50 procent skutečné tržby", () => {
    const castky: number[] = [];
    proSeedy((rng) => {
      const n = def("kasa_obcerstveni").vytvor(sVcerejskem(10000, 0), rng);
      const z = n?.ztraty[0];
      if (z && z.typ === "penize") castky.push(z.castka);
    }, 300);
    expect(castky.length).toBeGreaterThan(0);
    expect(Math.min(...castky)).toBeGreaterThanOrEqual(2000);
    expect(Math.max(...castky)).toBeLessThanOrEqual(5000);
  });

  it("z tomboly zmizí 30 až 100 procent a nese id zápasu", () => {
    const castky: number[] = [];
    proSeedy((rng) => {
      const n = def("tombola").vytvor(sVcerejskem(0, 2000), rng);
      const z = n?.ztraty[0];
      if (z && z.typ === "penize") { castky.push(z.castka); expect(z.zdrojZapasId).toBe("m1"); }
    }, 300);
    expect(Math.min(...castky)).toBeGreaterThanOrEqual(600);
    expect(Math.max(...castky)).toBeLessThanOrEqual(2000);
  });

  it("obě jsou spouštěné a nelosují se vahou", () => {
    for (const k of ["kasa_obcerstveni", "tombola"]) {
      expect(def(k).spousteny).toBe(true);
      expect(def(k).vaha).toBe(0);
    }
  });

  it("tak malý rozpočet, že strop vyjde na nulu, nedá žádný incident (ne incident s nulovou částkou)", () => {
    const s = stavKlubu({
      rozpocet: 0,
      vcera: { vyhra: true, zapasId: "m1", trzby: { kasa: 10000, tombola: 2000 } } as StavKlubu["vcera"],
    });
    proSeedy((rng) => {
      expect(def("kasa_obcerstveni").vytvor(s, rng)).toBeNull();
      expect(def("tombola").vytvor(s, rng)).toBeNull();
    }, 300);
  });

  it("s najatou obsluhou bere kasu občas ona", () => {
    let zamestnanec = 0;
    proSeedy((rng) => {
      const n = def("kasa_obcerstveni").vytvor(sVcerejskem(10000, 0, { obsluha: { id: "o1", jmeno: "Jana Pivná" } }), rng);
      if (n?.culpritType === "zamestnanec") zamestnanec++;
    }, 300);
    expect(zamestnanec).toBeGreaterThan(0);
  });

  it("bez najaté obsluhy pachatel zaměstnanec nevznikne", () => {
    proSeedy((rng) => {
      expect(def("kasa_obcerstveni").vytvor(sVcerejskem(10000, 0), rng)?.culpritType).not.toBe("zamestnanec");
    }, 300);
  });

  it("odhalená obsluha jako pachatel: incident je rovnou uzavřený a jmenuje ji", () => {
    let n = null;
    for (let seed = 1; seed <= 100 && !n; seed++) {
      n = def("kasa_obcerstveni").vytvor(sVcerejskem(10000, 0, { obsluha: { id: "o1", jmeno: "Jana Pivná" } }), createRng(seed));
      if (n?.culpritType !== "zamestnanec") n = null;
    }
    expect(n).not.toBeNull();
    expect(n?.culpritType).toBe("zamestnanec");
    expect(n?.culpritPlayerId).toBeNull();
    expect(n?.culpritStaffId).toBe("o1");
    expect(n?.culpritRevealed).toBe(true);
    expect(n?.status).toBe("uzavreny");
    expect(n?.text).toContain("Jana Pivná");
  });
});

describe("zpronevěra ekonoma (spec 4a)", () => {
  const sEkonomem = (judgement: number) =>
    stavKlubu({ ekonom: { id: "e1", jmeno: "Karel Počet", judgement }, rozpocet: 200000 });

  it("bez ekonoma se nezpronevěřuje", () => {
    expect(def("zpronevera_ekonoma").muze(stavKlubu({ ekonom: null }))).toBe(false);
  });

  it("s ekonomem se zpronevěřuje", () => {
    expect(def("zpronevera_ekonoma").muze(sEkonomem(5))).toBe(true);
  });

  it("ekonom se špatným úsudkem má větší šanci na zpronevěru než pečlivý", () => {
    // vahaEkonoma na DefiniceIncidentu nejde přidat (sdílené rozhraní pro celý katalog),
    // šance se testuje přes vlastní exportovanou funkci (viz implementer-prompt-instrukce).
    expect(sanceZproneveryPodleUsudku(2)).toBeGreaterThan(sanceZproneveryPodleUsudku(9));
  });

  it("šance drží kladná čísla na celé škále úsudku 1 až 20 a klesá s každým bodem", () => {
    // Regrese na `(10 - judgement) / 20`: úsudek ve staff_members jede 1 až 20, ne 0 až 10,
    // takže od desítky výš vycházela nula nebo záporné číslo a `rng.random() >= sance`
    // bylo vždycky splněné. Ekonomovi se úsudek losuje jako primární atribut až do 19.
    const sance = Array.from({ length: 20 }, (_, i) => sanceZproneveryPodleUsudku(i + 1));
    sance.forEach((s, i) => {
      expect(s, `úsudek ${i + 1}`).toBeGreaterThan(0);
      expect(s, `úsudek ${i + 1}`).toBeGreaterThanOrEqual(0.15);
      expect(s, `úsudek ${i + 1}`).toBeLessThanOrEqual(0.9);
      if (i > 0) expect(s, `úsudek ${i + 1}`).toBeLessThan(sance[i - 1]);
    });
    expect(sanceZproneveryPodleUsudku(20)).toBeGreaterThan(0);
    expect(sanceZproneveryPodleUsudku(1)).toBeGreaterThan(sanceZproneveryPodleUsudku(20));
  });

  it("i ekonom s vysokým úsudkem občas zpronevěří", () => {
    // Přes `vytvor`, ne jen přes vzorec: tohle je ta půlka ekonomů, která dřív nemohla krást nikdy.
    for (const usudek of [10, 15, 18, 20]) {
      let stalo = 0;
      proSeedy((rng) => { if (def("zpronevera_ekonoma").vytvor(sEkonomem(usudek), rng)) stalo++; }, 300);
      expect(stalo, `úsudek ${usudek}`).toBeGreaterThan(0);
    }
  });

  it("obě jsou spouštěné a nelosují se vahou", () => {
    const d = def("zpronevera_ekonoma");
    expect(d.spousteny).toBe(true);
    expect(d.vaha).toBe(0);
  });

  it("částka je 3 000 až 15 000 a nejvýš 5 procent rozpočtu", () => {
    const castky: number[] = [];
    proSeedy((rng) => {
      const n = def("zpronevera_ekonoma").vytvor(sEkonomem(3), rng);
      const z = n?.ztraty[0];
      if (z && z.typ === "penize") castky.push(z.castka);
    }, 300);
    expect(castky.length).toBeGreaterThan(0);
    expect(Math.min(...castky)).toBeGreaterThanOrEqual(3000);
    // 5 % z rozpočtu 200 000 je 10 000, strop je pod horní hranicí 15 000.
    expect(Math.max(...castky)).toBeLessThanOrEqual(10000);
  });

  it("pachatelem je zaměstnanec a incident je rovnou uzavřený", () => {
    let n = null;
    for (let seed = 1; seed <= 50 && !n; seed++) n = def("zpronevera_ekonoma").vytvor(sEkonomem(3), createRng(seed));
    expect(n).not.toBeNull();
    expect(n?.culpritType).toBe("zamestnanec");
    expect(n?.culpritPlayerId).toBeNull();
    expect(n?.culpritStaffId).toBe("e1");
    expect(n?.culpritRevealed).toBe(true);
    expect(n?.status).toBe("uzavreny");
    expect(n?.text).toContain("Karel Počet");
  });

  it("chudý klub, kterému strop srazí částku pod minimum, nedá žádný incident", () => {
    const s = stavKlubu({ ekonom: { id: "e1", jmeno: "Karel Počet", judgement: 0 }, rozpocet: 10000 });
    proSeedy((rng) => expect(def("zpronevera_ekonoma").vytvor(s, rng)).toBeNull(), 100);
  });
});
