import { describe, expect, it } from "vitest";
import { applyIncidentMatchMods, upravSestavuZIncidentu, type HracVZapase } from "./zapas";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";

const hrac = (id: number, morale = 60, consistency = 50): HracVZapase => ({ id, morale, consistency });
const ID_MAP = new Map([[1, "a"], [2, "p"], [3, "c"], [4, "o"]]);

describe("incidenty v zápase", () => {
  it("neprávem obviněný hraje s nižší morálkou a konzistencí, ostatní beze změny", () => {
    const zaklad = [hrac(1), hrac(4, 5, 5)];
    const lavka = [hrac(3)];
    const info = upravSestavuZIncidentu([zaklad, lavka], ID_MAP, new Map([["o", ["obvineny"]]]));
    expect(info).toEqual({ obvinenych: 1, pachatelVSestave: false });
    expect(zaklad[1]).toEqual({ id: 4, morale: 0, consistency: 0 });
    expect(zaklad[0]).toEqual(hrac(1));
    expect(lavka[0]).toEqual(hrac(3));
  });

  it("odhalený pachatel v základní sestavě sníží morálku celému týmu", () => {
    const zaklad = [hrac(1), hrac(2)];
    const lavka = [hrac(3)];
    const info = upravSestavuZIncidentu([zaklad, lavka], ID_MAP, new Map([["p", ["pachatel"]]]));
    expect(info.pachatelVSestave).toBe(true);
    expect([...zaklad, ...lavka].map((h) => h.morale)).toEqual([58, 58, 58]);
  });

  it("pachatel jen na lavičce týmu nevadí", () => {
    const zaklad = [hrac(1)];
    const lavka = [hrac(2)];
    expect(upravSestavuZIncidentu([zaklad, lavka], ID_MAP, new Map([["p", ["pachatel"]]])).pachatelVSestave).toBe(false);
    expect(zaklad[0].morale).toBe(60);
  });

  it("načte vlivy k hernímu datu týmu a bez vlivů nic nemění", async () => {
    const db = new FalesnaD1([{ sql: /SELECT game_date FROM teams/, first: { game_date: "2026-09-20T16:00:00.000Z" } }]);
    const zaklad = [hrac(1)];
    expect(await applyIncidentMatchMods(jakoD1(db), "tym-a", [zaklad], ID_MAP)).toBeNull();
    expect(zaklad[0]).toEqual(hrac(1));
    expect(db.pocet(/FROM club_incidents/)).toBe(1);
  });
});
