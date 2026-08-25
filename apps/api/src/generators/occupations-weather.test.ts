import { describe, expect, it } from "vitest";
import { OCCUPATIONS, getOccupationByName, pickProfessionalExcuse } from "./occupations";
import { createRng } from "./rng";

const POCASI = ["sunny", "cloudy", "rain", "wind", "snow"] as const;

/**
 * Výmluvy se váží na TOTÉŽ počasí, které hráč vidí v předpovědi u zápasu.
 * Vlastní kalendář mít nesmí — jinak by spoluhráč sháněl seno, zatímco venku
 * sněží, a hra by si v jedné zprávě protiřečila.
 */
describe("profesní výmluvy podle počasí", () => {
  it("správce hřiště ve sněhu odklízí, na slunci zalévá", () => {
    const s = getOccupationByName("Správce hřiště")!;
    const snih = new Set(Array.from({ length: 60 }, (_, i) => pickProfessionalExcuse(createRng(i), s, "snow")));
    const slunce = new Set(Array.from({ length: 60 }, (_, i) => pickProfessionalExcuse(createRng(i), s, "sunny")));
    expect([...snih].some((t) => t.includes("sníh"))).toBe(true);
    expect([...slunce].some((t) => t.includes("zalít"))).toBe(true);
    expect([...snih].some((t) => t.includes("zalít"))).toBe(false);
  });

  it("výmluva vázaná na počasí se za jiného nikdy neobjeví", () => {
    for (const occ of OCCUPATIONS) {
      for (const w of POCASI) {
        const vybrane = new Set(Array.from({ length: 120 }, (_, i) => pickProfessionalExcuse(createRng(i), occ, w)));
        for (const e of occ.excuses) {
          if (e.weather && !e.weather.includes(w)) {
            expect(vybrane.has(e.text), `${occ.name} / ${w}: ${e.text}`).toBe(false);
          }
        }
      }
    }
  });

  it("každé povolání má univerzální výmluvu — fallback nesmí být prázdný", () => {
    for (const occ of OCCUPATIONS) {
      expect(occ.excuses.some((e) => !e.weather), occ.name).toBe(true);
    }
  });

  it("za každého počasí se u každého povolání něco vybere", () => {
    for (const occ of OCCUPATIONS) {
      for (const w of POCASI) {
        expect(pickProfessionalExcuse(createRng(1), occ, w).trim().length, `${occ.name}/${w}`).toBeGreaterThan(5);
      }
    }
  });

  it("bez počasí se pořád vybere něco smysluplného", () => {
    for (const occ of OCCUPATIONS) {
      expect(pickProfessionalExcuse(createRng(1), occ).trim().length, occ.name).toBeGreaterThan(5);
    }
  });

  it("aspoň dvacet povolání na počasí reaguje", () => {
    expect(OCCUPATIONS.filter((o) => o.excuses.some((e) => e.weather)).length).toBeGreaterThanOrEqual(20);
  });

  it("žádná výmluva se neváže na měsíc — vlastní kalendář je zakázaný", () => {
    for (const occ of OCCUPATIONS) {
      for (const e of occ.excuses) {
        expect((e as unknown as Record<string, unknown>).months, `${occ.name}: ${e.text}`).toBeUndefined();
      }
    }
  });
});
