import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { ABROAD_INTEREST_BONUS, computePlayerInterest, type InterestInputs } from "./player-interest";
import { germanClubLetter } from "./virtual-teams";

const BASE: InterestInputs = {
  personality: { patriotism: 50 }, morale: 50, coachRelationship: 50, recentMinutes: 250, age: 26, overallRating: 55,
  position: "MID", currentTeamStrength: 45, offerTeamStrength: 55, offerAmount: 60_000,
};

describe("nabídky německých klubů", () => {
  it("nabídka z Německa láká hráče víc než stejná z Česka", () => {
    const czech = computePlayerInterest(BASE);
    const german = computePlayerInterest({ ...BASE, abroad: true });
    expect(german.score - czech.score).toBe(ABROAD_INTEREST_BONUS);
    expect(german.factors.map((f) => f.label)).toContain("Fotbal v Německu");
    expect(czech.factors.map((f) => f.label)).not.toContain("Fotbal v Německu");
  });

  it("dopis klubu je lámanou češtinou, s klubem, hráčem a cenou, bez dlouhé pomlčky", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const text = germanClubLetter(createRng(seed), "SV Waldkirchen", "Jan Novák", 82_000);
      expect(text).toContain("SV Waldkirchen");
      expect(text).toContain("Jan Novák");
      expect(text).toContain((82_000).toLocaleString("cs"));
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/\{\w+\}/);
    }
  });
});
