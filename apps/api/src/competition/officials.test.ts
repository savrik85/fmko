/**
 * Odbory podle velikosti soutěže.
 */

import { describe, it, expect } from "vitest";
import { rolesFor } from "./officials";

describe("odbory podle velikosti soutěže", () => {
  it("malá soutěž má jen prezidenta a generálního sekretáře", () => {
    expect(rolesFor(5)).toEqual(["predseda", "hospodarska"]);
    expect(rolesFor(8)).toEqual(["predseda", "hospodarska"]);
  });

  it("od devíti klubů se otevřou všechny funkce", () => {
    expect(rolesFor(9)).toHaveLength(5);
    expect(rolesFor(14)).toContain("disciplinarni");
    expect(rolesFor(14)).toContain("rozhodcich");
    expect(rolesFor(14)).toContain("integrita");
  });

  it("komisař pro integritu se v malé soutěži neobjeví", () => {
    // Na osm klubů nemá smysl pátý bafuňář — sázky i přestupy tam řeší
    // prezident, který zastupuje každou neobsazenou funkci.
    expect(rolesFor(8)).not.toContain("integrita");
  });
});
