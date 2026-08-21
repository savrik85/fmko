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

  it("od devíti klubů se otevřou všechny čtyři", () => {
    expect(rolesFor(9)).toHaveLength(4);
    expect(rolesFor(14)).toContain("disciplinarni");
    expect(rolesFor(14)).toContain("rozhodcich");
  });
});
