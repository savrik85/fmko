/**
 * Náhoda jednoho týmu nesmí být shodná s jiným týmem.
 *
 * 2026-10-08 ve 3:01 poslal starosta Dũnga Lýho (29, ÚTO) naráz Klamovce, Dvorcům
 * i Alze Vinohrady. Seed byl `now + teamId.charCodeAt(0)` a všechna tři ID začínají na „6“.
 * Na produkci tak bylo 25 skupin stejných hráčů v kádrech (53 hráčů).
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { teamSeed } from "./seed";
import { receivesPlayerOffers } from "../events/player-offers";

// Skutečná ID z produkce (Klamovka, Dvorce, Alza Vinohrady), všechna začínají na „6“.
const TEAM_A = "63b61977-542a-46db-9949-788a97582ee7";
const TEAM_B = "6b8f1d86-4567-4f34-a1f6-213ff4ad8fc8";
const TEAM_C = "6e53a516-bb0d-4a25-876a-34298b0a60bc";
const TICK = Date.parse("2026-10-08T03:01:11Z");

function firstDraws(seed: number, count = 5): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.random());
}

describe("teamSeed", () => {
  it("starý seed dával týmům se stejným prvním znakem stejnou náhodu (reprodukce chyby)", () => {
    const legacy = (id: string) => firstDraws(TICK + id.charCodeAt(0) + 22222);
    expect(legacy(TEAM_B)).toEqual(legacy(TEAM_A));
    expect(legacy(TEAM_C)).toEqual(legacy(TEAM_A));
  });

  it("týmy se stejným prvním znakem mají ve stejném ticku různou náhodu", () => {
    const draws = [TEAM_A, TEAM_B, TEAM_C].map((id) => firstDraws(teamSeed(id, TICK, "player-offers")).join());
    expect(new Set(draws).size).toBe(3);
  });

  it("je deterministický a liší se podle účelu i času", () => {
    expect(teamSeed(TEAM_A, TICK, "player-offers")).toBe(teamSeed(TEAM_A, TICK, "player-offers"));
    expect(teamSeed(TEAM_A, TICK, "player-offers")).not.toBe(teamSeed(TEAM_A, TICK, "training"));
    expect(teamSeed(TEAM_A, TICK, "player-offers")).not.toBe(teamSeed(TEAM_A, TICK + 86_400_000, "player-offers"));
  });

  it("denní šance na nabídku (14 %) se losuje pro každý tým zvlášť, ne všem nebo nikomu", () => {
    // 400 různých ID se stejným prvním znakem, jeden tick.
    const ids = Array.from({ length: 400 }, (_, i) => `6${i.toString(16).padStart(7, "0")}-1111-4111-8111-111111111111`);
    const offered = ids.filter((id) => createRng(teamSeed(id, TICK, "player-offers")).random() <= 0.14).length;
    expect(offered).toBeGreaterThan(30);
    expect(offered).toBeLessThan(90);
  });
});

describe("receivesPlayerOffers", () => {
  const senior = { user_id: "u1", team_type: "senior", game_date: "2026-10-08", village_district: "Praha" };

  it("lidské áčko nabídky dostává", () => {
    expect(receivesPlayerOffers(senior)).toBe(true);
  });

  it("U21 nabídky nedostává", () => {
    expect(receivesPlayerOffers({ ...senior, team_type: "u21" })).toBe(false);
  });

  it("AI tým a tým bez herního data nebo okresu ne", () => {
    expect(receivesPlayerOffers({ ...senior, user_id: "ai" })).toBe(false);
    expect(receivesPlayerOffers({ ...senior, game_date: null })).toBe(false);
    expect(receivesPlayerOffers({ ...senior, village_district: null })).toBe(false);
  });
});
