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
    `JAZYK: Jsi cizinec (${label}), v Česku žiješ pár let a česky píšeš LÁMANĚ: pleteš pády a rody, `,
    "slovesa často dáš do infinitivu („já zítra nepřijít“, „trenér, já mít problém“), trenéra oslovuješ „trenér“ (bez 5. pádu).",
    vietnam,
    words ? ` Občas vložíš slovo z rodného jazyka (${words}).` : "",
    " Pořád musí být jasné, co chceš říct. Lámaná čeština platí i místo pravidla o oslovení „trenére“.",
  ].join("");
}

type Swap = [string, string];

/** Lámaná čeština: časté tvary sloves a frází nahradí infinitiv s „já“. */
const BROKEN_SWAPS: Swap[] = [
  ["omlouvám se", "promiňte"], ["omlouvám", "promiňte"], ["těším se", "já těšit"],
  ["slíbil jsem", "já slíbit"], ["byl jsem", "já být"], ["měl jsem", "já mít"], ["jsem měl", "já mít"], ["jsem byl", "já být"],
  ["nepřijdu", "já nepřijít"], ["přijdu", "já přijít"], ["nedorazím", "já nepřijít"], ["dorazím", "já přijít"],
  ["nemůžu", "já nemoct"], ["můžu", "já moct"], ["nebudu", "já nebýt"], ["budu", "já být"],
  ["nemám", "já nemít"], ["mám", "já mít"], ["musím", "já muset"], ["nechci", "já nechtít"], ["chci", "já chtít"],
  ["nevím", "já nevědět"], ["vím", "já vědět"], ["nejdu", "já nejít"], ["jdu", "já jít"], ["nejedu", "já nejet"], ["jedu", "já jet"],
  ["sedím", "já sedět"], ["hlídám", "já hlídat"], ["zvažuju", "já zvažovat"], ["musíme", "my muset"], ["můžeme", "my moct"],
  ["děkuju", "děkovat"], ["děkuji", "děkovat"], ["jsem", "já"], ["trenére", "trenér"],
];

/** Slovenština: nejčastější slova ze šablon. Zbytek zůstane česky (v Česku běžná směs). */
const SLOVAK_SWAPS: Swap[] = [
  // Delší fráze dřív než jednotlivá slova („se mnou“ před „se“, „v práci“ před „práci“).
  ["omlouvám se", "ospravedlňujem sa"], ["těším se", "teším sa"], ["se mnou", "so mnou"],
  ["z práce", "z roboty"], ["v práci", "v robote"], ["do práce", "do roboty"], ["práci", "robote"], ["práce", "robota"],
  ["trenére", "tréner"], ["nejsem", "nie som"], ["jsem", "som"], ["jsi", "si"], ["jste", "ste"], ["není", "nie je"],
  ["nemůžu", "nemôžem"], ["můžu", "môžem"], ["nemůže", "nemôže"], ["nepřijdu", "neprídem"], ["přijdu", "prídem"],
  ["nedorazím", "neprídem"], ["dorazím", "prídem"], ["nebudu", "nebudem"], ["budu", "budem"], ["nechci", "nechcem"],
  ["chci", "chcem"], ["chtějí", "chcú"], ["nevím", "neviem"], ["vím", "viem"], ["bych", "by som"], ["byl", "bol"], ["byla", "bola"],
  ["měl", "mal"], ["být", "byť"], ["jít", "ísť"], ["jet", "ísť"], ["hrát", "hrať"], ["trénovat", "trénovať"], ["odvézt", "odviezť"],
  ["lhát", "klamať"], ["snil", "sníval"], ["sliboval", "sľuboval"], ["slíbil", "sľúbil"], ["zvažuju", "zvažujem"],
  ["říkali", "hovorili"], ["říkáte", "hovoríte"], ["nabízí", "ponúka"], ["nabízejí", "ponúkajú"], ["nabídka", "ponuka"], ["nabídku", "ponuku"],
  ["hledají", "hľadajú"], ["pozici", "pozíciu"], ["rozhodnutí", "rozhodnutie"], ["upřímně", "úprimne"],
  ["počítejte", "počítajte"], ["nepočítej", "nepočítaj"], ["počítej", "počítaj"],
  ["dneska", "dnes"], ["zítra", "zajtra"], ["zítřka", "zajtra"], ["teď", "teraz"], ["taky", "tiež"], ["vždycky", "vždy"],
  ["kluci", "chalani"], ["kluky", "chalanov"], ["děkuju", "ďakujem"], ["děkuji", "ďakujem"], ["bohužel", "bohužiaľ"],
  ["svatbu", "svadbu"], ["svatba", "svadba"], ["babičku", "babku"], ["rodičů", "rodičov"], ["deště", "dažďa"], ["dešti", "daždi"],
  ["sestavě", "zostave"], ["sestavu", "zostavu"], ["sestavy", "zostavy"], ["místě", "mieste"], ["místo", "miesto"],
  ["hospodě", "krčme"], ["hospoda", "krčma"], ["špatnej", "zlý"], ["špatný", "zlý"], ["špatně", "zle"], ["den", "deň"],
  ["tohle", "toto"], ["tomhle", "tomto"], ["tuhle", "túto"], ["jinak", "inak"], ["jiná", "iná"], ["jiný", "iný"], ["víc", "viac"],
  ["prostě", "proste"], ["ještě", "ešte"], ["proč", "prečo"], ["když", "keď"], ["co", "čo"], ["jak", "ako"], ["kdo", "kto"],
  ["kdy", "kedy"], ["nic", "nič"], ["všechno", "všetko"], ["tady", "tu"], ["hodně", "veľa"], ["moc", "veľmi"], ["jo", "hej"],
  ["ano", "áno"], ["prej", "vraj"], ["mě", "ma"], ["mně", "mne"], ["já", "ja"], ["se", "sa"], ["holka", "baba"], ["rovnou", "rovno"],
  ["jedu", "idem"], ["nejedu", "nejdem"], ["pro", "pre"], ["vrací", "vracia"],
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
    // „já já“ po dvou náhradách vedle sebe, „Já já“ na začátku věty, „já zase já sedět“.
    .replace(/(?<![\p{L}])([Jj]á) já(?![\p{L}])/gu, "$1")
    .replace(/(?<![\p{L}])([Jj]á) (\p{L}+) já(?![\p{L}])/gu, "$1 $2");
  if (nationality === "DE" || nationality === "AT") out = out.replace(/(?<![\p{L}])[Tt]renér(?![\p{L}])/gu, "Trainer");
  if (nationality === "PL") {
    out = out.replace(/ř/g, "rz").replace(/Ř/g, "Rz").replace(/č/g, "cz").replace(/Č/g, "Cz").replace(/š/g, "sz").replace(/Š/g, "Sz");
  }
  out = nationality === "VN"
    ? STRIP_DIACRITICS(out)
    : out.replace(/ř/g, "r").replace(/Ř/g, "R").replace(/ě/g, "e").replace(/ů/g, "u");

  const native = NATIVE_WORDS[nationality as string];
  const rng = createRng(seedFromString(`foreign|${seed}`));
  // Úvodní slovíčko jen před běžným slovem s velkým písmenem (ne před emoji, „Trainer“
  // ani citoslovcem: „Jó, jo, já fit“ zní jako koktání).
  const firstWord = out.split(/[^\p{L}]/u)[0].toLowerCase();
  if (native && native.openers.length > 0 && rng.random() < 0.4 && /^\p{Lu}\p{Ll}/u.test(out)
    && !["trainer", "jo", "no", "ano", "jasne", "jasně", "sorry", "ja", "tak", "nu", "bože"].includes(firstWord)) {
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

/**
 * Romský hráč (čeština je jeho rodný jazyk) a jestli mluví i romsky (2026-10-18, přání
 * uživatele: autenticky, ne parodie). Romsky neumí každý Rom, proto jen polovina, pevně
 * podle jména (bez losu z rng, aby se neposunuly ostatní hody generátoru).
 */
export function speaksRomani(identity: { firstName: string; lastName: string; nationality?: string | null; ethnicity?: string | null }): boolean {
  if (identity.ethnicity !== "brown" || (identity.nationality ?? "CZ") !== "CZ") return false;
  return seedFromString(`romani|${identity.firstName} ${identity.lastName}`) % 2 === 0;
}

/**
 * Pokyn do promptu pro hráče, který mluví i romsky: normální hovorová čeština jako u ostatních,
 * jen občas skutečné romské oslovení nebo slovo. Žádná zkomolená čeština, přízvuk ani stereotypy.
 */
export function romaniSpeechRule(romani: boolean | undefined): string | null {
  if (!romani) return null;
  return [
    "JAZYK: Jsi Rom z Česka, píšeš normální hovorovou češtinou jako ostatní kluci z týmu.",
    " Občas (ne v každé zprávě) použiješ romské oslovení nebo slovo: more (kámo), phrala (brácho), čhavale (kluci),",
    " šukar (pěkný), lačho (dobrý), O Devla (bože), paľikerav (děkuju), sar san? (jak je?).",
    " Nic dalšího si nepřidávej: žádnou zkomolenou češtinu, přízvuk ani stereotypy.",
  ].join("");
}
