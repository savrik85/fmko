/**
 * Hráč neopakuje sám sebe: detekce opakovaných vět, blok do promptu a jedno přegenerování.
 * Příklady jsou ze skutečných zpráv hráčů na produkci (9–11/2026).
 */
import { describe, expect, it, vi } from "vitest";
import {
  findRepeatedSentences, generateWithoutRepeats, isStockSentence, ownLinesPromptBlock, pickFreshVariant, pickUnusedIndex,
  repeatRetryRule, repeatsAny, sentencesRepeat, splitSentences, withoutSentences,
} from "./repetition";

describe("co je opakování", () => {
  it("stejná věta jen s jiným oslovením nebo interpunkcí", () => {
    expect(sentencesRepeat("Už mám po šichtě, trenére.", "Už mám po šichtě!")).toBe(true);
    expect(sentencesRepeat("No potěš koště.", "No potěš koště!")).toBe(true);
    expect(sentencesRepeat("Tak to je super, trenére!", "Tak to je super.")).toBe(true);
  });

  it("skoro stejná myšlenka stejnými slovy", () => {
    expect(sentencesRepeat("Teď si mě vychutná žena.", "Teď si mě doma vychutná žena!")).toBe(true);
    expect(sentencesRepeat(
      "Trenére, tenhle dril už fakt nebaví.",
      "Trenére, tenhle dril už je fakt na palici, to furt samý běhání kolem hřiště.",
    )).toBe(true);
    expect(sentencesRepeat("Ozvu se pak, až budu mít klid.", "Ozvu se pak, až budu mít klid, čau.")).toBe(true);
  });

  it("krátké běžné věty a jiná témata opakováním nejsou", () => {
    expect(sentencesRepeat("Díky.", "Díky, trenére!")).toBe(false);
    expect(sentencesRepeat("Jo, trenére.", "Jo.")).toBe(false);
    expect(sentencesRepeat("Ve středu proti Vimperku nechám na place duši.", "Díky za důvěru!")).toBe(false);
    expect(sentencesRepeat("Už mám po šichtě, trenére.", "Už mám padla, trenére.")).toBe(false);
    // Jedno společné slovo nestačí.
    expect(sentencesRepeat("Ten Vimperk je o ligu výš.", "V neděli hrajeme s Vimperkem doma.")).toBe(false);
  });

  it("ohrané věty, které píše každý (prod 9–11/2026)", () => {
    for (const s of [
      "Už mám po šichtě, trenére.", "Tak už mám padla, trenére.", "Už mám po šichtě klid, trenére.",
      "Tak to je super, trenére!", "No tak to je jiná, trenére!", "Tak to je jiná řeč, trenére!", "Už mám klid, trenére.",
    ]) expect(isStockSentence(s)).toBe(true);
    for (const s of [
      "Tak to je super, že jsi to vyřešil.", "Už mám po šichtě a jdu na pivo.", "Super, trenére.", "To je jiná liga než my.",
    ]) expect(isStockSentence(s)).toBe(false);
    expect(findRepeatedSentences("Tak už mám padla, trenére. Co se děje?", [])).toEqual(["Tak už mám padla, trenére."]);
  });

  it("dělí zprávu na věty i podle řádků a emoji nechává u věty", () => {
    expect(splitSentences("Už mám po šichtě, trenére. Ty prachy si nech!\nHlavně ať hraju 💪")).toEqual([
      "Už mám po šichtě, trenére.", "Ty prachy si nech!", "Hlavně ať hraju 💪",
    ]);
  });

  it("najde jen opakované věty nové zprávy", () => {
    const previous = ["Trenére, to jste mi to teda řekl. No potěš koště. Teď si mě vychutná žena."];
    expect(findRepeatedSentences("No potěš koště. Tohle jsem fakt nečekal.", previous)).toEqual(["No potěš koště."]);
    expect(findRepeatedSentences("Tohle jsem fakt nečekal.", previous)).toEqual([]);
    expect(findRepeatedSentences("No potěš koště.", [])).toEqual([]);
  });
});

describe("vyškrtnutí opakované věty", () => {
  it("zbytek, který dává smysl, zůstane", () => {
    expect(withoutSentences("Už mám po šichtě, trenére. Ty prachy si klidně nechte, hlavně ať zítra hraju.", ["Už mám po šichtě, trenére."]))
      .toBe("Ty prachy si klidně nechte, hlavně ať zítra hraju.");
  });

  it("když nezbude nic nebo jen citoslovce, vrátí null", () => {
    expect(withoutSentences("Už mám po šichtě, trenére.", ["Už mám po šichtě, trenére."])).toBeNull();
    expect(withoutSentences("No potěš koště. Jo.", ["No potěš koště."])).toBeNull();
    expect(withoutSentences("No potěš koště. 😅", ["No potěš koště."])).toBeNull();
  });
});

describe("blok do promptu", () => {
  it("prázdný seznam nepřidá nic", () => {
    expect(ownLinesPromptBlock([])).toBe("");
  });

  it("vypíše věty, které hráč už napsal, a zakáže je i podobně", () => {
    const block = ownLinesPromptBlock(["Už mám po šichtě, trenére.", "No potěš koště.\nTeď si mě vychutná žena."]);
    expect(block).toContain("CO UŽ JSI TRENÉROVI NAPSAL");
    expect(block).toContain("ani podobné");
    expect(block).toContain("- „Už mám po šichtě, trenére.“");
    expect(block).toContain("- „No potěš koště. Teď si mě vychutná žena.“");
    expect(block).not.toContain("—");
  });

  it("dlouhou zprávu zkrátí", () => {
    const block = ownLinesPromptBlock(["a".repeat(500)]);
    expect(block.length).toBeLessThan(400);
    expect(block).toContain("…“");
  });

  it("pokyn k druhému pokusu jmenuje opakovanou větu", () => {
    expect(repeatRetryRule(["Už mám po šichtě, trenére."])).toContain("„Už mám po šichtě, trenére.“");
  });
});

describe("jedno přegenerování", () => {
  const previous = ["Už mám po šichtě, trenére. Ty prachy si nech."];

  it("bez dřívějších zpráv nebo bez opakování volá model jednou", async () => {
    const gen = vi.fn(async () => ({ body: "Ty prachy si nech, v neděli dorazím." }));
    expect((await generateWithoutRepeats(undefined, gen, "test")).body).toBe("Ty prachy si nech, v neděli dorazím.");
    expect((await generateWithoutRepeats([], gen, "test")).body).toBe("Ty prachy si nech, v neděli dorazím.");
    expect(gen).toHaveBeenCalledTimes(2);
    const fresh = vi.fn(async () => ({ body: "V neděli dorazím, spolehni se." }));
    await generateWithoutRepeats(previous, fresh, "test");
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("ohranou větu hlídá i u hráče bez historie", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "Už mám po šichtě, trenére. Ta noha je v cajku." })
      .mockResolvedValueOnce({ body: "Ta noha je v cajku, v sobotu můžu." });
    expect((await generateWithoutRepeats([], gen, "test")).body).toBe("Ta noha je v cajku, v sobotu můžu.");
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it("při opakování zkusí jednou znovu s výslovně zakázanou větou", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "Už mám po šichtě, trenére. V neděli dorazím." })
      .mockResolvedValueOnce({ body: "Jasně, v neděli dorazím, spolehni se." });
    const out = await generateWithoutRepeats(previous, gen, "test");
    expect(out.body).toBe("Jasně, v neděli dorazím, spolehni se.");
    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls[0][0]).toBe("");
    expect(gen.mock.calls[1][0]).toContain("„Už mám po šichtě, trenére.“");
  });

  it("když opakuje i podruhé, opakovanou větu vyškrtne a ostatní pole nechá", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "Už mám po šichtě, trenére. V neděli dorazím.", writeLater: false })
      .mockResolvedValueOnce({ body: "Už mám po šichtě! V neděli tam budu.", writeLater: false });
    const out = await generateWithoutRepeats(previous, gen, "test");
    expect(gen).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ body: "V neděli tam budu.", writeLater: false });
  });

  it("když by bez opakované věty nic nezbylo, zprávu nechá", async () => {
    const gen = vi.fn(async () => ({ body: "Už mám po šichtě, trenére." }));
    expect((await generateWithoutRepeats(previous, gen, "test")).body).toBe("Už mám po šichtě, trenére.");
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it("když druhý pokus spadne, použije první bez opakované věty", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "Už mám po šichtě, trenére. V neděli dorazím." })
      .mockRejectedValueOnce(new Error("model nejede"));
    expect((await generateWithoutRepeats(previous, gen, "test")).body).toBe("V neděli dorazím.");
  });
});

describe("předem napsané varianty bez opakování", () => {
  // Poděkování za odmítnutou nabídku dostal jeden trenér pětkrát (conv f14c5721, prod 9–11/2026).
  const loyal = [
    "Trenére, díky, že jste tu nabídku odmítl. Jsem tady doma a jinam nechci.",
    "Trenére, slyšel jsem o té nabídce. Dobře, že jste ji poslal k šípku. Já svůj dres nevyměním.",
    "Díky, trenére. Kdyby se mě někdo ptal, řekl bych to samý: zůstávám.",
  ];

  it("index varianty, kterou hráč nedostal; když dostal všechny, ze všech", () => {
    expect(pickUnusedIndex(3, new Set([0, 1]), "x")).toBe(2);
    expect(pickUnusedIndex(3, new Set([0, 1, 2]), "x")).toBeLessThan(3);
    expect(pickUnusedIndex(5, new Set(), "seed")).toBe(pickUnusedIndex(5, new Set(), "seed"));
  });

  it("věta, kterou hráč už poslal, se nevybere ani s jiným oslovením nebo čárkou", () => {
    const previous = ["Šéfe, slyšel jsem o té nabídce. Dobře, že jste ji poslal k šípku. Já svůj dres nevyměním.", "Trenére díky že jste tu nabídku odmítl. Jsem tady doma a jinam nechci."];
    for (const seed of ["a", "b", "c", "d", "e"]) expect(pickFreshVariant(loyal, previous, seed).index).toBe(2);
  });

  it("když poslal všechny, vezme tu, kterou poslal nejdávněji", () => {
    const previous = [loyal[1], "Jdu na trénink.", loyal[0], loyal[2]];
    expect(pickFreshVariant(loyal, previous, "x")).toEqual({ text: loyal[1], index: 1 });
  });

  it("stejný seed a stejná historie dají stejnou variantu", () => {
    expect(pickFreshVariant(loyal, [], "offer-1")).toEqual(pickFreshVariant(loyal, [], "offer-1"));
  });

  it("dvě různé varianty se stejným klubem nejsou tatáž věta, lámaná šablona ano", () => {
    expect(repeatsAny("To si děláte srandu?! FK Dobrš mě chtěl a vy to hodíte do koše bez jediného slova?!",
      ["Super, trenére. FK Dobrš mě chtěl, já jsem chtěl jít a vy to zaříznete. Tak si to užijte."])).toBe(false);
    expect(repeatsAny("Trenére, díky, že jste tu nabídku odmítl. Jsem tady doma a jinam nechci.",
      ["Trenere, diky ze jste tu nabidku odmitl. Jsem tady doma a jinam nechci."])).toBe(true);
  });

  it("opakuje zpráva některou z předchozích?", () => {
    expect(repeatsAny("Jsem tady doma a jinam nechci.", [loyal[0]])).toBe(true);
    expect(repeatsAny("Díky, trenére.", ["Díky, trenére!"])).toBe(false);
    expect(repeatsAny("Tak to je jiná, trenére!", [])).toBe(false);
  });
});
