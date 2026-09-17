import { describe, expect, it } from "vitest";
import { jeOtazkaNaIncident, jeRecOHrozicim, najdiIncidentVTextu, normalizuj, temaZeStavu } from "./tema";
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
    "Zdar, jak se máš?",
    "Zítra trénink v šest.",
    "Dobrý gól včera.",
    "Buď příště preciznější v obraně.",
    "Utopil jsi tu penaltu, kámo.",
    "Bude výklad nových pravidel od svazu.",
    "Kdy budeš ve skladu?",
  ])("běžná zpráva: %s", (zprava) => {
    expect(jeRecOHrozicim(zprava, "vloupani_sklad")).toBe(false);
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
