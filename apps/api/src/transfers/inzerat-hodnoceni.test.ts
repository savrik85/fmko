import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRng } from "../generators/rng";
import { overallRatingFromFlat } from "../skills/generator";
import { stropyZDovednosti } from "../skills/stropy-z-dovednosti";
import { doplnZbyleDovednosti } from "./virtual-teams";

/**
 * Každý generátor hráčů musí hodnotit TÝMŽ vzorcem jako zbytek hry.
 *
 * Inzerát AI klubu si dřív počítal vlastní vážený průměr ze sedmi dovedností, zatímco hra
 * počítá z dvanácti atributů. Manažer koupil číslo, které mu první noční přepočet srazil —
 * naměřeno na produkci u 75 hráčů: inzerát v průměru o 3,35 bodu vyšší, u 54 z nich
 * nadhodnocený, nejvíc o 20. Cena z toho čísla vychází, takže se přeplácelo.
 *
 * Táž chyba pak zůstala v trhu s volnými hráči a v celebritách (2026-09-28). Trh počítal
 * brankáře jen z chytání, síly a výdrže: na produkci byl brankář v nabídce o 12 bodů vedle
 * a dva podepsaní brankáři o 18. Proto hlídka kontroluje VŠECHNY generátory, ne jeden.
 */

const ZDROJE = ["./virtual-teams.ts", "./free-agent-pool.ts", "../season/celebrity-spawn.ts"];

describe("hodnocení v inzerátu sedí s hodnocením ve hře", () => {
  it.each(ZDROJE)("generátor %s nemá vlastní tabulku vah", (soubor) => {
    const kod = readFileSync(fileURLToPath(new URL(soubor, import.meta.url)), "utf8");
    expect(kod, "posWeights = druhá pravda o tom, jak silný hráč je").not.toMatch(/posWeights\s*[:=]/);
    expect(kod, "hodnocení musí počítat sdílená funkce").toMatch(/overallRatingFromFlat\(/);
  });

  it("vlastní váhy trhu podceňovaly všechno kromě chytání", () => {
    // Stejný princip jako test níž: přepočítá PŮVODNÍ tabulku trhu a ukáže, o kolik
    // vedle byla. Brankář je nejhorší případ, protože se počítaly jen tři atributy.
    const STARE_VAHY_TRHU: Record<string, number> = { goalkeeping: 4, strength: 2, stamina: 1 };
    const rozdily: number[] = [];
    for (let seed = 0; seed < 60; seed++) {
      const rng = createRng(seed * 13 + 1);
      const vek = rng.int(19, 35);
      const skills: Record<string, number> = {
        speed: rng.int(20, 60), technique: rng.int(15, 50), shooting: rng.int(10, 40),
        passing: rng.int(20, 55), heading: rng.int(15, 50), defense: rng.int(30, 75),
        goalkeeping: rng.int(45, 95), stamina: rng.int(30, 80), strength: rng.int(30, 80),
        vision: rng.int(15, 50), creativity: rng.int(15, 55), setPieces: rng.int(10, 50),
        experience: Math.min(100, Math.max(1, (vek - 16) * rng.int(3, 6))),
      };
      const physical = { stamina: skills.stamina, strength: skills.strength };
      const caps = stropyZDovednosti(rng, skills, vek);
      let s = 0, t = 0;
      for (const [k, w] of Object.entries(STARE_VAHY_TRHU)) { s += skills[k] * w; t += w; }
      rozdily.push(Math.round(s / t) - (overallRatingFromFlat("GK", skills, physical, 0, caps) ?? 0));
    }
    const prumer = rozdily.reduce((a, b) => a + b, 0) / rozdily.length;
    expect(prumer, `starý vzorec trhu byl u brankářů v průměru o ${prumer.toFixed(2)} mimo`).toBeGreaterThan(5);
  });

  it("starý vzorec se od hry vážně rozcházel, proto ta hlídka výš", () => {
    // Tenhle test NEPOROVNÁVÁ opravený kód sám se sebou (to by nedokázalo nic).
    // Přepočítá PŮVODNÍ tabulku vah a ukáže, o kolik vedle byla — kdyby se do
    // generátoru někdy vrátila, hlídka o řádek výš to zachytí a tohle říká proč.
    const STARE_VAHY: Record<string, Record<string, number>> = {
      GK: { speed: 0.05, technique: 0.05, shooting: 0.02, passing: 0.08, heading: 0.05, defense: 0.15, goalkeeping: 0.60 },
      DEF: { speed: 0.12, technique: 0.10, shooting: 0.05, passing: 0.12, heading: 0.18, defense: 0.35, goalkeeping: 0.08 },
      MID: { speed: 0.12, technique: 0.20, shooting: 0.12, passing: 0.25, heading: 0.08, defense: 0.15, goalkeeping: 0.08 },
      FWD: { speed: 0.18, technique: 0.18, shooting: 0.28, passing: 0.12, heading: 0.15, defense: 0.05, goalkeeping: 0.04 },
    };
    const SEDM = ["speed", "technique", "shooting", "passing", "heading", "defense", "goalkeeping"];

    const rozdily: number[] = [];
    for (const pozice of ["GK", "DEF", "MID", "FWD"]) {
      for (let seed = 0; seed < 60; seed++) {
        const rng = createRng(seed * 7 + pozice.length);
        const zaklad = 25 + rng.int(0, 55);
        const vek = rng.int(19, 35);
        const skills: Record<string, number> = {};
        for (const k of SEDM) skills[k] = Math.max(1, Math.min(95, zaklad + rng.int(-10, 10)));
        // Poziční bonusy jako ve `vytvorInzerat` — bez nich vzorek neodpovídá tomu,
        // co generátor doopravdy vyrábí, a rozdíl by vyšel menší, než na produkci byl.
        if (pozice === "GK") { skills.goalkeeping += 20; skills.shooting -= 15; }
        if (pozice === "DEF") { skills.defense += 10; skills.heading += 8; }
        if (pozice === "MID") { skills.passing += 10; skills.technique += 8; }
        if (pozice === "FWD") { skills.shooting += 12; skills.speed += 8; }
        for (const k of SEDM) skills[k] = Math.max(1, Math.min(95, skills[k]));

        doplnZbyleDovednosti(skills, {
          stamina: rng.int(20, 80), strength: rng.int(20, 80), age: vek,
          sum: (a: number, b: number) => rng.int(a, b),
        });

        const physical = { stamina: skills.stamina, strength: skills.strength };
        const caps = stropyZDovednosti(rng, skills, vek);
        const w = STARE_VAHY[pozice];
        const stare = Math.round(SEDM.reduce((s, k) => s + skills[k] * (w[k] ?? 0.14), 0));
        const dnesni = overallRatingFromFlat(pozice, skills, physical, 0, caps) ?? 0;
        rozdily.push(stare - dnesni);
      }
    }

    const prumer = rozdily.reduce((a, b) => a + b, 0) / rozdily.length;
    const nadhodnocenych = rozdily.filter((x) => x > 0).length;
    // Kdyby rozdíl byl nulový, celá oprava by neměla smysl a tenhle test by na to
    // upozornil — na produkci byl průměr +3,35 a nadhodnocených 54 ze 75.
    expect(prumer, `starý vzorec byl v průměru o ${prumer.toFixed(2)} mimo`).toBeGreaterThan(1);
    expect(nadhodnocenych / rozdily.length, "většina hráčů byla nadhodnocená").toBeGreaterThan(0.5);
  });
});
