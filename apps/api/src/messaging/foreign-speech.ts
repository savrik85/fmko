/**
 * Jak píšou hráči cizinci (2026-10-18, přání uživatele: „všichni cizinci lámanou češtinou“).
 *
 * Dvě cesty, kudy hráč píše:
 *  - AI chat (1:1 i Kabina): `foreignSpeechRule` dá do promptu pokyn podle národnosti;
 *  - šablony (omluvenky, Kabina u nabídek, SMS): `brokenCzech` přepíše hotový český text.
 *
 * Slovák píše slovensky (s českými slovy, jak to v Česku bývá), ostatní lámanou češtinou:
 * slovesa v infinitivu („já zítra nepřijít“), bez ř/ě/ů, občas slovo z rodného jazyka.
 * Text musí zůstat srozumitelný: přepisuje se jen pár častých slov, ne celá gramatika.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { NATIONALITIES } from "../data/nationalities";

/** Je hráč cizinec, který píše jinak než česky? */
export function writesForeign(nationality: string | null | undefined): boolean {
  return !!nationality && nationality !== "CZ" && NATIONALITIES.some((n) => n.code === nationality);
}

/** Slova z rodného jazyka, která model smí vložit (a převodník šablon přidá na začátek). */
const NATIVE_WORDS: Record<string, { hint: string; openers: string[]; closers: string[] }> = {
  DE: { hint: "ja, genau, na ja, danke, Scheiße", openers: ["Ja, ", "Na ja, "], closers: [" Danke.", ""] },
  AT: { hint: "ja, servus, passt, danke, oida", openers: ["Servus, ", "Ja, "], closers: [" Passt.", ""] },
  PL: { hint: "tak, no, dzięki, kurczę", openers: ["No, ", "Kurczę, "], closers: [" Dzięki.", ""] },
  UA: { hint: "tak, nu, djakuju, bože", openers: ["Nu, ", "Bože, "], closers: [" Djakuju.", ""] },
  HU: { hint: "igen, jó, hát, köszönöm", openers: ["Hát, ", "Jó, "], closers: [" Köszönöm.", ""] },
  HR: { hint: "da, bok, hvala, ajme", openers: ["Bok, ", "Ajme, "], closers: [" Hvala.", ""] },
  RO: { hint: "da, bine, mersi, hai", openers: ["Bine, ", "Hai, "], closers: [" Mersi.", ""] },
  VN: { hint: "", openers: [], closers: [] },
};

/** Pokyn do promptu AI: jak hráč píše. `null` = Čech, pravidla zůstávají. */
export function foreignSpeechRule(nationality: string | null | undefined): string | null {
  if (!writesForeign(nationality)) return null;
  if (nationality === "SK") {
    return "JAZYK: Jsi Slovák, v Česku žiješ, ale píšeš SLOVENSKY (hovorově, občas ti vklouzne české slovo). Trenéra oslovuj „tréner“. Žádné vysvětlování, že jsi Slovák.";
  }
  const label = NATIONALITIES.find((n) => n.code === nationality)?.label ?? "ciziny";
  const words = NATIVE_WORDS[nationality as string]?.hint;
  const vietnam = nationality === "VN"
    ? " Píšeš úplně bez diakritiky a velmi krátké věty, skoro bez skloňování."
    : " Nepíšeš háčky nad ř, ě a ů.";
  return [
    `JAZYK: Jsi cizinec (${label}), v Česku žiješ pár let a česky píšeš LÁMANĚ: pleteš pády a rody,`,
    "slovesa často dáš do infinitivu („já zítra nepřijít“, „trenér, já mít problém“), trenéra oslovuješ „trenér“ (bez 5. pádu).",
    vietnam,
    words ? ` Občas vložíš slovo z rodného jazyka (${words}).` : "",
    " Pořád musí být jasné, co chceš říct. Lámaná čeština platí i místo pravidla o oslovení „trenére“.",
  ].join("");
}

type Swap = [string, string];

/** Lámaná čeština: časté tvary sloves a frází nahradí infinitiv s „já“. */
const BROKEN_SWAPS: Swap[] = [
  ["omlouvám se", "promiňte"], ["omlouvám", "promiňte"],
  ["nepřijdu", "já nepřijít"], ["přijdu", "já přijít"], ["nedorazím", "já nepřijít"], ["dorazím", "já přijít"],
  ["nemůžu", "já nemoct"], ["můžu", "já moct"], ["nebudu", "já nebýt"], ["budu", "já být"],
  ["nemám", "já nemít"], ["mám", "já mít"], ["musím", "já muset"], ["nechci", "já nechtít"], ["chci", "já chtít"],
  ["nevím", "já nevědět"], ["vím", "já vědět"], ["jdu", "já jít"], ["děkuju", "děkovat"], ["děkuji", "děkovat"],
  ["jsem", "já"], ["trenére", "trenér"],
];

/** Slovenština: nejčastější slova ze šablon. Zbytek zůstane česky (v Česku běžná směs). */
const SLOVAK_SWAPS: Swap[] = [
  ["omlouvám se", "ospravedlňujem sa"], ["trenére", "tréner"], ["nejsem", "nie som"], ["jsem", "som"], ["jsi", "si"],
  ["není", "nie je"], ["nemůžu", "nemôžem"], ["můžu", "môžem"], ["nepřijdu", "neprídem"], ["přijdu", "prídem"],
  ["nedorazím", "neprídem"], ["dorazím", "prídem"], ["nebudu", "nebudem"], ["budu", "budem"], ["nechci", "nechcem"],
  ["chci", "chcem"], ["nevím", "neviem"], ["vím", "viem"], ["dneska", "dnes"], ["zítra", "zajtra"], ["teď", "teraz"],
  ["taky", "tiež"], ["kluci", "chalani"], ["kluky", "chalanov"], ["děkuju", "ďakujem"], ["děkuji", "ďakujem"],
  ["prostě", "proste"], ["ještě", "ešte"], ["proč", "prečo"], ["když", "keď"], ["co", "čo"], ["jo", "hej"],
  ["moc", "veľmi"], ["hrát", "hrať"], ["jet", "ísť"], ["práci", "robote"], ["práce", "robota"], ["holka", "baba"],
];

const NOT_LETTER = "(?<![\\p{L}])";
const NOT_LETTER_AFTER = "(?![\\p{L}])";

function swapWords(text: string, swaps: Swap[]): string {
  let out = text;
  for (const [from, to] of swaps) {
    out = out.replace(new RegExp(`${NOT_LETTER}${from}${NOT_LETTER_AFTER}`, "giu"), (m) =>
      m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to);
  }
  return out;
}

const STRIP_DIACRITICS = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Přepíše český text šablony do řeči cizince. Deterministické: stejný `seed` dá stejný text.
 * U Čecha (nebo neznámé národnosti) vrací text beze změny.
 */
export function brokenCzech(text: string, nationality: string | null | undefined, seed: string): string {
  if (!writesForeign(nationality) || !text) return text;
  if (nationality === "SK") return swapWords(text, SLOVAK_SWAPS).replace(/ř/g, "r").replace(/Ř/g, "R").replace(/ů/g, "u").replace(/ě/g, "e");

  let out = swapWords(text, BROKEN_SWAPS)
    // „já já“ po dvou náhradách vedle sebe, „Já já“ na začátku věty.
    .replace(/(?<![\p{L}])([Jj]á) já(?![\p{L}])/gu, "$1");
  if (nationality === "DE" || nationality === "AT") out = out.replace(/(?<![\p{L}])[Tt]renér(?![\p{L}])/gu, "Trainer");
  if (nationality === "PL") {
    out = out.replace(/ř/g, "rz").replace(/Ř/g, "Rz").replace(/č/g, "cz").replace(/Č/g, "Cz").replace(/š/g, "sz").replace(/Š/g, "Sz");
  }
  out = nationality === "VN"
    ? STRIP_DIACRITICS(out)
    : out.replace(/ř/g, "r").replace(/Ř/g, "R").replace(/ě/g, "e").replace(/ů/g, "u");

  const native = NATIVE_WORDS[nationality as string];
  const rng = createRng(seedFromString(`foreign|${seed}`));
  // Úvodní slovíčko jen před běžným slovem s velkým písmenem (ne před emoji ani „Trainer“).
  if (native && native.openers.length > 0 && rng.random() < 0.4 && /^\p{Lu}\p{Ll}/u.test(out) && !out.startsWith("Trainer")) {
    out = rng.pick(native.openers) + out[0].toLowerCase() + out.slice(1);
  }
  if (native && native.closers.length > 0 && rng.random() < 0.3) {
    const closer = rng.pick(native.closers);
    if (closer) {
      const trimmed = out.replace(/\s*$/, "");
      out = (/[.!?…\p{Extended_Pictographic}]$/u.test(trimmed) ? trimmed : `${trimmed}.`) + closer;
    }
  }
  return out;
}
