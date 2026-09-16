import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { generateAbsences, hracProAbsenci, type AbsenceResult, type PlayerForAbsence } from "./absence";

const SQUAD: PlayerForAbsence[] = Array.from({ length: 18 }, (_, i) => ({
  firstName: "Hráč",
  lastName: `Č${i}`,
  age: 22 + (i % 20),
  occupation: i % 3 === 0 ? "Zedník" : i % 3 === 1 ? "Traktorista" : "Účetní",
  discipline: 30 + i * 3,
  patriotism: 50,
  alcohol: 40,
  temper: 45,
  morale: 50,
  stamina: 70,
  injuryProneness: 40,
  commuteKm: i % 12,
}));

/**
 * Absence se pro jeden zápas generují dvakrát — jednou pro SMS hráči, jednou
 * pro simulaci. Když se vstupy rozejdou, hráč dostane omluvenku od někoho,
 * kdo ve skutečnosti nastoupil. Tenhle test je pojistka přesně proti tomu.
 */
describe("determinismus absencí", () => {
  it("stejný seed a stejné options dají identický výsledek", () => {
    const opts = { timing: "match_day" as const, district: "Prachatice", commuteMod: 0.2 };
    expect(generateAbsences(createRng(12345), SQUAD, opts))
      .toEqual(generateAbsences(createRng(12345), SQUAD, opts));
  });

  it("chybějící commuteMod se chová jako nula, ne jako undefined", () => {
    expect(generateAbsences(createRng(777), SQUAD, { timing: "match_day" }))
      .toEqual(generateAbsences(createRng(777), SQUAD, { timing: "match_day", commuteMod: 0 }));
  });

  it("dodávka opravdu ubírá absence z dojíždění", () => {
    // U jednoho seedu se rozdíl projevit nemusí — vliv je malý a musí překlopit
    // práh. Přes stovku seedů ale dodávka absencí nasčítá znatelně míň.
    const celkem = (commuteMod: number) => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        n += generateAbsences(createRng(seed), SQUAD, { timing: "match_day", commuteMod }).length;
      }
      return n;
    };
    expect(celkem(0.45)).toBeLessThan(celkem(0));
  });

  it("prázdné options nespadnou a chovají se jako výchozí", () => {
    expect(() => generateAbsences(createRng(1), SQUAD)).not.toThrow();
    expect(generateAbsences(createRng(1), SQUAD)).toEqual(generateAbsences(createRng(1), SQUAD, {}));
  });

  it("dodávka a řidič dohromady nepřekročí strop 0,55", () => {
    // Nad stropem by absence z dojíždění zmizely úplně. Vstup 0,9 se musí
    // chovat stejně jako 0,55, jinak strop neplatí.
    expect(generateAbsences(createRng(4242), SQUAD, { timing: "match_day", commuteMod: 0.9 }))
      .toEqual(generateAbsences(createRng(4242), SQUAD, { timing: "match_day", commuteMod: 0.55 }));
  });
});

describe("hracProAbsenci — jeden převod pro všechna místa", () => {
  const radek = {
    first_name: "Franta", last_name: "Novák", age: 31,
    personality: JSON.stringify({ discipline: 20, patriotism: 30, alcohol: 80, temper: 70, injuryProneness: 60, celebrityType: "legend", celebrityTier: "B" }),
    life_context: JSON.stringify({ occupation: "Zedník", morale: 35, transferUnrest: { level: 55 } }),
    physical: JSON.stringify({ stamina: 64 }),
    commute_km: 7, is_celebrity: 1,
  };

  it("převezme i truc po odmítnutém přestupu", () => {
    // Simulace, náhled sestavy a admin trigger ho dřív nepředávaly, takže hráč
    // s trucem měl v SMS vyšší šanci chybět než ve skutečném zápase.
    expect(hracProAbsenci(radek)).toEqual({
      firstName: "Franta", lastName: "Novák", age: 31, occupation: "Zedník",
      discipline: 20, patriotism: 30, alcohol: 80, temper: 70, morale: 35, stamina: 64,
      injuryProneness: 60, commuteKm: 7, transferUnrest: 55,
      isCelebrity: true, celebrityType: "legend", celebrityTier: "B",
    });
  });

  it("rozbitý JSON nebo chybějící physical dá výchozí hodnoty, ne výjimku", () => {
    const p = hracProAbsenci({ ...radek, personality: "{rozbite", physical: null, life_context: "" });
    expect(p.discipline).toBe(50);
    expect(p.stamina).toBe(50);
    expect(p.transferUnrest).toBe(0);
    expect(p.occupation).toBe("");
  });
});

describe("incident v losu omluvenek", () => {
  const OBVINENY = 5;
  const sObvinenym = SQUAD.map((p, i) => (i === OBVINENY ? { ...p, incident: { druhy: ["obvineny"] } } : p));

  it("bez incidentu je výstup beze změny", () => {
    const sPrazdnym = SQUAD.map((p) => ({ ...p, incident: undefined }));
    for (let seed = 1; seed <= 50; seed++) {
      expect(generateAbsences(createRng(seed), sPrazdnym, { timing: "match_day" }))
        .toEqual(generateAbsences(createRng(seed), SQUAD, { timing: "match_day" }));
    }
  });

  it("jiný druh vlivu než obviněný los nemění", () => {
    const sPachatelem = SQUAD.map((p, i) => (i === OBVINENY ? { ...p, incident: { druhy: ["pachatel"] } } : p));
    for (let seed = 1; seed <= 50; seed++) {
      expect(generateAbsences(createRng(seed), sPachatelem, { timing: "day_before" }))
        .toEqual(generateAbsences(createRng(seed), SQUAD, { timing: "day_before" }));
    }
  });

  it("neprávem obviněný chybí častěji a vymlouvá se na obvinění", () => {
    let predtim = 0;
    let potom = 0;
    const vymluvy: AbsenceResult[] = [];
    for (let seed = 1; seed <= 600; seed++) {
      predtim += generateAbsences(createRng(seed), SQUAD, { timing: "day_before" }).filter((a) => a.playerIndex === OBVINENY).length;
      const jeho = generateAbsences(createRng(seed), sObvinenym, { timing: "day_before" }).filter((a) => a.playerIndex === OBVINENY);
      potom += jeho.length;
      vymluvy.push(...jeho.filter((a) => a.category === "incident"));
    }
    expect(potom).toBeGreaterThan(predtim);
    expect(vymluvy.length).toBeGreaterThan(0);
    for (const v of vymluvy) {
      expect(v.reason).toBe("Po obvinění");
      expect(v.smsText).not.toContain("—");
      expect(v.smsText.trim()).toMatch(/[.!]$/);
    }
  });

  it("převod řádku: prázdné druhy nepřidají klíč incident", () => {
    const row = {
      first_name: "Jan", last_name: "Kos", age: 25, commute_km: 0, is_celebrity: 0,
      personality: JSON.stringify({ discipline: 40 }), life_context: "{}", physical: "{}",
    };
    expect(hracProAbsenci(row, [])).toEqual(hracProAbsenci(row));
    expect("incident" in hracProAbsenci(row)).toBe(false);
    expect(hracProAbsenci(row, ["obvineny"]).incident).toEqual({ druhy: ["obvineny"] });
  });
});
