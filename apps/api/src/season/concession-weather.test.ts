import { describe, expect, it } from "vitest";
import { CONCESSION_PRODUCT_KEYS, concessionWeatherFactor } from "./concession-catalog";
import { computeSelfConcessionMatch } from "./fans-processor";

/** Teploty krajních fází sezóny — viz `season-weather.ts`. */
const LETO = 24;
const ZIMA = -2;

describe("konzumace podle počasí", () => {
  it("klobása se ve sněhu prodává líp než na slunci", () => {
    expect(concessionWeatherFactor("sausage", "snow", 1))
      .toBeGreaterThan(concessionWeatherFactor("sausage", "sunny", LETO));
  });

  it("pivo se na slunci prodává líp než ve sněhu", () => {
    expect(concessionWeatherFactor("beer", "sunny", LETO))
      .toBeGreaterThan(concessionWeatherFactor("beer", "snow", 1));
  });

  it("limonáda reaguje na teplo prudčeji než pivo", () => {
    const lemoRozpeti = concessionWeatherFactor("lemonade", "sunny", LETO) - concessionWeatherFactor("lemonade", "snow", 1);
    const pivoRozpeti = concessionWeatherFactor("beer", "sunny", LETO) - concessionWeatherFactor("beer", "snow", 1);
    expect(lemoRozpeti).toBeGreaterThan(pivoRozpeti);
  });

  it("stejné počasí za jiné teploty nedá stejný výsledek", () => {
    // Přesně ta díra, kterou task zavírá: dřív obojí 1,30.
    expect(concessionWeatherFactor("beer", "sunny", 11))
      .not.toBe(concessionWeatherFactor("beer", "sunny", LETO));
  });

  it("bez měsíce se použije jen složka počasí — žádný NaN", () => {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      const v = concessionWeatherFactor(key, "cloudy");
      expect(Number.isFinite(v), key).toBe(true);
      expect(v, key).toBeGreaterThan(0);
    }
  });

  it("žádná kombinace neuteče mimo 0,3–1,8", () => {
    const pocasi = ["sunny", "cloudy", "rain", "wind", "snow"] as const;
    for (const key of CONCESSION_PRODUCT_KEYS) {
      for (const w of pocasi) {
        for (const t of [LETO, 11, ZIMA]) {
          const v = concessionWeatherFactor(key, w, t);
          expect(v, `${key}/${w}/${t}C`).toBeGreaterThanOrEqual(0.3);
          expect(v, `${key}/${w}/${t}C`).toBeLessThanOrEqual(1.8);
        }
      }
    }
  });
});

describe("teplota doteče až do prodeje", () => {
  const zbozi = (key: "sausage" | "beer" | "lemonade") => ({
    key, qualityLevel: 2, sellPrice: key === "beer" ? 35 : key === "sausage" ? 45 : 25,
    stockQuantity: 100000, // schválně mimo dosah, ať nelimituje sklad
  });
  const prodej = (weather: "sunny" | "snow", temp?: number) =>
    computeSelfConcessionMatch(300, 50, [zbozi("sausage"), zbozi("beer"), zbozi("lemonade")], weather, 1, temp);
  const kus = (r: ReturnType<typeof prodej>, key: string) => r.products.find((p) => p.key === key)!.sold;

  it("v zimě se prodá víc klobás než v létě", () => {
    expect(kus(prodej("snow", ZIMA), "sausage")).toBeGreaterThan(kus(prodej("sunny", LETO), "sausage"));
  });

  it("v létě se prodá víc piva než v zimě", () => {
    expect(kus(prodej("sunny", LETO), "beer")).toBeGreaterThan(kus(prodej("snow", ZIMA), "beer"));
  });

  it("stejné počasí za jiné teploty dá jiný prodej piva", () => {
    // Kdyby se month po cestě ztratil, tenhle test spadne — a nic jiného by to nechytlo.
    expect(kus(prodej("sunny", 11), "beer")).not.toBe(kus(prodej("sunny", LETO), "beer"));
  });

  it("zima je výrazně slabší než léto, ale bufet nezavírá", () => {
    // Sezónní výkyv je záměr — v zimě se konzumuje míň, tečka. Hraje se
    // duben–prosinec, takže reálné extrémy jsou červenec a prosinec.
    //
    // Pozor při čtení čísel: tenhle test počítá s pevnou návštěvností 300, takže
    // měří jen konzumaci na hlavu. V ostrém provozu se na to navrství ještě
    // weatherAttendanceFactor (sníh −38 %) a skutečný rozdíl je podstatně hlubší.
    const leto = prodej("sunny", LETO).totalRevenue;
    const zima = prodej("snow", ZIMA).totalRevenue;
    expect(zima).toBeLessThan(leto * 0.5);
    expect(zima).toBeGreaterThan(leto * 0.25);
  });

  it("v zimě se tržba přesune ke klobásám, ne že zmizí", () => {
    // Tohle je vlastní smysl celé změny: mění se skladba, ne jen objem.
    const leto = prodej("sunny", LETO);
    const zima = prodej("snow", ZIMA);
    const podil = (r: ReturnType<typeof prodej>) =>
      (r.products.find((p) => p.key === "sausage")!.sold * 45) / r.totalRevenue;
    expect(podil(zima)).toBeGreaterThan(podil(leto) * 3);
  });
});
