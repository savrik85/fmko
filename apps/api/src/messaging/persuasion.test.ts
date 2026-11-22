import { describe, expect, it } from "vitest";
import {
  PERSUADED_ATTEND_REPLIES, PERSUADED_SKIP_REPLIES, PERSUASION_FRESH_MS, contradictsPersuasion, isPersuasion, offersHelp, persuasionChance,
  persuasionFallback, persuasionFromLife, persuasionLine, persuasionRoll, replyStance,
} from "./persuasion";
import { addressFormOf } from "./address-form";

// Doslovné zprávy trenéra z přetestu 3 (22. 11.), Veselý s kocovinou a Filip s leností.
describe("pozná, že trenér hráče přemlouvá", () => {
  it.each([
    "Honzo, četl jsem to v kabině. Těžká hlava do zítřejšího večera přejde, zápas je až v šest. Bez tebe nemáme útok, fakt tě potřebuju. Dneska hodně vody a zítra přijď, jo?",
    "Chápu. Tak jinak: zítra v pět tě vyzvednu autem, začneš na lavičce a rozchodíš se. Do večera budeš v pohodě. Kluci na tebe čekaj. Tak co, přijdeš nakonec?",
    "Honzo, udělej to pro mě, prosím. Stačí mi jeden poločas, víc nechci. Domluvíme se?",
    "Honzo, vezmi malou v pondělí s sebou, Bohoušova žena ji na tribuně pohlídá, má tam i svoje děti. Potřebuju tě vepředu. Přijdeš?",
    "Chápu, ale fakt tě potřebuju, bez tebe tam vepředu nikoho nemáme. Malá může jet s námi, je o ni postaráno. Uděláš to pro kluky a přijdeš?",
    "Filipe, zítra tě v Hradčanech potřebuju. Přijď, jo?",
    "Šimone, změna plánu. Jirka se zranil, zítra tě v Hradčanech nakonec potřebuju. To volno beru zpátky, promiň. Přijdeš?",
  ])("přemlouvá: %s", (text) => {
    expect(isPersuasion(text)).toBe(true);
  });

  it.each([
    "Jak se máš?",
    "Prosím tě, kdo ukradl ty dresy?",
    "Díky za info, uzdrav se.",
    "Tak co, ukradl jsi ty dresy, nebo ne?",
  ])("nepřemlouvá: %s", (text) => {
    expect(isPersuasion(text)).toBe(false);
  });

  it("nabídnuté řešení (odvoz, hlídání) pozná", () => {
    expect(offersHelp("zítra v pět tě vyzvednu autem")).toBe(true);
    expect(offersHelp("Bohoušova žena ji na tribuně pohlídá")).toBe(true);
    expect(offersHelp("Přijď, jo?")).toBe(false);
  });
});

describe("šance a rozhodnutí", () => {
  it("lehký důvod snáz než práce, druhý pokus a nabídka šanci zvednou, strop 90 %", () => {
    expect(persuasionChance({ ease: 3, attempt: 1, offer: false })).toBeGreaterThan(persuasionChance({ ease: 0, attempt: 1, offer: false }));
    expect(persuasionChance({ ease: 2, attempt: 2, offer: false })).toBeGreaterThan(persuasionChance({ ease: 2, attempt: 1, offer: false }));
    expect(persuasionChance({ ease: 2, attempt: 1, offer: true })).toBeGreaterThan(persuasionChance({ ease: 2, attempt: 1, offer: false }));
    expect(persuasionChance({ ease: 3, attempt: 5, offer: true })).toBe(0.9);
  });

  it("los je deterministický: stejný hráč, věc a pokus = stejný výsledek", () => {
    expect(persuasionRoll("p1", "match:cal", 1)).toBe(persuasionRoll("p1", "match:cal", 1));
    expect(persuasionRoll("p1", "match:cal", 1)).not.toBe(persuasionRoll("p1", "match:cal", 2));
  });

  it("pevný pokyn pro model a jen čerstvé rozhodnutí", () => {
    const now = new Date("2026-11-22T15:00:00Z");
    const state = { key: "match:cal", event: "match", attempts: 1, decided: "attend", at: "2026-11-22T14:50:00Z", convId: "c" } as const;
    expect(persuasionLine(state)).toContain("Rozhodl ses: PŘIJDEŠ, řekni to jasně");
    expect(persuasionLine({ ...state, decided: "skip" })).toContain("NEPŘIJDEŠ, vymluv se po svém");
    expect(persuasionLine(state)).not.toContain("—");
    expect(persuasionFromLife({ persuasion: state }, now)).toEqual(state);
    expect(persuasionFromLife({ persuasion: state }, new Date(Date.parse(state.at) + PERSUASION_FRESH_MS + 1000))).toBeUndefined();
  });
});

// Přibyl (E2E 22. 11., final3 Chyba 4): rozhodnutí „přijde“, text „Nezvládnu ani poločas“.
describe("text odpovědi proti rozhodnutí hry", () => {
  it("pozná, co hráč píše: poslední zmínka rozhoduje, otázka a „příště“ se nepočítají", () => {
    expect(replyStance("Nezvládnu ani poločas, díky za nabídku 😔")).toBe("skip");
    expect(replyStance("Přijedu v pět, děkuju! 😊")).toBe("attend");
    expect(replyStance("Nakonec to klaplo, dorazím.")).toBe("attend");
    expect(replyStance("Celý zápas nezvládnu, ale přijdu.")).toBe("attend");
    expect(replyStance("Nemůžu se dočkat, budu tam!")).toBe("attend");
    expect(replyStance("Přijdu, ale nakonec to nestihnu.")).toBe("skip");
    expect(replyStance("Přijdu příště, teď to fakt nejde.")).toBeNull();
    expect(replyStance("A můžu přijít až na druhý poločas?")).toBeNull();
    expect(replyStance("Díky, trenére, vážím si toho 😊")).toBeNull();
  });

  it("rozpor: „přijde“ s „nezvládnu“, „nepřijde“ s jasným „přijdu“", () => {
    expect(contradictsPersuasion("Nezvládnu ani poločas, díky za nabídku 😔", "attend")).toBe(true);
    expect(contradictsPersuasion("Trenére, nemůžu, fakt to nejde.", "attend")).toBe(true);
    expect(contradictsPersuasion("Přijedu v pět, děkuju! 😊", "attend")).toBe(false);
    expect(contradictsPersuasion("Díky, trenére, vážím si toho 😊", "attend")).toBe(false);
    expect(contradictsPersuasion("Jasně, přijdu, trenére!", "skip")).toBe(true);
    expect(contradictsPersuasion("Asi přijdu, uvidíme.", "skip")).toBe(false);
    expect(contradictsPersuasion("Nechce se mi, fakt ne.", "skip")).toBe(false);
  });

  it("předem napsané věty: aspoň 8, různé, bez tvaru oslovení a podle rozhodnutí", () => {
    for (const [pool, stance] of [[PERSUADED_ATTEND_REPLIES, "attend"], [PERSUADED_SKIP_REPLIES, "skip"]] as const) {
      expect(pool.length).toBeGreaterThanOrEqual(8);
      expect(new Set(pool).size).toBe(pool.length);
      for (const t of pool) {
        expect(t, t).not.toContain("—");
        expect(addressFormOf(t), t).toBeNull();
        expect(contradictsPersuasion(t, stance), t).toBe(false);
        if (stance === "attend") expect(replyStance(t), t).toBe("attend");
      }
    }
  });

  it("věta navíc, kterou hráč trenérovi ještě neposlal", () => {
    const p = { decided: "attend", key: "match:cal", attempts: 1 } as const;
    const first = persuasionFallback(p, "p-pribyl", [], "ty");
    expect(persuasionFallback(p, "p-pribyl", [], "ty")).toBe(first);
    const sent: string[] = [];
    for (let i = 0; i < PERSUADED_ATTEND_REPLIES.length; i++) sent.push(persuasionFallback(p, "p-pribyl", sent, "ty"));
    expect(new Set(sent).size).toBe(PERSUADED_ATTEND_REPLIES.length);
  });
});
