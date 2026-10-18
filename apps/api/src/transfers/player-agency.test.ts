import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { evaluateSigningChance } from "./player-agency";

const TEAM = { reputation: 50, villageLat: 49.0128, villageLon: 13.9975, squadSize: 18, district: "Prachatice", coach: null };
const NEAR = { lat: 48.98, lng: 13.95 };
const factorNames = (d: ReturnType<typeof evaluateSigningChance>) => d.factors.map((f) => f.name);

describe("ochota hráče z ciziny", () => {
  it("hráč z Německa má místo „Jiný okres“ faktor „Zahraničí“ a je méně ochotný", () => {
    const personality = { patriotism: 50 };
    const czech = evaluateSigningChance({ weekly_wage: 200, personality, district: "Strakonice" }, TEAM, NEAR, 200, createRng(1));
    const german = evaluateSigningChance({ weekly_wage: 200, personality, district: "Freyung-Grafenau", country: "DE" }, TEAM, NEAR, 200, createRng(1));
    expect(factorNames(czech)).toContain("Jiný okres");
    expect(factorNames(german)).toContain("Zahraničí");
    expect(factorNames(german)).not.toContain("Jiný okres");
    const penalty = (d: typeof czech, name: string) => d.factors.find((f) => f.name === name)!.value;
    expect(penalty(german, "Zahraničí")).toBeLessThan(penalty(czech, "Jiný okres"));
  });

  it("patriot z Bavorska dostane největší postih", () => {
    const d = evaluateSigningChance({ weekly_wage: 200, personality: { patriotism: 80 }, district: "Freyung-Grafenau", country: "DE" }, TEAM, NEAR, 200, createRng(2));
    expect(d.factors.find((f) => f.name === "Zahraničí")!.value).toBe(-35);
  });

  it("český hráč s country CZ se chová jako dřív", () => {
    const a = evaluateSigningChance({ weekly_wage: 200, personality: { patriotism: 50 }, district: "Strakonice" }, TEAM, NEAR, 200, createRng(3));
    const b = evaluateSigningChance({ weekly_wage: 200, personality: { patriotism: 50 }, district: "Strakonice", country: "CZ" }, TEAM, NEAR, 200, createRng(3));
    expect(b).toEqual(a);
  });
});
