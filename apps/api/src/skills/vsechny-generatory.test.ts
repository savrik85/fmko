/**
 * Všechny cesty, kterými ve hře vzniká hráč — každá musí dodat kompletního hráče.
 *
 * Hráči se generují na pěti různých místech (AI týmy, dorost, volní hráči, virtuální
 * soupeři, odchovanci z akademie) a každé z nich si dovednosti skládá po svém. Když
 * některé zapomene, projeví se to až za týdny: prázdné hvězdy, brankář bez chytání,
 * dovednost s nulou, kterou trénink nikdy nezvedne.
 *
 * Test proto prochází sadu dovedností, kterou generátory produkují, proti tomu, co
 * hodnocení na dané pozici doopravdy potřebuje.
 */
import { describe, it, expect } from "vitest";
import { generateFieldSkills, generateGKSkills, generateHiddenTalent, calculateOverallRating } from "./generator";
import { ratingWeightsFor } from "@okresni-masina/shared";

/** Deterministická náhoda se stejným rozhraním jako herní `Rng`. */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return {
    random: next,
    int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
    pick: <T,>(arr: T[]) => arr[Math.floor(next() * arr.length)],
    shuffle: <T,>(arr: T[]) => arr,
  };
}

const POZICE = ["DEF", "MID", "FWD"] as const;
const VELIKOSTI = ["hamlet", "village", "town", "small_city", "city"] as const;
const VEKY = [16, 18, 21, 25, 30, 36, 42];

/** Dovednost je použitelná, když existuje, je číslo a není nula. */
function jeVporadku(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

describe("hráči v poli ze všech kombinací", () => {
  it("mají každou dovednost, kterou jejich pozice potřebuje do hodnocení", () => {
    const chybejici: string[] = [];
    let vygenerovano = 0;

    for (const pozice of POZICE) {
      const potreba = Object.keys(ratingWeightsFor(pozice)).filter((k) => k !== "experience");
      for (const velikost of VELIKOSTI) {
        for (const vek of VEKY) {
          const d = generateFieldSkills(rng(vek * 31 + velikost.length) as never, pozice, velikost, vek) as unknown as Record<string, { current: number; maxPotential: number }>;
          vygenerovano++;
          for (const dovednost of potreba) {
            const zaznam = d[dovednost];
            if (!zaznam || !jeVporadku(zaznam.current)) {
              chybejici.push(`${pozice}/${velikost}/${vek}let: ${dovednost}`);
            }
          }
        }
      }
    }
    expect(vygenerovano).toBeGreaterThan(90);
    expect(chybejici.slice(0, 8), `${chybejici.length} chybějících dovedností`).toEqual([]);
  });

  it("strop nikdy neklesne pod současnou hodnotu", () => {
    const chybne: string[] = [];
    for (const pozice of POZICE) {
      for (const velikost of VELIKOSTI) {
        for (const vek of VEKY) {
          const d = generateFieldSkills(rng(vek * 17 + pozice.length) as never, pozice, velikost, vek) as unknown as Record<string, { current: number; maxPotential: number }>;
          for (const [nazev, h] of Object.entries(d)) {
            if (typeof h?.current === "number" && typeof h?.maxPotential === "number" && h.maxPotential < h.current) {
              chybne.push(`${pozice}/${velikost}/${vek}let ${nazev}: ${h.current} > strop ${h.maxPotential}`);
            }
          }
        }
      }
    }
    expect(chybne.slice(0, 8), `${chybne.length} dovedností nad vlastním stropem`).toEqual([]);
  });

  it("hodnocení vyjde v rozumném rozsahu, ne nula ani přes sto", () => {
    const mimo: string[] = [];
    for (const pozice of POZICE) {
      for (const velikost of VELIKOSTI) {
        for (const vek of VEKY) {
          const r = rng(vek * 13 + velikost.length);
          const d = generateFieldSkills(r as never, pozice, velikost, vek);
          const talent = generateHiddenTalent(r as never, velikost);
          const hodnoceni = calculateOverallRating(pozice, d, talent);
          if (!(hodnoceni > 0 && hodnoceni <= 100)) mimo.push(`${pozice}/${velikost}/${vek}let: ${hodnoceni}`);
        }
      }
    }
    expect(mimo.slice(0, 5), `${mimo.length} hráčů s nesmyslným hodnocením`).toEqual([]);
  });
});

describe("brankáři ze všech kombinací", () => {
  it("mají všechny dovednosti, které brankářské váhy potřebují", () => {
    // Výdrž a síla žijí u brankáře v `physical`, ne v jeho sadě dovedností — `overallRatingFromFlat`
    // je odtamtud čte. Sada je proto nemusí obsahovat.
    const potreba = Object.keys(ratingWeightsFor("GK"))
      .filter((k) => k !== "experience" && k !== "stamina" && k !== "strength");
    const chybejici: string[] = [];
    for (const velikost of VELIKOSTI) {
      for (const vek of VEKY) {
        const d = generateGKSkills(rng(vek * 7 + velikost.length) as never, velikost, vek) as unknown as Record<string, { current: number; maxPotential: number }>;
        for (const dovednost of potreba) {
          const z = d[dovednost];
          if (!z || !jeVporadku(z.current)) chybejici.push(`${velikost}/${vek}let: ${dovednost}`);
        }
      }
    }
    expect(chybejici.slice(0, 8), `${chybejici.length} chybějících`).toEqual([]);
  });

  it("chytání je jejich nejsilnější stránka, ne náhodné číslo", () => {
    let slabych = 0, celkem = 0;
    for (const velikost of VELIKOSTI) {
      for (const vek of [18, 25, 32]) {
        const d = generateGKSkills(rng(vek * 3 + velikost.length) as never, velikost, vek) as unknown as Record<string, { current: number }>;
        celkem++;
        if ((d.goalkeeping?.current ?? 0) < (d.shooting?.current ?? 0)) slabych++;
      }
    }
    expect(celkem).toBeGreaterThan(10);
    expect(slabych).toBe(0);
  });

  it("hodnocení brankáře je nenulové ve všech kombinacích", () => {
    const nuly: string[] = [];
    for (const velikost of VELIKOSTI) {
      for (const vek of VEKY) {
        const r = rng(vek * 11 + velikost.length);
        const d = generateGKSkills(r as never, velikost, vek);
        const h = calculateOverallRating("GK", d, generateHiddenTalent(r as never, velikost));
        if (!(h > 0)) nuly.push(`${velikost}/${vek}let`);
      }
    }
    expect(nuly.slice(0, 5), `${nuly.length} brankářů s nulovým hodnocením`).toEqual([]);
  });
});

describe("skrytý talent", () => {
  it("nikdy nevyjde záporný ani přes sto", () => {
    for (const velikost of VELIKOSTI) {
      for (let i = 0; i < 200; i++) {
        const t = generateHiddenTalent(rng(i * 37 + velikost.length) as never, velikost);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(100);
      }
    }
  });

  it("větší obec dává v průměru vyšší talent", () => {
    const prumer = (velikost: string) => {
      let s = 0;
      for (let i = 0; i < 400; i++) s += generateHiddenTalent(rng(i * 19 + velikost.length) as never, velikost);
      return s / 400;
    };
    expect(prumer("city")).toBeGreaterThan(prumer("hamlet"));
  });
});
