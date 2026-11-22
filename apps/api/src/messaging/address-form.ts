/**
 * Tyká hráč trenérovi, nebo mu vyká? Tvar se bere z toho, jak hráč trenérovi doposud psal
 * (převažující tvar v jeho SMS), a odpověď modelu se proti němu kontroluje.
 *
 * E2E 22. 11.: tvar se dřív odvozoval jen z věku a id hráče a model ho v promptu dostal jako
 * pokyn bez kontroly. Král (pokyn TY, v historii vykal) napsal „A vy, trenére?“, Mráz (pokyn VY,
 * do 18. 11. vykal) začal tykat. Pokyn proti historii tvar přepínal, místo aby ho držel.
 *
 * Detektor je záměrně jednoduchý: zájmena a slovesa 2. osoby (jsi, máš, promiň / jste, máte,
 * promiňte) a koncovky -š a -te. Bez vnořených kvantifikátorů, text je od modelu.
 */

import { logger } from "../lib/logger";

export type CoachAddress = "ty" | "vy";

const M = "address-form";

/** Z kolika posledních zpráv hráče v konverzaci s trenérem se tvar bere. */
export const ADDRESS_HISTORY_LIMIT = 40;

/** Slova, která sama znamenají vykání (s diakritikou i bez, opilý píše bez háčků). */
const VY_WORDS = new Set([
  "jste", "byste", "vy", "vás", "vas", "vám", "vam", "vámi", "vami", "váš", "vaše", "vase", "vašeho", "vaseho", "vašemu", "vasemu",
  "vaším", "vasim", "vaši", "vasi", "vašich", "vasich",
  "máte", "mate", "budete", "můžete", "muzete", "víte", "vite", "chcete", "myslíte", "myslite", "děláte", "delate",
  "jdete", "půjdete", "pujdete", "přijdete", "prijdete", "dáte", "prominte", "nezlobte",
  "držte", "drzte", "mějte", "mejte", "buďte", "budte", "nechte", "vemte", "berte", "zkuste", "věřte", "verte", "stavte",
  "napište", "napiste",
]);

/** Slova, která sama znamenají tykání. „ty“ a „ti“ ne: „ty dresy“, „ti kluci“ (samotné „ty“ viz `TY_ALONE_RE`). */
const TY_WORDS = new Set([
  "jsi", "seš", "ses", "sis", "bys", "máš", "mas", "budeš", "budes", "můžeš", "muzes", "víš", "chceš", "chces", "myslíš", "myslis",
  "tebe", "tobě", "tobe", "tebou", "tvůj", "tvuj", "tvoje", "tvoji", "tvý", "tvýho", "tvyho", "tvého", "tvému", "tvým", "tvá", "tvé",
  "tě", "promiň", "promin", "řekni", "rekni", "napiš", "pošli", "posli", "přijď", "prijd", "pojď", "pojd", "počkej", "pockej",
  "podívej", "podivej",
]);

/** „A ty, trenére?“, „Co ty na to?“: samotné „ty“ před interpunkcí, na konci nebo před oslovením. */
const TY_ALONE_RE = /(?:^|[^\p{L}])ty(?:\s*[,?!.…]|\s*$|\s+(?:trenére|trenere|na to|taky|sám|sam)(?![\p{L}]))/giu;

/** Slova končící na -š nebo -ls, která 2. osobou nejsou (jména, „náš“, „spíš“). */
const NOT_TY_SUFFIX = new Set(["náš", "váš", "spíš", "příliš", "lukáš", "tomáš", "matyáš", "mikuláš", "aleš", "guláš"]);

/** Koncovky 2. osoby čísla množného (máte, víte, jdete, promiňte, pojďte). */
const VY_SUFFIXES = ["áte", "íte", "ete", "ěte", "ejte", "ňte", "ďte", "ťte"] as const;
/** Koncovky 2. osoby čísla jednotného (děláš, víš, přijdeš, těšíš) a minulého času („říkals“). */
const TY_SUFFIXES = ["áš", "íš", "eš", "ěš", "ls"] as const;

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

/** Počty znaků tykání a vykání ve zprávě. */
export function addressMarkers(text: string): { ty: number; vy: number } {
  let ty = text.match(TY_ALONE_RE)?.length ?? 0;
  let vy = 0;
  for (const w of wordsOf(text)) {
    if (VY_WORDS.has(w)) vy++;
    else if (TY_WORDS.has(w)) ty++;
    else if (w.length >= 4 && VY_SUFFIXES.some((s) => w.endsWith(s))) vy++;
    else if (w.length >= 3 && !NOT_TY_SUFFIX.has(w) && TY_SUFFIXES.some((s) => w.endsWith(s))) ty++;
  }
  return { ty, vy };
}

/** Tvar oslovení v jedné zprávě, nebo null (nepozná se, nebo je ho v ní stejně). */
export function addressFormOf(text: string): CoachAddress | null {
  const m = addressMarkers(text);
  if (m.ty === m.vy) return null;
  return m.ty > m.vy ? "ty" : "vy";
}

/** Převažující tvar v hráčových zprávách, nebo null (žádná zpráva ho neukáže, nebo remíza). */
export function historyAddressForm(lines: readonly string[]): CoachAddress | null {
  let ty = 0;
  let vy = 0;
  for (const line of lines) {
    const f = addressFormOf(line);
    if (f === "ty") ty++;
    else if (f === "vy") vy++;
  }
  if (ty === vy) return null;
  return ty > vy ? "ty" : "vy";
}

/** Model napsal opačný tvar, než hráč trenérovi píše (zpráva bez tvaru je v pořádku). */
export function wrongAddress(body: string, expected: CoachAddress | undefined): boolean {
  if (!expected) return false;
  const f = addressFormOf(body);
  return f !== null && f !== expected;
}

// ─── Oprava bez modelu ───────────────────────────────────────────────────────
//
// E2E 22. 11. (Hrdlička, historie VY): přegenerování kvůli tvaru často nestihlo rozpočet a odešlo
// „Promiň, trenére“ nebo „Seš krutej… Promiň“. Nejčastější jednoznačné tvary na začátku klauzule
// a na konci věty jdou vyměnit bez rizika pro gramatiku; když ve zprávě zůstane opačný tvar
// i jinde, oprava se nedělá vůbec (radši celá zpráva v jednom tvaru než napůl).

type Swap = readonly [from: string, to: string];

/** Začátek věty nebo klauzule (za čárkou). Delší dřív: „díky, že ses“ před „díky, že jsi“. */
const START_TO_FORMAL: readonly Swap[] = [
  ["díky, že ses", "díky, že jste se"], ["díky, že sis", "díky, že jste si"], ["díky, že jsi", "díky, že jste"],
  ["nezlob se", "nezlobte se"], ["promiň", "promiňte"], ["víš", "víte"], ["seš", "jste"], ["jsi", "jste"],
];
const START_TO_INFORMAL: readonly Swap[] = [
  ["díky, že jste se", "díky, že ses"], ["díky, že jste si", "díky, že sis"], ["díky, že jste", "díky, že jsi"],
  ["nezlobte se", "nezlob se"], ["promiňte", "promiň"], ["víte", "víš"], ["jste", "jsi"],
];
/** Poslední slovo věty: „…, víš?“, „…, chápeš?“ jen před otazníkem, „…, promiň.“ kdekoli. */
const END_TO_FORMAL: readonly Swap[] = [["víš", "víte"], ["chápeš", "chápete"], ["promiň", "promiňte"]];
const END_TO_INFORMAL: readonly Swap[] = [["víte", "víš"], ["chápete", "chápeš"], ["promiňte", "promiň"]];
const QUESTION_TAGS = new Set(["víš", "víte", "chápeš", "chápete"]);
const LETTER_RE = /\p{L}/u;
const SENTENCE_END_CHARS = new Set([".", "!", "?", "…", " "]);

function withCase(original: string, replacement: string): string {
  const first = original.charAt(0);
  return first !== first.toLowerCase() ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

/** Vymění tvar na začátku klauzulí věty (začátek a za „, “). */
function swapClauseStarts(sentence: string, swaps: readonly Swap[]): string {
  let out = "";
  let i = 0;
  let clauseStart = true;
  while (i < sentence.length) {
    if (clauseStart && sentence[i] !== " ") {
      const rest = sentence.slice(i).toLowerCase();
      const hit = swaps.find(([from]) => rest.startsWith(from) && !LETTER_RE.test(rest.charAt(from.length)));
      clauseStart = false;
      if (hit) {
        out += withCase(sentence.slice(i, i + hit[0].length), hit[1]);
        i += hit[0].length;
        continue;
      }
    }
    if (sentence[i] === "," && sentence[i + 1] === " ") clauseStart = true;
    out += sentence[i];
    i++;
  }
  return out;
}

/** Vymění poslední slovo věty (za mezerou nebo čárkou), u „víš?“ jen před otazníkem. */
function swapSentenceEnd(sentence: string, swaps: readonly Swap[]): string {
  let end = sentence.length;
  while (end > 0 && SENTENCE_END_CHARS.has(sentence[end - 1])) end--;
  const core = sentence.slice(0, end);
  const tail = sentence.slice(end);
  const lower = core.toLowerCase();
  const hit = swaps.find(([from]) => lower.endsWith(from) && lower.length > from.length
    && (lower[lower.length - from.length - 1] === " " || lower[lower.length - from.length - 1] === ",")
    && (!QUESTION_TAGS.has(from) || tail.includes("?")));
  if (!hit) return sentence;
  const at = core.length - hit[0].length;
  return `${core.slice(0, at)}${withCase(core.slice(at), hit[1])}${tail}`;
}

/**
 * Zpráva s tvarem oslovení `expected`, opravená bez modelu, nebo null: opravit nebylo co, nebo
 * by v ní opačný tvar zůstal i jinde (tvar uprostřed věty se nemění, to by mohlo rozbít shodu).
 */
export function fixAddressForm(body: string, expected: CoachAddress): string | null {
  const starts = expected === "vy" ? START_TO_FORMAL : START_TO_INFORMAL;
  const ends = expected === "vy" ? END_TO_FORMAL : END_TO_INFORMAL;
  // Věty i s mezerami mezi nimi (lichá místa pole), ať se text složí přesně zpátky.
  const parts = body.split(/((?<=[.!?…])\s+|\n+)/u);
  const out = parts.map((part, i) => (i % 2 === 1 || !part ? part : swapSentenceEnd(swapClauseStarts(part, starts), ends))).join("");
  if (out === body) return null;
  const wrong = expected === "vy" ? "ty" : "vy";
  return addressMarkers(out)[wrong] === 0 ? out : null;
}

/** Pokyn k druhému pokusu, když model tvar oslovení nedodržel. */
export function addressRetryRule(expected: CoachAddress): string {
  return expected === "vy"
    ? "POZOR: trenérovi VYKÁŠ, ve zprávě jsi mu tykal. Napiš ji znovu s vykáním („vy“, „jste“, „máte“, „promiňte“)."
    : "POZOR: trenérovi TYKÁŠ, ve zprávě jsi mu vykal. Napiš ji znovu s tykáním („ty“, „jsi“, „máš“, „promiň“).";
}

/**
 * Tvar oslovení z posledních `ADDRESS_HISTORY_LIMIT` zpráv hráče v jeho konverzaci s trenérem
 * (`convId`, nebo dohledaná podle týmu). Null, když z historie nevyplývá; pak rozhodne věk a id
 * (ai-player-chat.ts `coachAddressForm`).
 */
export async function loadCoachAddress(
  db: D1Database, o: { playerId: string; convId?: string | null; teamId?: string },
): Promise<CoachAddress | null> {
  try {
    const { loadOwnRecentLines } = await import("./repetition");
    return historyAddressForm(await loadOwnRecentLines(db, { ...o, limit: ADDRESS_HISTORY_LIMIT }));
  } catch (e) {
    logger.warn({ module: M }, `tvar oslovení hráče ${o.playerId}`, e);
    return null;
  }
}
