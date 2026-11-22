/**
 * Hráč neopakuje sám sebe: detekce opakovaných vět, blok do promptu a jedno přegenerování.
 * Příklady jsou ze skutečných zpráv hráčů na produkci (9–11/2026).
 */
import { describe, expect, it, vi } from "vitest";
import {
  findRepeatedSentences, generateWithoutRepeats, isStockSentence, ownLinesPromptBlock, pickFreshVariant, pickUnusedIndex,
  repeatRetryRule, repeatsAny, sentenceTail, sentencesRepeat, splitSentences, withoutRepeatedPhrases, withoutSentences,
} from "./repetition";
import { GeminiUnavailableError } from "./model-errors";

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
    // Ohraný začátek i s pokračováním (31× po dohodě s nespokojeným).
    expect(isStockSentence("No tak to je jiná, trenére, díky moc!")).toBe(true);
    expect(isStockSentence("To je jiná liga než my.")).toBe(false);
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

  // Lokální E2E 22. 11. (Staš): druhý pokus nestihl rozpočet a hráč poslal doslova stejnou
  // větu jako před chvílí. Opakovaná věta nikdy neodejde: volající pošle náhradu nebo odpoví později.
  it("když by bez opakované věty nic nezbylo, zprávu nepošle (model jako nedostupný)", async () => {
    const gen = vi.fn(async () => ({ body: "Už mám po šichtě, trenére." }));
    await expect(generateWithoutRepeats(previous, gen, "test")).rejects.toBeInstanceOf(GeminiUnavailableError);
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it("doslovný duplikát bez času na druhý pokus neodejde", async () => {
    const said = ["No tak mi řekněte, proč jste to odmítl? Mám bejt rád, že mě někdo chce?"];
    const gen = vi.fn(async () => ({ body: "No tak mi řekněte, proč jste to odmítl? Mám bejt rád, že mě někdo chce?" }));
    await expect(generateWithoutRepeats(said, gen, "test", { deadline: Date.now() + 2_000 })).rejects.toBeInstanceOf(GeminiUnavailableError);
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("když druhý pokus spadne, použije první bez opakované věty", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "Už mám po šichtě, trenére. V neděli dorazím." })
      .mockRejectedValueOnce(new Error("model nejede"));
    expect((await generateWithoutRepeats(previous, gen, "test")).body).toBe("V neděli dorazím.");
  });

  it("s časovým rozpočtem přegeneruje jen s rezervou, jinak rovnou vyškrtne", async () => {
    // Práce na pozadí končí po ~30 s: uříznutý druhý pokus by zahodil i hotový první text.
    const repeating = () => vi.fn()
      .mockResolvedValueOnce({ body: "Už mám po šichtě, trenére. V neděli dorazím." })
      .mockResolvedValueOnce({ body: "Jasně, v neděli dorazím, spolehni se." });
    const late = repeating();
    expect((await generateWithoutRepeats(previous, late, "test", { deadline: Date.now() + 2_000 })).body).toBe("V neděli dorazím.");
    expect(late).toHaveBeenCalledTimes(1);
    const early = repeating();
    expect((await generateWithoutRepeats(previous, early, "test", { deadline: Date.now() + 15_000 })).body).toBe("Jasně, v neděli dorazím, spolehni se.");
    expect(early).toHaveBeenCalledTimes(2);
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

// Lokální E2E 22. 11.: „užívám víkend 😅“ → „užíval víkend 😅“ ve dvou zprávách po sobě,
// „díky za otázku“ 5× za dopoledne, 33 z 80 zpráv začínalo „Trenére,“ (Bartoš 7 ze 7) a v kabině
// dva hráči doslova „V neděli budu, trenére“. Krátké fráze a úvody se škrtají bez dalšího volání modelu.
describe("krátké fráze a úvody", () => {
  it("zopakovaná krátká fráze a ohrané „díky za otázku“ se vyškrtnou, oslovení jen občas (Bartoš)", () => {
    expect(withoutRepeatedPhrases(
      "Trenére, mám se dobře, díky za otázku! Dneska jsem si užíval víkend 😅",
      ["Trenére, nic moc nedělám, jen si užívám víkend 😅"],
    )).toBe("Mám se dobře!");
    expect(withoutRepeatedPhrases("Trenére, díky za otázku! Dresy jsou fajn 😊", ["Trenére, plánuju jen relax."]))
      .toBe("Dresy jsou fajn 😊");
  });

  it("„Trenére,“ na začátku nesmí být ve víc než jedné ze tří posledních zpráv (Dvořák)", () => {
    expect(withoutRepeatedPhrases("Trenére, doma je všechno v pořádku, díky za otázku!", ["Trenére, přijedu.", "Fajn, cítím se dobře."]))
      .toBe("Doma je všechno v pořádku!");
    // Předposlední zpráva začínala oslovením: tahle bez něj.
    expect(withoutRepeatedPhrases("Trenére, myslím že ano, zvládneme to.", ["Trenére, doma v pohodě.", "Líbí se mi Matěj."]))
      .toBe("Myslím že ano, zvládneme to.");
    // Dvě poslední bez oslovení: smí být.
    expect(withoutRepeatedPhrases("Trenére, myslím že ano, zvládneme to.", ["Doma v pohodě.", "Líbí se mi Matěj."]))
      .toBe("Trenére, myslím že ano, zvládneme to.");
  });

  it("stejné citoslovce na začátku po sobě se vyškrtne i s oslovením, slovo s významem ne", () => {
    expect(withoutRepeatedPhrases("Jasný trenére, poptám se zítra u piva.", ["Jasný trenére, dorazím v úterý."]))
      .toBe("Poptám se zítra u piva.");
    expect(withoutRepeatedPhrases("Nevím, jestli to stihnu.", ["Nevím, trenére, uvidíme."])).toBe("Nevím, jestli to stihnu.");
  });

  it("dlouhou větu, desetinnou čárku ani jiná témata nechá být; když by nic nezbylo, nechá zprávu", () => {
    const own = ["V příštím zápase proti Vimperku dám gól, uvidíte."];
    expect(withoutRepeatedPhrases("V příštím zápase proti Vimperku konečně nastoupím od začátku a dám gól.", own))
      .toBe("V příštím zápase proti Vimperku konečně nastoupím od začátku a dám gól.");
    expect(withoutRepeatedPhrases("Malej má 2,96 kila, je zdravej.", ["Jsme doma."])).toBe("Malej má 2,96 kila, je zdravej.");
    expect(withoutRepeatedPhrases("Díky za otázku!", [])).toBe("Díky za otázku!");
  });

  it("přegenerování hlídá i věty spoluhráčů v kabině, úvody a fráze jen vlastní", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "V neděli budu, trenére" })
      .mockResolvedValueOnce({ body: "Já v neděli taky dorazím." });
    const out = await generateWithoutRepeats([], gen, "kabina", { others: ["V neděli budu, trenére"] });
    expect(out.body).toBe("Já v neděli taky dorazím.");
    expect(gen).toHaveBeenCalledTimes(2);
    // Oslovení spoluhráče úvod hráče neomezuje.
    const own = vi.fn(async () => ({ body: "Trenére, v neděli jsem tam." }));
    expect((await generateWithoutRepeats([], own, "kabina", { others: ["Trenére, já taky."] })).body).toBe("Trenére, v neděli jsem tam.");
  });

  // Rohde (E2E 22. 11.): druhý hlas napsal doslova Peckovu větu, zpráva se zahodila a kabina
  // vypadala jako rozhovor s jedním. Druhý pokus dostal pokyn „tohle jsi trenérovi už napsal“,
  // ačkoli větu napsal spoluhráč.
  it("kopie věty spoluhráče: jeden nový pokus s pokynem, že to napsal spoluhráč, a odpověď odejde", async () => {
    const pecka = "Trenére, zítra jsem doma, tak asi přijdu";
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: pecka })
      .mockResolvedValueOnce({ body: "Já budu taky, vezmu i kopačky navíc." });
    const out = await generateWithoutRepeats(["Na sraz přijdu."], gen, "kabina", { others: [pecka], deadline: Date.now() + 20_000 });
    expect(out.body).toBe("Já budu taky, vezmu i kopačky navíc.");
    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls[1][0]).toContain("napsal spoluhráč");
    expect(gen.mock.calls[1][0]).not.toContain("tohle jsi trenérovi už napsal");
    // Vlastní opakování dostane pokyn jako dřív.
    const ownRepeat = vi.fn()
      .mockResolvedValueOnce({ body: "Na sraz přijdu." })
      .mockResolvedValueOnce({ body: "Dorazím i s autem." });
    await generateWithoutRepeats(["Na sraz přijdu, trenére."], ownRepeat, "kabina", { others: [pecka] });
    expect(ownRepeat.mock.calls[1][0]).toContain("tohle jsi trenérovi už napsal");
  });

  it("výsledek přegenerování projde i škrtnutím frází", async () => {
    const gen = vi.fn(async () => ({ body: "Trenére, mám se dobře, díky za otázku!" }));
    expect((await generateWithoutRepeats(["Trenére, jsem v práci."], gen, "test")).body).toBe("Mám se dobře!");
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("prompt řekne, ať zprávu nezačíná oslovením, když ho měla jedna ze dvou posledních", () => {
    expect(ownLinesPromptBlock(["Trenére, přijedu.", "Fajn."])).toContain("nezačínej oslovením");
    expect(ownLinesPromptBlock(["Přijedu.", "Fajn."])).not.toContain("nezačínej oslovením");
  });
});

// Bezpečnostní kontrola 22. 11.: konec věty hledal regulární výraz s vnořenými kvantifikátory,
// který na řadě emoji před písmenem backtrackoval exponenciálně (ReDoS, limit CPU ve Workeru).
describe("konec věty bez backtrackingu", () => {
  it("odřízne interpunkci a emoji z konce, uprostřed nic", () => {
    expect(sentenceTail("Dneska jsem si užíval víkend 😅")).toEqual({ core: "Dneska jsem si užíval víkend", tail: " 😅" });
    expect(sentenceTail("Mám se dobře, díky!!! 👍🏻❤️")).toEqual({ core: "Mám se dobře, díky", tail: "!!! 👍🏻❤️" });
    expect(sentenceTail("Bez konce")).toEqual({ core: "Bez konce", tail: "" });
    expect(sentenceTail("😅😂")).toEqual({ core: "", tail: "😅😂" });
  });

  it("patologický vstup doběhne hned", () => {
    for (const input of [" .!😅".repeat(5000) + "a", "😅".repeat(5000) + "a", "😅".repeat(120) + "a"]) {
      const started = performance.now();
      sentenceTail(input);
      withoutRepeatedPhrases(input, ["Trenére, jen si užívám víkend 😅"]);
      expect(performance.now() - started, `${input.length} znaků`).toBeLessThan(50);
    }
  });
});

// Lokální E2E 22. 11. (Šmíd, Agrokat): na „dorazíš v úterý?“ napsal „V úterý dorazím, trenére.“
// a hlídač to zahodil kvůli „…v úterý dorazím a máknu“ z 19. 11.; hráč pak 56 minut mlčel.
describe("krátká odpověď na otázku trenéra a staré věty", () => {
  const SMID = "V úterý dorazím, trenére.";
  const COACH = "Tomáši, dorazíš v úterý na trénink? Potřebuju tě na standardky.";
  const withTimes = (lines: string[], sentAt: string[]) => {
    const out = [...lines];
    Object.defineProperty(out, "sentAt", { value: sentAt, enumerable: false });
    return out as string[] & { sentAt: string[] };
  };
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

  it("odpověď, která jen vrací slova z otázky trenéra, opakováním není", async () => {
    expect(findRepeatedSentences(SMID, ["Jo trenére, v úterý dorazím a máknu."])).toEqual([SMID]);
    expect(findRepeatedSentences(SMID, ["Jo trenére, v úterý dorazím a máknu."], { coachMessage: COACH })).toEqual([]);
    const gen = vi.fn(async () => ({ body: SMID }));
    expect((await generateWithoutRepeats(["Jo trenére, v úterý dorazím a máknu."], gen, "test", { coachMessage: COACH })).body).toBe(SMID);
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("krátká věta se proti zprávám starším než 48 h nehlídá, dlouhá ano", async () => {
    const own = withTimes(["Jo trenére, v úterý dorazím a máknu."], [daysAgo(3)]);
    const gen = vi.fn(async () => ({ body: SMID }));
    expect((await generateWithoutRepeats(own, gen, "test")).body).toBe(SMID);
    expect(gen).toHaveBeenCalledTimes(1);

    const long = "V neděli proti Vimperku nechám na place duši a dám gól.";
    const ownLong = withTimes(["Proti Vimperku v neděli nechám na place duši, dám gól!"], [daysAgo(5)]);
    expect(findRepeatedSentences(long, [], { old: ownLong })).toEqual([long]);
    // Čerstvá zpráva (bez času nebo do 48 h) se hlídá jako dřív.
    expect(findRepeatedSentences(SMID, withTimes(["Jo trenére, v úterý dorazím a máknu."], [daysAgo(1)]))).toEqual([SMID]);
  });

  it("při pochybnosti zprávu pošle: podobná, ne stejná věta je lepší než mlčení", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "V úterý dorazím, trenére." })
      .mockResolvedValueOnce({ body: "Jo, v úterý dorazím." });
    // Klauzule se slibem „v úterý dorazím“ zůstane, škrtne se jen „Jo“ (stejné citoslovce jako minule).
    expect((await generateWithoutRepeats(["Jo trenére, v úterý dorazím a máknu."], gen, "test")).body).toBe("V úterý dorazím.");
    expect(gen).toHaveBeenCalledTimes(2);
  });
});

// Lokální E2E 22. 11. (Král, Mráz): pokyn TYKÁŠ/VYKÁŠ model nedržel a výstup se nekontroloval.
describe("tvar oslovení trenéra ve vygenerované zprávě", () => {
  it("opačný tvar: jednou přegeneruje s výslovným pokynem a pošle opravenou zprávu", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "Relax, rodina. A vy co děláte, trenére?" })
      .mockResolvedValueOnce({ body: "Relax, rodina. A co ty, trenére?" });
    expect((await generateWithoutRepeats([], gen, "test", { address: "ty" })).body).toBe("Relax, rodina. A co ty, trenére?");
    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls[1][0]).toContain("TYKÁŠ");
  });

  it("zpráva bez tvaru nebo se správným tvarem: jedno volání", async () => {
    const gen = vi.fn(async () => ({ body: "V úterý dorazím, trenére." }));
    await generateWithoutRepeats([], gen, "test", { address: "vy" });
    const right = vi.fn(async () => ({ body: "Promiňte, trenére, v úterý dorazím." }));
    await generateWithoutRepeats([], right, "test", { address: "vy" });
    expect(gen).toHaveBeenCalledTimes(1);
    expect(right).toHaveBeenCalledTimes(1);
  });

  it("bez času na druhý pokus pošle první zprávu (a zaloguje)", async () => {
    const gen = vi.fn(async () => ({ body: "Měl bys se stavit, trenére." }));
    expect((await generateWithoutRepeats([], gen, "test", { address: "vy", deadline: Date.now() + 2_000 })).body).toBe("Měl bys se stavit, trenére.");
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("druhý pokus tvar nedodrží nebo opakuje: pošle první, nic nezahodí", async () => {
    const wrongAgain = vi.fn()
      .mockResolvedValueOnce({ body: "Měl bys se stavit, trenére." })
      .mockResolvedValueOnce({ body: "Stav se, ať to zapijem, máš čas?" });
    expect((await generateWithoutRepeats([], wrongAgain, "test", { address: "vy" })).body).toBe("Měl bys se stavit, trenére.");
    const said = ["Promiňte, že píšu tak pozdě, mám toho moc."];
    const repeats = vi.fn()
      .mockResolvedValueOnce({ body: "Měl bys se stavit, trenére." })
      .mockResolvedValueOnce({ body: "Promiňte, že píšu tak pozdě, mám toho moc." });
    expect((await generateWithoutRepeats(said, repeats, "test", { address: "vy" })).body).toBe("Měl bys se stavit, trenére.");
  });

  it("předem napsaná varianta se stejným tvarem, jako hráč píše, dokud nějakou takovou ještě neposlal", () => {
    const variants = ["Díky, trenére, jste borec.", "Díky, trenére, jsi borec.", "Díky moc, trenére."];
    for (const seed of ["a", "b", "c", "d"]) {
      expect(pickFreshVariant(variants, [], seed, { address: "ty" }).index).not.toBe(0);
      expect(pickFreshVariant(variants, [], seed, { address: "vy" }).index).not.toBe(1);
    }
    // Obě vhodné už poslal: rozhoduje jen to, co poslal nejdávněji.
    expect(pickFreshVariant(variants, ["Díky, trenére, jsi borec.", "Díky moc, trenére."], "a", { address: "ty" }).index).toBe(0);
  });
});

// E2E 22. 11. (Hrdlička, historie VY): druhý pokus kvůli tvaru nestihl rozpočet a odešlo
// „Promiň, trenére“, „Seš krutej… Promiň“. Jednoznačné tvary na začátku a konci věty se opraví bez modelu.
describe("tvar oslovení bez času na druhý pokus", () => {
  it("bez rozpočtu opraví jednoznačné „Promiň“, „Seš“ a „víš?“ na začátku a konci věty", async () => {
    for (const [first, fixed] of [
      ["Jo, ukradl. Promiň, trenére. Vrátím to v pondělí už určitě.", "Jo, ukradl. Promiňte, trenére. Vrátím to v pondělí už určitě."],
      ["Jo, ukradl. Seš krutej, ale už je to pryč. Promiň, bylo to blbý.", "Jo, ukradl. Jste krutej, ale už je to pryč. Promiňte, bylo to blbý."],
      ["Jo, ukradl. Promiň, vrátím to.", "Jo, ukradl. Promiňte, vrátím to."],
      ["Bylo to blbý, víš?", "Bylo to blbý, víte?"],
    ] as const) {
      const gen = vi.fn(async () => ({ body: first }));
      expect((await generateWithoutRepeats([], gen, "test", { address: "vy", deadline: Date.now() + 2_000 })).body).toBe(fixed);
      expect(gen).toHaveBeenCalledTimes(1);
    }
    const informal = vi.fn(async () => ({ body: "Díky, že jste se stavil, trenére! Promiňte ten nepořádek." }));
    expect((await generateWithoutRepeats([], informal, "test", { address: "ty", deadline: Date.now() + 2_000 })).body)
      .toBe("Díky, že ses stavil, trenére! Promiň ten nepořádek.");
  });

  it("druhý pokus spadne: opraví se první text", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: "Jo, ukradl. Promiň, trenére." })
      .mockRejectedValueOnce(new GeminiUnavailableError("timeout"));
    expect((await generateWithoutRepeats([], gen, "test", { address: "vy" })).body).toBe("Jo, ukradl. Promiňte, trenére.");
  });

  it("když si oprava není jistá (tvar i uprostřed věty), zpráva zůstane, jak je", async () => {
    for (const body of ["Nevím, proč to vytahuješ teď.", "Promiň, ale máš pravdu.", "Měl bys se stavit, trenére."]) {
      const gen = vi.fn(async () => ({ body }));
      expect((await generateWithoutRepeats([], gen, "test", { address: "vy", deadline: Date.now() + 2_000 })).body).toBe(body);
    }
  });
});

// E2E 22. 11.: hlídač opakování mazal věcné odpovědi. Kovalčuk (Rohlík, casual_new_boots) na
// „A kolik tě stály a kde jsi je kupoval?“ odepsal cenu a obchod, věta se vzala jako opakování
// „Nu, trenér, podívej se, co jsem si koupil!“ (2 společná slova ze 3) a odešlo jen poděkování.
// Bohuslavovi frázový filtr vzal z kývnutí „zhubnu těch 3 kila“ a hra kývnutí nepoznala.
describe("věta s novou informací není opakování", () => {
  const BOOTS_BEFORE = [
    "Nu, trenér, podívej se, co jsem si koupil! Djakuju, že vždycky poradíš, ale teď chci jen ukázat nové kopačky 😊",
    "Nu, trenér, djakuju za odpověď! Teď už chci jen hrát v nich zítra proti Břevnovu 😊",
  ];
  const BOOTS_ANSWER = "Nu, trenér, kopačky mě stály 2500 korun, koupil jsem je v obchodě Sport Life.";
  const BOOTS_QUESTION = "A kolik tě stály a kde jsi je kupoval?";

  it("cena a obchod nejsou opakováním krátké věty „podívej se, co jsem si koupil“", () => {
    expect(sentencesRepeat(BOOTS_ANSWER, "Nu, trenér, podívej se, co jsem si koupil!")).toBe(false);
    expect(findRepeatedSentences(BOOTS_ANSWER, BOOTS_BEFORE, { coachMessage: BOOTS_QUESTION })).toEqual([]);
  });

  it("dlouhá nová věta s dvěma slovy z krátké staré věty opakováním není, krátká po dlouhé ano", () => {
    expect(sentencesRepeat("Těším se na zápas, kluci jsou připravení a hlavně v pohodě.", "Těším se na zápas!")).toBe(false);
    // Opačný směr: nová krátká věta opakuje myšlenku staré dlouhé (jako dřív).
    expect(sentencesRepeat(
      "Trenére, do dvou týdnů zhubnu těch 3 kila, to mám jasno.",
      "Řeknu ti to teda přímo, trenére: beru to opravdu vážně, do dvou týdnů zhubnu těch 3 kila, to mám jasno.",
    )).toBe(true);
  });

  it("odpověď na otázku, číslo, jméno nebo slib proti kratší obecné větě: nové", () => {
    // Bez nové informace by to opakování bylo (stejná slova, podobná délka).
    expect(sentencesRepeat("Kopačky stály hodně, koupil jsem nové.", "Podívej, koupil jsem nové kopačky!")).toBe(true);
    expect(sentencesRepeat("Kopačky stály hodně, koupil jsem nové.", "Podívej, koupil jsem nové kopačky!", "A kolik tě stály?")).toBe(false);
    expect(sentencesRepeat("Koupil jsem kopačky za 2500.", "Koupil jsem si kopačky!")).toBe(false);
    expect(sentencesRepeat("Koupil jsem kopačky v Decathlonu.", "Koupil jsem si kopačky!")).toBe(false);
    expect(sentencesRepeat("Do dvou týdnů to zhubnu, je to dost málo.", "Do dvou týdnů to je dost málo.")).toBe(false);
    expect(sentencesRepeat("Do dvou týdnů to je fakt dost málo.", "Do dvou týdnů to je dost málo.")).toBe(true);
  });

  it("odpověď s cenou odejde celá, i když druhý pokus spadne", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ body: `${BOOTS_ANSWER} Djakuju za zájem, těším se na zítřejší zápas 😊` })
      .mockRejectedValueOnce(new GeminiUnavailableError("timeout"));
    const out = await generateWithoutRepeats(BOOTS_BEFORE, gen, "test", { coachMessage: BOOTS_QUESTION, deadline: Date.now() + 20_000 });
    expect(out.body).toContain("2500 korun");
    expect(out.body).toContain("Sport Life");
  });

  it("frázový filtr nevezme z kývnutí klauzuli se slibem a číslem (Bohuslav)", () => {
    const own = [
      "Trenére, tys mi dal 1000 Kč, když zhubnu 3 kila, ne?",
      "Těch 3 kila dám dolů, 1000 Kč se mi hodí",
      "Beru to vážně, do 6. 12. 1000 Kč se mi hodí",
    ];
    expect(withoutRepeatedPhrases("Trenére, zhubnu těch 3 kila, mám to pod kontrolou.", own))
      .toBe("Trenére, zhubnu těch 3 kila, mám to pod kontrolou.");
    // Výplň bez slibu a čísel se dál škrtá.
    expect(withoutRepeatedPhrases("Trenére, mám se dobře, díky za otázku! Dneska jsem si užíval víkend 😅", ["Trenére, nic moc nedělám, jen si užívám víkend 😅"]))
      .toBe("Mám se dobře!");
  });
});
