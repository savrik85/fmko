import { describe, expect, it } from "vitest";
import { FORMATIONS, TACTICS, generateAiProfile, parseAiProfile } from "./profile";
import { resolveCoachMode, normalizeCoachModeSetting } from "./mode";

describe("povaha AI trenéra", () => {
  it("stejné id týmu dá stejnou povahu", () => {
    const a = generateAiProfile("team-abc", { tactics: 40, youth_development: 50, discipline: 30, motivation: 60 });
    const b = generateAiProfile("team-abc", { tactics: 40, youth_development: 50, discipline: 30, motivation: 60 });
    expect(a).toEqual(b);
  });

  it("hodnoty jsou 0–100 a formace i taktika jsou platné", () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAiProfile(`team-${i}`, null);
      for (const k of ["ambition", "thrift", "youthFocus", "risk", "trading", "building", "patience"] as const) {
        expect(p[k]).toBeGreaterThanOrEqual(0);
        expect(p[k]).toBeLessThanOrEqual(100);
      }
      expect(TACTICS).toContain(p.favouriteTactic);
      expect(p.favouriteFormations.length).toBeGreaterThanOrEqual(1);
      expect(p.favouriteFormations.length).toBeLessThanOrEqual(2);
      expect(new Set(p.favouriteFormations).size).toBe(p.favouriteFormations.length);
      for (const f of p.favouriteFormations) expect(FORMATIONS).toContain(f);
    }
  });

  it("trenér s dobrou prací s mládeží sází na mladé víc", () => {
    const avg = (youth: number) => {
      let sum = 0;
      for (let i = 0; i < 50; i++) sum += generateAiProfile(`team-${i}`, { youth_development: youth }).youthFocus;
      return sum / 50;
    };
    expect(avg(70)).toBeGreaterThanOrEqual(50);
    expect(avg(70)).toBeGreaterThan(avg(20));
  });

  it("uložená povaha se načte zpět, rozbitá ne", () => {
    const p = generateAiProfile("team-x", null);
    expect(parseAiProfile(JSON.stringify(p))).toEqual(p);
    expect(parseAiProfile("{\"version\":1}")).toBeNull();
    expect(parseAiProfile("není json")).toBeNull();
    expect(parseAiProfile(null)).toBeNull();
  });
});

describe("přepínač AI trenérů", () => {
  it("bez klíče platí on, jeden řetězec platí pro všechny oblasti", () => {
    expect(resolveCoachMode(null, "match")).toBe("on");
    expect(resolveCoachMode("shadow", "weekly")).toBe("shadow");
  });

  it("JSON nastaví oblasti zvlášť, chybějící oblast je on", () => {
    const raw = JSON.stringify({ match: "off", market: "shadow" });
    expect(resolveCoachMode(raw, "match")).toBe("off");
    expect(resolveCoachMode(raw, "market")).toBe("shadow");
    expect(resolveCoachMode(raw, "weekly")).toBe("on");
  });

  it("neplatné nastavení se odmítne", () => {
    expect(normalizeCoachModeSetting("maybe")).toBeNull();
    expect(normalizeCoachModeSetting({ match: "maybe" })).toBeNull();
    expect(normalizeCoachModeSetting({ match: "off" })).toEqual({ match: "off" });
  });
});
