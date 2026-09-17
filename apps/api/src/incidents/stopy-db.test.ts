import { describe, expect, it } from "vitest";
import { nactiZdrojeStop, prikazyStop, stopaZRadku } from "./stopy-db";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import type { NavrhStopy } from "./typy";

const SVEDEK: NavrhStopy = {
  zdroj: "svedek", ukazujeNa: "p", podezreli: null, drzitel: "a", sila: 2, bonusPolicie: 0.1, text: "Adam viděl Pepu.", nalezena: false,
};
const DNES = "2026-09-16T16:00:00.000Z";

describe("zápis stop", () => {
  it("id čísluje v rámci zdroje a nalezenou stopu datuje", async () => {
    const db = new FalesnaD1();
    const kamera: NavrhStopy = { ...SVEDEK, zdroj: "kamera", ukazujeNa: null, drzitel: null, podezreli: ["p", "a"], nalezena: true };
    await jakoD1(db).batch(prikazyStop(jakoD1(db), "tym-a", "inc-1", [SVEDEK, { ...SVEDEK, drzitel: "b" }, kamera], DNES));
    const [prvni, druhy, treti] = db.davky[0];
    expect(prvni.sql).toMatch(/INSERT OR IGNORE INTO club_incident_clues/);
    expect(prvni.params).toEqual(["inc-1-svedek-1", "inc-1", "tym-a", "svedek", "p", null, "a", 2, 0.1, "Adam viděl Pepu.", 0, null]);
    expect(druhy.params[0]).toBe("inc-1-svedek-2");
    expect(treti.params[0]).toBe("inc-1-kamera-1");
    expect(treti.params[5]).toBe('["p","a"]');
    expect(treti.params.slice(-2)).toEqual([1, DNES]);
  });

  it("pozdější stopa téhož zdroje dostane další pořadí", () => {
    const [p] = prikazyStop(jakoD1(new FalesnaD1()), "tym-a", "inc-1", [{
      zdroj: "bazar", ukazujeNa: null, podezreli: null, drzitel: null, sila: 1, bonusPolicie: 0, text: "Koupil klub.", nalezena: true,
    }], "2026-09-16T16:00:00.000Z", 2);
    expect((p as unknown as { params: unknown[] }).params[0]).toBe("inc-1-bazar-2");
  });

  it("řádek z DB převede zpátky a rozbitý seznam podezřelých zahodí", () => {
    const radek = {
      id: "inc-1-soused-1", source: "soused", points_to_player_id: null, suspects: '["p","a"]',
      holder_player_id: null, strength: 1, police_bonus: 0.15, text: "Soused.", found: 1,
    };
    expect(stopaZRadku(radek)).toEqual({
      id: "inc-1-soused-1", zdroj: "soused", ukazujeNa: null, podezreli: ["p", "a"], drzitel: null,
      sila: 1, bonusPolicie: 0.15, text: "Soused.", nalezena: true,
    });
    expect(stopaZRadku({ ...radek, suspects: "{rozbite" }).podezreli).toBeNull();
  });
});

describe("zdroje stop", () => {
  it("správce podle úsudku a vztahy pachatele z obou stran", async () => {
    const db = new FalesnaD1([
      { sql: /FROM staff_members/, first: { usudek: 12 } },
      { sql: /FROM relationships/, all: [
        { player_a_id: "p", player_b_id: "a", type: "brothers", strength: 70 },
        { player_a_id: "b", player_b_id: "p", type: "rivals", strength: 40 },
      ] },
    ]);
    expect(await nactiZdrojeStop(jakoD1(db), "tym-a", "p")).toEqual({
      spravceUsudek: 12,
      vztahyPachatele: [{ hracId: "a", typ: "brothers", sila: 70 }, { hracId: "b", typ: "rivals", sila: 40 }],
    });
  });

  it("bez pachatele z kádru se vztahy nenačítají, bez správce je úsudek null", async () => {
    const db = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    expect(await nactiZdrojeStop(jakoD1(db), "tym-a", null)).toEqual({ spravceUsudek: null, vztahyPachatele: [] });
    expect(db.pocet(/FROM relationships/)).toBe(0);
  });
});
