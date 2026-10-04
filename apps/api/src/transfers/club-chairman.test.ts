/** Předseda cizího klubu: stejný klub má pořád stejného předsedu i obličej. */
import { describe, it, expect } from "vitest";
import { clubChairman } from "./club-chairman";

describe("předseda cizího klubu", () => {
  it("je pro stejný klub pořád stejný", () => {
    expect(clubChairman("TJ Sokol Husinec")).toEqual(clubChairman("TJ Sokol Husinec"));
  });

  it("jiný klub má jiného předsedu", () => {
    expect(clubChairman("TJ Sokol Husinec")).not.toEqual(clubChairman("SK Strakonice 1908"));
  });

  it("má jméno, věk a obličej", () => {
    const c = clubChairman("FK Modřany");
    expect(c.name).toMatch(/^\S+ \S+$/);
    expect(c.age).toBeGreaterThanOrEqual(48);
    expect(Object.keys(c.avatar).length).toBeGreaterThan(5);
  });
});
