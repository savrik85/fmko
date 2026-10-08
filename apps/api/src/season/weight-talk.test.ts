import { describe, expect, it } from "vitest";
import { carryWeightTalk, detectWeightTalk, weightPledgeChance, weightTalkPrompt } from "./weight-talk";

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

  it("chytí otázku na váhu a pivo nebo hospodu jen s omezením", () => {
    for (const text of [
      "Kolik vážíš?",
      "Hlídej si váhu",
      "Na váze máš o pět kilo víc",
      "Omez pivo",
      "Nechoď do hospody",
      "Míň piva, víc běhání",
    ]) expect(detectWeightTalk(text), text).toBe(true);
  });

  it("nechytí pochvalu, pozvání na pivo ani hospodaření", () => {
    for (const text of [
      "Vážím si tě, že makáš",
      "Vážíme si tě",
      "Trenér si tě váží si",
      "Tvoje slovo má váhu",
      "Pojď na pivo, oslavíme to",
      "Hospodaření klubu je v pořádku",
      "Musíme to zvážit",
    ]) expect(detectWeightTalk(text), text).toBe(false);
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

describe("přenesení výsledku domluvy do nového stavu vlákna", () => {
  it("vezme weightTalk ze starého stavu, jinak nic", () => {
    const talk = { outcome: "pledge", day: "2026-10-12" };
    expect(carryWeightTalk(JSON.stringify({ awaiting: "coach", weightTalk: talk }))).toEqual({ weightTalk: talk });
    expect(carryWeightTalk(JSON.stringify({ awaiting: "coach" }))).toEqual({});
    expect(carryWeightTalk(null)).toEqual({});
    expect(carryWeightTalk("nesmysl")).toEqual({});
  });
});
