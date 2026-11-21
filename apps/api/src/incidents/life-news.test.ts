/**
 * Zpráva po skončení porodu a nemoci rodiče: fakta, předem napsané varianty a pokyn modelu.
 */
import { describe, expect, it } from "vitest";
import {
  BIRTH_NEWS_TEMPLATES, PARENT_NEWS_TEMPLATES, babyFacts, fallbackNews, formatWeight, lifeEventFact, newsScenario,
  parentFromTexts, seededParent,
} from "./life-news";
import { TEXTY } from "./texty";

describe("kdo se narodil", () => {
  it("pro tentýž incident vždycky stejně, váha jako u novorozence", () => {
    expect(babyFacts("inc-a")).toEqual(babyFacts("inc-a"));
    const all = Array.from({ length: 200 }, (_, n) => babyFacts(`inc-${n}`));
    expect(new Set(all.map((b) => b.sex))).toEqual(new Set(["boy", "girl"]));
    expect(new Set(all.map((b) => b.name)).size).toBeGreaterThan(15);
    for (const b of all) {
      expect(b.weightG).toBeGreaterThanOrEqual(2850);
      expect(b.weightG).toBeLessThanOrEqual(4100);
    }
  });

  it("váha, jak ji řekne táta", () => {
    expect(formatWeight(3450)).toBe("3,45 kila");
    expect(formatWeight(3400)).toBe("3,4 kila");
    expect(formatWeight(3000)).toBe("3 kila");
  });
});

describe("který rodič je v nemocnici", () => {
  it("pozná ho z úvodní SMS i z omluvenky", () => {
    const [father, mother, unknown] = TEXTY.sms_situace_nemocny_rodic;
    expect(parentFromTexts([father])).toBe("father");
    expect(parentFromTexts([mother])).toBe("mother");
    expect(parentFromTexts([unknown])).toBeNull();
    expect(parentFromTexts([unknown, "Trenére, musím do nemocnice za mámou. Omlouvám se."])).toBe("mother");
    // „Mám“ jako sloveso mámu neznamená.
    expect(parentFromTexts(["Mám toho moc, rodič je v nemocnici."])).toBeNull();
  });

  it("když ho SMS nejmenuje, los podle incidentu je pořád stejný", () => {
    expect(seededParent("inc-x")).toBe(seededParent("inc-x"));
    expect(new Set(Array.from({ length: 40 }, (_, n) => seededParent(`inc-${n}`)))).toEqual(new Set(["father", "mother"]));
  });
});

describe("předem napsané zprávy", () => {
  const boy = { baby: { sex: "boy" as const, name: "Matyáš", weightG: 3450 } };
  const girl = { baby: { sex: "girl" as const, name: "Eliška", weightG: 3200 } };

  it("aspoň pět variant pro porod i rodiče, všechny vyplněné a bez dlouhé pomlčky", () => {
    expect(BIRTH_NEWS_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    expect(PARENT_NEWS_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    for (let used = 0; used < BIRTH_NEWS_TEMPLATES.length; used++) {
      for (const data of [boy, girl]) {
        const { body } = fallbackNews("narozeni_ditete", data, BIRTH_NEWS_TEMPLATES.map((_, i) => i).filter((i) => i !== used), "s");
        expect(body).toContain(data.baby.name);
        expect(body).toContain(formatWeight(data.baby.weightG));
        expect(body).not.toMatch(/[{}—]/);
        // Pozvání zapít: přijetí má dopad (casual-messages.ts, pozvání „baby“).
        expect(body).toMatch(/zapí|Zapij/);
      }
    }
    for (let used = 0; used < PARENT_NEWS_TEMPLATES.length; used++) {
      for (const parent of ["father", "mother"] as const) {
        const { body } = fallbackNews("nemocny_rodic", { parent }, PARENT_NEWS_TEMPLATES.map((_, i) => i).filter((i) => i !== used), "s");
        expect(body).toMatch(parent === "father" ? /tát/ : /mám/);
        expect(body).not.toMatch(/[{}—]/);
      }
    }
  });

  it("rod sedí: holka vážila a zve se zapít malou", () => {
    const texts = BIRTH_NEWS_TEMPLATES.map((_, i) => fallbackNews("narozeni_ditete", girl, BIRTH_NEWS_TEMPLATES.map((_, j) => j).filter((j) => j !== i), "s").body);
    expect(texts.join(" ")).not.toMatch(/vážil |malýho|malej|kluka|syna/);
    expect(texts.join(" ")).toMatch(/vážila/);
  });

  it("nevybere variantu, kterou hráč už dostal", () => {
    const used = [0, 1, 2, 3, 4];
    expect(fallbackNews("narozeni_ditete", boy, used, "x").variant).toBe(5);
    // Když dostal všechny, vybírá se znovu ze všech.
    expect(fallbackNews("narozeni_ditete", boy, [0, 1, 2, 3, 4, 5], "x").variant).toBeLessThan(6);
  });
});

describe("pokyn modelu a fakt do chatu", () => {
  it("porod: jméno, váha a pozvání zapít; rodič: díky za pochopení", () => {
    const s = newsScenario("narozeni_ditete", { baby: { sex: "girl", name: "Eliška", weightG: 3200 } });
    expect(s.invite).toBe("baby");
    expect(s.description).toContain("Narodila se ti dcera, jmenuje se Eliška a vážila 3,2 kila");
    expect(s.description).toContain("zapít malou");
    const p = newsScenario("nemocny_rodic", { parent: "father" });
    expect(p.invite).toBeUndefined();
    expect(p.description).toContain("táta skončil v nemocnici");
    expect(p.description).toContain("poděkuj mu za pochopení");
    expect(`${s.description} ${p.description}`).not.toContain("—");
  });

  it("chat ví, že je čerstvý táta, i jak se dítě jmenuje", () => {
    expect(lifeEventFact("narozeni_ditete", { baby: { sex: "boy", name: "Matyáš", weightG: 3450 } }, 3))
      .toBe("Před 3 dny jste se vrátili z porodnice, narodil se ti syn Matyáš (3,45 kila). Jsi čerstvý táta, doma máte miminko.");
    expect(lifeEventFact("nemocny_rodic", { parent: "mother" }, 1)).toBe("Tvoje máma byla v nemocnici, včera ji pustili domů a je to lepší.");
  });
});
