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
    // Morálka hráče 4 začínala na 5, OBVINENY_MORALKA je -8, ale podlaha je 0 →
    // skutečně uplatněná delta je jen -5, ne -8.
    expect(info).toEqual({ obvinenych: 1, pachatelVSestave: false, moraleDelta: new Map([[4, -5]]) });
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
    expect(info.moraleDelta).toEqual(new Map([[1, -2], [2, -2], [3, -2]]));
  });

  it("pachatel jen na lavičce týmu nevadí", () => {
    const zaklad = [hrac(1)];
    const lavka = [hrac(2)];
    const info = upravSestavuZIncidentu([zaklad, lavka], ID_MAP, new Map([["p", ["pachatel"]]]));
    expect(info.pachatelVSestave).toBe(false);
    expect(info.moraleDelta).toEqual(new Map());
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

describe("životní situace v zápase (spec 17c)", () => {
  it("rozvod bere morálku i konzistenci, narození dítěte morálku přidá", () => {
    const sestava = [[{ id: 1, morale: 60, consistency: 60 }, { id: 2, morale: 60, consistency: 60 }]];
    const idMap = new Map([[1, "r"], [2, "n"]]);
    const r = upravSestavuZIncidentu(sestava, idMap, new Map([["r", ["rozvod"]], ["n", ["narozeni_ditete"]]]));
    expect(sestava[0][0]).toMatchObject({ morale: 55, consistency: 55 });
    expect(sestava[0][1].morale).toBe(65);
    // Dočasné je jen zhoršení: kladná změna se po zápase neodečítá.
    expect(r.moraleDelta.get(1)).toBe(-5);
    expect(r.moraleDelta.get(2)).toBeUndefined();
  });
});
