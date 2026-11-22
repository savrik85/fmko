/**
 * Ať hráč v SMS neopakuje sám sebe.
 *
 * Historie do promptu je jen pár posledních zpráv a obecné „neopakuj se“ model přecházel:
 * „Už mám po šichtě, trenére.“ napsalo 43 hráčů (skoro třetina odložených odpovědí),
 * „No potěš koště… Teď si mě vychutná žena.“ hráč opsal ze své zprávy z předchozího dne
 * (prod 9–11/2026). Proto dvě pojistky: v promptu konkrétní seznam vět, které hráč trenérovi
 * už poslal, a po vygenerování kontrola vět odpovědi proti nim (`findRepeatedSentences`).
 *
 * Čisté funkce bez modelu; načtení vět z DB je `loadOwnRecentLines`.
 */

import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { RETRY_MIN_MS, remainingMs } from "../lib/time-budget";
import { tooSimilar } from "./match-speech";
import { GeminiUnavailableError } from "./model-errors";
import { addressRetryRule, fixAddressForm, wrongAddress, type CoachAddress } from "./address-form";

const M = "repetition";

/** Kolik posledních vlastních zpráv hráče se hlídá (i starších, než je okno historie). */
export const OWN_LINES_LIMIT = 8;
/**
 * U předem napsaných variant se kouká dál do minulosti: šablona po odmítnuté nabídce přišla
 * jednomu trenérovi pětkrát za dva měsíce (conv f14c5721, prod 9–11/2026).
 */
export const TEMPLATE_HISTORY_LIMIT = 40;
/** Jedna zpráva v seznamu do promptu nejvýš takhle dlouhá. */
const LINE_MAX_CHARS = 200;

/**
 * Oslovení trenéra: je skoro v každé větě, o opakování nic neříká. „Trenér“ v 1. pádě oslovuje
 * hráč s lámanou češtinou („Nu, trenér, …“, Kovalčuk, E2E 22. 11.).
 */
const ADDRESS_WORDS = new Set(["trenere", "trenerko", "sefe", "trener"]);
/** Výplňová slova, která sama o shodě vět nerozhodují. */
const FILLER_WORDS = new Set([
  "diky", "fakt", "takze", "jako", "proste", "jsem", "jste", "neni", "bude", "tady", "teda", "tohle", "toho",
  "taky", "kdyz", "protoze", "nebo", "jeste", "uplne", "vubec", "porad", "furt", "nejak", "mozna",
]);

/** Slova malými písmeny bez diakritiky. */
function plainWords(text: string): string[] {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
}

/** Věta bez oslovení a interpunkce: „Už mám po šichtě, trenére!“ → „uz mam po sichte“. */
function plainSentence(text: string): string {
  return plainWords(text).filter((w) => !ADDRESS_WORDS.has(w)).join(" ");
}

/** Slova, podle kterých se pozná stejná myšlenka: delší než tři znaky, bez oslovení a výplně. */
function significantWords(text: string): string[] {
  return [...new Set(plainWords(text).filter((w) => w.length > 3 && !ADDRESS_WORDS.has(w) && !FILLER_WORDS.has(w)))];
}

/**
 * Ohrané věty, které píše skoro každý hráč: „Už mám po šichtě, trenére.“ (43 hráčů, hlavně
 * úvod odložené odpovědi), „Už mám padla“, „Tak to je super, trenére!“ (35), „Tak to je jiná“
 * (29). Celá věta bez oslovení, takže „Tak to je super, že jsi to vyřešil“ projde.
 */
const STOCK_SENTENCE_RE = /^(?:no |tak )*(?:uz mam (?:po sichte|padla|klid)(?: klid)?|uz jsem po sichte|to je (?:super|jina)(?: rec)?)$/;

/**
 * Ohraný začátek věty: „No tak to je jiná, trenére, díky moc“ (31× po dohodě s nespokojeným,
 * i dvě minuty po hádce). „To je jiná liga než my“ ohrané není.
 */
const STOCK_OPENER_RE = /^(?:no )?tak to je jina\b/;

/** Jedna z ohraných vět, které hráči píšou pořád dokola (`STOCK_SENTENCE_RE`, `STOCK_OPENER_RE`). */
export function isStockSentence(sentence: string): boolean {
  const plain = plainSentence(sentence);
  return STOCK_SENTENCE_RE.test(plain) || STOCK_OPENER_RE.test(plain);
}

/** Pravidlo do promptu proti ohraným větám. */
export const STOCK_PHRASES_RULE =
  "- Ohrané věty, které píše každý, nepoužívej: „Už mám po šichtě“, „Už mám padla“, „Tak to je super, trenére“, „Tak to je jiná“, „Díky za otázku“. Řekni to po svém.";

/** Věty zprávy (konec věty, nový řádek). Emoji zůstávají u své věty. */
export function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Slib nebo kývnutí („zhubnu“, „vrátím“, „zaplatím“, „přijdu“, „beru“, „platí“, „jdu do toho“),
 * bez diakritiky. Nese obsah: hra podle něj zapisuje dohody a sliby (coach-rules.ts).
 */
const COMMITMENT_RE = /\b(zhubnu|shodim|vratim|zaplatim|nahradim|opravim|prijdu|dorazim|prijedu|beru|plati|slibuju|slibuji|udelam|jdu do toho|dam (to|je|ty|dolu))\b/;
/** Nová delší věta je opakováním kratší staré jen s tolika společnými významovými slovy. */
const LONGER_MIN_COMMON = 3;

/** Začátky slov (`ECHO_STEM_CHARS`) jako množina. */
function stemSet(words: readonly string[]): Set<string> {
  return new Set(words.map((w) => w.slice(0, ECHO_STEM_CHARS)));
}

/** Jména uprostřed věty („Sport Life“, „Břevnovu“) bez diakritiky, bez oslovení. */
function namesIn(sentence: string): string[] {
  return sentence.split(/\s+/).slice(1)
    .filter((w) => /^[„"(]?\p{Lu}\p{Ll}/u.test(w))
    .flatMap(plainWords)
    .filter((w) => !ADDRESS_WORDS.has(w));
}

/**
 * Nese věta `a` proti `b` novou informaci: číslo, jméno, slib nebo kývnutí, nebo slovo
 * z otázky trenéra (`coachMessage`, odpověď na ni), které `b` nemá?
 */
function addsInformation(a: string, b: string, coachMessage?: string): boolean {
  const wordsB = new Set(plainWords(b));
  if (plainWords(a).some((w) => /\d/.test(w) && !wordsB.has(w))) return true;
  const stemsB = stemSet(plainWords(b));
  if (namesIn(a).some((w) => !stemsB.has(w.slice(0, ECHO_STEM_CHARS)))) return true;
  const plainA = plainWords(a).join(" ");
  if (COMMITMENT_RE.test(plainA) && !COMMITMENT_RE.test(plainWords(b).join(" "))) return true;
  if (!coachMessage?.includes("?")) return false;
  const asked = stemSet(significantWords(coachMessage));
  return [...stemSet(significantWords(a))].some((w) => asked.has(w) && !stemsB.has(w));
}

/**
 * Je věta `a` (nová) opakováním věty `b` (dřívější)? Stejná věta (bez oslovení, aspoň tři
 * slova), nebo shoda významových slov podle `tooSimilar` (aspoň 60 % kratší věty a aspoň dvě
 * slova). Krátké „Díky.“ nebo „Jasně, dorazím.“ se za opakování nepočítají, ty k řeči patří.
 *
 * Nová věta delší než stará opakováním není, když s ní má jen dvě společná slova a je o víc
 * než slovo delší, nebo když nese novou informaci (`addsInformation`). Kovalčuk (E2E 22. 11.):
 * „kopačky mě stály 2500 korun, koupil jsem je v obchodě Sport Life“ na otázku, kolik stály,
 * se vzalo jako opakování „podívej se, co jsem si koupil!“ a odpověď se vyškrtla.
 */
export function sentencesRepeat(a: string, b: string, coachMessage?: string): boolean {
  const pa = plainSentence(a);
  if (pa.split(" ").length >= 3 && pa === plainSentence(b)) return true;
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.length < 2 || wb.length < 2) return false;
  if (!tooSimilar(wa.join(" "), wb.join(" "))) return false;
  if (wa.length <= wb.length) return true;
  const common = wa.filter((w) => wb.includes(w)).length;
  if (wa.length > wb.length + 1 && common < LONGER_MIN_COMMON) return false;
  return !addsInformation(a, b, coachMessage);
}

/** Starší vlastní zprávy se porovnávají jen s dlouhými větami (`LONG_SENTENCE_WORDS`). */
export const RECENT_LINES_MS = 48 * 3600_000;
/** Věta s tolika významovými slovy nese obsah: opakuje se, i když ji hráč napsal před týdnem. */
const LONG_SENTENCE_WORDS = 4;
/** Odpověď, která jen vrací slova z trenérovy otázky, smí mít nejvýš tolik významových slov. */
const ECHO_MAX_WORDS = 3;
/** Slova z otázky trenéra se porovnávají podle začátku („dorazíš“ a „dorazím“ jsou totéž). */
const ECHO_STEM_CHARS = 5;

/**
 * Vlastní zprávy hráče a kdy je poslal (`sentAt`, ISO, stejné pořadí). Bez časů se všechny
 * berou jako čerstvé. `loadOwnRecentLines` časy přidává, kopie pole (`[...lines]`) o ně přijde.
 */
export type OwnLines = string[] & { sentAt?: string[] };

function stems(words: readonly string[]): string[] {
  return words.map((w) => w.slice(0, ECHO_STEM_CHARS));
}

/**
 * Krátká věcná odpověď na přímou otázku trenéra, která jen vrací jeho slova: „Dorazíš v úterý?“
 * → „V úterý dorazím, trenére.“ To není opakování, i když to hráč napsal už dřív (Šmíd, E2E 22. 11.:
 * hlídač odpověď zahodil kvůli „…v úterý dorazím a máknu“ z 19. 11. a hráč 56 minut mlčel).
 */
export function echoesCoach(sentence: string, coachMessage: string | undefined): boolean {
  if (!coachMessage) return false;
  const own = significantWords(sentence);
  if (own.length === 0 || own.length > ECHO_MAX_WORDS) return false;
  const coach = new Set(stems(significantWords(coachMessage)));
  return stems(own).every((w) => coach.has(w));
}

/**
 * Věty nové zprávy, které hráč už napsal (stejně nebo skoro stejně) v některé z `previous`,
 * a ohrané věty, které píše každý (`isStockSentence`). `old`: starší zprávy (víc než
 * `RECENT_LINES_MS`), proti nim se hlídají jen dlouhé věty. Krátká odpověď, která vrací slova
 * z trenérovy zprávy (`coachMessage`, `echoesCoach`), opakováním není.
 */
export function findRepeatedSentences(
  body: string, previous: readonly string[], opts: { old?: readonly string[]; coachMessage?: string } = {},
): string[] {
  const recent = previous.flatMap(splitSentences);
  const old = (opts.old ?? []).flatMap(splitSentences);
  return splitSentences(body).filter((s) => {
    if (isStockSentence(s)) return true;
    if (echoesCoach(s, opts.coachMessage)) return false;
    if (recent.some((o) => sentencesRepeat(s, o, opts.coachMessage))) return true;
    return significantWords(s).length >= LONG_SENTENCE_WORDS && old.some((o) => sentencesRepeat(s, o, opts.coachMessage));
  });
}

/** Je věta doslova (bez oslovení a interpunkce, aspoň tři slova) jedna z vět `lines`? */
function literalRepeat(sentence: string, lines: readonly string[]): boolean {
  const p = plainSentence(sentence);
  return p.split(" ").length >= 3 && lines.flatMap(splitSentences).some((o) => plainSentence(o) === p);
}

/** Vlastní zprávy rozdělené na čerstvé a starší než `RECENT_LINES_MS` (podle `sentAt`). */
function splitByAge(lines: readonly string[] & { sentAt?: readonly string[] }, now: number): { recent: string[]; old: string[] } {
  const recent: string[] = [];
  const old: string[] = [];
  lines.forEach((line, i) => {
    const at = Date.parse(lines.sentAt?.[i] ?? "");
    (Number.isFinite(at) && now - at > RECENT_LINES_MS ? old : recent).push(line);
  });
  return { recent, old };
}

// ─── Krátké fráze a úvody ────────────────────────────────────────────────────
//
// Lokální E2E 22. 11.: „jen si užívám víkend 😅“ a hned další zpráva „Dneska jsem si užíval
// víkend 😅“, „díky za otázku“ 5× za dopoledne u tří hráčů, 33 z 80 zpráv začínalo „Trenére,“
// (Bartoš 7 ze 7). Hlídání vět to nechytí: fráze je kratší než věta a úvod je jen oslovení.
// Škrtá se bez dalšího volání modelu (rozpočet), a jen když zbytek dává smysl.

/** Fráze se porovnává podle začátku slov, ať „užívám“ a „užíval“ vyjdou stejně. */
const STEM_CHARS = 5;
/** Klauzule s opakovanou frází se škrtne, jen když je krátká (výplň), delší nese obsah. */
const PHRASE_CLAUSE_MAX_WORDS = 6;
/** Fráze se hlídá proti tolika posledním vlastním zprávám, úvod proti dvěma. */
const PHRASE_LOOKBACK = 3;
const OPENER_LOOKBACK = 2;

/** Ohraná klauzule, kterou píše skoro každý: „díky za otázku“. */
const STOCK_CLAUSE_RE = /^(?:a |no )?(?:diky|dik|dekuju|dekuji) (?:moc )?za (?:otazku|optani|zeptani|dotaz)$/;

/** Citoslovce a souhlas na začátku zprávy: dvakrát po sobě se škrtnou, slovo s významem („Nevím, …“) ne. */
const INTERJECTION_OPENERS = new Set([
  "jo", "joo", "jj", "jojo", "jasne", "jasny", "jasan", "jasnacka", "no", "no jo", "no tak", "no jasne", "tak", "tak jo", "hele",
  "dobre", "dobra", "dobry", "super", "ok", "okej", "oki", "diky", "dik", "dekuju", "fajn", "v pohode", "pohoda", "ty jo", "aha",
  "hm", "hmm", "cau", "ahoj", "zdar", "nazdar", "cus", "jo jasne", "jasne ze jo",
]);

/** Oslovení na začátku zprávy i s interpunkcí za ním: „Trenére, …“, „Šéfe!“, opile „trenere vole…“. */
const ADDRESS_OPENER_RE = /^\s*(?:tren[eé]r(?:e|ko)|[sš][eé]fe)(?![\p{L}])[\s,!.?…:;-]*/iu;
/** Jeden znak konce věty: mezera, interpunkce, emoji (i barva pleti, variační znak a spojovač). */
const TAIL_CHAR_RE = /^[\s.!?…\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]$/u;
/** Delší věta se po klauzulích nekontroluje (SMS má nejvýš 280 znaků, tohle je pojistka). */
const PHRASE_SENTENCE_MAX_CHARS = 500;

/**
 * Věta rozdělená na obsah a konec (interpunkce a emoji). Hledá se průchodem od konce po znacích,
 * ne regulárním výrazem: vnořené kvantifikátory na řadě emoji před písmenem backtrackovaly
 * exponenciálně (25 emoji = 1,7 s) a ve Workeru by přetekl limit CPU.
 */
export function sentenceTail(sentence: string): { core: string; tail: string } {
  const chars = Array.from(sentence);
  let i = chars.length;
  while (i > 0 && TAIL_CHAR_RE.test(chars[i - 1])) i--;
  return { core: chars.slice(0, i).join(""), tail: chars.slice(i).join("") };
}

/** Slova bez oslovení. */
function wordsWithoutAddress(text: string): string[] {
  return plainWords(text).filter((w) => !ADDRESS_WORDS.has(w));
}

/** Začíná zpráva oslovením trenéra? */
export function opensWithAddress(text: string): boolean {
  const first = plainWords(text)[0];
  return first !== undefined && ADDRESS_WORDS.has(first);
}

/**
 * Trojice slov po sobě (podle začátku slov), které nesou frázi: aspoň dvě delší slova
 * a jedno z nich ne výplňové. „si užívám víkend“, „díky za otázku“; „mám se dobře“ ne.
 */
function phraseKeys(text: string): string[] {
  const words = wordsWithoutAddress(text);
  const keys: string[] = [];
  for (let i = 0; i + 3 <= words.length; i++) {
    const t = words.slice(i, i + 3);
    const long = t.filter((w) => w.length >= 4);
    if (long.length < 2 || !long.some((w) => !FILLER_WORDS.has(w))) continue;
    keys.push(t.map((w) => w.slice(0, STEM_CHARS)).join(" "));
  }
  return keys;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Dává zbytek smysl (aspoň tři slova a jedno významové)? */
function meaningful(text: string): boolean {
  return significantWords(text).length >= 1 && plainWords(text).length >= 3;
}

/** První klauzule zprávy bez oslovení („Jasný trenére, …“ → „jasny“). */
function openerKey(text: string): string {
  const clause = text.trim().split(/[,.!?…\n]/)[0] ?? "";
  return wordsWithoutAddress(clause).join(" ");
}

/** Zpráva bez první klauzule (a oslovení hned za ní). */
function withoutOpenerClause(text: string): string {
  const rest = text.trim().replace(/^[^,.!?…\n]*[,.!?…]*\s*/u, "").replace(ADDRESS_OPENER_RE, "");
  return capitalize(rest);
}

/**
 * Zpráva bez opakované krátké fráze a bez úvodu, který měla i jedna ze dvou posledních zpráv
 * hráče (`own`, nejstarší první). Krátká klauzule (nejvýš šest slov), ve které je fráze z jedné
 * ze tří posledních zpráv, nebo ohrané „díky za otázku“ se vyškrtne. Klauzule s číslem, slibem
 * nebo kývnutím zůstane: Bohuslavovi (E2E 22. 11.) filtr vzal z kývnutí „zhubnu těch 3 kila“
 * a hra dohodu nepoznala. Oslovení „Trenére,“ na začátku smí být, ale nejvýš v jedné ze tří
 * zpráv po sobě; stejné citoslovce na začátku („Jasný trenére, …“) taky ne dvakrát po sobě.
 * Když by zbytek nedával smysl, zpráva zůstane.
 */
export function withoutRepeatedPhrases(body: string, own: readonly string[]): string {
  const seen = new Set(own.slice(-PHRASE_LOOKBACK).flatMap(phraseKeys));
  const droppable = (clause: string) => {
    const words = wordsWithoutAddress(clause);
    if (STOCK_CLAUSE_RE.test(words.join(" "))) return true;
    if (words.some((w) => /\d/.test(w)) || COMMITMENT_RE.test(words.join(" "))) return false;
    return words.length <= PHRASE_CLAUSE_MAX_WORDS && phraseKeys(clause).some((k) => seen.has(k));
  };
  const addressOnly = (clause: string) => plainWords(clause).length > 0 && wordsWithoutAddress(clause).length === 0;

  let changed = false;
  const kept: string[] = [];
  for (const sentence of splitSentences(body)) {
    if (sentence.length > PHRASE_SENTENCE_MAX_CHARS) { kept.push(sentence); continue; }
    const { core, tail } = sentenceTail(sentence);
    const clauses = core.split(/,\s+/);
    const keep = clauses.filter((c) => !droppable(c));
    if (keep.length === clauses.length) { kept.push(sentence); continue; }
    changed = true;
    if (keep.every(addressOnly)) continue;
    // Emoji patří k vyškrtnuté klauzuli („…užíval víkend 😅“), interpunkce zůstane.
    const end = keep[keep.length - 1] === clauses[clauses.length - 1] ? tail : tail.replace(/[^.!?…]/gu, "");
    const text = `${keep.join(", ")}${end}`.trim();
    kept.push(keep[0] === clauses[0] ? text : capitalize(text));
  }
  let text = changed ? kept.join(" ") : body;

  const recent = own.slice(-OPENER_LOOKBACK);
  if (opensWithAddress(text)) {
    if (recent.some(opensWithAddress)) {
      const rest = capitalize(text.replace(ADDRESS_OPENER_RE, ""));
      if (meaningful(rest)) text = rest;
    }
  } else {
    const opener = openerKey(text);
    if (INTERJECTION_OPENERS.has(opener) && recent.some((p) => openerKey(p) === opener)) {
      const rest = withoutOpenerClause(text);
      if (meaningful(rest)) text = rest;
    }
  }
  return text === body || meaningful(text) ? text : body;
}

/**
 * Zpráva bez opakovaných vět. `null`, když by zbytek nedával smysl: nezbude nic, nebo
 * jen krátké citoslovce bez jediného významového slova („Jo.“, „😅“).
 */
export function withoutSentences(body: string, drop: readonly string[]): string | null {
  const dropped = new Set(drop);
  const rest = splitSentences(body).filter((s) => !dropped.has(s));
  if (rest.length === 0) return null;
  const text = rest.join(" ");
  return significantWords(text).length >= 1 && plainWords(text).length >= 3 ? text : null;
}

/**
 * Je věta předem napsané varianty tatáž jako věta dřív poslané zprávy? Šablona se opakuje
 * doslova (nanejvýš s jiným oslovením nebo lámaně), takže stačí přísnější shoda než u modelu:
 * stejná věta i krátká („Beru to, trenére.“), nebo aspoň tři společná významová slova
 * a tři čtvrtiny slov delší z vět. Volnější `sentencesRepeat` by za stejné bral i dvě různé
 * varianty se stejným klubem („{klub} mě chtěl…“) a variant by ubylo.
 */
function templateSentencesMatch(a: string, b: string): boolean {
  const pa = plainSentence(a);
  if (pa.split(" ").length >= 2 && pa === plainSentence(b)) return true;
  const wa = significantWords(a);
  const wb = new Set(significantWords(b));
  const common = wa.filter((w) => wb.has(w)).length;
  return common >= 3 && common / Math.max(wa.length, wb.size) >= 0.75;
}

/** Opakuje text (některou svou větou) jednu z předchozích zpráv? Pro předem napsané varianty. */
export function repeatsAny(text: string, previous: readonly string[]): boolean {
  const own = splitSentences(text);
  return previous.some((p) => {
    const old = splitSentences(p);
    return own.some((s) => old.some((o) => templateSentencesMatch(s, o)));
  });
}

/**
 * Index varianty, kterou hráč ještě nedostal (`used`), vybraný podle `seed`. Když dostal
 * všechny, vybírá se znovu ze všech. Stejný seed dá stejnou variantu.
 */
export function pickUnusedIndex(count: number, used: ReadonlySet<number>, seed: string): number {
  const all = Array.from({ length: count }, (_, i) => i);
  const fresh = all.filter((i) => !used.has(i));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[seedFromString(seed) % pool.length];
}

/**
 * Předem napsaná varianta, kterou hráč trenérovi ještě neposlal. Porovnává se s jeho
 * posledními zprávami (`previous`, nejstarší první) po větách (`repeatsAny`), takže se pozná
 * i šablona s jiným oslovením nebo bez diakritiky. Když už poslal všechny, vezme se ta,
 * kterou poslal nejdávněji.
 */
export function pickFreshVariant(
  variants: readonly string[], previous: readonly string[], seed: string,
  /**
   * Jak hráč trenérovi píše: varianty s opačným tvarem oslovení se vynechají, když mezi zbylými
   * je nějaká, kterou ještě neposlal. Jinak rozhoduje jen to, co už poslal (opakování je horší).
   */
  opts: { address?: CoachAddress | null } = {},
): { text: string; index: number } {
  if (variants.length === 0) throw new Error("pickFreshVariant: prázdný seznam variant");
  if (opts.address) {
    const address = opts.address;
    const fitting = variants.flatMap((v, i) => (wrongAddress(v, address) ? [] : [i]));
    if (fitting.length > 0 && fitting.length < variants.length && fitting.some((i) => !repeatsAny(variants[i], previous))) {
      const picked = pickFreshVariant(fitting.map((i) => variants[i]), previous, seed);
      return { text: picked.text, index: fitting[picked.index] };
    }
  }
  const lastUse = variants.map((v) => {
    for (let i = previous.length - 1; i >= 0; i--) if (repeatsAny(v, [previous[i]])) return i;
    return -1;
  });
  const fresh = new Set(lastUse.flatMap((u, i) => (u === -1 ? [i] : [])));
  if (fresh.size > 0) {
    const index = pickUnusedIndex(variants.length, new Set(variants.map((_, i) => i).filter((i) => !fresh.has(i))), seed);
    return { text: variants[index], index };
  }
  const oldest = Math.min(...lastUse);
  const used = new Set(lastUse.flatMap((u, i) => (u === oldest ? [] : [i])));
  const index = pickUnusedIndex(variants.length, used, seed);
  return { text: variants[index], index };
}

function quote(line: string): string {
  const oneLine = line.replace(/\s+/g, " ").trim();
  return `„${oneLine.length > LINE_MAX_CHARS ? `${oneLine.slice(0, LINE_MAX_CHARS - 1)}…` : oneLine}“`;
}

/** Blok do promptu: co už hráč trenérovi napsal. Prázdný seznam nepřidá nic. */
export function ownLinesPromptBlock(lines: readonly string[]): string {
  if (lines.length === 0) return "";
  return [
    "CO UŽ JSI TRENÉROVI NAPSAL (tyhle věty ani podobné znovu nepoužij, i začátek zprávy a obraty vymysli jinak):",
    ...lines.map((l) => `- ${quote(l)}`),
    // Oslovení na začátku smí být, ale ne v každé zprávě (withoutRepeatedPhrases ho jinak škrtne).
    ...(lines.slice(-OPENER_LOOKBACK).some(opensWithAddress)
      ? ["Nedávno jsi zprávu začal oslovením „Trenére“: tuhle nezačínej oslovením, začni rovnou k věci."]
      : []),
  ].join("\n");
}

/** Pokyn k druhému pokusu: konkrétní věty, které model napsal znovu. */
export function repeatRetryRule(repeated: readonly string[]): string {
  return `POZOR: tohle jsi trenérovi už napsal a znovu to nepoužij ani podobně: ${repeated.map(quote).join(", ")}. Napiš zprávu jinými slovy.`;
}

/**
 * Pokyn k druhému pokusu v kabině: větu napsal spoluhráč, ne hráč. „Tohle jsi už napsal“ model
 * u cizí věty nebere a napíše ji znovu (Rohde, E2E 22. 11.: druhý hlas se zahodil a kabina
 * vypadala jako rozhovor s jedním).
 */
export function teammateRetryRule(repeated: readonly string[]): string {
  return `POZOR: tohle už v kabině napsal spoluhráč: ${repeated.map(quote).join(", ")}. Nepiš to po něm ani podobně, napiš vlastní reakci jinými slovy.`;
}

/**
 * Text hráče bez opakování. Když první pokus opakuje dřívější větu (nebo ohranou větu), model zkusí ještě
 * jednou s výslovně zakázanou větou (nejvýš jedno přegenerování kvůli latenci a kvótě).
 * Když opakuje i potom, opakovaná věta se vyškrtne, pokud zbytek dává smysl; jinak hodí
 * `GeminiUnavailableError` (volající pošle předem napsanou variantu nebo odpoví později).
 *
 * `deadline` (lib/time-budget.ts): přegenerování jen s rezervou `RETRY_MIN_MS`. Práce na
 * pozadí končí po ~30 s a uříznutý druhý pokus by zahodil i hotový první text.
 */
export async function generateWithoutRepeats<T extends { body: string }>(
  previous: (readonly string[] & { sentAt?: readonly string[] }) | undefined,
  generate: (retryRule: string) => Promise<T>,
  where: string,
  /**
   * `others`: věty spoluhráčů z téhož vlákna (kabina). Hlídají se celé věty, úvody a fráze jen vlastní.
   * `address`: jak hráč trenérovi píše (address-form.ts). Text s opačným tvarem se jednou přegeneruje,
   * když zbývá čas; jinak (nebo když ani druhý pokus tvar nedodrží) se pošle a zaloguje.
   * `coachMessage`: na co hráč odpovídá. Krátká odpověď s jeho slovy se za opakování nepočítá.
   */
  opts: { deadline?: number; others?: readonly string[]; address?: CoachAddress; coachMessage?: string } = {},
): Promise<T> {
  const own = previous ?? [];
  const { recent, old } = splitByAge(own, Date.now());
  const fresh = [...recent, ...(opts.others ?? [])];
  const repeatsIn = (body: string) => findRepeatedSentences(body, fresh, { old, coachMessage: opts.coachMessage });
  // Krátké fráze a úvody se jen škrtají, kvůli nim se model znovu nevolá. Tvar oslovení, který
  // ani přegenerování neopravilo (nebylo na něj kdy), se zkusí opravit bez modelu (address-form.ts).
  const finish = (r: T): T => {
    let body = withoutRepeatedPhrases(r.body, own);
    if (opts.address && wrongAddress(body, opts.address)) {
      const fixed = fixAddressForm(body, opts.address);
      if (fixed) {
        logger.info({ module: M }, `tvar oslovení opraven bez modelu (${where}): ${body} → ${fixed}`);
        body = fixed;
      } else {
        logger.warn({ module: M }, `tvar oslovení nesedí a bez modelu opravit nejde, posílám (${where}): ${body}`);
      }
    }
    return body === r.body ? r : { ...r, body };
  };
  const first = await generate("");
  const repeated = repeatsIn(first.body);
  const firstWrongAddress = wrongAddress(first.body, opts.address);
  if (repeated.length === 0 && !firstWrongAddress) return finish(first);

  let best = first;
  let bestRepeated = repeated;
  if (remainingMs(opts.deadline) < RETRY_MIN_MS) {
    logger.info({ module: M }, `na přegenerování nezbývá čas (${where}), ${repeated.length > 0 ? "vyškrtávám rovnou" : "posílám s jiným tvarem oslovení"}`);
    if (repeated.length === 0) return finish(first);
  } else {
    try {
      // Které věty opakují jeho vlastní zprávy a které jen to, co napsal spoluhráč (kabina).
      const ownRepeats = findRepeatedSentences(first.body, recent, { old, coachMessage: opts.coachMessage });
      const teammateRepeats = repeated.filter((r) => !ownRepeats.includes(r));
      const rule = [
        ...(ownRepeats.length > 0 ? [repeatRetryRule(ownRepeats)] : []),
        ...(teammateRepeats.length > 0 ? [teammateRetryRule(teammateRepeats)] : []),
        ...(firstWrongAddress && opts.address ? [addressRetryRule(opts.address)] : []),
      ].join("\n");
      const second = await generate(rule);
      const again = repeatsIn(second.body);
      // Opakování je horší než špatný tvar oslovení: druhý pokus bez opakování vyhrává,
      // když první opakoval, nebo když tvar opravil.
      if (again.length === 0 && (repeated.length > 0 || !wrongAddress(second.body, opts.address))) return finish(second);
      if (repeated.length === 0) {
        logger.warn({ module: M }, `tvar oslovení nesedí ani po druhém pokusu (${where}), posílám první: ${first.body}`);
        return finish(first);
      }
      if (again.length <= repeated.length) {
        best = second;
        bestRepeated = again;
      }
    } catch (e) {
      logger.warn({ module: M }, `druhý pokus bez opakování selhal (${where})`, e);
      if (repeated.length === 0) return finish(first);
    }
  }
  const trimmed = withoutSentences(best.body, bestRepeated);
  if (trimmed) {
    logger.info({ module: M }, `vyškrtnuto opakování (${where}): ${bestRepeated.join(" | ")}`);
    return finish({ ...best, body: trimmed });
  }
  // Při pochybnosti zprávu nechat: podobná, ale ne stejná věta je menší chyba než hráč, který
  // pak hodinu mlčí (Šmíd, Král, Dvořák v E2E 22. 11.: 3 z 11 odložených odpovědí).
  if (!bestRepeated.some((r) => isStockSentence(r) || literalRepeat(r, fresh))) {
    logger.warn({ module: M }, `zpráva se podobá dřívější, bez ní by nic nezbylo, posílám ji (${where}): ${bestRepeated.join(" | ")}`);
    return finish(best);
  }
  // Doslovný duplikát ani ohraná věta neodejde (E2E 22. 11.: druhý pokus nestihl rozpočet a hráč
  // poslal tutéž větu jako před chvílí). Volající to bere jako nedostupný model: předem napsaná
  // varianta, nebo odpověď později (retry_reply), kdy má model čas na nový pokus.
  logger.warn({ module: M }, `hráč opakuje větu a bez ní by ze zprávy nic nezbylo, neposílám (${where}): ${bestRepeated.join(" | ")}`);
  throw new GeminiUnavailableError(`odpověď by jen opakovala, co hráč už napsal (${where})`);
}

/**
 * Posledních `OWN_LINES_LIMIT` (nebo `limit`) zpráv hráče v jeho konverzaci s trenérem, nejstarší první.
 * Bez `convId` se konverzace dohledá podle týmu a hráče (úvodní zpráva, zpráva jen tak).
 * Selhání nic neblokuje: prázdný seznam.
 */
export async function loadOwnRecentLines(
  db: D1Database, o: { playerId: string; convId?: string | null; teamId?: string; limit?: number },
): Promise<OwnLines> {
  const convId = o.convId ?? (o.teamId
    ? (await db.prepare(
      "SELECT id FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ? ORDER BY created_at, rowid LIMIT 1",
    ).bind(o.teamId, o.playerId).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: M }, `konverzace hráče ${o.playerId}`, e); return null; }))?.id
    : undefined);
  if (!convId) return [];
  const rows = await db.prepare(
    `SELECT body, sent_at FROM messages WHERE conversation_id = ? AND sender_type = 'player' AND sender_id = ?
        AND TRIM(COALESCE(body, '')) != ''
      ORDER BY sent_at DESC LIMIT ?`,
  ).bind(convId, o.playerId, o.limit ?? OWN_LINES_LIMIT).all<{ body: string | null; sent_at: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `poslední zprávy hráče ${o.playerId}`, e); return null; });
  return ownLinesOf(rows?.results ?? []);
}

/**
 * Řádky z DB (nejnovější první) → `OwnLines` nejstarší první, s časy odeslání. Časy jsou
 * neviditelná vlastnost pole: kdo s ním zachází jako se seznamem textů (prompt, porovnání), nic nepozná.
 */
function ownLinesOf(rows: ReadonlyArray<{ body: string | null; sent_at?: string | null }>): OwnLines {
  const kept = rows.map((r) => ({ body: (r.body ?? "").trim(), at: sentAtIso(r.sent_at) })).filter((r) => r.body).reverse();
  const lines: OwnLines = kept.map((r) => r.body);
  Object.defineProperty(lines, "sentAt", { value: kept.map((r) => r.at), enumerable: false });
  return lines;
}

/** Čas zprávy z D1 (ISO i „2026-11-21 18:02:11“) jako ISO, nečitelný jako prázdný řetězec. */
function sentAtIso(sentAt: string | null | undefined): string {
  if (!sentAt) return "";
  const ms = Date.parse(sentAt.includes("T") ? sentAt : `${sentAt.replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

/**
 * Posledních `limit` zpráv hráče napříč konverzacemi, nejstarší první: kabina (skupinový chat
 * `convIds`) i jeho konverzace 1:1 s trenérem (dohledá se podle `teamId`). V kabině hráč psal
 * pořád stejné hlášky, protože hlídání opakování tam nebylo (balík 1 ho měl jen v 1:1).
 */
export async function loadOwnLinesAcross(
  db: D1Database, o: { playerId: string; convIds: readonly string[]; teamId?: string; limit?: number },
): Promise<OwnLines> {
  const privateConv = o.teamId
    ? (await db.prepare(
      "SELECT id FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ? ORDER BY created_at, rowid LIMIT 1",
    ).bind(o.teamId, o.playerId).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: M }, `konverzace hráče ${o.playerId}`, e); return null; }))?.id
    : undefined;
  const convIds = [...new Set([...o.convIds, ...(privateConv ? [privateConv] : [])])];
  if (convIds.length === 0) return [];
  const rows = await db.prepare(
    `SELECT body, sent_at FROM messages WHERE conversation_id IN (${convIds.map(() => "?").join(", ")})
        AND sender_type = 'player' AND sender_id = ? AND TRIM(COALESCE(body, '')) != ''
      ORDER BY julianday(sent_at) DESC, rowid DESC LIMIT ?`,
  ).bind(...convIds, o.playerId, o.limit ?? OWN_LINES_LIMIT).all<{ body: string | null; sent_at: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `poslední zprávy hráče ${o.playerId} napříč konverzacemi`, e); return null; });
  return ownLinesOf(rows?.results ?? []);
}

/**
 * Co v kabině (`convId`) v posledních hodinách napsali spoluhráči (bez `playerId`), nejstarší
 * první. V E2E 22. 11. napsali dva hráči 9 s po sobě doslova „V neděli budu, trenére“: hlídalo
 * se jen to, co psal hráč sám. Selhání nic neblokuje: prázdný seznam.
 */
export async function loadTeammateLines(
  db: D1Database, o: { convId: string; playerId: string; limit?: number; since?: Date },
): Promise<string[]> {
  const since = o.since ?? new Date(Date.now() - TEAMMATE_LINES_HOURS * 3600_000);
  const rows = await db.prepare(
    `SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player' AND COALESCE(sender_id, '') != ?
        AND TRIM(COALESCE(body, '')) != '' AND julianday(sent_at) > julianday(?)
      ORDER BY julianday(sent_at) DESC, rowid DESC LIMIT ?`,
  ).bind(o.convId, o.playerId, since.toISOString(), o.limit ?? TEAMMATE_LINES_LIMIT).all<{ body: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `věty spoluhráčů v kabině ${o.convId}`, e); return null; });
  return (rows?.results ?? []).map((r) => (r.body ?? "").trim()).filter(Boolean).reverse();
}
/** Věty spoluhráčů v kabině: kolik posledních a jak staré. */
const TEAMMATE_LINES_LIMIT = 6;
const TEAMMATE_LINES_HOURS = 3;
