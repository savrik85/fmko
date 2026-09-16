import { describe, expect, it } from "vitest";
import { jeOpravitelne, ROZBITNE, ROZBITNE_ZEVNITR } from "./stadium-damage";

describe("co jde rozbít a opravit", () => {
  it("hráči se dostanou i do kabin, fanoušci ne", () => {
    expect(ROZBITNE_ZEVNITR).toContain("changing_rooms");
    expect(ROZBITNE).not.toContain("changing_rooms");
  });

  it("opravit jde všechno, co jde rozbít, a nic jiného", () => {
    for (const k of [...ROZBITNE, ...ROZBITNE_ZEVNITR]) expect(jeOpravitelne(k)).toBe(true);
    expect(jeOpravitelne("lighting")).toBe(false);
    expect(jeOpravitelne("security")).toBe(false);
  });
});
