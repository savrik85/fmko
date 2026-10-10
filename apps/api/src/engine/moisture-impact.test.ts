import { describe, it, expect } from "vitest";
import {
  moistureTechniqueFactor, moistureLongBallBonus, moistureInjuryFactor,
  pitchTechniqueFactor, WEATHER_MODS,
} from "./simulation";
import { MOISTURE_NORMAL } from "../stadium/pitch-moisture";

/**
 * Vlhkost hřiště byla do 2026-08-25 čistě kosmetická: hlídala kaluže ve 3D a
 * radila k taktice, ale zápas se na rozmáčené louce hrál úplně stejně jako na
 * suchu. Dva dny po lijáku tak bylo hřiště pořád rozbahněné — a nikomu to
 * nevadilo. Tyhle testy hlídají, že se to promítá do hry.
 *
 * Vlhkost NENÍ počasí: déšť řeší `WEATHER_MODS`, tohle je paměť půdy. Proto musí
 * být slabší než počasí samo — jinak by se postih započítal dvakrát.
 */

describe("nasáklost půdy a technika", () => {
  it("normální vlhkost hru nemění", () => {
    expect(moistureTechniqueFactor(MOISTURE_NORMAL)).toBe(1);
    expect(moistureLongBallBonus(MOISTURE_NORMAL)).toBe(0);
    expect(moistureInjuryFactor(MOISTURE_NORMAL)).toBe(1);
  });

  it("rozmáčené hřiště sráží techniku, vyprahlé míň", () => {
    expect(moistureTechniqueFactor(100)).toBeLessThan(1);
    expect(moistureTechniqueFactor(0)).toBeLessThan(1);
    expect(moistureTechniqueFactor(100)).toBeLessThan(moistureTechniqueFactor(0));
  });

  it("postih je mírnější než ze samotného počasí, nesmí se počítat dvakrát", () => {
    expect(moistureTechniqueFactor(100)).toBeGreaterThan(WEATHER_MODS.rain.techniqueMod);
    expect(1 - moistureTechniqueFactor(100)).toBeLessThan(1 - pitchTechniqueFactor(0));
  });

  it("na bahně se víc nakopává", () => {
    expect(moistureLongBallBonus(100)).toBeGreaterThan(0);
    expect(moistureLongBallBonus(80)).toBeGreaterThan(0);
    expect(moistureLongBallBonus(100)).toBeLessThan(WEATHER_MODS.rain.longBallBonus);
    // Vyprahlá tvrdá zem k nakopávání nevede — tam se naopak hraje rychle po zemi.
    expect(moistureLongBallBonus(0)).toBe(0);
  });

  it("obě krajnosti zvednou riziko zranění, bahno víc než tvrdá zem", () => {
    expect(moistureInjuryFactor(100)).toBeGreaterThan(1);
    expect(moistureInjuryFactor(0)).toBeGreaterThan(1);
    expect(moistureInjuryFactor(100)).toBeGreaterThan(moistureInjuryFactor(0));
    // Ale ani nejhorší bahno nesmí přebít samotný sníh.
    expect(moistureInjuryFactor(100)).toBeLessThan(WEATHER_MODS.snow.injuryMod);
  });

  it("pásmo kolem normálu je hluché, hřiště se chová jako suché", () => {
    for (const m of [45, 48, 50, 52, 55]) {
      expect(moistureTechniqueFactor(m), `vlhkost ${m}`).toBe(1);
      expect(moistureInjuryFactor(m), `vlhkost ${m}`).toBe(1);
    }
  });

  it("neznámá vlhkost (starší zápasy) hru nemění", () => {
    for (const v of [null, undefined]) {
      expect(moistureTechniqueFactor(v)).toBe(1);
      expect(moistureLongBallBonus(v)).toBe(0);
      expect(moistureInjuryFactor(v)).toBe(1);
    }
  });

  it("hodnoty mimo rozsah se ořežou", () => {
    expect(moistureTechniqueFactor(-20)).toBe(moistureTechniqueFactor(0));
    expect(moistureTechniqueFactor(180)).toBe(moistureTechniqueFactor(100));
  });
});

/**
 * Integrace: totéž počasí, tytéž seedy, jiná nasáklost půdy. Kdyby se vlhkost do
 * simulace nepropsala (což byl stav do 2026-08-25), vyšla by obě čísla stejně.
 */
describe("rozmáčené hřiště v odehraném zápase", () => {
  // Do 2026-10-10 tu bylo „na bahně padne míň gólů“ na 120 zápasech. Bahno ubere
  // technice a přihrávkám zhruba 1 % útoku a šance za minutu klesnou o ~0,6 %, což
  // je na tisícovce zápasů pod úrovní šumu (starý engine −0,4 %, nový +0,8 %).
  // Test proto hlídá dvě věci zvlášť a bez náhody: vlhkost se do zápasu propíše
  // (jiný průběh) a na bahně vzniká méně šancí.
  it("vlhkost se do odehraného zápasu propíše", async () => {
    const { simulateMatch } = await import("./simulation");
    const { createRng } = await import("../generators/rng");
    const { createTeam } = await import("./test-helpers/lineup");

    let changedMatches = 0;
    for (let i = 0; i < 60; i++) {
      const a = simulateMatch(createRng(7000 + i), {
        home: createTeam(1, "TJ Sokol"), away: createTeam(2, "SK Lhota"),
        weather: "cloudy", isHomeAdvantage: false, pitchCondition: 80, pitchMoisture: 50,
      });
      const b = simulateMatch(createRng(7000 + i), {
        home: createTeam(1, "TJ Sokol"), away: createTeam(2, "SK Lhota"),
        weather: "cloudy", isHomeAdvantage: false, pitchCondition: 80, pitchMoisture: 100,
      });
      if (JSON.stringify(a.events) !== JSON.stringify(b.events)) changedMatches++;
    }
    expect(changedMatches).toBeGreaterThan(30);
  });

  it("na bahně vzniká méně šancí než na suchu", async () => {
    const { calcChanceProb } = await import("./simulation");
    const { createTeam } = await import("./test-helpers/lineup");
    const dry = calcChanceProb(createTeam(1, "TJ Sokol"), createTeam(2, "SK Lhota"), "cloudy", 1, undefined, undefined, 80, 50);
    const mud = calcChanceProb(createTeam(1, "TJ Sokol"), createTeam(2, "SK Lhota"), "cloudy", 1, undefined, undefined, 80, 100);
    expect(mud).toBeLessThan(dry);
  });

  it("na bahně se hráči častěji zraní", async () => {
    const { simulateMatch } = await import("./simulation");
    const { createRng } = await import("../generators/rng");
    const { createTeam } = await import("./test-helpers/lineup");

    const N = 200;
    const zraneni = (moisture: number) => {
      let n = 0;
      for (let i = 0; i < N; i++) {
        const r = simulateMatch(createRng(9000 + i), {
          home: createTeam(1, "TJ Sokol"), away: createTeam(2, "SK Lhota"),
          weather: "cloudy", isHomeAdvantage: false, pitchCondition: 80, pitchMoisture: moisture,
        });
        n += r.events.filter((e) => e.type === "injury").length;
      }
      return n;
    };
    expect(zraneni(100)).toBeGreaterThan(zraneni(50));
  });
});
