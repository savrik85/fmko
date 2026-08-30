import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRng } from "../generators/rng";
import { stropyZDovednosti, talentPodleVeku, prostorPodleVeku } from "./stropy-z-dovednosti";
import { teoretickyStropHrace } from "./vyhled-hrace";

const SRC = fileURLToPath(new URL("../", import.meta.url));

describe("stropy dopočítané z dovedností", () => {
  it("strop nikdy neklesne pod dnešní hodnotu", () => {
    const rng = createRng(1);
    for (const vek of [18, 22, 27, 31, 36]) {
      const s = stropyZDovednosti(rng, { speed: 60, defense: 45, passing: 88 }, vek);
      for (const [nazev, v] of Object.entries(s)) {
        expect(v.maxPotential, `${nazev} v ${vek} letech`).toBeGreaterThanOrEqual(v.current);
        expect(v.maxPotential).toBeLessThanOrEqual(100);
      }
    }
  });

  it("mladík dostane víc prostoru než veterán", () => {
    expect(prostorPodleVeku(19).max).toBeGreaterThan(prostorPodleVeku(35).max);
    expect(prostorPodleVeku(19).min).toBeGreaterThan(prostorPodleVeku(35).min);
  });

  it("talent klesá s věkem — kdo ho měl, ten už ho proměnil", () => {
    const vzorek = (vek: number) => {
      let soucet = 0;
      for (let i = 0; i < 400; i++) soucet += talentPodleVeku(createRng(i), vek);
      return soucet / 400;
    };
    expect(vzorek(20)).toBeGreaterThan(vzorek(27));
    expect(vzorek(27)).toBeGreaterThan(vzorek(33));
  });

  it("hráč se stropy má spočítatelný potenciál, s prázdnými ne", () => {
    // Kvůli tomuhle to celé je: bez stropů vrací výhled null a karta Potenciálu
    // zůstane prázdná.
    const rng = createRng(7);
    const dovednosti = { speed: 55, technique: 50, shooting: 48, passing: 52,
                         heading: 50, defense: 60, goalkeeping: 10 };
    const sm = stropyZDovednosti(rng, dovednosti, 24);
    expect(teoretickyStropHrace("DEF", sm, 30)).not.toBeNull();
    expect(teoretickyStropHrace("DEF", {}, 30), "prázdné stropy = žádný potenciál").toBeNull();
  });
});

describe("žádná cesta nezakládá hráče bez potenciálu", () => {
  /** Všechny `INSERT INTO players` ve zdrojácích. */
  function najdiZapisy(slozka: string, podcesta = ""): Array<{ soubor: string; radek: number; sql: string }> {
    const nalezy: Array<{ soubor: string; radek: number; sql: string }> = [];
    for (const p of readdirSync(join(slozka, podcesta), { withFileTypes: true })) {
      const cesta = podcesta ? `${podcesta}/${p.name}` : p.name;
      if (p.isDirectory()) { nalezy.push(...najdiZapisy(slozka, cesta)); continue; }
      if (!p.name.endsWith(".ts") || p.name.endsWith(".test.ts")) continue;
      const radky = readFileSync(join(slozka, cesta), "utf8").split("\n");
      radky.forEach((r, i) => {
        if (!/INSERT (OR \w+ )?INTO players\s*\(/.test(r)) return;
        // Seznam sloupců může přetéct na další řádky — posbírat až po `)`
        let sql = r;
        for (let j = i + 1; j < radky.length && !sql.includes(")"); j++) sql += radky[j];
        nalezy.push({ soubor: cesta, radek: i + 1, sql });
      });
    }
    return nalezy;
  }

  it("každý INSERT INTO players vyplňuje skills_max i hidden_talent", () => {
    const zapisy = najdiZapisy(SRC);
    expect(zapisy.length, "žádný INSERT nenalezen — špatná cesta?").toBeGreaterThan(3);

    const chybne = zapisy
      .filter((z) => !(z.sql.includes("skills_max") && z.sql.includes("hidden_talent")))
      .map((z) => `${z.soubor}:${z.radek}`);

    expect(
      chybne,
      `${chybne.length} zápisů zakládá hráče bez potenciálu — sloupce mají DEFAULT, takže to nic nevyhodí`,
    ).toEqual([]);
  });
});
