/**
 * Domácí pomezní s praporkem (F15): volba, výměna sudím a posun pro engine.
 */
import { describe, expect, it } from "vitest";
import {
  LINESMAN_TILT, linesmanColumn, parseLinesman, refereeSwapChance, resolveLinesmanTilt,
} from "./linesman";

describe("volba pomezního", () => {
  it("přečte platnou volbu z textu i z objektu", () => {
    const choice = { kind: "player", id: "p-7", style: "homer" } as const;
    expect(parseLinesman(JSON.stringify(choice))).toEqual(choice);
    expect(parseLinesman(choice)).toEqual(choice);
    expect(parseLinesman({ kind: "fan_leader", id: "fl-1", style: "fair" })).toEqual({ kind: "fan_leader", id: "fl-1", style: "fair" });
  });

  it("neplatnou nebo prázdnou volbu bere jako žádného pomezního", () => {
    for (const raw of [null, undefined, "", "nesmysl", "{}", 42, [],
      { kind: "referee", id: "x", style: "fair" },
      { kind: "player", id: "", style: "fair" },
      { kind: "player", id: "p-1", style: "dirty" },
      { kind: "player", id: 5, style: "fair" }]) {
      expect(parseLinesman(raw)).toBeNull();
    }
  });

  it("do sloupce uloží jen kind, id a style", () => {
    const stored = linesmanColumn({ kind: "player", id: "p-1", style: "fair", extra: "x" } as never);
    expect(JSON.parse(stored!)).toEqual({ kind: "player", id: "p-1", style: "fair" });
    expect(linesmanColumn(null)).toBeNull();
  });
});

describe("výměna nadržujícího pomezního sudím", () => {
  it("přísnější sudí vymění nadržujícího pomezního častěji", () => {
    expect(refereeSwapChance(90)).toBeGreaterThan(refereeSwapChance(50));
    expect(refereeSwapChance(50)).toBeGreaterThan(refereeSwapChance(20));
    expect(refereeSwapChance(0)).toBeGreaterThan(0);
    expect(refereeSwapChance(100)).toBeLessThan(1);
  });

  it("rozhodnutí o výměně je pro stejný zápas pokaždé stejné", () => {
    const choice = { kind: "fan_leader", id: "fl-1", style: "homer" } as const;
    for (let i = 0; i < 50; i++) {
      expect(resolveLinesmanTilt(choice, `match-${i}`, 60)).toEqual(resolveLinesmanTilt(choice, `match-${i}`, 60));
    }
  });

  it("výměna vynuluje posun, bez výměny platí posun nadržujícího pomezního", () => {
    const choice = { kind: "player", id: "p-1", style: "homer" } as const;
    let swapped = 0;
    let kept = 0;
    for (let i = 0; i < 400; i++) {
      const r = resolveLinesmanTilt(choice, `match-${i}`, 70);
      if (r.swapped) { swapped++; expect(r.tilt).toBe(0); }
      else { kept++; expect(r.tilt).toBe(LINESMAN_TILT.homer); }
    }
    expect(swapped).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  it("podíl výměn odpovídá přísnosti sudího", () => {
    const choice = { kind: "player", id: "p-1", style: "homer" } as const;
    const share = (strictness: number) => {
      let n = 0;
      for (let i = 0; i < 4000; i++) if (resolveLinesmanTilt(choice, `m-${i}`, strictness).swapped) n++;
      return n / 4000;
    };
    expect(Math.abs(share(85) - refereeSwapChance(85))).toBeLessThan(0.03);
    expect(Math.abs(share(30) - refereeSwapChance(30))).toBeLessThan(0.03);
  });

  it("poctivého pomezního sudí nemění a zápas neovlivní, bez pomezního taky nic", () => {
    for (let i = 0; i < 100; i++) {
      expect(resolveLinesmanTilt({ kind: "player", id: "p-1", style: "fair" }, `m-${i}`, 95)).toEqual({ tilt: 0, swapped: false });
      expect(resolveLinesmanTilt(null, `m-${i}`, 95)).toEqual({ tilt: 0, swapped: false });
    }
  });
});
