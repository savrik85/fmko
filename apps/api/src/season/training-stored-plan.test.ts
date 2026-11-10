import { describe, expect, it } from "vitest";
import { storedTrainingApproach, storedTrainingType, trainingConditionDrain, TRAINING_CONDITION_DRAIN } from "./training";

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

describe("úbytek kondice podle typu tréninku", () => {
  it("každý skutečný typ má svou hodnotu: kondice a taktika 3, technika a zápasový 4", () => {
    expect(TRAINING_CONDITION_DRAIN).toEqual({ conditioning: 3, technique: 4, tactics: 3, match_practice: 4 });
    // Taktika dřív padala na výchozí 4, protože tabulka měla klíč „tactical“
    expect(trainingConditionDrain("tactics")).toBe(3);
    expect(trainingConditionDrain("conditioning")).toBe(3);
    expect(trainingConditionDrain("technique")).toBe(4);
    expect(trainingConditionDrain("match_practice")).toBe(4);
  });

  it("neznámý nebo prázdný typ bere výchozí 4", () => {
    expect(trainingConditionDrain("tactical")).toBe(4);
    expect(trainingConditionDrain(null)).toBe(4);
  });
});
