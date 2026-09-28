/**
 * Zadání pro model, který píše na plachtu.
 *
 * Kontrolní branku sdílí s chorály (`zkontrolujChoral`), tady se hlídá jen to,
 * co je na plachtě jiné: kratší strop a vlastní zadání podle tónu.
 */
import { describe, it, expect } from "vitest";
import { promptTransparentu, slovaSponzoru, vadaPlachty, ZADANI_TONU, STAVBA_TRANSPARENTU } from "./fan-banner-ai";
import { MAX_DELKA_TRANSPARENTU } from "./fan-banner";
import { zkontrolujChoral } from "./fan-chant-inspirace";

describe("zadání pro plachtu", () => {
  it("nese fakta, tón, limit i pravidla stavby", () => {
    const p = promptTransparentu({
      ton: "proti_treneru",
      fakta: ["Trenér se jmenuje Klement Testovič a chceme, aby skončil."],
      obec: "Břevnov",
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
      ton: "podpora", fakta: ["Fandíme svému týmu."], obec: "Dvory",
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

describe("plachta bez sponzora, čísel a děkování", () => {
  it("sponzor je zbytek názvu klubu po odečtení obce", () => {
    expect(slovaSponzoru(["FK Rohlík Podolí", "FK Madeta Volary"], ["Podolí", "Volary"])).toEqual(["Rohlík", "Madeta"]);
    expect(slovaSponzoru(["Sokol Kobylisy", "SK Břevnov"], ["Kobylisy", "Břevnov"])).toEqual([]);
  });

  it("zahodí skutečné patvary z produkce", () => {
    const sponzori = ["Rohlík", "Jitona", "Madeta"];
    expect(vadaPlachty("DIKY JUN! ROHLIK MA 5 VYHER!", sponzori)).not.toBeNull();
    expect(vadaPlachty("Jitono, ty jsi naše, ne cizí!", sponzori)).toBe("sponzor Jitona");
    expect(vadaPlachty("Kdo jinému jámu kopá, Madeta Volary!", sponzori)).toBe("přísloví");
    expect(vadaPlachty("DÍKY, TRENÉŘE ŘEPKO!", sponzori)).toBe("děkuje");
  });

  it("zkratka klubu a přísloví neprojdou", () => {
    expect(vadaPlachty("FK HVĚZDA VIMPERK. TADY JE DOMA!", [])).toBe("zkratka klubu");
    expect(vadaPlachty("Kam čert nemůže, tam nastrčí čkyňského!", [])).toBe("přísloví");
  });

  it("obyčejné choreo projde", () => {
    expect(vadaPlachty("ČKYNĚ NAVŽDY", ["Forpsi"])).toBeNull();
    expect(vadaPlachty("V DEŠTI I V BLÁTĚ", ["Rohlík"])).toBeNull();
  });

  it("zadání nese obec, ne název klubu", () => {
    const p = promptTransparentu({ ton: "podpora", fakta: ["x"], obec: "Čkyně", maxDelka: MAX_DELKA_TRANSPARENTU });
    expect(p).toContain("z obce Čkyně");
  });
});
