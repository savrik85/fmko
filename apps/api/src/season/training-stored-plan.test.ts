import { describe, expect, it } from "vitest";
import { storedTrainingApproach, storedTrainingType } from "./training";

describe("typ a přístup tréninku uložený v DB", () => {
  it("neznámý typ (třeba „kondice“ ze staršího klienta) se trénuje jako kondice, prázdný zůstane bez tréninku", () => {
    expect(storedTrainingType("kondice")).toBe("conditioning");
    expect(storedTrainingType("tactics")).toBe("tactics");
    expect(storedTrainingType(null)).toBeNull();
    expect(storedTrainingType("")).toBeNull();
  });

  it("neznámý přístup je vyvážený", () => {
    expect(storedTrainingApproach("balance")).toBe("balanced");
    expect(storedTrainingApproach("strict")).toBe("strict");
    expect(storedTrainingApproach(null)).toBe("balanced");
  });
});
