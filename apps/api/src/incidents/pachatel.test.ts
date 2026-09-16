import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { PRAH_VAHY_PACHATELE } from "./nastaveni";
import { sanceUspechuZvenku, vahaPachatele, vyberHrace } from "./pachatel";
import { hrac, PROBLEMOVY } from "./testovaci-stav";

describe("pachatel", () => {
  it("disciplinovaný, věrný a střízlivý hráč s dobrým vztahem k trenérovi nekrade", () => {
    const svatous = hrac({ id: "s", alkohol: 5, disciplina: 95, vernost: 95, vztahKTrenerovi: 90 });
    expect(vahaPachatele(svatous)).toBeLessThan(PRAH_VAHY_PACHATELE);
    for (let seed = 1; seed <= 200; seed++) expect(vyberHrace([svatous], createRng(seed))).toBeNull();
  });

  it("problémový hráč je kandidát", () => {
    expect(vahaPachatele(PROBLEMOVY)).toBeGreaterThanOrEqual(PRAH_VAHY_PACHATELE);
    expect(vyberHrace([PROBLEMOVY], createRng(3))?.id).toBe("p");
  });

  it("truc po odmítnutém přestupu váhu zvedá", () => {
    expect(vahaPachatele(hrac({ transferUnrest: 80 }))).toBeGreaterThan(vahaPachatele(hrac({ transferUnrest: 0 })));
  });

  it("výběr je deterministický", () => {
    const kadr = [PROBLEMOVY, hrac({ id: "q", alkohol: 80, disciplina: 20 }), hrac({ id: "r" })];
    expect(vyberHrace(kadr, createRng(42))?.id).toBe(vyberHrace(kadr, createRng(42))?.id);
  });

  it("plot, osvětlení a zabezpečení odrazují zloděje zvenku", () => {
    expect(sanceUspechuZvenku({}, 1)).toBe(1);
    expect(sanceUspechuZvenku({ fence: 3, lighting: 3 }, 0.2)).toBeCloseTo(0.6 * 0.8 * 0.2);
  });
});
