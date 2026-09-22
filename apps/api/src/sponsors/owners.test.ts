/**
 * Majitel firmy: deterministický podle id sponzora, povaha vážená oborem.
 */
import { describe, it, expect } from "vitest";
import { generateSponsorOwner, isOwnerPersonality, OWNER_PERSONALITIES } from "./owners";

describe("generateSponsorOwner", () => {
  it("je deterministický pro stejné id", () => {
    expect(generateSponsorOwner(93, "club")).toEqual(generateSponsorOwner(93, "club"));
  });

  it("různá id dávají různé majitele", () => {
    const names = new Set(Array.from({ length: 30 }, (_, i) => {
      const o = generateSponsorOwner(i + 1, "company");
      return `${o.firstName} ${o.lastName} ${o.age}`;
    }));
    expect(names.size).toBeGreaterThan(20);
  });

  it("má platnou povahu, věk 32–68 a portrét", () => {
    for (let id = 1; id <= 50; id++) {
      const o = generateSponsorOwner(id, "pub");
      expect(isOwnerPersonality(o.personality)).toBe(true);
      expect(o.age).toBeGreaterThanOrEqual(32);
      expect(o.age).toBeLessThanOrEqual(68);
      expect(o.faceConfig).toHaveProperty("head");
    }
  });

  it("pokrývá všechny povahy napříč obory", () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 200; id++) seen.add(generateSponsorOwner(id, id % 2 ? "pub" : "company").personality);
    expect([...seen].sort()).toEqual([...OWNER_PERSONALITIES].sort());
  });
});
