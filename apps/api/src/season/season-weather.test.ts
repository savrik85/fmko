import { describe, expect, it } from "vitest";
import { roundWeather, seasonTemperature, seasonWeatherWeights, seasonWinterness } from "./season-weather";

/**
 * Počasí se řídí průběhem sezóny, ne kalendářním měsícem: sezóna začíná i končí
 * v létě a uprostřed je zima. Sezóny startují v datech pokaždé jindy (duben,
 * červenec, srpen), takže kalendář by dával nesmyslné výsledky.
 *
 * Determinismus je tu podmínka, ne příjemnost — předpověď, SMS s omluvenkami
 * i simulace zápasu musí dostat stejné počasí, jinak hra hráči lže.
 */
describe("oblouk sezóny", () => {
  it("první a poslední kolo je léto, půlka je zima", () => {
    expect(seasonWinterness(1, 13)).toBeCloseTo(0, 5);
    expect(seasonWinterness(13, 13)).toBeCloseTo(0, 5);
    expect(seasonWinterness(7, 13)).toBeCloseTo(1, 1);
  });

  it("zimavost nikdy neuteče z rozsahu 0–1", () => {
    for (const kol of [2, 13, 30, 53]) {
      for (let w = 1; w <= kol; w++) {
        const z = seasonWinterness(w, kol);
        expect(z, `${w}/${kol}`).toBeGreaterThanOrEqual(0);
        expect(z, `${w}/${kol}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("jednokolová sezóna nespadne na dělení nulou", () => {
    expect(Number.isFinite(seasonWinterness(1, 1))).toBe(true);
  });

  it("teplota jde od letních dvaceti k mrazu a zpátky", () => {
    expect(seasonTemperature(0)).toBeGreaterThan(20);
    expect(seasonTemperature(1)).toBeLessThan(0);
    expect(seasonTemperature(0.5)).toBeGreaterThan(seasonTemperature(1));
    expect(seasonTemperature(0.5)).toBeLessThan(seasonTemperature(0));
  });
});

describe("váhy počasí podle sezóny", () => {
  it("v létě nesněží, v zimě je sníh nejčastější", () => {
    expect(seasonWeatherWeights(0).snow).toBe(0);
    const zima = seasonWeatherWeights(1);
    for (const w of ["sunny", "cloudy", "rain", "wind"] as const) {
      expect(zima.snow).toBeGreaterThan(zima[w]);
    }
  });

  it("v létě je nejčastější slunce", () => {
    const leto = seasonWeatherWeights(0);
    for (const w of ["cloudy", "rain", "wind", "snow"] as const) {
      expect(leto.sunny).toBeGreaterThan(leto[w]);
    }
  });

  it("váhy jsou vždy nezáporné a nenulový součet", () => {
    for (let i = 0; i <= 10; i++) {
      const w = seasonWeatherWeights(i / 10);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0);
      for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("počasí kola", () => {
  it("je deterministické — stejné kolo dá vždy totéž", () => {
    const a = roundWeather("cal-abc-123", 5, 13);
    const b = roundWeather("cal-abc-123", 5, 13);
    expect(a).toEqual(b);
  });

  it("různá kola se liší, jinak by celá sezóna měla jedno počasí", () => {
    const ruzne = new Set(Array.from({ length: 13 }, (_, i) => roundWeather("cal-x", i + 1, 13).weather));
    expect(ruzne.size).toBeGreaterThan(1);
  });

  it("různé ligy ve stejném kole nemusí mít totéž", () => {
    const a = Array.from({ length: 13 }, (_, i) => roundWeather("liga-A", i + 1, 13).weather).join();
    const b = Array.from({ length: 13 }, (_, i) => roundWeather("liga-B", i + 1, 13).weather).join();
    expect(a).not.toBe(b);
  });

  it("v prvním a posledním kole nikdy nesněží", () => {
    for (let i = 0; i < 300; i++) {
      expect(roundWeather(`cal-${i}`, 1, 13).weather).not.toBe("snow");
      expect(roundWeather(`cal-${i}`, 13, 13).weather).not.toBe("snow");
    }
  });

  it("uprostřed sezóny sníh reálně padá", () => {
    const snih = Array.from({ length: 300 }, (_, i) => roundWeather(`cal-${i}`, 7, 13).weather)
      .filter((w) => w === "snow").length;
    expect(snih).toBeGreaterThan(60);
  });

  it("teplota sedí k fázi sezóny", () => {
    expect(roundWeather("cal-x", 1, 13).temperature).toBeGreaterThan(15);
    expect(roundWeather("cal-x", 7, 13).temperature).toBeLessThan(5);
  });
});
