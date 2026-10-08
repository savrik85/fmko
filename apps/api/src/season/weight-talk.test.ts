import { describe, expect, it } from "vitest";
import { detectWeightTalk, weightPledgeChance, weightTalkPrompt } from "./weight-talk";

describe("rozpoznání řeči o váze", () => {
  it("chytí běžné obraty o hubnutí, pivu a hospodě, i bez diakritiky", () => {
    for (const text of [
      "Musíš zhubnout, takhle to nejde",
      "Nech toho piva, jo?",
      "Ten břich ti roste",
      "Míň hospody, víc běhání",
      "tvoje vaha je problem",
      "Shoď pár kil do konce měsíce",
      "Drž dietu",
    ]) expect(detectWeightTalk(text)).toBe(true);
  });

  it("nechytí běžný rozhovor", () => {
    for (const text of ["Jak se máš?", "V neděli hrajeme doma", "Pěkný gól včera"]) expect(detectWeightTalk(text)).toBe(false);
  });
});

describe("šance na slib", () => {
  it("disciplinovaný a v pohodě skoro jistě slíbí, vznětlivý s mizernou náladou spíš ne", () => {
    expect(weightPledgeChance(90, 70, 20)).toBeCloseTo(0.9, 5);
    expect(weightPledgeChance(10, 20, 90)).toBeCloseTo(0.1, 5);
    expect(weightPledgeChance(50, 50, 50)).toBeCloseTo(0.55, 5);
  });
});

describe("pokyn do promptu", () => {
  it("slib i urážka mají vlastní pokyn bez dlouhé pomlčky", () => {
    expect(weightTalkPrompt("pledge")).toContain("slíbil");
    expect(weightTalkPrompt("refused")).toContain("urazil");
    expect(weightTalkPrompt("pledge")).not.toContain("—");
    expect(weightTalkPrompt("refused")).not.toContain("—");
  });
});
