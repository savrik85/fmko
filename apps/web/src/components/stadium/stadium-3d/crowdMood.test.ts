import { describe, expect, it } from "vitest";
import { crowdLift } from "./crowdMood";

describe("reakce diváků na dění na hřišti", () => {
  /** Kolik ze sta diváků s rovnoměrně rozloženým prahem při dané náladě reaguje. */
  const reacting = (mood: number) => Array.from({ length: 100 }, (_, n) => crowdLift(mood, n / 100)).filter((lift) => lift > 0).length;

  it("při gólu se zvedne většina tribuny, ale ne všichni; při šanci jen pár lidí; v klidu nikdo", () => {
    expect(reacting(1)).toBe(80);
    expect(reacting(0.3)).toBe(24);
    expect(reacting(0)).toBe(0);
    // Po inkasovaném gólu (záporná nálada) nevyskakuje nikdo.
    expect(reacting(-1)).toBe(0);
  });

  it("síla reakce je mezi 0 a 1 a nejdychtivější divák reaguje naplno", () => {
    expect(crowdLift(1, 0)).toBe(1);
    expect(crowdLift(1, 0.7)).toBeCloseTo(0.4);
    expect(crowdLift(0.3, 0.9)).toBe(0);
  });
});
