import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { TEXTY, text, vypln } from "./texty";

describe("texty incidentů", () => {
  it("žádná šablona nemá dlouhou pomlčku a každá končí tečkou", () => {
    for (const [klic, sablony] of Object.entries(TEXTY)) {
      expect(sablony.length, klic).toBeGreaterThan(0);
      for (const s of sablony) {
        expect(s, klic).not.toContain("—");
        expect(s.trim(), klic).toMatch(/[.!]$/);
      }
    }
  });

  it("doplní hodnoty a neznámou značku nechá být", () => {
    expect(vypln("Pryč je: {vec}.", { vec: "Dresy" })).toBe("Pryč je: Dresy.");
    expect(vypln("{x}.", {})).toBe("{x}.");
  });

  it("výběr šablony je deterministický", () => {
    expect(text(createRng(7), "svetlice")).toBe(text(createRng(7), "svetlice"));
  });
});
