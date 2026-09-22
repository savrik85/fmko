/**
 * Přízeň zastupitelů, kteří zápas prosedí ve VIP lóži.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { applyVipBoxVillageFavor } from "./vip-box-favor";

const NOW = "2026-09-22T10:00:00.000Z";
const PRITOMNI = {
  sql: /FROM village_invitations vi/,
  all: [{ official_id: "o1", village_id: "v1" }, { official_id: "o2", village_id: "v1" }],
};

describe("applyVipBoxVillageFavor", () => {
  it("bez lóže se nic nečte ani nezapisuje", async () => {
    const db = new FalesnaD1([PRITOMNI]);
    expect(await applyVipBoxVillageFavor(jakoD1(db), "m1", "t1", 0, NOW)).toBe(0);
    expect(db.dotazy).toEqual([]);
  });

  it("L3: každý přítomný zastupitel s řádkem přízně dostane +3", async () => {
    const db = new FalesnaD1([PRITOMNI, { sql: /SELECT id FROM village_team_favor/, first: { id: "f1" } }]);
    expect(await applyVipBoxVillageFavor(jakoD1(db), "m1", "t1", 3, NOW)).toBe(2);
    const updaty = db.dotazy.filter((d) => /UPDATE village_team_favor/.test(d.sql));
    expect(updaty).toHaveLength(2);
    expect(updaty[0].params).toEqual([3, NOW, NOW, "f1"]);
  });

  it("chybějící osobní řádek se založí z 50 + bonus", async () => {
    const db = new FalesnaD1([PRITOMNI]);
    await applyVipBoxVillageFavor(jakoD1(db), "m1", "t1", 1, NOW);
    const inserty = db.dotazy.filter((d) => /INSERT INTO village_team_favor/.test(d.sql));
    expect(inserty).toHaveLength(2);
    expect(inserty[0].params.slice(1)).toEqual(["v1", "t1", "o1", 51, NOW, NOW]);
  });

  it("čte jen zastupitele, kteří na zápase opravdu byli", async () => {
    const db = new FalesnaD1([PRITOMNI]);
    await applyVipBoxVillageFavor(jakoD1(db), "m1", "t1", 2, NOW);
    const dotaz = db.dotazy.find((d) => /FROM village_invitations vi/.test(d.sql));
    expect(dotaz?.sql).toContain("vi.status = 'attended'");
    expect(dotaz?.params).toEqual(["m1", "t1"]);
  });
});
