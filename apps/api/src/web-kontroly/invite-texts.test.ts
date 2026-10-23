import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Pozvánka a sdílení jsou texty pro hráče: česky s diakritikou, bez dlouhé pomlčky
 * a bez angličtiny. Pozvánka kamarádovi chodila bez háčků a čárek
 * („te vyzyva", „Pridej se do okresniho preboru … ukaz mi, kdo je tu lepsi trener!").
 */

const WEB = fileURLToPath(new URL("../../../web/src/", import.meta.url));

const FILES = [
  "app/(hra)/pozvat/page.tsx",
  "app/pozvanka/[teamId]/page.tsx",
  "app/pozvanka/[teamId]/client.tsx",
  "app/pozvanka/[teamId]/opengraph-image.tsx",
  "app/klub/[teamId]/ShareButton.tsx",
];

/** Slova pozvánky, jak vypadají bez diakritiky (správně tě, vyzývá, přidej, okresního…). */
const WITHOUT_DIACRITICS = [
  "te", "vyzyva", "pridej", "okresniho", "preboru", "ukaz", "lepsi", "trener", "posli", "kamaradovi", "kamarad",
  "uvidi", "tvuj", "tym", "tymu", "vyzvou", "vyzvu", "muze", "zalozit", "zaloz", "ucet", "tvem", "zkopirovano",
  "kopirovat", "sdilet", "pres", "zapasu", "prida", "neplatny", "zpet", "hlavni", "stranku", "pozvanka", "prijmi",
  "vyzvy", "zavazku",
];

/** Zdroj bez adres, cest a komentářů: zbude kód a texty, které hráč uvidí. */
function visibleText(source: string): string {
  return source
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1 ")
    .replace(/\/[\w[\]${}().-]+(?:\/[\w[\]${}().-]+)*/g, " ");
}

function wordsWithoutDiacritics(text: string): string[] {
  return WITHOUT_DIACRITICS.filter((word) => new RegExp(`(?<![\\p{L}\\d_])${word}(?![\\p{L}\\d_])`, "iu").test(text));
}

describe("texty pozvánky a sdílení", () => {
  for (const file of FILES) {
    it(`${file}: česky s diakritikou, bez dlouhé pomlčky a bez angličtiny`, () => {
      const text = visibleText(readFileSync(`${WEB}${file}`, "utf8"));
      expect(wordsWithoutDiacritics(text)).toEqual([]);
      expect(text).not.toMatch(/—|\\u2014/);
      expect(text).not.toMatch(/\bfeedback\b/i);
    });
  }

  it("kontrola pozná text bez diakritiky i v řetězci", () => {
    expect(wordsWithoutDiacritics(visibleText('title: `${teamName} te vyzyva! | Prales`'))).toEqual(["te", "vyzyva"]);
    expect(wordsWithoutDiacritics(visibleText("text: `Přidej se do okresního přeboru a ukaž mi, kdo je tu lepší trenér!`"))).toEqual([]);
    // Cesta v odkazu není text pro hráče.
    expect(wordsWithoutDiacritics(visibleText("const inviteUrl = `${origin}/pozvanka/${teamId}`;"))).toEqual([]);
  });
});
