/**
 * Přání majitele podle povahy a oboru, zájem o slib (čisté funkce).
 */
import { describe, expect, it } from "vitest";
import { kindAllowedForCategory, ownerWishes, PERSONALITY_WISHES, promiseInterest } from "./wishes";

const base = { sponsorId: 11, teamId: "t1", season: 3, category: "main" as const };

describe("ownerWishes", () => {
  it("fanoušek z oboru bez přání navíc: 2 přání z výsledků", () => {
    const w = ownerWishes({ ...base, personality: "fan", sponsorType: "shop" });
    expect(w).toHaveLength(2);
    for (const k of w) expect(PERSONALITY_WISHES.fan).toContain(k);
  });

  it("deterministické: stejné vstupy, stejná přání", () => {
    const a = ownerWishes({ ...base, personality: "patriot", sponsorType: "farm" });
    const b = ownerWishes({ ...base, personality: "patriot", sponsorType: "farm" });
    expect(a).toEqual(b);
  });

  it("pivovar přidá návštěvu jako třetí přání", () => {
    const w = ownerWishes({ ...base, personality: "patriot", sponsorType: "brewery" });
    expect(w).toContain("attendance");
    expect(w).toHaveLength(3);
  });

  it("stavebnina chce modernizaci stadionu", () => {
    expect(ownerWishes({ ...base, personality: "cautious", sponsorType: "construction" })).toContain("stadium_upgrade");
  });

  it("IT chce výsledky, bez duplicit", () => {
    const w = ownerWishes({ ...base, personality: "fan", sponsorType: "it" });
    expect(w).toContain("league_position");
    expect(new Set(w).size).toBe(w.length);
    expect(w.length).toBeLessThanOrEqual(3);
  });

  it("logo na rukávu jen u sponzora stadionu", () => {
    for (let id = 1; id <= 30; id++) {
      const w = ownerWishes({ ...base, sponsorId: id, personality: "businessman", sponsorType: "company" });
      expect(w).not.toContain("jersey_logo");
    }
    expect(kindAllowedForCategory("jersey_logo", "stadium")).toBe(true);
    expect(kindAllowedForCategory("jersey_logo", "main")).toBe(false);
  });

  it("logo na rukávu, když ho rukáv už nese: businessman ho mezi přání nedá", () => {
    let sawJerseyLogo = false;
    for (let id = 1; id <= 30; id++) {
      const w = ownerWishes({
        ...base, sponsorId: id, personality: "businessman", sponsorType: "company", category: "stadium",
        sleeveHeldBySponsor: true,
      });
      if (w.includes("jersey_logo")) sawJerseyLogo = true;
    }
    expect(sawJerseyLogo).toBe(false);
    // Volný rukáv: logo mezi přáními businessmana u sponzora stadionu občas je.
    const withoutSleeve = Array.from({ length: 30 }, (_, i) => ownerWishes({
      ...base, sponsorId: i + 1, personality: "businessman", sponsorType: "company", category: "stadium",
    }));
    expect(withoutSleeve.some((w) => w.includes("jersey_logo"))).toBe(true);
  });
});

describe("ownerWishes bez postupů", () => {
  it("postup ani nesestup majitel nikdy nechce (postupy se teď nehrají)", () => {
    for (let id = 1; id <= 60; id++) {
      for (const personality of ["fan", "cautious", "patriot", "businessman"] as const) {
        for (const sponsorType of ["it", "shop", "construction", "pub"]) {
          for (const category of ["main", "stadium"] as const) {
            const w = ownerWishes({ ...base, sponsorId: id, personality, sponsorType, category });
            expect(w).not.toContain("promotion");
            expect(w).not.toContain("no_relegation");
          }
        }
      }
    }
  });
});

describe("promiseInterest", () => {
  it("přání = 1,5", () => {
    expect(promiseInterest("youth", "patriot", ["youth", "no_riots"])).toBe(1.5);
  });
  it("opatrnému jsou výsledky nad nesestup jedno", () => {
    expect(promiseInterest("league_position", "cautious", [])).toBe(0.5);
    expect(promiseInterest("cup_round", "cautious", [])).toBe(0.5);
    expect(promiseInterest("no_relegation", "cautious", [])).toBe(1);
  });
  it("obchodníkovi jsou mladí hráči jedno", () => {
    expect(promiseInterest("youth", "businessman", [])).toBe(0.5);
  });
  it("ostatní = 1", () => {
    expect(promiseInterest("reputation", "fan", ["league_position"])).toBe(1);
  });
});
