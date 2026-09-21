import { describe, expect, it } from "vitest";
import { posunHrace, posunKadru, posunKamaradu, posunVztah } from "./hraci";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";

type Dotaz = { sql: string; params: unknown[] };
const jakoDotaz = (p: D1PreparedStatement) => p as unknown as Dotaz;

describe("příkazy pro hráče", () => {
  it("posun hráče ořízne 0 až 100, hlídá tým a vztah zapíše i s důvodem", () => {
    const [moralka, log, vztah] = posunHrace(jakoD1(new FalesnaD1()), "tym-a", "p", { morale: -12, vztah: -20, description: "Křivé obvinění" }).map(jakoDotaz);
    expect(moralka.params).toEqual([-12, "p", "tym-a"]);
    expect(moralka.sql).toMatch(/MAX\(0, MIN\(100/);
    expect(log.sql).toContain("INSERT INTO coach_relation_log");
    expect(log.params).toContain("Křivé obvinění");
    expect(log.params).toContain("incident");
    expect(vztah.sql).toMatch(/coach_relationship = MAX\(0, MIN\(100/);
    expect(vztah.params).toEqual([-20, "p"]);
  });

  it("nulový posun nic nezapisuje", () => {
    expect(posunHrace(jakoD1(new FalesnaD1()), "tym-a", "p", { morale: 0, vztah: 0 })).toHaveLength(0);
    expect(posunHrace(jakoD1(new FalesnaD1()), "tym-a", "p", { morale: -10 })).toHaveLength(1);
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

describe("vztah mezi dvěma hráči", () => {
  const sVztahem = (first: unknown) => new FalesnaD1([{ sql: /SELECT id, strength FROM relationships/, first }]);

  it("hledá pár v obou pořadích a posune sílu s ořezem na 100", async () => {
    const db = sVztahem({ id: "v1", strength: 50 });
    const prikazy = (await posunVztah(jakoD1(db), "a", "b", { typy: ["rivals"], delta: 15 })).map(jakoDotaz);
    expect(db.dotazy[0].params).toEqual(["a", "b", "b", "a", "rivals"]);
    expect(prikazy.map((p) => p.params)).toEqual([[65, "v1"]]);
    const strop = (await posunVztah(jakoD1(sVztahem({ id: "v1", strength: 95 })), "a", "b", { typy: ["rivals"], delta: 15 })).map(jakoDotaz);
    expect(strop[0].params).toEqual([100, "v1"]);
  });

  it("pod hranicí vztah smaže", async () => {
    const prikazy = (await posunVztah(jakoD1(sVztahem({ id: "v1", strength: 25 })), "a", "b", { typy: ["neighbors"], delta: -20, smazPod: 10 })).map(jakoDotaz);
    expect(prikazy[0].sql).toContain("DELETE FROM relationships");
    expect(prikazy[0].params).toEqual(["v1"]);
  });

  it("chybějící vztah založí jen s vytvorJako, pár seřazený; existující s nulovou změnou nechá být", async () => {
    expect(await posunVztah(jakoD1(sVztahem(null)), "s", "p", { typy: ["rivals"], delta: 0 })).toEqual([]);
    const nove = (await posunVztah(jakoD1(sVztahem(null)), "s", "p", { typy: ["rivals"], delta: 0, vytvorJako: { typ: "rivals", sila: 40 } })).map(jakoDotaz);
    expect(nove[0].sql).toContain("INSERT INTO relationships");
    expect(nove[0].params.slice(1)).toEqual(["p", "s", "rivals", 40]);
    expect(await posunVztah(jakoD1(sVztahem({ id: "v1", strength: 50 })), "s", "p", { typy: ["rivals"], delta: 0, vytvorJako: { typ: "rivals", sila: 40 } })).toEqual([]);
  });
});
