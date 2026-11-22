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
import { tooSimilar } from "./match-speech";

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

/** Oslovení trenéra: je skoro v každé větě, o opakování nic neříká. */
const ADDRESS_WORDS = new Set(["trenere", "trenerko", "sefe"]);
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

/** Jedna z ohraných vět, které hráči píšou pořád dokola (`STOCK_SENTENCE_RE`). */
export function isStockSentence(sentence: string): boolean {
  return STOCK_SENTENCE_RE.test(plainSentence(sentence));
}

/** Pravidlo do promptu proti ohraným větám. */
export const STOCK_PHRASES_RULE =
  "- Ohrané věty, které píše každý, nepoužívej: „Už mám po šichtě“, „Už mám padla“, „Tak to je super, trenére“, „Tak to je jiná“. Řekni to po svém.";

/** Věty zprávy (konec věty, nový řádek). Emoji zůstávají u své věty. */
export function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Je věta `a` opakováním věty `b`? Stejná věta (bez oslovení, aspoň tři slova), nebo shoda
 * významových slov podle `tooSimilar` (aspoň 60 % kratší věty a aspoň dvě slova). Krátké
 * „Díky.“ nebo „Jasně, dorazím.“ se za opakování nepočítají, ty k řeči patří.
 */
export function sentencesRepeat(a: string, b: string): boolean {
  const pa = plainSentence(a);
  if (pa.split(" ").length >= 3 && pa === plainSentence(b)) return true;
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.length < 2 || wb.length < 2) return false;
  return tooSimilar(wa.join(" "), wb.join(" "));
}

/**
 * Věty nové zprávy, které hráč už napsal (stejně nebo skoro stejně) v některé z `previous`,
 * a ohrané věty, které píše každý (`isStockSentence`).
 */
export function findRepeatedSentences(body: string, previous: readonly string[]): string[] {
  const old = previous.flatMap(splitSentences);
  return splitSentences(body).filter((s) => isStockSentence(s) || old.some((o) => sentencesRepeat(s, o)));
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
 * Opakuje text (některou svou větou) jednu z předchozích zpráv? Pro předem napsané varianty:
 * proti `sentencesRepeat` se počítá i krátká stejná věta („Beru to, trenére.“), u šablony
 * je to pořád tatáž věta. Ohrané věty se tu nepočítají.
 */
export function repeatsAny(text: string, previous: readonly string[]): boolean {
  const own = splitSentences(text);
  return previous.some((p) => {
    const old = splitSentences(p);
    const oldPlain = new Set(old.map(plainSentence));
    return own.some((s) => {
      const plain = plainSentence(s);
      return (plain.split(" ").length >= 2 && oldPlain.has(plain)) || old.some((o) => sentencesRepeat(s, o));
    });
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
 * posledními zprávami (`previous`, nejstarší první) stejně jako odpověď modelu
 * (`sentencesRepeat`), takže se pozná i šablona, kterou cizinec dostal lámaně. Když už
 * poslal všechny, vezme se ta, kterou poslal nejdávněji.
 */
export function pickFreshVariant(
  variants: readonly string[], previous: readonly string[], seed: string,
): { text: string; index: number } {
  if (variants.length === 0) throw new Error("pickFreshVariant: prázdný seznam variant");
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
  ].join("\n");
}

/** Pokyn k druhému pokusu: konkrétní věty, které model napsal znovu. */
export function repeatRetryRule(repeated: readonly string[]): string {
  return `POZOR: tohle jsi trenérovi už napsal a znovu to nepoužij ani podobně: ${repeated.map(quote).join(", ")}. Napiš zprávu jinými slovy.`;
}

/**
 * Text hráče bez opakování. Když první pokus opakuje dřívější větu (nebo ohranou větu), model zkusí ještě
 * jednou s výslovně zakázanou větou (nejvýš jedno přegenerování kvůli latenci a kvótě).
 * Když opakuje i potom, opakovaná věta se vyškrtne, pokud zbytek dává smysl; jinak
 * zpráva zůstane, jak je, a zaloguje se.
 */
export async function generateWithoutRepeats<T extends { body: string }>(
  previous: readonly string[] | undefined,
  generate: (retryRule: string) => Promise<T>,
  where: string,
): Promise<T> {
  previous = previous ?? [];
  const first = await generate("");
  const repeated = findRepeatedSentences(first.body, previous);
  if (repeated.length === 0) return first;

  let best = first;
  let bestRepeated = repeated;
  try {
    const second = await generate(repeatRetryRule(repeated));
    const again = findRepeatedSentences(second.body, previous);
    if (again.length === 0) return second;
    if (again.length <= repeated.length) {
      best = second;
      bestRepeated = again;
    }
  } catch (e) {
    logger.warn({ module: M }, `druhý pokus bez opakování selhal (${where})`, e);
  }
  const trimmed = withoutSentences(best.body, bestRepeated);
  if (trimmed) {
    logger.info({ module: M }, `vyškrtnuto opakování (${where}): ${bestRepeated.join(" | ")}`);
    return { ...best, body: trimmed };
  }
  logger.warn({ module: M }, `hráč opakuje větu a bez ní by ze zprávy nic nezbylo, nechávám (${where}): ${bestRepeated.join(" | ")}`);
  return best;
}

/**
 * Posledních `OWN_LINES_LIMIT` (nebo `limit`) zpráv hráče v jeho konverzaci s trenérem, nejstarší první.
 * Bez `convId` se konverzace dohledá podle týmu a hráče (úvodní zpráva, zpráva jen tak).
 * Selhání nic neblokuje: prázdný seznam.
 */
export async function loadOwnRecentLines(
  db: D1Database, o: { playerId: string; convId?: string | null; teamId?: string; limit?: number },
): Promise<string[]> {
  const convId = o.convId ?? (o.teamId
    ? (await db.prepare(
      "SELECT id FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ? ORDER BY created_at, rowid LIMIT 1",
    ).bind(o.teamId, o.playerId).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: M }, `konverzace hráče ${o.playerId}`, e); return null; }))?.id
    : undefined);
  if (!convId) return [];
  const rows = await db.prepare(
    `SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player' AND sender_id = ?
        AND TRIM(COALESCE(body, '')) != ''
      ORDER BY sent_at DESC LIMIT ?`,
  ).bind(convId, o.playerId, o.limit ?? OWN_LINES_LIMIT).all<{ body: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `poslední zprávy hráče ${o.playerId}`, e); return null; });
  return (rows?.results ?? []).map((r) => (r.body ?? "").trim()).filter(Boolean).reverse();
}
