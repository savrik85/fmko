/**
 * Prosba o příspěvek napsaná jako obyčejná SMS: vyčte z textu částku a účel.
 * Bez modelu, jen klíčová slova. Co nepozná, na to se majitel doptá.
 */
import type { RequestPurpose } from "./requests";

export interface ParsedRequest {
  amount: number | null;
  /** Poznaný účel; null = žádný nebo víc různých (viz `purposes`). */
  purpose: RequestPurpose | null;
  purposes: RequestPurpose[];
  /** Jde vůbec o peníze? (částka, účel nebo slova jako příspěvek, peníze) */
  intent: boolean;
}

/** Malá písmena bez diakritiky. */
export function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const PURPOSE_PATTERNS: Record<RequestPurpose, RegExp> = {
  coach: /\b(trener\w*|kurz\w*|licenc\w*|skoleni\w*|vzdelan\w*|skol[auey]\w*)/,
  transfer: /\b(prestup\w*|posil\w*|hrac\w*|koupit|koupi|utocnik\w*|obrance|obrancu|zaloznik\w*|brankar\w*|golman\w*)/,
  equipment: /\b(vybaven\w*|dres\w*|mic|mice|micu|mici|kopack\w*|vystroj\w*|tasky|chranic\w*)/,
  stadium: /\b(stadion\w*|hrist\w*|tribun\w*|travnik\w*|satn\w*|osvetlen\w*|lavic\w*|zazemi|rekonstrukc\w*|parkovist\w*|sprch\w*)/,
  youth: /\b(mladez\w*|dorost\w*|zaci|zaky|zaku|akademi\w*|pripravk\w*|deti|junior\w*)/,
};

const MONEY_WORDS = /\b(penez|penize|prispev\w*|podpor\w*|prachy|prachu|korun\w*|financ\w*|dotac\w*|pomoc\w*|pomoz\w*|pujc\w*)/;

/**
 * Částky: „20 000", „20.000", „20000 Kč", „20 tisíc", „20 tis.", „20k", „1,5 milionu".
 * Holé číslo pod 1 000 bez jednotky se nebere (termíny, počty hráčů).
 */
export function parseAmount(norm: string): number | null {
  const re = /(\d{1,3}(?:[ . ]\d{3})+|\d+)(?:,(\d+))?\s*(tisic\w*|tis\b\.?|k\b|kc\b|korun\w*|mil\w*)?/g;
  let best: number | null = null;
  for (const m of norm.matchAll(re)) {
    const base = Number(m[1].replace(/[ . ]/g, ""));
    const dec = m[2] ? Number(`0.${m[2]}`) : 0;
    const unit = m[3] ?? "";
    const mult = unit.startsWith("mil") ? 1_000_000 : unit.startsWith("tis") || unit === "k" ? 1000 : 1;
    const value = Math.round((base + dec) * mult);
    const hasUnit = unit !== "";
    if (!hasUnit && value < 1000) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

export function parseRequestText(text: string): ParsedRequest {
  const norm = normalize(text);
  const purposes = (Object.keys(PURPOSE_PATTERNS) as RequestPurpose[]).filter((p) => PURPOSE_PATTERNS[p].test(norm));
  const amount = parseAmount(norm);
  return {
    amount,
    purpose: purposes.length === 1 ? purposes[0] : null,
    purposes,
    intent: amount !== null || purposes.length > 0 || MONEY_WORDS.test(norm),
  };
}
