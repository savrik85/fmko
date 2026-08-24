import { describe, it, expect } from "vitest";
import {
  decidePitchCare, serviceForWeather, serviceCost, careEffectiveness,
  SNOW_CLEARING_COST, HEATING_COST_PER_MATCH, IRRIGATION_COST_PER_MATCH,
  type PitchCareDecisionInput,
} from "./pitch-care";

function vstup(over: Partial<PitchCareDecisionInput> = {}): PitchCareDecisionInput {
  return {
    weather: "snow",
    mode: "auto",
    heatingLevel: 2,
    irrigationLevel: 2,
    orderedThisMatch: false,
    snowClearingOrdered: false,
    budget: 1_000_000,
    ...over,
  };
}

describe("co si počasí žádá", () => {
  it("mráz a déšť chtějí vyhřívání, výheň zavlažování", () => {
    expect(serviceForWeather("snow")).toBe("heating");
    expect(serviceForWeather("rain")).toBe("heating");
    expect(serviceForWeather("sunny")).toBe("irrigation");
  });

  it("zataženo a vítr nechtějí nic", () => {
    expect(serviceForWeather("cloudy")).toBeNull();
    expect(serviceForWeather("wind")).toBeNull();
    expect(serviceForWeather(null)).toBeNull();
  });

  it("vyšší úroveň znamená vyšší provoz — dražší zařízení není jen jednorázový výdaj", () => {
    expect(serviceCost("heating", 1)).toBeLessThan(serviceCost("heating", 3));
    expect(serviceCost("irrigation", 1)).toBeLessThan(serviceCost("irrigation", 3));
    expect(serviceCost("heating", 0)).toBe(0);
  });

  it("vyhřívání je v provozu dražší než zavlažování", () => {
    expect(HEATING_COST_PER_MATCH[3]).toBeGreaterThan(IRRIGATION_COST_PER_MATCH[3]);
  });

  it("úroveň mimo rozsah se ořízne", () => {
    expect(serviceCost("heating", 99)).toBe(HEATING_COST_PER_MATCH[3]);
    expect(serviceCost("heating", -5)).toBe(0);
  });
});

describe("rozhodnutí o péči před zápasem", () => {
  it("v hezkém počasí se nezapíná nic", () => {
    const d = decidePitchCare(vstup({ weather: "cloudy" }));
    expect(d.service).toBeNull();
    expect(d.cost).toBe(0);
    expect(d.skipped).toBe("not_needed");
  });

  it("automatický režim zapne, co je potřeba, a naúčtuje to", () => {
    const d = decidePitchCare(vstup({ weather: "snow" }));
    expect(d.service).toBe("heating");
    expect(d.cost).toBe(serviceCost("heating", 2));
  });

  it("na výhni se zapne zavlažování, ne topení", () => {
    expect(decidePitchCare(vstup({ weather: "sunny" })).service).toBe("irrigation");
  });

  it("bez zařízení není co zapínat", () => {
    const d = decidePitchCare(vstup({ heatingLevel: 0 }));
    expect(d.service).toBeNull();
    expect(d.skipped).toBe("no_equipment");
  });

  it("režim „nezapínat\" ušetří, ale hřiště si to vybere", () => {
    const d = decidePitchCare(vstup({ mode: "off" }));
    expect(d.service).toBeNull();
    expect(d.cost).toBe(0);
    expect(d.skipped).toBe("mode_off");
  });

  it("v ručním režimu se bez objednávky nezapne nic", () => {
    expect(decidePitchCare(vstup({ mode: "manual" })).skipped).toBe("not_ordered");
    expect(decidePitchCare(vstup({ mode: "manual", orderedThisMatch: true })).service).toBe("heating");
  });

  it("bez peněz se péče nezapne — klub se nedostane do minusu", () => {
    const d = decidePitchCare(vstup({ budget: 10 }));
    expect(d.service).toBeNull();
    expect(d.cost).toBe(0);
    expect(d.skipped).toBe("no_money");
  });

  it("zaplacený úklid sněhu má přednost před topením", () => {
    const d = decidePitchCare(vstup({ weather: "snow", snowClearingOrdered: true }));
    expect(d.service).toBe("snow_clearing");
    expect(d.cost).toBe(SNOW_CLEARING_COST);
  });

  it("úklid sněhu funguje i bez vyhřívání — je to parta s lopatami, ne zařízení", () => {
    const d = decidePitchCare(vstup({ weather: "snow", heatingLevel: 0, snowClearingOrdered: true }));
    expect(d.service).toBe("snow_clearing");
  });

  it("úklid sněhu v dešti nedává smysl, řeší se topením", () => {
    const d = decidePitchCare(vstup({ weather: "rain", snowClearingOrdered: true }));
    expect(d.service).toBe("heating");
  });
});

describe("účinnost zapnuté péče", () => {
  it("zapnuté vyhřívání tlumí jen svou stranu počasí", () => {
    const d = decidePitchCare(vstup({ weather: "snow" }));
    const eff = careEffectiveness(d, 0.66, 0.66);
    expect(eff.heatingMod).toBe(0.66);
    expect(eff.irrigationMod).toBe(0);
  });

  it("nezapnutá péče netlumí nic, i když zařízení klub má", () => {
    const d = decidePitchCare(vstup({ mode: "off" }));
    const eff = careEffectiveness(d, 1, 1);
    expect(eff.heatingMod).toBe(0);
    expect(eff.irrigationMod).toBe(0);
  });

  it("lopaty nezmůžou to co topení — sníh se shrne, rozbředlý podklad zůstane", () => {
    const shrnuto = careEffectiveness(
      decidePitchCare(vstup({ weather: "snow", snowClearingOrdered: true })), 1, 1);
    const vyhrivano = careEffectiveness(
      decidePitchCare(vstup({ weather: "snow", heatingLevel: 3 })), 1, 1);
    expect(shrnuto.heatingMod).toBeGreaterThan(0);
    expect(shrnuto.heatingMod).toBeLessThan(vyhrivano.heatingMod);
  });
});
