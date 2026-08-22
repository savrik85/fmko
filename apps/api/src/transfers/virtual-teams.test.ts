import { describe, it, expect } from "vitest";
import { doplnZbyleDovednosti, VSECHNY_DOVEDNOSTI } from "./virtual-teams";

/**
 * Hráč koupený z přestupového trhu měl polovinu dovedností nulovou.
 *
 * Generátor si zakládal prázdný objekt a přepisoval do něj jen sedm dovedností;
 * kreativita, standardky, přehled, výdrž, síla a zkušenost zůstaly prázdné. Do
 * zápasu se počítají jako nula, takže hráč byl reálně slabší, než říkal rating —
 * a ten se počítá jen z těch sedmi, takže vypadal v pořádku. Na produkci takhle
 * vzniklo devět hráčů.
 */

/** Deterministická náhoda, ať testy nekolísají. */
const bezNahody = { sum: () => 0 };

const zaklad = () => ({
  speed: 50, technique: 48, shooting: 44, passing: 52,
  heading: 46, defense: 40, goalkeeping: 30,
});

describe("dovednosti hráče z přestupového trhu", () => {
  it("po doplnění má hráč všech třináct dovedností", () => {
    const s = doplnZbyleDovednosti(zaklad(), { stamina: 61, strength: 55, age: 24, ...bezNahody });
    for (const k of VSECHNY_DOVEDNOSTI) {
      expect(s[k], `chybí dovednost „${k}" — v zápase by se počítala jako nula`).toBeGreaterThan(0);
    }
    expect(Object.keys(s)).toHaveLength(VSECHNY_DOVEDNOSTI.length);
  });

  it("žádná dovednost nezůstane nulová ani u nejslabšího hráče", () => {
    const slabouch = { speed: 1, technique: 1, shooting: 1, passing: 1, heading: 1, defense: 1, goalkeeping: 1 };
    const s = doplnZbyleDovednosti(slabouch, { stamina: 12, strength: 10, age: 17, ...bezNahody });
    for (const k of VSECHNY_DOVEDNOSTI) expect(s[k]).toBeGreaterThanOrEqual(1);
  });

  it("doplněné dovednosti vycházejí z příbuzných, ne z ničeho", () => {
    const s = doplnZbyleDovednosti(zaklad(), { stamina: 61, strength: 55, age: 24, ...bezNahody });
    expect(s.vision).toBe(48);        // z techniky
    expect(s.creativity).toBe(52);    // z přihrávky
    expect(s.setPieces).toBe(46);     // průměr techniky a střelby
    expect(s.stamina).toBe(61);       // z fyzičky
    expect(s.strength).toBe(55);
  });

  it("zkušenost roste s věkem", () => {
    const mlady = doplnZbyleDovednosti(zaklad(), { stamina: 50, strength: 50, age: 18, ...bezNahody });
    const stary = doplnZbyleDovednosti(zaklad(), { stamina: 50, strength: 50, age: 34, ...bezNahody });
    expect(mlady.experience).toBeLessThan(stary.experience);
    expect(mlady.experience).toBeGreaterThanOrEqual(1);
    expect(stary.experience).toBeLessThanOrEqual(95);
  });

  it("hodnoty se drží v rozsahu 1 až 95", () => {
    const hvezda = { speed: 95, technique: 95, shooting: 95, passing: 95, heading: 95, defense: 95, goalkeeping: 95 };
    const s = doplnZbyleDovednosti(hvezda, { stamina: 90, strength: 90, age: 40, sum: () => 8 });
    for (const k of VSECHNY_DOVEDNOSTI) {
      expect(s[k]).toBeGreaterThanOrEqual(1);
      expect(s[k]).toBeLessThanOrEqual(95);
    }
  });
});
