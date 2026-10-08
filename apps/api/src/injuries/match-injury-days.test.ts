import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { matchInjuryDays } from "./injury-generator";
import { POPISY_ZRANENI } from "../engine/simulation";

function sample(description: string, age = 25, proneness = 50, n = 4000): number[] {
  const rng = createRng(12345);
  return Array.from({ length: n }, () => matchInjuryDays(rng, description, age, proneness));
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("matchInjuryDays", () => {
  it("křeče hráče o další zápas nepřipraví", () => {
    expect(Math.max(...sample("křeče"))).toBeLessThanOrEqual(3);
  });

  it("koleno umí vyřadit na dlouho, naraženina ne", () => {
    expect(Math.max(...sample("koleno"))).toBeGreaterThanOrEqual(30);
    expect(Math.max(...sample("naraženina"))).toBeLessThanOrEqual(14);
  });

  it("průměr přes všechny druhy zůstává kolem 10 dní jako u dřívějšího hodu 3–20", () => {
    const all = POPISY_ZRANENI.flatMap((d) => sample(d, 25, 50, 2000));
    expect(mean(all)).toBeGreaterThan(8);
    expect(mean(all)).toBeLessThan(13);
  });

  it("starší a náchylnější hráč je mimo déle", () => {
    expect(mean(sample("koleno", 36, 95))).toBeGreaterThan(mean(sample("koleno", 22, 5)));
  });

  it("lékárnička zkrátí zranění, ale aspoň jeden den zůstane", () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) expect(matchInjuryDays(rng, "křeče", 25, 50, 5)).toBe(1);
  });

  it("neznámý popis se bere jako naraženina", () => {
    expect(Math.max(...sample("něco jiného"))).toBeLessThanOrEqual(14);
  });
});
