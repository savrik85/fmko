import { describe, expect, it } from "vitest";
import { seasonTemperature, weatherForDay, winternessForDate } from "./season-weather";
import { moistureDaily, pitchFrostDamage } from "../stadium/pitch-moisture";

// Celý rok od léta do léta: zimavost se řídí dnem v roce, ne pozicí v sezóně.
const START = "2026-07-03T16:00:00.000Z";
const DNI = 365;

function prubeh() {
  let vlhkost = 50;
  let kondice = 100;
  const zaznam: Array<{ den: number; weather: string; temp: number; vlhkost: number; kondice: number }> = [];
  for (let d = 0; d <= DNI; d++) {
    const den = new Date(Date.parse(START) + d * 86400000).toISOString();
    const zim = winternessForDate(den);
    const w = weatherForDay(den, zim);
    vlhkost = moistureDaily(vlhkost, w.weather);
    kondice = Math.max(5, kondice - pitchFrostDamage(w.weather));
    zaznam.push({ den: d, weather: w.weather, temp: Math.round(seasonTemperature(zim)), vlhkost, kondice });
  }
  return zaznam;
}

/**
 * Chování celého roku, ne jednotlivé funkce. Tyhle vlastnosti vznikají teprve
 * složením oblouku sezóny, vah počasí a modelu vlhkosti — a právě tam se
 * schovaly dvě vady, které jednotkové testy nechytily: sníh při +12 °C
 * a vlhkost zaseklá na stovce na celé týdny.
 */
describe("sezóna jako celek", () => {
  const p = prubeh();

  it("nikdy nesněží nad bodem mrazu", () => {
    for (const d of p) {
      if (d.weather === "snow") expect(d.temp, `den ${d.den}`).toBeLessThanOrEqual(3);
    }
  });

  it("v létě je sucho, v zimě mokro", () => {
    const leto = p.slice(0, 25);
    // Dny 170 až 200 od 3. července = 20. prosince až 19. ledna.
    const stred = p.slice(170, 200);
    expect(Math.min(...leto.map((d) => d.vlhkost))).toBeLessThan(45);
    expect(Math.max(...stred.map((d) => d.vlhkost))).toBeGreaterThan(70);
  });

  it("vlhkost se nezasekne na krajní hodnotě na víc než dva týdny", () => {
    for (const mez of [0, 100]) {
      let vrez = 0;
      for (const d of p) {
        vrez = d.vlhkost === mez ? vrez + 1 : 0;
        expect(vrez, `vlhkost ${mez} od dne ${d.den}`).toBeLessThanOrEqual(14);
      }
    }
  });

  it("mráz ubere za rok znatelně, ale hřiště nezničí", () => {
    // Zima podle kalendáře trvá déle než dřívější zima uprostřed sezóny, sněhových dnů
    // je za rok kolem padesáti (bez jediné opravy trávníku).
    const konec = p[p.length - 1].kondice;
    expect(konec).toBeLessThan(95);
    expect(konec).toBeGreaterThan(40);
  });

  it("po roce je zase teplo jako na začátku", () => {
    expect(p[p.length - 1].temp).toBe(p[0].temp);
  });

  it("vystřídají se všechna roční období", () => {
    const teploty = p.map((d) => d.temp);
    expect(Math.max(...teploty)).toBeGreaterThan(20);
    expect(Math.min(...teploty)).toBeLessThan(0);
  });
});
