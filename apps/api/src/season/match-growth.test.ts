/**
 * Rozvoj z odehraných minut.
 *
 * Nejdůležitější je poměr: mladík na celý zápas se musí posunout znatelně víc než
 * třicátník, a nesmí přerůst svůj vygenerovaný strop. Kdyby minuty strop ignorovaly
 * (jak to dřív dělaly s paušální osmdesátkou), potenciál by přestal cokoliv znamenat.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { matchGrowthChance, tryMatchGrowth, parseSkillCaps } from "./match-growth";

describe("matchGrowthChance", () => {
  it("mladík na celý zápas se posouvá výrazně víc než třicátník", () => {
    const mladik = matchGrowthChance({ age: 18, position: "MID", minutes: 90 });
    const veteran = matchGrowthChance({ age: 31, position: "MID", minutes: 90 });
    expect(mladik).toBeGreaterThan(veteran * 5);
  });

  it("odehrané minuty škálují lineárně", () => {
    const cely = matchGrowthChance({ age: 18, position: "MID", minutes: 90 });
    const pulka = matchGrowthChance({ age: 18, position: "MID", minutes: 45 });
    expect(pulka).toBeCloseTo(cely / 2, 5);
  });

  it("talent i trenér mládeže růst zrychlují", () => {
    const zaklad = matchGrowthChance({ age: 18, position: "MID", minutes: 90 });
    const talent = matchGrowthChance({ age: 18, position: "MID", minutes: 90, hiddenTalent: 80 });
    const sTrenerem = matchGrowthChance({ age: 18, position: "MID", minutes: 90, youthMod: 0.3 });
    expect(talent).toBeGreaterThan(zaklad);
    expect(sTrenerem).toBeGreaterThan(zaklad);
  });

  it("trenér mládeže na hráče nad 22 let nepůsobí", () => {
    const bez = matchGrowthChance({ age: 25, position: "MID", minutes: 90 });
    const s = matchGrowthChance({ age: 25, position: "MID", minutes: 90, youthMod: 0.3 });
    expect(s).toBeCloseTo(bez, 5);
  });

  it("přátelák dává poloviční posun oproti ostrému zápasu", () => {
    const liga = matchGrowthChance({ age: 18, position: "MID", minutes: 90 });
    const pratelak = matchGrowthChance({ age: 18, position: "MID", minutes: 90, nasobitel: 0.5 });
    expect(pratelak).toBeCloseTo(liga / 2, 5);
  });
});

describe("tryMatchGrowth", () => {
  it("hráč na svém stropu se z minut dál nezlepší", () => {
    const rng = createRng(42);
    const skills = { passing: 60, vision: 60, technique: 60 };
    const caps = { passing: 60, vision: 60, technique: 60 };
    for (let i = 0; i < 200; i++) {
      const r = tryMatchGrowth(rng, skills, {
        age: 18, position: "MID", minutes: 90, hiddenTalent: 90, skillCaps: caps,
      });
      expect(r).toBeNull();
    }
  });

  it("pod stropem se hráč zlepšuje a vždy jen o bod", () => {
    const rng = createRng(7);
    const skills = { passing: 30, vision: 30, technique: 30 };
    const caps = { passing: 60, vision: 60, technique: 60 };
    let zlepseni = 0;
    for (let i = 0; i < 300; i++) {
      const r = tryMatchGrowth(rng, skills, {
        age: 18, position: "MID", minutes: 90, skillCaps: caps,
      });
      if (r) {
        expect(r.newValue - r.oldValue).toBe(1);
        expect(["passing", "vision", "technique"]).toContain(r.attribute);
        zlepseni++;
      }
    }
    expect(zlepseni).toBeGreaterThan(0);
  });

  it("bez známého stropu platí záložních 85", () => {
    const rng = createRng(11);
    const skills = { passing: 85, vision: 85, technique: 85 };
    for (let i = 0; i < 200; i++) {
      expect(tryMatchGrowth(rng, skills, { age: 18, position: "MID", minutes: 90 })).toBeNull();
    }
  });

  it("brankáři roste jen brankářská dovednost", () => {
    const rng = createRng(3);
    const skills = { goalkeeping: 20, passing: 20 };
    let videno = 0;
    for (let i = 0; i < 300; i++) {
      const r = tryMatchGrowth(rng, skills, { age: 18, position: "GK", minutes: 90 });
      if (r) {
        expect(r.attribute).toBe("goalkeeping");
        videno++;
      }
    }
    expect(videno).toBeGreaterThan(0);
  });
});

describe("parseSkillCaps", () => {
  it("vytáhne maxPotential a přeskočí nekompletní záznamy", () => {
    const caps = parseSkillCaps(JSON.stringify({
      passing: { current: 30, maxPotential: 55 },
      vision: { current: 20 },
    }));
    expect(caps).toEqual({ passing: 55 });
  });

  it("chybějící nebo rozbitý sloupec vrátí undefined", () => {
    expect(parseSkillCaps(null)).toBeUndefined();
    expect(parseSkillCaps("{tohle není JSON")).toBeUndefined();
  });
});
