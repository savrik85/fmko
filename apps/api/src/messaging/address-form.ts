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
