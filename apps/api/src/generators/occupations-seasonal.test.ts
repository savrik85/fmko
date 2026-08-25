import { describe, expect, it } from "vitest";
import { OCCUPATIONS, getOccupationByName, pickProfessionalExcuse } from "./occupations";
import { createRng } from "./rng";

describe("sezónní profesní výmluvy", () => {
  it("zemědělec má o žních jinou výmluvu než v lednu", () => {
    const z = getOccupationByName("Zemědělec")!;
    const zne = new Set(Array.from({ length: 80 }, (_, i) => pickProfessionalExcuse(createRng(i), z, 7)));
    const leden = new Set(Array.from({ length: 80 }, (_, i) => pickProfessionalExcuse(createRng(i), z, 1)));
    expect([...zne].some((t) => !leden.has(t))).toBe(true);
  });

  it("výmluva vázaná na měsíce se mimo ně nikdy neobjeví", () => {
    for (const occ of OCCUPATIONS) {
      const sezonni = occ.excuses.filter((e) => e.months);
      if (sezonni.length === 0) continue;
      const cerven = new Set(Array.from({ length: 150 }, (_, i) => pickProfessionalExcuse(createRng(i), occ, 6)));
      for (const e of sezonni) {
        if (!e.months!.includes(6)) expect(cerven.has(e.text), `${occ.name}: ${e.text}`).toBe(false);
      }
    }
  });

  it("každé povolání má aspoň jednu celoroční výmluvu — fallback nesmí být prázdný", () => {
    for (const occ of OCCUPATIONS) {
      expect(occ.excuses.some((e) => !e.months), occ.name).toBe(true);
    }
  });

  it("měsíce jsou v rozsahu 1–12 a texty nejsou prázdné", () => {
    for (const occ of OCCUPATIONS) {
      expect(occ.excuses.length, occ.name).toBeGreaterThan(0);
      for (const e of occ.excuses) {
        expect(e.text.trim().length, occ.name).toBeGreaterThan(5);
        for (const m of e.months ?? []) {
          expect(m, `${occ.name}: ${e.text}`).toBeGreaterThanOrEqual(1);
          expect(m, `${occ.name}: ${e.text}`).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("aspoň deset povolání má sezónní výmluvu — jinak se to ve hře neprojeví", () => {
    expect(OCCUPATIONS.filter((o) => o.excuses.some((e) => e.months)).length).toBeGreaterThanOrEqual(10);
  });
});

/**
 * Vazba výmluv na počasí tu záměrně není — počasí není v době generování
 * rozhodnuté a nebylo by identické mezi SMS a simulací. Tenhle blok hlídá,
 * že se sem taková vazba nevrátí zadními vrátky, dokud počasí neprotéká
 * do `generateAbsences` z jednoho zdroje.
 */
describe("výmluvy se neváží na počasí", () => {
  it("žádná výmluva nemá pole weather", () => {
    for (const occ of OCCUPATIONS) {
      for (const e of occ.excuses) {
        expect((e as unknown as Record<string, unknown>).weather, `${occ.name}: ${e.text}`).toBeUndefined();
      }
    }
  });

  it("zimní a letní varianty jsou pokryté měsíci", () => {
    const pokryvac = getOccupationByName("Pokrývač")!;
    const zima = new Set(Array.from({ length: 80 }, (_, i) => pickProfessionalExcuse(createRng(i), pokryvac, 1)));
    const leto = new Set(Array.from({ length: 80 }, (_, i) => pickProfessionalExcuse(createRng(i), pokryvac, 7)));
    expect([...zima].some((t) => !leto.has(t))).toBe(true);
    expect([...leto].some((t) => !zima.has(t))).toBe(true);
  });

  it("bez měsíce se pořád vybere něco smysluplného", () => {
    for (const occ of OCCUPATIONS) {
      expect(pickProfessionalExcuse(createRng(1), occ).trim().length, occ.name).toBeGreaterThan(5);
    }
  });
});
