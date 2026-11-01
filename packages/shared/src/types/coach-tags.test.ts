import { describe, expect, it } from "vitest";
import { coachTags } from "./coach";

const average = { coaching: 50, motivation: 50, tactics: 50, youthDevelopment: 46, discipline: 46, reputation: 37 };

describe("štítky trenéra", () => {
  it("průměrný trenér žádný štítek nemá", () => {
    expect(coachTags(average)).toEqual([]);
  });

  it("výrazné stránky dostanou štítek s číslem, jaké počítá hra; nejvýraznější první, nejvýš tři", () => {
    const tags = coachTags({ ...average, coaching: 70, motivation: 66, tactics: 66, youthDevelopment: 60 });
    expect(tags).toHaveLength(3);
    expect(tags.map((t) => t.label)).toEqual(["Brusič", "Taktik", "Motivátor"]);
    expect(tags[0].description).toContain("×1,36");
  });

  it("slabé stránky jsou taky vidět a popis nelže o nule", () => {
    const tags = coachTags({ ...average, motivation: 25, discipline: 32 });
    expect(tags.map((t) => t.key)).toEqual(["discipline_low", "motivation_low"].sort((a, b) => (a === "motivation_low" ? -1 : 1)));
    expect(tags.find((t) => t.key === "motivation_low")?.description).toBe("Před výkopem morálku sestavy nezvedne a nenominovaní u něj trucují víc.");
  });

  it("v popiscích nejsou dlouhé pomlčky", () => {
    const all = [
      ...coachTags({ coaching: 70, motivation: 66, tactics: 66, youthDevelopment: 64, discipline: 60, reputation: 72 }, 9),
      ...coachTags({ coaching: 25, motivation: 25, tactics: 31, youthDevelopment: 32, discipline: 32, reputation: 16 }, 9),
    ];
    expect(all).toHaveLength(12);
    for (const t of all) expect(t.description).not.toContain("—");
  });
});
