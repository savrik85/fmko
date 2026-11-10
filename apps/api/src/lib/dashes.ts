/**
 * Společný čistič dlouhých pomlček (— a –).
 *
 * V textech pro hráče být nesmějí. Modely je ale píšou rády a čistič dřív měly jen
 * Socky a chat se sponzorem, takže ve Zpravodaji a v SMS od hráčů zůstávaly. Tenhle
 * běží na výstupu každého volání modelu (`lib/ai-provider`, `news/gemini-helper`,
 * `ai-coach/llm`), tedy dřív, než se text uloží do `news` nebo jako zpráva.
 *
 * Podle kontextu:
 *  - mezi čísly (skóre, rozsah, roky) je to spojovník: „3–1“ → „3-1“,
 *  - na začátku řádku (odrážka, uvozovací pomlčka) zmizí,
 *  - hned po interpunkci zmizí taky, čárka by se zdvojila,
 *  - mezi slovy s mezerami je to vsuvka, tedy čárka: „přišel — a vyhrál“ → „přišel, a vyhrál“,
 *  - bez mezer mezi slovy zůstane spojovník: „Sparta–Slavia“ → „Sparta-Slavia“.
 */

const DASH = "[—–―]";
const HAS_DASH = new RegExp(DASH);
const BETWEEN_DIGITS = new RegExp(`(\\d)[ \\t]*${DASH}[ \\t]*(?=\\d)`, "g");
const LINE_START = new RegExp(`^([ \\t]*)${DASH}[ \\t]*`, "gm");
const AFTER_PUNCTUATION = new RegExp(`([,;:.!?…])[ \\t]*${DASH}[ \\t]*`, "g");
const LINE_END = new RegExp(`[ \\t]*${DASH}[ \\t]*$`, "gm");
const BETWEEN_WORDS = new RegExp(`[ \\t]+${DASH}[ \\t]+`, "g");
const ANY = new RegExp(DASH, "g");

export function cleanDashes(text: string): string {
  if (!HAS_DASH.test(text)) return text;
  return text
    .replace(BETWEEN_DIGITS, "$1-")
    .replace(LINE_START, "$1")
    .replace(AFTER_PUNCTUATION, "$1 ")
    .replace(LINE_END, "")
    .replace(BETWEEN_WORDS, ", ")
    .replace(ANY, "-")
    .replace(/[ \t]+$/gm, "");
}

/** Totéž pro odpověď modelu jako objekt: projde všechny textové hodnoty, klíče nechá. */
export function cleanDashesDeep<T>(value: T): T {
  if (typeof value === "string") return cleanDashes(value) as T;
  if (Array.isArray(value)) return value.map((v) => cleanDashesDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = cleanDashesDeep(v);
    return out as T;
  }
  return value;
}
