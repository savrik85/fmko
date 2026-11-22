import { describe, expect, it } from "vitest";
import { incidentNamedInText, involvedIncidentInText, jeOtazkaNaIncident, jeRecOHrozicim, najdiIncidentVTextu, normalizuj, temaZeStavu } from "./tema";
import type { Ztrata } from "./typy";

const SKLAD = { kind: "vloupani_sklad", ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }] as Ztrata[] };
const KOTEL = { kind: "vandal", ztraty: [{ typ: "vybaveni_stav", kategorie: "fan_drums", stavPred: 80, stavPo: 40 }] as Ztrata[] };
const VITRINA = { kind: "vitrina", ztraty: [{ typ: "stadion", zarizeni: "trophy_case", urovni: 1 }] as Ztrata[] };
const OSLAVA_KABINA = { kind: "oslava_v_kabine", ztraty: [{ typ: "stadion", zarizeni: "changing_rooms", urovni: 1 }] as Ztrata[] };
const SKLAD_BRANKAR = { kind: "vloupani_sklad", ztraty: [{ typ: "vybaveni", kategorie: "goalkeeper_gear", uroven: 1, stav: 80, urovniDolu: 1 }] as Ztrata[] };
const TRAKTUREK_TRAVNIK = { kind: "koleje_trakturek", ztraty: [{ typ: "travnik", pred: 80, po: 50 }] as Ztrata[] };
const SKLAD_VIDEO = { kind: "vloupani_sklad", ztraty: [{ typ: "vybaveni", kategorie: "video_setup", uroven: 1, stav: 80, urovniDolu: 1 }] as Ztrata[] };

describe("pozná otázku na incident", () => {
  it.each([
    "Kdo ukradl ty dresy?",
    "Nevíš něco o těch ukradených věcech?",
    "Kdo vykradl sklad?",
    "Víš, kdo to byl?",
    "Co ukázala KAMERA?",
    "Byla u tebe policie?",
    "Kam zmizely dresy?",
    "Kdo byl večer u skladu?",
  ])("%s", (zprava) => {
    expect(jeOtazkaNaIncident(zprava, SKLAD)).toBe(true);
  });

  it.each([
    "Zdar, jak se máš?",
    "Zítra trénink v šest.",
    "Dobrý gól včera, jen tak dál.",
    "V sobotu hrajeme doma, přijď dřív.",
    "Kotel byl v sobotu skvělý.",
  ])("běžná zpráva: %s", (zprava) => {
    expect(jeOtazkaNaIncident(zprava, SKLAD)).toBe(false);
    expect(jeOtazkaNaIncident(zprava, KOTEL)).toBe(false);
  });

  it("slova věci patří jen k incidentu, kde ta věc zmizela nebo se rozbila", () => {
    expect(jeOtazkaNaIncident("Kde jsou dresy?", KOTEL)).toBe(false);
    expect(jeOtazkaNaIncident("Kdo rozmlátil bubny?", KOTEL)).toBe(true);
  });

  it("kmen věci nebo místa bez signálu průšvihu téma nenastaví", () => {
    expect(jeOtazkaNaIncident("Kde jsou dresy?", SKLAD)).toBe(false);
    expect(jeOtazkaNaIncident("Byl jsi večer u skladu?", SKLAD)).toBe(false);
  });

  it.each([
    ["Sraz v kabině v pět.", OSLAVA_KABINA] as const,
    ["Po výhře to oslavíme.", OSLAVA_KABINA] as const,
    ["Zítra brankářský trénink.", SKLAD_BRANKAR] as const,
    ["Přijď dřív na hřiště.", TRAKTUREK_TRAVNIK] as const,
    ["Trávník je po dešti rozbahněný.", TRAKTUREK_TRAVNIK] as const,
    ["Po zápase rozbor.", SKLAD_VIDEO] as const,
  ])("běžná zpráva bez signálu: %s", (zprava, incident) => {
    expect(jeOtazkaNaIncident(zprava, incident)).toBe(false);
  });

  it.each([SKLAD, KOTEL, VITRINA])("Kam jsi včera zmizel? - běžný dotaz na jiný incident", (incident) => {
    expect(jeOtazkaNaIncident("Kam jsi včera zmizel?", incident)).toBe(false);
  });

  it("kmen se signálem průšvihu pozná i u zařízení a trávníku", () => {
    expect(jeOtazkaNaIncident("Kdo rozbil vitrínu?", VITRINA)).toBe(true);
    expect(jeOtazkaNaIncident("Kdo rozbil šatny?", OSLAVA_KABINA)).toBe(true);
    expect(jeOtazkaNaIncident("Kdo nám zničil trávník?", TRAKTUREK_TRAVNIK)).toBe(true);
  });

  it("pozitivní ztráty (oprava, vybavení nahoru) se neztratí v trávníku (regrese)", () => {
    // kmenyZtraty je ternární řetězec, kompilátor unii nehlídá: nový typ ztráty, který
    // by tu chyběl, by tiše spadl na "trávník" místo skutečného zařízení nebo kategorie.
    const OPRAVA_PLOTU = { kind: "remeslnik_opravil", ztraty: [{ typ: "oprava", damageId: "dmg-1", zarizeni: "fence" }] as Ztrata[] };
    const DRESY_NAHORU = { kind: "dedictvi", ztraty: [{ typ: "vybaveni_nahoru", kategorie: "jerseys", urovniNahoru: 1, stavNahoru: 100 }] as Ztrata[] };

    expect(jeOtazkaNaIncident("Kdo opravil oplocení?", OPRAVA_PLOTU)).toBe(true);
    expect(jeOtazkaNaIncident("Kdo nám zničil trávník?", OPRAVA_PLOTU)).toBe(false);

    expect(jeOtazkaNaIncident("Kdo přinesl ty dresy?", DRESY_NAHORU)).toBe(true);
    expect(jeOtazkaNaIncident("Kdo nám zničil trávník?", DRESY_NAHORU)).toBe(false);
  });

  it("normalizace bez diakritiky a velkých písmen", () => {
    expect(normalizuj("Ukradené DRESY")).toBe("ukradene dresy");
  });
});

describe("na který incident se ptá", () => {
  const incidenty = [{ id: "novy", ...KOTEL }, { id: "stary", ...SKLAD }];

  it("obecná otázka míří na nejnovější", () => {
    expect(najdiIncidentVTextu("Kdo to byl?", incidenty)).toBe("novy");
  });

  it("otázka na věc najde ten správný", () => {
    expect(najdiIncidentVTextu("Kam zmizely dresy?", incidenty)).toBe("stary");
  });

  it("běžná zpráva žádný", () => {
    expect(najdiIncidentVTextu("Zdar", incidenty)).toBeNull();
  });

  it("zpráva o penězích najde peněžní incident, ne trávníkový (spec 4a)", () => {
    const penize = { id: "kasa", kind: "kasa_obcerstveni", ztraty: [{ typ: "penize", castka: 3000 }] as Ztrata[] };
    const travnik = { id: "travnik", kind: "vandal", ztraty: [{ typ: "travnik", pred: 70, po: 40 }] as Ztrata[] };
    expect(najdiIncidentVTextu("Zmizely nám peníze z kasy!", [penize, travnik])).toBe("kasa");
    expect(najdiIncidentVTextu("Kdo nám zničil trávník?", [penize, travnik])).toBe("travnik");
  });

  // FK Geomapping 19.–20. 11.: „vykrást tu kasu“ hra nepoznala, téma se nenastavilo a žádost
  // „nepoptal by ses mi“ tak nemohla založit úkol pátrání.
  it("„vykrást tu kasu“ a „prachy z občerstvení“ najdou vybranou kasu, i když je novější jiný incident", () => {
    const cashBox = { id: "cash-box", kind: "kasa_obcerstveni", ztraty: [{ typ: "penize", castka: 2528 }] as Ztrata[] };
    const party = { id: "party", ...OSLAVA_KABINA };
    expect(najdiIncidentVTextu("Ahoj Tome, měl bych prosbu, nepoptal by ses mi, kdo by mohl vykrást tu kasu?", [party, cashBox])).toBe("cash-box");
    expect(najdiIncidentVTextu("Maty, nevíš o někom s těma prachama z občerstvení? Nebo kdo by mohl vědět?", [party, cashBox])).toBe("cash-box");
    expect(najdiIncidentVTextu("Z tržby někdo něco vzal, kdo to byl?", [party, cashBox])).toBe("cash-box");
    // Obecná otázka dál míří na nejnovější.
    expect(najdiIncidentVTextu("Kdo to byl?", [party, cashBox])).toBe("party");
  });

  it("kmeny kasy nechytají kašel ani kastrol", () => {
    const cashBox = { kind: "kasa_obcerstveni", ztraty: [{ typ: "penize", castka: 2528 }] as Ztrata[] };
    expect(jeOtazkaNaIncident("Kdo kašle na trénink?", cashBox)).toBe(false);
    expect(jeOtazkaNaIncident("Kdo zničil ten kastrol?", cashBox)).toBe(false);
    expect(jeOtazkaNaIncident("Kdo ukrást chtěl kasu?", cashBox)).toBe(true);
  });
});

describe("o kterém incidentu mluví žádost o nápravu (Sedlecký, E2E 22. 11.)", () => {
  const RAFFLE = { id: "raffle", kind: "tombola", ztraty: [{ typ: "penize", castka: 2533 }] as Ztrata[] };
  const STORE_CONES = { id: "store", kind: "vloupani_sklad", ztraty: [{ typ: "vybaveni", kategorie: "training_cones", uroven: 1, stav: 87, urovniDolu: 1 }] as Ztrata[] };
  const KIOSK_CASH = { id: "kiosk", kind: "kasa_obcerstveni", ztraty: [{ typ: "penize", castka: 900 }] as Ztrata[] };

  it("jmenuje druh, místo nebo věc i bez slova průšvihu; druh váží víc než peníze", () => {
    expect(incidentNamedInText("Marceli, kamera tě natočila u tomboly. Ty peníze zaplatíš, rozumíš?", [STORE_CONES, RAFFLE])).toBe("raffle");
    expect(incidentNamedInText("Ty pomůcky vrátíš, jasný?", [RAFFLE, STORE_CONES])).toBe("store");
    expect(incidentNamedInText("Ty peníze z tomboly vrátíš.", [KIOSK_CASH, RAFFLE])).toBe("raffle");
    // Jen peníze: první v pořadí volajícího.
    expect(incidentNamedInText("Ty peníze vrátíš.", [KIOSK_CASH, RAFFLE])).toBe("kiosk");
    expect(incidentNamedInText("Zaplatíš to, nebo ne?", [RAFFLE, STORE_CONES])).toBeNull();
  });
});

describe("téma ve vlákně", () => {
  const stav = JSON.stringify({ awaiting: "coach", incidentId: "inc-1", incidentDen: "2026-09-16" });

  it("platí do konce herního dne", () => {
    expect(temaZeStavu(stav, "2026-09-16")).toEqual({ incidentId: "inc-1", den: "2026-09-16" });
    expect(temaZeStavu(stav, "2026-09-17")).toBeNull();
    expect(temaZeStavu(stav)).toEqual({ incidentId: "inc-1", den: "2026-09-16" });
  });

  it("vlákno bez tématu nebo rozbitý JSON", () => {
    expect(temaZeStavu(JSON.stringify({ awaiting: "coach" }))).toBeNull();
    expect(temaZeStavu("{rozbité")).toBeNull();
    expect(temaZeStavu(null)).toBeNull();
  });
});

describe("řeči z hospody (spec 9a)", () => {
  it.each([
    "Co to bylo včera v hospodě za řeči?",
    "Slyšel jsem, co jsi vykládal.",
    "Neblbni, jo?",
    "Ke skladu ani nechoď.",
  ])("%s", (zprava) => {
    expect(jeRecOHrozicim(zprava, "vloupani_sklad")).toBe(true);
  });

  it.each([
    ["Zdar, jak se máš?", "vloupani_sklad"] as const,
    ["Zítra trénink v šest.", "vloupani_sklad"] as const,
    ["Dobrý gól včera.", "vloupani_sklad"] as const,
    ["Buď příště preciznější v obraně.", "vloupani_sklad"] as const,
    ["Utopil jsi tu penaltu, kámo.", "vloupani_sklad"] as const,
    ["Bude výklad nových pravidel od svazu.", "vloupani_sklad"] as const,
    ["Kdy budeš ve skladu?", "vloupani_sklad"] as const,
    ["Kdo dneska pomůže s vykládáním dresů z dodávky?", "dodavka_pujcena"] as const,
  ])("běžná zpráva: %s", (zprava, kind) => {
    expect(jeRecOHrozicim(zprava, kind)).toBe(false);
  });

  it("místo samo nestačí, ani u kabiny a dveří", () => {
    expect(jeRecOHrozicim("Kdy budeš v kabině?", "kopnute_dvere")).toBe(false);
    expect(jeRecOHrozicim("Sejdeme se v kabině po zápase.", "kopnute_dvere")).toBe(false);
    expect(jeRecOHrozicim("Zavři prosím dveře.", "kopnute_dvere")).toBe(false);
    expect(jeRecOHrozicim("Na dveře od kabiny ani nesahej.", "kopnute_dvere")).toBe(true);
  });

  it("místo činu platí jen pro ten čin", () => {
    expect(jeRecOHrozicim("Na vitrínu ani nesahej.", "vitrina")).toBe(true);
    expect(jeRecOHrozicim("Na vitrínu ani nesahej.", "vloupani_sklad")).toBe(false);
  });
});

describe("otázka hráči zapletenému do incidentu", () => {
  const MICE = { kind: "vloupani_sklad", ztraty: [{ typ: "vybaveni", kategorie: "balls", uroven: 2, stav: 70, urovniDolu: 1 }] as Ztrata[] };
  const both = [{ id: "kabina", ...OSLAVA_KABINA }, { id: "mice", ...MICE }];

  it("přímé obvinění s věcí incidentu stačí i bez slova průšvihu (Benedikt, E2E 22. 11.)", () => {
    expect(najdiIncidentVTextu("Martine, ty míče ze skladu jsi vzal ty, nebo ne?", both)).toBeNull();
    expect(involvedIncidentInText("Martine, ty míče ze skladu jsi vzal ty, nebo ne?", both)).toBe("mice");
    expect(involvedIncidentInText("Vzal jsi ty věci ze skladu?", both)).toBe("mice");
    expect(involvedIncidentInText("Přiznej se, ten sklad jsi byl ty.", both)).toBe("mice");
  });

  it("běžná otázka na incident platí jako dřív", () => {
    expect(involvedIncidentInText("Tak co, ukradl jsi ty dresy, nebo ne?", [{ id: "dresy", ...SKLAD }])).toBe("dresy");
  });

  it("věc bez obvinění ani obvinění bez věci téma nezakládá", () => {
    expect(involvedIncidentInText("Ve skladu jsou nové míče, vezmi si jeden.", both)).toBeNull();
    expect(involvedIncidentInText("Vzal jsi včera auto?", both)).toBeNull();
    expect(involvedIncidentInText("Dorazíš v úterý na trénink?", both)).toBeNull();
  });
});
