import { describe, expect, it } from "vitest";
import { jeOtazkaNaIncident, najdiIncidentVTextu, normalizuj, temaZeStavu } from "./tema";
import type { Ztrata } from "./typy";

const SKLAD = { kind: "vloupani_sklad", ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }] as Ztrata[] };
const KOTEL = { kind: "vandal", ztraty: [{ typ: "vybaveni_stav", kategorie: "fan_drums", stavPred: 80, stavPo: 40 }] as Ztrata[] };

describe("pozná otázku na incident", () => {
  it.each([
    "Kdo ukradl ty dresy?",
    "Nevíš něco o těch ukradených věcech?",
    "Kdo vykradl sklad?",
    "Víš, kdo to byl?",
    "Co ukázala KAMERA?",
    "Byla u tebe policie?",
    "Kam zmizely dresy?",
    "Kde jsou dresy?",
    "Byl jsi večer u skladu?",
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
    expect(najdiIncidentVTextu("Kde jsou dresy?", incidenty)).toBe("stary");
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
