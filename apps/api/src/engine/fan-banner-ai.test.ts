import { describe, expect, it } from "vitest";
import {
  VZORY, korektorSchvalil, normalizujHeslo, promptKorektor, promptPlachty, slovaSponzoru, vadaPlachty, vyberVzory,
} from "./fan-banner-ai";

describe("vzory ze skutečných nápisů", () => {
  it("každý tón má dost vzorů", () => {
    for (const v of Object.values(VZORY)) expect(v.length).toBeGreaterThanOrEqual(7);
  });

  it("různé kluby dostanou různý výběr, stejný klub stejný", () => {
    expect(vyberVzory("podpora", 1)).toEqual(vyberVzory("podpora", 1));
    expect(vyberVzory("podpora", 1)).not.toEqual(vyberVzory("podpora", 2));
  });
});

describe("zadání", () => {
  it("nese obec, vzory, situaci a co už v lize visí", () => {
    const p = promptPlachty({
      ton: "vytka", fakta: ["Tým prohrál tři zápasy po sobě."], obec: "Čkyně",
      vzory: ["Věrní, ale nasraní"], maxDelka: 48, obsazene: ["TADY JSME DOMA"],
    });
    expect(p).toContain("z obce Čkyně");
    expect(p).toContain("Věrní, ale nasraní");
    expect(p).toContain("Tým prohrál tři zápasy po sobě.");
    expect(p).toContain("TADY JSME DOMA");
  });

  it("korektor dostane text a chce jen ANO nebo NE", () => {
    expect(promptKorektor("ČKYNĚ = DOMOV")).toContain("ČKYNĚ = DOMOV");
    expect(korektorSchvalil("ANO")).toBe(true);
    expect(korektorSchvalil(" ano.")).toBe(true);
    expect(korektorSchvalil("NE")).toBe(false);
    expect(korektorSchvalil("Ano, ale…")).toBe(true);
    expect(korektorSchvalil(null)).toBe(false);
  });
});

describe("co kód na plachtě nepustí", () => {
  it("skutečné patvary z produkce", () => {
    const sp = ["Rohlík", "Jitona", "Madeta"];
    expect(vadaPlachty("SPŮLE JE NAŠE KRVOU, SRDCEM, DUŠÍ", sp)).toBe("patos");
    expect(vadaPlachty("HRADČANY V SRDCI, NAVŽDY VĚRNI", sp)).toBe("patos");
    expect(vadaPlachty("DIKY JUN! ROHLIK MA 5 VYHER!", sp)).toBe("obsahuje číslo");
    expect(vadaPlachty("Jitono, ty jsi naše!", sp)).toBe("sponzor Jitona");
    expect(vadaPlachty("FK HVĚZDA VIMPERK. TADY JE DOMA!", sp)).toBe("zkratka klubu");
    expect(vadaPlachty("Kam čert nemůže, tam nastrčí čkyňského!", sp)).toBe("přísloví");
  });

  it("heslo, které v lize už visí, se nezopakuje", () => {
    expect(vadaPlachty("Fiala. Náš kluk.", [], ["FIALA. NÁŠ KLUK."])).toBe("v lize už visí");
    expect(normalizujHeslo("FIALA. NÁŠ KLUK.")).toBe(normalizujHeslo("fiala nas kluk"));
  });

  it("obyčejný kotel projde", () => {
    expect(vadaPlachty("VĚRNÍ, ALE NASRANÍ", ["Forpsi"], ["TADY JSME DOMA"])).toBeNull();
  });

  it("sponzor je zbytek názvu po odečtení obce", () => {
    expect(slovaSponzoru(["FK Rohlík Podolí", "Sokol Kobylisy"], ["Podolí", "Kobylisy"])).toEqual(["Rohlík"]);
  });
});
