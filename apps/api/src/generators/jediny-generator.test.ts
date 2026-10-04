/**
 * Hráč smí vzniknout JEN přes společný generátor (createPlayer → generatePlayerSkills).
 *
 * Do 2026-10-03 vznikali hráči na deseti místech a každé si dovednosti skládalo po svém:
 * vlastní losování 3–30 v nabídce z dorostu, vlastní vzorec v `generatePlayer`, vlastní
 * stropy, šest různých pravidel pro talent. Výsledek: kluk z dorostu s hodnocením 12,
 * zatímco dorost klubu měl průměr 30. Tenhle test hlídá, aby se další místo neodtrhlo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRng } from "./rng";
import { createPlayer, aiTeamShift, MARKET_SHIFT } from "./create-player";
import { generatePlayerSkills, flattenGeneratedSkills, generateFieldSkills } from "../skills/generator";
import type { VillageInfo } from "./player";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function zdrojaky(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return zdrojaky(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const VSECHNY = zdrojaky(SRC).map((path) => ({ path: relative(SRC, path), kod: readFileSync(path, "utf8") }));

describe("jediný generátor hráčů", () => {
  it("dovednosti generuje jen skills/generator.ts", () => {
    const mimo = VSECHNY
      .filter((f) => f.path !== "skills/generator.ts")
      .filter((f) => /\bgenerate(?:Field|GK)Skills\(/.test(f.kod))
      .map((f) => f.path);
    expect(mimo, "volat generatePlayerSkills / createPlayer, ne generátor dovedností napřímo").toEqual([]);
  });

  it("každé místo, kde vzniká hráč, jde přes createPlayer nebo generatePlayerSkills", () => {
    // Tabulky s novými hráči. `remove-player.ts` vrací do volných hráčů existujícího hráče
    // (nic negeneruje), podpisy a přestupy kopírují už vygenerovaného. `virtual-purchase.ts`
    // zapisuje hráče z inzerátu nebo hlášení skauta, který vznikl přes createPlayer dřív.
    const VYJIMKY = new Set(["transfers/remove-player.ts", "routes/game.ts", "transfers/virtual-purchase.ts"]);
    const vznikHrace = /INSERT INTO (?:players|free_agents|player_offers|cup_club_players)\b/;
    const bezGeneratoru = VSECHNY
      .filter((f) => vznikHrace.test(f.kod) && !VYJIMKY.has(f.path))
      .filter((f) => !/createPlayer\(|generatePlayerSkills\(|generate(?:CelebrityLegend|FallenStar|GlassMan)\(/.test(f.kod))
      .map((f) => f.path);
    expect(bezGeneratoru).toEqual([]);
  });

  it("generatePlayer už nevrací dovednosti", () => {
    const kod = VSECHNY.find((f) => f.path === "generators/player.ts")!.kod;
    expect(kod).not.toMatch(/function generateAttributes|QUALITY_BY_CATEGORY/);
  });

  it("hráč má kompletní sadu dovedností a strop nikdy pod dnešní hodnotou", () => {
    const rng = createRng(3);
    const village: VillageInfo = { region_code: "PT", category: "obec", population: 500, district: "PT" };
    const names = { surnameData: { surnames: { Novák: 1 }, female_forms: {} }, firstnameData: { male: { "1990s": { Jan: 1 }, "1980s": { Jan: 1 } }, female: {} } };
    for (let i = 0; i < 200; i++) {
      const position = (["GK", "DEF", "MID", "FWD"] as const)[i % 4];
      const p = createPlayer(rng, { position, village, names, shift: i % 2 ? MARKET_SHIFT : aiTeamShift(rng) });
      for (const klic of ["speed", "technique", "shooting", "passing", "heading", "defense", "stamina", "strength", "vision", "creativity", "setPieces", "experience"]) {
        expect(p.skills[klic], `${position}.${klic}`).toBeGreaterThanOrEqual(klic === "experience" ? 0 : 1);
        if (klic !== "experience") expect(p.skillsMax[klic]?.maxPotential, `${position}.${klic} strop`).toBeGreaterThanOrEqual(p.skills[klic]);
      }
      expect(p.physical.stamina).toBe(p.skills.stamina);
      expect(p.physical.strength).toBe(p.skills.strength);
      expect(p.rating).toBeGreaterThanOrEqual(1);
    }
  });

  it("věk se zná před identitou: avatar i povolání sedí na zadaný věk", () => {
    const rng = createRng(11);
    const village: VillageInfo = { region_code: "PT", category: "obec", population: 500, district: "PT" };
    const names = { surnameData: { surnames: { Novák: 1 }, female_forms: {} }, firstnameData: { male: { "2000s": { Jan: 1 }, "1980s": { Jan: 1 } }, female: {} } };
    for (let i = 0; i < 50; i++) {
      expect(createPlayer(rng, { position: "MID", village, names, age: 17 }).age).toBe(17);
    }
  });

  it("posun úrovně posouvá hodnocení: AI slabší, trh silnější než obec", () => {
    const rng = createRng(5);
    const prumer = (shift: number) => {
      let s = 0;
      for (let i = 0; i < 600; i++) s += generatePlayerSkills(rng, { position: "MID", age: 26, level: "village", shift }).rating;
      return s / 600;
    };
    const obec = prumer(0);
    expect(prumer(-9)).toBeLessThan(obec - 5);
    expect(prumer(MARKET_SHIFT)).toBeGreaterThan(obec + 10);
  });

  it("targetRating trefí průměrné hodnocení v daném věku", () => {
    const rng = createRng(9);
    for (const [age, cil] of [[18, 30], [26, 45], [31, 55]] as const) {
      let s = 0;
      for (let i = 0; i < 600; i++) s += generatePlayerSkills(rng, { position: (["DEF", "MID", "FWD"] as const)[i % 3], age, level: "village", targetRating: cil }).rating;
      expect(Math.abs(s / 600 - cil), `věk ${age}, cíl ${cil}`).toBeLessThan(3);
    }
  });

  it("bez posunu dává stejné dovednosti jako generátor dorostu (flatten)", () => {
    const a = generatePlayerSkills(createRng(1), { position: "DEF", age: 19, level: "village" });
    const b = flattenGeneratedSkills(generateFieldSkills(createRng(1), "DEF", "village", 19), false);
    expect(a.skills.speed).toBe(b.speed);
    expect(a.skills.defense).toBe(b.defense);
  });
});
