/**
 * Hodnocení brankáře z plochých atributů.
 *
 * Brankářské dovednosti (reflexes, catching, …) žijí jen ve `skills_max`, který se po vzniku
 * hráče nikdy neaktualizuje. Trénink zapisuje do plochého `goalkeeping`. Bez překladu mezi
 * nimi se brankáři hodnocení po tréninku vůbec nehnulo — a přesně to tenhle test hlídá.
 */
import { describe, it, expect } from "vitest";
import { overallRatingFromFlat } from "./generator";

/** Jak vypadá `skills_max` brankáře po vygenerování — zamrzlé hodnoty. */
const SKILLS_MAX_GK = {
  reflexes: { current: 30, maxPotential: 60 },
  positioning: { current: 30, maxPotential: 58 },
  rushing: { current: 28, maxPotential: 55 },
  catching: { current: 30, maxPotential: 60 },
  kicking: { current: 25, maxPotential: 50 },
  distribution: { current: 24, maxPotential: 48 },
  strength: { current: 30, maxPotential: 55 },
  reach: { current: 28, maxPotential: 56 },
  communication: { current: 26, maxPotential: 52 },
  experience: { current: 20, maxPotential: 100 },
};

/** Ploché `skills`, do kterých píše trénink. Brankářské názvy tu nejsou vůbec. */
function ploche(goalkeeping: number) {
  return {
    speed: 28, technique: 25, shooting: 25, passing: 24, heading: 28, defense: 30,
    goalkeeping, creativity: 26, setPieces: 25, stamina: 30, strength: 30, vision: 30,
    experience: 20,
  };
}

describe("hodnocení brankáře", () => {
  it("natrénovaná brankářská dovednost hodnocení zvedne", () => {
    const physical = { stamina: 30, strength: 30 };
    const pred = overallRatingFromFlat("GK", ploche(30), physical, 0, SKILLS_MAX_GK);
    const po = overallRatingFromFlat("GK", ploche(60), physical, 0, SKILLS_MAX_GK);

    expect(pred).not.toBeNull();
    expect(po).not.toBeNull();
    expect(po!).toBeGreaterThan(pred!);
  });

  it("brankář bez skills_max dostane hodnocení, ne null", () => {
    const r = overallRatingFromFlat("GK", ploche(45), { stamina: 30, strength: 30 }, 0);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0);
  });

  it("překlad platí jen pro brankáře — hráč v poli goalkeeping neřeší", () => {
    const physical = { stamina: 30, strength: 30 };
    const nizke = overallRatingFromFlat("MID", ploche(10), physical, 0);
    const vysoke = overallRatingFromFlat("MID", ploche(90), physical, 0);
    expect(nizke).toBe(vysoke);
  });

  it("skrytý talent se do hodnocení promítne stejně jako u hráčů v poli", () => {
    const physical = { stamina: 30, strength: 30 };
    const bez = overallRatingFromFlat("GK", ploche(40), physical, 0, SKILLS_MAX_GK);
    const s = overallRatingFromFlat("GK", ploche(40), physical, 60, SKILLS_MAX_GK);
    expect(s!).toBeGreaterThan(bez!);
  });
});
