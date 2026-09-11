/** Text skautova tipu — jediné místo, kde se z čísel dělá věta. */
import { describe, it, expect } from "vitest";
import { textTipu } from "./staff-tick";

const hrac = (o: Partial<Parameters<typeof textTipu>[0]> = {}) => ({
  first_name: "Adam", last_name: "Kolář", position: "FWD",
  age: 20, overall_rating: 40, hidden_talent: 35, ...o,
});

describe("skautův tip", () => {
  it("vždycky nese jméno, věk, post i rating — bez čísel je tip k ničemu", () => {
    const t = textTipu(hrac());
    expect(t).toContain("Adam Kolář");
    expect(t).toContain("20 let");
    expect(t).toContain("útočník");
    expect(t).toContain("rating 40");
  });

  it("post se překládá do češtiny, ne „(FWD)“", () => {
    expect(textTipu(hrac({ position: "GK" }))).toContain("brankář");
    expect(textTipu(hrac({ position: "DEF" }))).toContain("obránce");
    expect(textTipu(hrac({ position: "MID" }))).toContain("záložník");
  });

  it("neznámý post nespadne na prázdno", () => {
    expect(textTipu(hrac({ position: "XX" }))).toContain("XX");
  });

  it("důvod odpovídá tomu, proč ho skaut vytáhl", () => {
    expect(textTipu(hrac({ hidden_talent: 30 }))).toContain("víc, než ukazuje");
    expect(textTipu(hrac({ hidden_talent: 18 }))).toContain("poroste");
    expect(textTipu(hrac({ hidden_talent: 5, age: 20 }))).toContain("Na svůj věk");
    expect(textTipu(hrac({ hidden_talent: 5, age: 29 }))).toContain("zrovna volný");
  });

  it("věta je hotová a odkáže, kde hráče najít", () => {
    const t = textTipu(hrac());
    expect(t.trim()).toMatch(/\.$/);
    expect(t).toContain("Přestupech");
  });
});
