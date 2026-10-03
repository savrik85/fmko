/**
 * Kluk, kterého trenér dorostu nabízí do áčka.
 *
 * 2026-10-03 dostalo 24 klubů na produkci nabídku kluka s hodnocením 11–20, zatímco jejich
 * vlastní dorost měl průměr 22–40 — nabídka se losovala natvrdo 3–30 mimo generátor dorostu.
 * Po první opravě zase šestnáctiletý vycházel stejně silný jako dvacetiletý (16 let, 51 při
 * kádru 51) a posun zvedal i strop, takže 37 % kluků ze SMS mělo strop hvězdy (75+),
 * víc než odchovanci z velkorysé akademie (10 %).
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { youthOfferShift } from "./player-offers";
import { generatePlayerSkills, overallRatingFromFlat } from "../skills/generator";
import { YOUTH_BONUS } from "../season/youth";

const POZICE = ["GK", "DEF", "MID", "FWD"] as const;

function nabidka(rng: ReturnType<typeof createRng>, i: number, age: number, prumerAcka: number) {
  const pos = POZICE[i % 4];
  const shift = youthOfferShift("village", pos, prumerAcka, rng);
  return { pos, ...generatePlayerSkills(rng, { position: pos, age, level: "village", shift, keepLevelCaps: true }) };
}

function stropHodnoceni(pos: string, skillsMax: Record<string, { maxPotential: number }>) {
  const c: Record<string, number> = {};
  for (const [k, v] of Object.entries(skillsMax)) c[k] = v.maxPotential;
  return overallRatingFromFlat(pos, c, { stamina: c.stamina, strength: c.strength }, 0) ?? 0;
}

describe("nabídka kluka z dorostu", () => {
  it("dvacetiletý by vyšel 4–12 bodů pod průměrem áčka", () => {
    const rng = createRng(42);
    let s = 0;
    for (let i = 0; i < 800; i++) s += nabidka(rng, i, 20, 50).rating;
    expect(s / 800).toBeGreaterThanOrEqual(38);
    expect(s / 800).toBeLessThanOrEqual(46);
  });

  it("mladší kluk je slabší než starší", () => {
    const rng = createRng(5);
    let mladsi = 0;
    let starsi = 0;
    for (let i = 0; i < 800; i++) {
      mladsi += nabidka(rng, i, 16, 50).rating;
      starsi += nabidka(rng, i, 19, 50).rating;
    }
    expect(mladsi / 800).toBeLessThan(starsi / 800 - 3);
  });

  it("strop hvězdy má méně kluků než odchovanců z velkorysé akademie", () => {
    const rng = createRng(9);
    let zNabidky = 0;
    let zAkademie = 0;
    for (let i = 0; i < 2000; i++) {
      const n = nabidka(rng, i, 16 + (i % 4), 49);
      if (stropHodnoceni(n.pos, n.skillsMax) >= 75) zNabidky++;
      const pos = POZICE[i % 4];
      const a = generatePlayerSkills(rng, { position: pos, age: 16 + (i % 3), level: "village", academy: YOUTH_BONUS.high });
      if (stropHodnoceni(pos, a.skillsMax) >= 75) zAkademie++;
    }
    expect(zNabidky).toBeLessThan(zAkademie);
  });

  it("strop nikdy pod dnešní hodnotou", () => {
    const rng = createRng(13);
    for (let i = 0; i < 400; i++) {
      const n = nabidka(rng, i, 16 + (i % 4), 55);
      for (const [k, v] of Object.entries(n.skillsMax)) {
        if (k !== "experience") expect(v.maxPotential).toBeGreaterThanOrEqual(n.skills[k]);
      }
    }
  });

  it("ve slabém kádru nespadne pod běžného dorostence z obce", () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) expect(youthOfferShift("village", POZICE[i % 4], 10, rng)).toBe(0);
    expect(youthOfferShift("village", "MID", null, rng)).toBe(0);
  });
});
