import { describe, it, expect } from "vitest";
import { pitchTechniqueFactor, pitchLongBallBonus, WEATHER_MODS } from "./simulation";

/**
 * Stav trávníku dlouho ovlivňoval VÝHRADNĚ riziko zranění — na rozorané louce
 * se přihrávalo stejně přesně jako na koberci. Tyhle testy hlídají, že hřiště
 * zasahuje i do toho, JAK se hraje, ne jen kdo se zraní.
 */
describe("dopad stavu trávníku na hru", () => {
  it("koberec techniku nesráží, rozorané hřiště ano", () => {
    expect(pitchTechniqueFactor(100)).toBe(1);
    expect(pitchTechniqueFactor(50)).toBeLessThan(1);
    expect(pitchTechniqueFactor(5)).toBeLessThan(pitchTechniqueFactor(50));
  });

  it("postih techniky zůstává v rozumných mezích", () => {
    // Nejhorší možné hřiště nesmí z fotbalu udělat loterii.
    expect(pitchTechniqueFactor(0)).toBeGreaterThan(0.85);
    expect(pitchTechniqueFactor(0)).toBeLessThan(0.9);
  });

  it("neznámý stav (starší zápasy) hru nemění", () => {
    expect(pitchTechniqueFactor(null)).toBe(1);
    expect(pitchTechniqueFactor(undefined)).toBe(1);
    expect(pitchLongBallBonus(null)).toBe(0);
    expect(pitchLongBallBonus(undefined)).toBe(0);
  });

  it("čím horší hřiště, tím víc se vyplatí nakopávat", () => {
    expect(pitchLongBallBonus(100)).toBe(0);
    expect(pitchLongBallBonus(50)).toBeGreaterThan(0);
    expect(pitchLongBallBonus(5)).toBeGreaterThan(pitchLongBallBonus(50));
  });

  it("bonus za nakopávání nepřebije bonus z počasí", () => {
    // Na nejhorším hřišti musí zůstat srovnatelný s deštěm (0.15), ne dvojnásobný.
    expect(pitchLongBallBonus(0)).toBeLessThan(WEATHER_MODS.rain.longBallBonus);
  });

  it("hodnoty mimo rozsah se ořežou", () => {
    expect(pitchTechniqueFactor(-50)).toBe(pitchTechniqueFactor(0));
    expect(pitchTechniqueFactor(500)).toBe(pitchTechniqueFactor(100));
    expect(pitchLongBallBonus(-50)).toBe(pitchLongBallBonus(0));
    expect(pitchLongBallBonus(500)).toBe(pitchLongBallBonus(100));
  });

  it("výheň už není zadarmo — tvrdá zem a vedro si něco berou", () => {
    expect(WEATHER_MODS.sunny.injuryMod).toBeGreaterThan(1);
    expect(WEATHER_MODS.sunny.conditionDrainMod).toBeGreaterThan(1);
    // Ale pořád musí být mírnější než sníh.
    expect(WEATHER_MODS.sunny.injuryMod).toBeLessThan(WEATHER_MODS.snow.injuryMod);
    expect(WEATHER_MODS.sunny.conditionDrainMod).toBeLessThan(WEATHER_MODS.snow.conditionDrainMod);
  });

  it("zataženo zůstává jediné plně neutrální počasí", () => {
    const c = WEATHER_MODS.cloudy;
    expect(c.injuryMod).toBe(1);
    expect(c.conditionDrainMod).toBe(1);
    expect(c.techniqueMod).toBe(1);
    expect(c.gkHandlingMod).toBe(1);
  });
});
