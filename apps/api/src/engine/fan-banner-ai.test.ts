/**
 * Zadání pro model, který píše na plachtu.
 *
 * Kontrolní branku sdílí s chorály (`zkontrolujChoral`), tady se hlídá jen to,
 * co je na plachtě jiné: kratší strop a vlastní zadání podle tónu.
 */
import { describe, it, expect } from "vitest";
import { promptTransparentu, ZADANI_TONU, STAVBA_TRANSPARENTU } from "./fan-banner-ai";
import { MAX_DELKA_TRANSPARENTU } from "./fan-banner";
import { zkontrolujChoral } from "./fan-chant-inspirace";

describe("zadání pro plachtu", () => {
  it("nese fakta, tón, limit i pravidla stavby", () => {
    const p = promptTransparentu({
      ton: "proti_treneru",
      fakta: ["Trenér se jmenuje Klement Testovič a chceme, aby skončil."],
      klub: "FK Duplex Břevnov",
      okres: "Praha",
      maxDelka: MAX_DELKA_TRANSPARENTU,
      povinneSlovo: "Testovič",
    });
    expect(p).toContain("Klement Testovič");
    expect(p).toContain(`${MAX_DELKA_TRANSPARENTU} znaků`);
    expect(p).toContain("MUSÍ zaznít: Testovič");
    expect(p).toContain(STAVBA_TRANSPARENTU[0]);
    expect(p).toContain("PRVNÍM PÁDĚ");
  });

  it("bez okresu a bez povinného slova to nespadne", () => {
    const p = promptTransparentu({
      ton: "podpora", fakta: ["Fandíme svému týmu."], klub: "Sokol",
      maxDelka: MAX_DELKA_TRANSPARENTU,
    });
    expect(p).not.toContain("undefined");
    expect(p).not.toContain("MUSÍ zaznít");
  });

  it("každý tón má své zadání", () => {
    for (const t of Object.keys(ZADANI_TONU) as Array<keyof typeof ZADANI_TONU>) {
      expect(ZADANI_TONU[t].length).toBeGreaterThan(20);
    }
  });
});

describe("kontrola hesla používá kratší strop", () => {
  it("co se vejde na chorál, se na plachtu vejít nemusí", () => {
    const dlouhe = "A".repeat(MAX_DELKA_TRANSPARENTU + 1);
    expect(zkontrolujChoral(dlouhe, { maxDelka: MAX_DELKA_TRANSPARENTU }).ok).toBe(false);
    // Bez stropu plachty by tentýž text prošel, chorál unese víc.
    expect(zkontrolujChoral(dlouhe).ok).toBe(true);
  });

  it("přesně na hranici projde", () => {
    const akorat = "B".repeat(MAX_DELKA_TRANSPARENTU);
    expect(zkontrolujChoral(akorat, { maxDelka: MAX_DELKA_TRANSPARENTU }).ok).toBe(true);
  });

  it("heslo proti soupeři mu nesmí fandit ani na plachtě", () => {
    expect(zkontrolujChoral("BRANÍK, DO TOHO!", { tema: "rival", maxDelka: MAX_DELKA_TRANSPARENTU }).ok)
      .toBe(false);
    expect(zkontrolujChoral("BRANÍK NIKDY", { tema: "rival", maxDelka: MAX_DELKA_TRANSPARENTU }).ok)
      .toBe(true);
  });
});
