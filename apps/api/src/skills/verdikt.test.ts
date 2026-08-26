/**
 * Verdikt o hráči — hlavně to, že si SÁM NEODPORUJE.
 *
 * Tenhle test vznikl poté, co v seznamu dorostu stálo u téhož kluka „Výhled: sestava"
 * a hned vedle „Nedotáhne se". Odznak počítal z horní hranice odhadu, prognóza sezón
 * ze středu. Předchozí kontrola tu kombinaci hlídala jen u klenotů, takže prošla.
 *
 * Proto se tu projíždí KŘÍŽEM celý prostor: věky, hodnocení, stropy, talenty — a kontroluje
 * se, že verdikt a prognóza nikdy netvrdí opak.
 */
import { describe, it, expect } from "vitest";
import {
  pasmo, slovneNadejnost, sezonDoLatky, realneDosazitelnyStrop, tempoPodleVeku,
  type LatkyKadru,
} from "./verdikt";

const LATKY: LatkyKadru = { prumerKadru: 47, sestavaDnes: 52, latkaKlenotu: 63 };

const VEKY = [16, 17, 18, 19, 20, 21, 22, 25, 28, 31, 34, 38, 44];
const HODNOCENI = [10, 20, 30, 40, 45, 50, 55, 60, 70];
const TALENTY = [0, 15, 40, 65, 90];
const STROPY = [25, 40, 52, 60, 70, 85];

describe("verdikt si neodporuje s prognózou", () => {
  it("odznak neslibuje sestavu hráči, který se na ni nedotáhne", () => {
    const rozpory: string[] = [];

    for (const vek of VEKY) {
      for (const hodnoceni of HODNOCENI) {
        for (const talent of TALENTY) {
          for (const teoretickyStrop of STROPY) {
            if (teoretickyStrop < hodnoceni) continue;

            const realny = realneDosazitelnyStrop(vek, hodnoceni, teoretickyStrop, talent);
            const rozptyl = 6;
            const v = slovneNadejnost(
              realny,
              Math.max(hodnoceni, realny - rozptyl),
              Math.min(100, realny + rozptyl),
              hodnoceni,
              LATKY,
              Math.max(0, realny - hodnoceni),
            );
            const sezon = sezonDoLatky(vek, hodnoceni, realny, talent, LATKY.sestavaDnes);

            const slibujeSestavu = v.uroven === "hvezda" || v.uroven === "nadejny";
            const dotahneSe = sezon !== null;

            if (slibujeSestavu && !dotahneSe) {
              rozpory.push(`${vek}let ${hodnoceni}→${realny} talent${talent}: "${v.slovne}" ale nedotáhne se`);
            }
            if (!slibujeSestavu && dotahneSe && v.uroven === "slaby") {
              rozpory.push(`${vek}let ${hodnoceni}→${realny} talent${talent}: "${v.slovne}" ale dotáhne se za ${sezon}`);
            }
          }
        }
      }
    }

    expect(rozpory.slice(0, 5), `nalezeno ${rozpory.length} rozporů`).toEqual([]);
  });
});

describe("pásma", () => {
  it("řadí se vzestupně podle laťek", () => {
    expect(pasmo(10, LATKY)).toBe(0);
    expect(pasmo(48, LATKY)).toBe(1);
    expect(pasmo(55, LATKY)).toBe(2);
    expect(pasmo(70, LATKY)).toBe(3);
  });

  it("hranice patří do vyššího pásma", () => {
    expect(pasmo(LATKY.prumerKadru, LATKY)).toBe(1);
    expect(pasmo(LATKY.sestavaDnes, LATKY)).toBe(2);
    expect(pasmo(LATKY.latkaKlenotu, LATKY)).toBe(3);
  });
});

describe("reálně dosažitelný strop", () => {
  it("veterán se ke svému teoretickému stropu nedostane", () => {
    expect(realneDosazitelnyStrop(44, 33, 70, 50)).toBeLessThan(40);
  });

  it("mladík s talentem se ke stropu dostane", () => {
    expect(realneDosazitelnyStrop(16, 25, 70, 80)).toBe(70);
  });

  it("nikdy nevrátí míň než dnešní hodnocení", () => {
    for (const vek of VEKY) {
      for (const h of HODNOCENI) {
        expect(realneDosazitelnyStrop(vek, h, h + 5, 0)).toBeGreaterThanOrEqual(h);
      }
    }
  });

  it("nikdy nepřeleze teoretický strop", () => {
    for (const vek of VEKY) {
      for (const t of TALENTY) {
        expect(realneDosazitelnyStrop(vek, 20, 60, t)).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe("prognóza sezón", () => {
  it("hráč nad laťkou je hotový hned", () => {
    expect(sezonDoLatky(20, 60, 70, 50, 52)).toBe(0);
  });

  it("hráč se stropem pod laťkou se nedotáhne nikdy", () => {
    expect(sezonDoLatky(20, 30, 45, 20, 52)).toBeNull();
  });

  it("talentovaný mladík se dotáhne dřív než netalentovaný", () => {
    const s1 = sezonDoLatky(17, 30, 80, 90, 52);
    const s2 = sezonDoLatky(17, 30, 80, 5, 52);
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(s1!).toBeLessThan(s2!);
  });

  it("bez tréninkové historie použije odhad podle věku, ne nulu", () => {
    // Bez zálohy by hráč bez historie nikdy nikam nedorostl
    expect(sezonDoLatky(22, 45, 70, 10, 52)).not.toBeNull();
  });
});

describe("kdy se odznak ukazuje", () => {
  it("hotovému hráči v jeho pásmu se neukáže", () => {
    // Hráč už je v sestavě a víc z něj nebude
    const v = slovneNadejnost(55, 53, 57, 55, LATKY, 2);
    expect(v.zobrazit).toBe(false);
  });

  it("mladíkovi před posunem se ukáže", () => {
    const v = slovneNadejnost(63, 58, 68, 35, LATKY, 28);
    expect(v.zobrazit).toBe(true);
  });

  it("nezobrazí se u hráče, kterému nezbývá růst", () => {
    const v = slovneNadejnost(53, 50, 56, 40, LATKY, 3);
    expect(v.zobrazit).toBe(false);
  });
});

describe("tempo podle věku", () => {
  it("s věkem klesá", () => {
    const rada = [18, 22, 27, 31, 35].map(tempoPodleVeku);
    for (let i = 1; i < rada.length; i++) expect(rada[i]).toBeLessThan(rada[i - 1]);
  });
});
