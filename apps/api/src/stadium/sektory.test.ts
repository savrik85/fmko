/**
 * Kapacita po sektorech.
 *
 * Vzniklo kvůli konkrétní díře: zavření sektoru ubíralo poptávku, ale ne
 * kapacitu, takže na vyprodaném zápase neznamenalo vůbec nic. Testy proto hlídají
 * hlavně dvě věci: součet sedí na kapacitu a zavřený sektor opravdu ubere místa.
 */
import { describe, it, expect } from "vitest";
import { kapacitaSektoru, dostupnaKapacita, zaplneniSektoru } from "./sektory";

describe("rozdělení kapacity", () => {
  it("součet sedí na kapacitu na hlavu, ať je vybavení jakékoli", () => {
    for (const capacity of [0, 1, 7, 150, 233, 1000, 4321]) {
      for (const ul of [0, 1, 2, 3]) {
        for (const st of [0, 1, 2, 3]) {
          const r = kapacitaSektoru(capacity, { ultras_stand: ul, stands: st });
          expect(r.kotel + r.hlavni + r.za_branou, `cap ${capacity}, ul ${ul}, st ${st}`)
            .toBe(Math.max(0, capacity));
          expect(r.kotel).toBeGreaterThanOrEqual(0);
          expect(r.hlavni).toBeGreaterThanOrEqual(0);
          expect(r.za_branou).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("vybudovaný sektor kotle je větší než holé místo za brankou", () => {
    const bez = kapacitaSektoru(1000, { ultras_stand: 0, stands: 1 });
    const s = kapacitaSektoru(1000, { ultras_stand: 3, stands: 1 });
    expect(s.kotel).toBeGreaterThan(bez.kotel);
  });

  it("tribuny zvětšují hlavní tribunu", () => {
    const male = kapacitaSektoru(1000, { ultras_stand: 1, stands: 0 });
    const velke = kapacitaSektoru(1000, { ultras_stand: 1, stands: 3 });
    expect(velke.hlavni).toBeGreaterThan(male.hlavni);
  });

  it("prázdný stadion nerozdělí nic", () => {
    expect(kapacitaSektoru(0, {})).toEqual({ kotel: 0, hlavni: 0, za_branou: 0 });
  });
});

describe("dostupná kapacita", () => {
  it("bez zavřených sektorů je to celá kapacita", () => {
    const d = dostupnaKapacita(500, { ultras_stand: 2, stands: 2 }, []);
    expect(d.kapacita).toBe(500);
    expect(d.zavrenoMist).toBe(0);
  });

  it("zavřený kotel ubere přesně místa kotle", () => {
    const rozpad = kapacitaSektoru(500, { ultras_stand: 2, stands: 2 });
    const d = dostupnaKapacita(500, { ultras_stand: 2, stands: 2 }, ["kotel"]);
    expect(d.zavrenoMist).toBe(rozpad.kotel);
    expect(d.kapacita).toBe(500 - rozpad.kotel);
  });

  it("dvakrát zavřený týž sektor se nepočítá dvakrát", () => {
    const jednou = dostupnaKapacita(500, { ultras_stand: 2, stands: 2 }, ["kotel"]);
    const dvakrat = dostupnaKapacita(500, { ultras_stand: 2, stands: 2 }, ["kotel", "kotel"]);
    expect(dvakrat.kapacita).toBe(jednou.kapacita);
  });

  it("zavřít všechno znamená nulu, ne záporné číslo", () => {
    const d = dostupnaKapacita(500, { ultras_stand: 2, stands: 2 }, ["kotel", "hlavni", "za_branou"]);
    expect(d.kapacita).toBe(0);
  });
});

describe("zaplnění sektorů pro 3D scénu", () => {
  it("zavřený sektor je prázdný, i když je jinde plno", () => {
    const z = zaplneniSektoru(400, 500, { ultras_stand: 2, stands: 2 }, ["kotel"]);
    expect(z.kotel).toBe(0);
    expect(z.hlavni).toBeGreaterThan(0);
  });

  it("zaplnění nikdy nepřeteče přes plno", () => {
    const z = zaplneniSektoru(9999, 500, { ultras_stand: 2, stands: 2 }, []);
    for (const v of Object.values(z)) expect(v).toBeLessThanOrEqual(1);
  });

  it("prázdný stadion je prázdný, ne NaN", () => {
    const z = zaplneniSektoru(0, 0, {}, []);
    for (const v of Object.values(z)) expect(Number.isFinite(v)).toBe(true);
  });

  it("zavřené všechno nedělí nulou", () => {
    const z = zaplneniSektoru(100, 500, { ultras_stand: 2, stands: 2 }, ["kotel", "hlavni", "za_branou"]);
    for (const v of Object.values(z)) expect(v).toBe(0);
  });
});
