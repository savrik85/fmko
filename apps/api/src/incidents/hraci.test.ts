import { describe, expect, it } from "vitest";
import { posunHrace, posunKadru, posunKamaradu } from "./hraci";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";

type Dotaz = { sql: string; params: unknown[] };
const jakoDotaz = (p: D1PreparedStatement) => p as unknown as Dotaz;

describe("příkazy pro hráče", () => {
  it("posun hráče ořízne 0 až 100 a hlídá tým", () => {
    const p = jakoDotaz(posunHrace(jakoD1(new FalesnaD1()), "tym-a", "p", { morale: -12, vztah: -20 }));
    expect(p.params).toEqual([-12, -20, "p", "tym-a"]);
    expect(p.sql).toMatch(/MAX\(0, MIN\(100/);
    expect(p.sql.match(/\?/g)).toHaveLength(4);
  });

  it("kádr bez obviněného a bez jeho kamarádů", () => {
    const p = jakoDotaz(posunKadru(jakoD1(new FalesnaD1()), "tym-a", -2, ["a"], "a"));
    expect(p.params).toEqual([-2, "tym-a", "a", "a", "a", "a"]);
    expect(p.sql.match(/\?/g)).toHaveLength(6);
  });

  it("kamarádi jsou jen kamarádské vztahy, ne rivalové", () => {
    const p = jakoDotaz(posunKamaradu(jakoD1(new FalesnaD1()), "tym-a", "a", -3));
    expect(p.params).toEqual([-3, "tym-a", "a", "a", "a"]);
    expect(p.sql).toContain("'drinking_buddies'");
    expect(p.sql).not.toContain("'rivals'");
    expect(p.sql.match(/\?/g)).toHaveLength(5);
  });
});
