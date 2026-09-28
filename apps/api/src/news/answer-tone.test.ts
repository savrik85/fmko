import { describe, it, expect } from "vitest";
import { normalizeTones, parseStoredTones, toneLine, tonePromptRule, lexiconWithTone } from "./answer-tone";

describe("answer-tone", () => {
  it("chybějící a neznámé tóny doplní na normální", () => {
    expect(normalizeTones(["ironie", "blbost"], 3)).toEqual(["ironie", "normalni", "normalni"]);
    expect(normalizeTones(undefined, 2)).toEqual(["normalni", "normalni"]);
    expect(parseStoredTones("rozbité{", 1)).toEqual(["normalni"]);
    expect(parseStoredTones(null, 1)).toEqual(["normalni"]);
  });

  it("normální tón do promptu nic nepřidá", () => {
    expect(toneLine("normalni")).toBe("");
    expect(tonePromptRule(["normalni", "normalni"])).toBe("");
    expect(toneLine("ironie")).toContain("ironicky");
    expect(tonePromptRule(["normalni", "nadsazka"])).not.toBe("");
  });

  it("ironická pochvala sudího je pro lexikon kritika", () => {
    expect(lexiconWithTone({ postoj: "obhajoba", sila: 3 }, "ironie")).toEqual({ postoj: "kritika", sila: 2 });
    expect(lexiconWithTone({ postoj: "obhajoba", sila: 1 }, "normalni")).toEqual({ postoj: "obhajoba", sila: 1 });
  });

  it("ostrá kritika s cedulkou ironie zůstává kritikou", () => {
    expect(lexiconWithTone({ postoj: "kritika", sila: 3 }, "ironie")).toEqual({ postoj: "kritika", sila: 3 });
  });
});
