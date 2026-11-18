/**
 * Kabina jako parta (rozbor SMS z produ 2026-11-18): kdo se ozve, kolik lidí, proslov
 * a výzva „žádné omluvenky“.
 */
import { describe, expect, it } from "vitest";
import {
  addressedPlayers, isAttendancePush, persuadeChance, pickResponders, responderCount, speechEligible, wordMatchesName,
} from "./squad-talk";

const kadr = [
  { id: "honza", firstName: "Jan", lastName: "Novák", nickname: "Honzík" },
  { id: "petr", firstName: "Petr", lastName: "Hrách", nickname: null },
  { id: "karel", firstName: "Karel", lastName: "Kučera", nickname: "Cihla" },
  { id: "jan2", firstName: "Jan", lastName: "Mikeš", nickname: null },
];

describe("oslovení", () => {
  it("jméno, přezdívka i příjmení se skloňováním", () => {
    expect(wordMatchesName("novaku", "Novák")).toBe(true);
    expect(wordMatchesName("cihlo", "Cihla")).toBe(true);
    expect(wordMatchesName("petre", "Petr")).toBe(true);
    expect(wordMatchesName("kucerovi", "Kučera")).toBe(true);
  });

  it("obyčejné slovo nikoho neosloví", () => {
    expect(wordMatchesName("pet", "Petr")).toBe(false);
    expect(addressedPlayers(kadr, "Dejte jim pět gólů!")).toEqual([]);
  });

  it("dva Honzové = křestní jméno nikoho neosloví, příjmení ano", () => {
    expect(addressedPlayers(kadr, "Jane, zítra v šest")).toEqual([]);
    expect(addressedPlayers(kadr, "Mikeši, zítra v šest").map((p) => p.id)).toEqual(["jan2"]);
    expect(addressedPlayers(kadr, "Cihlo a Petře, makejte").map((p) => p.id)).toEqual(["karel", "petr"]);
  });
});

describe("kdo a kolik", () => {
  it("krátká zpráva jednomu, celé kabině nebo proslov víc lidem", () => {
    expect(responderCount("Zdar", 0)).toBe(1);
    expect(responderCount("Kluci, zítra v šest!", 0)).toBe(2);
    expect(responderCount("x".repeat(260), 0)).toBe(3);
    expect(responderCount("Cihlo a Petře?", 2)).toBe(2);
  });

  it("nejdřív oslovený, pak ten, komu trenér odpovídá, pak ostatní", () => {
    const pick = (pool: readonly (typeof kadr)[number][]) => pool[0] ?? null;
    const now = new Date("2026-11-18T18:00:00Z");
    expect(pickResponders(kadr, "Cihlo, co ty na to?", null, pick, now).map((p) => p.id)).toEqual(["karel"]);
    // Hráč v kabině hlásil nabídku, trenér ho přemlouvá bez oslovení: odpoví on.
    expect(pickResponders(kadr, "Zůstaň, potřebujeme tě", { id: "petr", at: "2026-11-18T17:30:00Z" }, pick, now).map((p) => p.id)).toEqual(["petr"]);
    // Psal před víc než dvěma hodinami: už to není odpověď jemu.
    expect(pickResponders(kadr, "Zůstaň, potřebujeme tě", { id: "petr", at: "2026-11-18T13:00:00Z" }, pick, now).map((p) => p.id)).toEqual(["honza"]);
    expect(pickResponders(kadr, "Kluci, zítra v šest!", null, pick, now)).toHaveLength(2);
  });
});

describe("proslov a výzva", () => {
  it("proslov jen den předem nebo v den zápasu a jen delší", () => {
    const long = "Kluci, zítra je derby, chci vidět každého na sto procent, makejte za sebe i za vesnici!";
    expect(speechEligible(long, "zítra (sobota 21. 11.) v 18:00 doma s Lhota")).toBe(true);
    expect(speechEligible(long, "DNES (sobota 21. 11.) v 18:00 doma s Lhota")).toBe(true);
    expect(speechEligible(long, "středa 25. 11. v 18:00 doma s Lhota")).toBe(false);
    expect(speechEligible("Zítra v šest", "zítra (sobota 21. 11.) v 18:00 doma s Lhota")).toBe(false);
  });

  it("výzva ke všem z rozboru SMS", () => {
    expect(isAttendancePush("Ve středu žádné omluvenky!")).toBe(true);
    expect(isAttendancePush("Chci tam všechny, je to derby")).toBe(true);
    expect(isAttendancePush("Kdo může?")).toBe(false);
  });

  it("zranění ani incident trenér nerozmluví, kocovinu spíš", () => {
    const p = { coachRelationship: 50, discipline: 50 };
    expect(persuadeChance("health", p)).toBe(0);
    expect(persuadeChance("incident", p)).toBe(0);
    expect(persuadeChance("hangover", p)).toBeCloseTo(0.45);
    expect(persuadeChance("hangover", { coachRelationship: 90, discipline: 80 })).toBeGreaterThan(0.6);
    expect(persuadeChance("absurd", { coachRelationship: 100, discipline: 100 })).toBe(0.85);
  });
});
