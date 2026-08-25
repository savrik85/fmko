import { describe, expect, it } from "vitest";
import { CONCESSION_PRODUCT_KEYS, concessionWeatherFactor } from "./concession-catalog";
import { monthTemperature } from "./weather";
import { computeSelfConcessionMatch } from "./fans-processor";

describe("teplota podle měsíce", () => {
  it("leden je pod nulou, červenec přes dvacet", () => {
    expect(monthTemperature(1)).toBeLessThan(0);
    expect(monthTemperature(7)).toBeGreaterThan(20);
  });

  it("každý měsíc vrací číslo v rozumném rozsahu", () => {
    for (let m = 1; m <= 12; m++) {
      expect(monthTemperature(m), `měsíc ${m}`).toBeGreaterThan(-15);
      expect(monthTemperature(m), `měsíc ${m}`).toBeLessThan(35);
    }
  });

  it("neznámý měsíc spadne na mírný default, ne na NaN", () => {
    expect(Number.isFinite(monthTemperature(0))).toBe(true);
    expect(Number.isFinite(monthTemperature(13))).toBe(true);
  });
});

describe("konzumace podle počasí", () => {
  it("klobása se ve sněhu prodává líp než na slunci", () => {
    expect(concessionWeatherFactor("sausage", "snow", 1))
      .toBeGreaterThan(concessionWeatherFactor("sausage", "sunny", 7));
  });

  it("pivo se na slunci prodává líp než ve sněhu", () => {
    expect(concessionWeatherFactor("beer", "sunny", 7))
      .toBeGreaterThan(concessionWeatherFactor("beer", "snow", 1));
  });

  it("limonáda reaguje na teplo prudčeji než pivo", () => {
    const lemoRozpeti = concessionWeatherFactor("lemonade", "sunny", 7) - concessionWeatherFactor("lemonade", "snow", 1);
    const pivoRozpeti = concessionWeatherFactor("beer", "sunny", 7) - concessionWeatherFactor("beer", "snow", 1);
    expect(lemoRozpeti).toBeGreaterThan(pivoRozpeti);
  });

  it("stejné počasí v dubnu a v červenci nedá stejný výsledek", () => {
    // Přesně ta díra, kterou task zavírá: dřív obojí 1,30.
    expect(concessionWeatherFactor("beer", "sunny", 4))
      .not.toBe(concessionWeatherFactor("beer", "sunny", 7));
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
        for (let m = 1; m <= 12; m++) {
          const v = concessionWeatherFactor(key, w, m);
          expect(v, `${key}/${w}/${m}`).toBeGreaterThanOrEqual(0.3);
          expect(v, `${key}/${w}/${m}`).toBeLessThanOrEqual(1.8);
        }
      }
    }
  });
});

describe("měsíc doteče až do prodeje", () => {
  const zbozi = (key: "sausage" | "beer" | "lemonade") => ({
    key, qualityLevel: 2, sellPrice: key === "beer" ? 35 : key === "sausage" ? 45 : 25,
    stockQuantity: 100000, // schválně mimo dosah, ať nelimituje sklad
  });
  const prodej = (weather: "sunny" | "snow", month?: number) =>
    computeSelfConcessionMatch(300, 50, [zbozi("sausage"), zbozi("beer"), zbozi("lemonade")], weather, 1, month);
  const kus = (r: ReturnType<typeof prodej>, key: string) => r.products.find((p) => p.key === key)!.sold;

  it("v prosinci se prodá víc klobás než v červenci", () => {
    expect(kus(prodej("snow", 12), "sausage")).toBeGreaterThan(kus(prodej("sunny", 7), "sausage"));
  });

  it("v červenci se prodá víc piva než v prosinci", () => {
    expect(kus(prodej("sunny", 7), "beer")).toBeGreaterThan(kus(prodej("snow", 12), "beer"));
  });

  it("stejné počasí v dubnu a v červenci dá jiný prodej piva", () => {
    // Kdyby se month po cestě ztratil, tenhle test spadne — a nic jiného by to nechytlo.
    expect(kus(prodej("sunny", 4), "beer")).not.toBe(kus(prodej("sunny", 7), "beer"));
  });

  it("prosincová tržba neklesne pod 40 % té červencové", () => {
    // Sezónní výkyv je záměr, ale bufet nesmí v zimě přestat vydělávat.
    // Hraje se duben–prosinec, takže reálné extrémy jsou červenec a prosinec.
    const leto = prodej("sunny", 7).totalRevenue;
    const zima = prodej("snow", 12).totalRevenue;
    expect(zima).toBeGreaterThan(leto * 0.4);
  });

  it("v zimě se tržba přesune ke klobásám, ne že zmizí", () => {
    // Tohle je vlastní smysl celé změny: mění se skladba, ne jen objem.
    const leto = prodej("sunny", 7);
    const zima = prodej("snow", 12);
    const podil = (r: ReturnType<typeof prodej>) =>
      (r.products.find((p) => p.key === "sausage")!.sold * 45) / r.totalRevenue;
    expect(podil(zima)).toBeGreaterThan(podil(leto) * 3);
  });
});
