import { describe, expect, it } from "vitest";
import { brokenCzech, foreignSpeechRule, writesForeign } from "./foreign-speech";

const SAMPLES = [
  "Sorry, nemůžu. Mám směnu.",
  "Odpustíš, trenére? Mám raut v práci",
  "Jasně, přijdu",
  "Trenére, ozval se mi SK Strakonice. Nabízejí 42 000 Kč. Rozhodnutí je na vás.",
  "Dneska fakt nejde, příště určitě",
  "Musím do práce, nemůžu přijít",
  "Omlouvám se, ale nevím, jestli dorazím.",
];

describe("řeč cizinců", () => {
  it("Čech i neznámá národnost píšou beze změny", () => {
    for (const t of SAMPLES) {
      expect(brokenCzech(t, "CZ", "x")).toBe(t);
      expect(brokenCzech(t, null, "x")).toBe(t);
      expect(brokenCzech(t, "XX", "x")).toBe(t);
    }
    expect(foreignSpeechRule("CZ")).toBeNull();
    expect(writesForeign("CZ")).toBe(false);
  });

  it("cizinec píše lámaně: infinitiv s „já“, bez ř/ě/ů, trenér bez 5. pádu", () => {
    expect(brokenCzech("Sorry, nemůžu. Mám směnu.", "UA", "a")).toMatch(/já nemoct\. Já mít smenu\./);
    expect(brokenCzech("Odpustíš, trenére? Mám raut v práci", "HU", "a")).toContain("trenér? Já mít raut v práci");
    expect(brokenCzech("Já jsem tam", "RO", "b")).toMatch(/Já tam/);
    expect(brokenCzech("Dorazím, nebojte", "HR", "c")).toMatch(/[Jj]á prijít, nebojte/);
    // Rozloučení v rodném jazyce nikdy nepřilepí k větě bez tečky.
    for (let i = 0; i < 40; i++) expect(brokenCzech("Mám raut v práci", "UA", `k${i}`)).not.toMatch(/práci [A-Z]/);
  });

  it("Němec píše Trainer, Polák polským pravopisem, Vietnamec bez diakritiky", () => {
    expect(brokenCzech("Trenére, mám problém", "DE", "d")).toMatch(/Trainer, já mít problém/);
    expect(brokenCzech("Přijdu až večer, čekám na řemeslníka", "PL", "e")).toMatch(/[Jj]á przijít až veczer, czekám na rzemeslníka/);
    expect(brokenCzech("Dneska ne, hlídám děti", "VN", "f")).toMatch(/Dneska ne, hlidam deti/);
  });

  it("Slovák píše slovensky", () => {
    expect(brokenCzech("Trenére, dneska nemůžu, jsem v práci", "SK", "g")).toBe("Tréner, dnes nemôžem, som v robote");
    expect(brokenCzech("Jasně, přijdu", "SK", "h")).toBe("Jasne, prídem");
  });

  it("stejný seed dá stejný text, žádné dlouhé pomlčky ani zdvojené „já“", () => {
    for (const nat of ["SK", "UA", "PL", "DE", "AT", "HR", "HU", "RO", "VN"]) {
      for (const t of SAMPLES) {
        const out = brokenCzech(t, nat, "seed");
        expect(out).toBe(brokenCzech(t, nat, "seed"));
        expect(out).not.toContain("—");
        expect(out).not.toMatch(/já já/i);
        expect(out.length).toBeGreaterThan(0);
      }
    }
  });

  it("pokyn do promptu: Slovák slovensky, ostatní lámaně se slovy rodného jazyka", () => {
    expect(foreignSpeechRule("SK")).toContain("SLOVENSKY");
    expect(foreignSpeechRule("DE")).toContain("LÁMANĚ");
    expect(foreignSpeechRule("DE")).toContain("genau");
    expect(foreignSpeechRule("VN")).toContain("bez diakritiky");
  });
});
