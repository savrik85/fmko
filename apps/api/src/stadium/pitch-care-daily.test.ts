import { describe, expect, it } from "vitest";
import {
  DAILY_SERVICE_RATE, dailyServiceCost, dailyServiceForWeather, decideDailyPitchCare, serviceCost,
} from "./pitch-care";

/**
 * Péče o trávník se do 2026-08-25 vyhodnocovala VÝHRADNĚ v zápasový den, zatímco
 * počasí na hřiště působí každý den. Týden veder tak hřiště vypráhl a zavlažování
 * s tím nesvedlo nic, dokud se nehrálo doma — a vyhřívání nechránilo před mrazem,
 * protože mráz ubírá kondici v denním ticku.
 */

const zaklad = {
  mode: "auto" as const,
  heatingLevel: 2,
  irrigationLevel: 2,
  budget: 1_000_000,
};

describe("co se zapíná v běžný den", () => {
  it("mráz volá po vyhřívání, výheň po zavlažování", () => {
    expect(dailyServiceForWeather("snow")).toBe("heating");
    expect(dailyServiceForWeather("sunny")).toBe("irrigation");
  });

  it("v dešti se mimo zápas netopí — bahno dělají teprve kopačky", () => {
    expect(dailyServiceForWeather("rain")).toBeNull();
    expect(dailyServiceForWeather("cloudy")).toBeNull();
    expect(dailyServiceForWeather("wind")).toBeNull();
  });

  it("běžný den stojí zlomek zápasového provozu", () => {
    for (const lv of [1, 2, 3]) {
      expect(dailyServiceCost("heating", lv)).toBeLessThan(serviceCost("heating", lv));
      expect(dailyServiceCost("irrigation", lv)).toBeGreaterThan(0);
    }
    expect(DAILY_SERVICE_RATE).toBeLessThan(1);
  });

  it("bez zařízení se neplatí nic", () => {
    expect(dailyServiceCost("heating", 0)).toBe(0);
  });
});

describe("denní rozhodnutí o péči", () => {
  it("v automatu se v mrazu zapne vyhřívání a strhne denní sazba", () => {
    const d = decideDailyPitchCare({ ...zaklad, weather: "snow" });
    expect(d.service).toBe("heating");
    expect(d.cost).toBe(dailyServiceCost("heating", 2));
  });

  it("zataženo nestojí nic", () => {
    expect(decideDailyPitchCare({ ...zaklad, weather: "cloudy" }))
      .toMatchObject({ service: null, cost: 0, skipped: "not_needed" });
  });

  it("ruční režim mimo zápas nezapne nic — objednává se na zápas", () => {
    expect(decideDailyPitchCare({ ...zaklad, mode: "manual", weather: "snow" }))
      .toMatchObject({ service: null, skipped: "not_ordered" });
  });

  it("vypnutá péče zůstane vypnutá", () => {
    expect(decideDailyPitchCare({ ...zaklad, mode: "off", weather: "snow" }))
      .toMatchObject({ service: null, skipped: "mode_off" });
  });

  it("bez zařízení není co zapnout", () => {
    expect(decideDailyPitchCare({ ...zaklad, heatingLevel: 0, weather: "snow" }))
      .toMatchObject({ service: null, skipped: "no_equipment" });
  });

  it("prázdná kasa péči nezaplatí — riziko zůstává na manažerovi", () => {
    expect(decideDailyPitchCare({ ...zaklad, budget: 10, weather: "snow" }))
      .toMatchObject({ service: null, skipped: "no_money" });
  });
});
