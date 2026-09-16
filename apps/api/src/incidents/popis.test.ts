import { describe, expect, it } from "vitest";
import { nactiZtraty, popisZtraty } from "./popis";

describe("popis škody", () => {
  it("převede ztráty do vět bez dlouhé pomlčky", () => {
    const vety = [
      popisZtraty({ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }),
      popisZtraty({ typ: "vybaveni", kategorie: "trophy_case", uroven: 3, stav: 70, urovniDolu: 1 }),
      popisZtraty({ typ: "vybaveni_stav", kategorie: "team_van", stavPred: 80, stavPo: 35 }),
      popisZtraty({ typ: "stadion", zarizeni: "changing_rooms", urovni: 1 }),
      popisZtraty({ typ: "travnik", pred: 70, po: 58 }),
    ];
    expect(vety).toEqual([
      "Zmizelo vybavení: Dresy (úroveň 2)",
      "Klubová kronika a vitrína: úroveň 3 → 2",
      "Klubová dodávka: stav 80 % → 35 %",
      "Rozbité zařízení: Šatny (o 1 úroveň)",
      "Trávník: stav 70 % → 58 %",
    ]);
    for (const v of vety) expect(v).not.toContain("—");
  });

  it("rozbitý JSON dá prázdný seznam", () => {
    expect(nactiZtraty("{rozbite")).toEqual([]);
    expect(nactiZtraty(null)).toEqual([]);
    expect(nactiZtraty('[{"typ":"travnik","pred":70,"po":60}]')).toEqual([{ typ: "travnik", pred: 70, po: 60 }]);
  });
});
