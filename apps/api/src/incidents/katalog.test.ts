import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../generators/rng";
import { CINY_HRACE, cinHrace, KATALOG, KATALOG_PODLE_KIND, muzeOhlasit } from "./katalog";
import { hrac, PROBLEMOVY, stavKlubu } from "./testovaci-stav";

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
    const venku = stavKlubu({ stadion: { changing_rooms: 2, pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: true, doma: false, cervenaKarta: ["k"] } });
    expect(def("kopnute_dvere").muze(venku)).toBe(false);
    expect(def("svetlice").muze(venku)).toBe(false);
  });

  it("kopnuté dveře potřebují šatny i červenou kartu", () => {
    const vztekloun = hrac({ id: "k", temperament: 80 });
    const bezSaten = stavKlubu({ stadion: { pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: false, doma: true, cervenaKarta: ["k"] } });
    expect(def("kopnute_dvere").muze(bezSaten)).toBe(false);
    const bezCervene = stavKlubu({ stadion: { changing_rooms: 1, pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: false, doma: true, cervenaKarta: [] } });
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
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: true, doma: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"] }))).toBe(true);
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: false, doma: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"] }))).toBe(false);
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: true, doma: true, cervenaKarta: [] }, hospodaVcera: ["a", "c"] }))).toBe(false);
    expect(d.muze(stavKlubu({ ...zaklad, stadion: { pitch_condition: 70 }, vcera: { vyhra: true, doma: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"] }))).toBe(false);
  });

  it("za oslavou stojí nejvíc pijící návštěvník hospody", () => {
    const s = stavKlubu({ ...zaklad, vcera: { vyhra: true, doma: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"] });
    expect(def("oslava_v_kabine").vytvor(s, createRng(1))?.culpritPlayerId).toBe("b");
  });

  it("kopnuté dveře jen vyloučený vzteklý hráč a pachatel je hned známý", () => {
    const vztekloun = hrac({ id: "k", jmeno: "Karel Vzteklý", temperament: 80 });
    const s = stavKlubu({ stadion: { changing_rooms: 2, pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: false, doma: true, cervenaKarta: ["k"] } });
    const n = def("kopnute_dvere").vytvor(s, createRng(5));
    expect(n).toMatchObject({ culpritPlayerId: "k", culpritRevealed: true });
    expect(n?.text).toContain("Karel Vzteklý");
    const klidas = stavKlubu({ ...s, kadr: [hrac({ id: "k", temperament: 50 })] });
    expect(def("kopnute_dvere").muze(klidas)).toBe(false);
  });

  it("světlice jen po výhře", () => {
    expect(def("svetlice").muze(stavKlubu())).toBe(false);
    expect(def("svetlice").muze(stavKlubu({ vcera: { vyhra: true, doma: true, cervenaKarta: [] } }))).toBe(true);
  });

  it("oslava nikdy nerozbije stánek, jen šatny, sprchy nebo sociálky", () => {
    const s = stavKlubu({
      stadion: { refreshments: 3, pitch_condition: 70 }, kadr: piti,
      vcera: { vyhra: true, doma: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"],
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
