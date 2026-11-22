/**
 * O kom trenér ve zprávě mluví (spec část 1).
 *
 * Síto: jméno, příjmení nebo přezdívka hráče klubu ve zprávě, i skloňované
 * (`wordMatchesName` z kabiny). Model se volá jen když síto někoho najde, jednou na zprávu.
 * Rozhodne, jestli jde opravdu o toho hráče (na produ: „pořádně“ × Pořádek, „pivko“ ×
 * přezdívka Pivko, „Německo“ × Němec) a jestli ho trenér chválí, kritizuje nebo o něm rozhodl.
 */
import { logger } from "../lib/logger";
import { askModelJson, coachQuote, COACH_TEXT_RULE, type ChatEnv } from "../messaging/ai-player-chat";
import { plainWords, wordMatchesName } from "../messaging/squad-talk";
import type { HearsayKind } from "./types";

const M = "hearsay-detect";

export interface MentionCandidate {
  id: string; firstName: string; lastName: string; nickname?: string | null;
  /** Vazba na adresáta SMS (`relationships.type`): „tvůj brácha Lukáš“ pak model pozná mezi třemi Lukáši. */
  tieToRecipient?: string;
}

const TIE_LABEL: Record<string, string> = {
  brothers: "brácha adresáta", father_son: "táta nebo syn adresáta", in_laws: "švagr adresáta",
  drinking_buddies: "kámoš adresáta od piva", classmates: "spolužák adresáta", neighbors: "soused adresáta",
  coworkers: "kolega adresáta z práce", rivals: "rival adresáta", mentor_pupil: "parťák adresáta z tréninku",
};

export interface DetectedMention { playerId: string; kind: HearsayKind; quote: string }

const KINDS: readonly HearsayKind[] = ["praise", "criticism", "decision_against", "decision_for"];
const MAX_MENTIONS = 3;

/**
 * Hráči klubu, jejichž jméno ve zprávě je. Na rozdíl od oslovení v kabině stačí i křestní
 * jméno, které má v kádru víc lidí: rozhodne model podle celé věty.
 */
export function mentionCandidates(club: MentionCandidate[], message: string, excludeIds: string[]): MentionCandidate[] {
  const words = plainWords(message);
  const skip = new Set(excludeIds);
  const excluded = club.filter((p) => skip.has(p.id));
  // „Tomáši, hrál jsi skvěle“: oslovení adresáta (křestním jménem nebo přezdívkou) není zmínka
  // jmenovce. Platí i pro příjmení a přezdívku spoluhráče: „Lukáši, proč jsi vykradl sklad?“
  // Lukáši Kohoutovi nemluví o Jakubu Lukášovi (lokální E2E 22. 11., hearsay obvinil jeho).
  const addressWord = (w: string) => excluded.some((p) => wordMatchesName(w, p.firstName) || (!!p.nickname && wordMatchesName(w, p.nickname)));
  const hits = (name: string | null | undefined) => !!name && words.some((w) => wordMatchesName(w, name) && !addressWord(w));
  return club.filter((p) => !skip.has(p.id) && (hits(p.nickname) || hits(p.lastName) || hits(p.firstName)));
}

function fullName(c: MentionCandidate): string {
  const tie = c.tieToRecipient ? TIE_LABEL[c.tieToRecipient] : undefined;
  return `${c.firstName} ${c.lastName}${c.nickname ? ` („${c.nickname}“)` : ""}${tie ? ` (${tie})` : ""}`;
}

export function buildMentionPrompt(o: { message: string; recipientName: string | null; squadChat: boolean; candidates: MentionCandidate[] }): string {
  return [
    COACH_TEXT_RULE,
    o.squadChat
      ? "Trenér vesnického fotbalového týmu napsal do skupinového chatu celé kabiny:"
      : `Trenér vesnického fotbalového týmu napsal SMS svému hráči${o.recipientName ? ` jménem ${o.recipientName}` : ""}:`,
    coachQuote(o.message),
    "",
    "Hráči klubu, jejichž jméno se ve zprávě možná objevuje (id: jméno):",
    ...o.candidates.map((c) => `- ${c.id}: ${fullName(c)}`),
    "",
    "U každého urči, co o něm trenér v té zprávě říká:",
    "- praise: chválí ho („Šmejkal hrál skvěle“, „Pešek je náš nejlepší stoper“)",
    "- criticism: kritizuje ho, stěžuje si na něj, slibuje si ho srovnat („Šmejkal se fláká“, „se Šmejkalem si promluvím, flákání trpět nebudu“, „Pivko zase chlastal“)",
    "- decision_against: rozhodl o něčem na jeho úkor (páska, místo v základu, brána, lavička): „pásku budeš mít ty, místo Straky“ = decision_against pro Straku",
    "- decision_for: rozhodl o něčem v jeho prospěch („Novák zítra začne v základu“, „Pešl bude chytat pohár“)",
    "- none: o něm nic takového neříká, jen ho zmíní („v základu vedle Szaba“ = none pro Szabóa, „Grillak podle mě nebude“ = none), nebo to vůbec není on",
    "",
    "PRAVIDLA:",
    "- Jméno, které je zároveň běžné slovo, není zmínka hráče, když ho trenér používá jako to slovo („pořádně“ ≠ Pořádek, „pivko“ ≠ Pivko, „Německo“ ≠ Němec, „dělo“ ≠ Dělo). Pak none.",
    "- Když mají dva hráči stejné příjmení a z věty nejde poznat, kterého trenér myslí (chybí křestní jméno nebo přezdívka), dej none oběma.",
    "- Stejné křestní jméno u víc hráčů: rozhoduje příjmení, přezdívka, nebo vazba v závorce („tvůj brácha Lukáš“ = ten Lukáš, který je brácha adresáta). Když to z věty nejde poznat, dej none.",
    o.recipientName ? `- Adresát SMS (${o.recipientName}) v seznamu není, o něm nerozhoduj.` : "",
    "- decision_for a decision_against jen když trenér oznamuje hotové rozhodnutí (kdo bude hrát, chytat, mít pásku, sedět na lavičce). Přání nebo doufání („doufám, že Šimek přijde“, „Šimka potřebujeme“) rozhodnutí není: je to praise, nebo none.",
    "- Do quote dej DOSLOVA tu část zprávy, která to říká.",
    "",
    "Vrať POUZE JSON:",
    `{"mentions": [{"player_id": "<id>", "kind": "praise"|"criticism"|"decision_against"|"decision_for"|"none", "quote": "<doslovná citace>"}]}`,
  ].filter(Boolean).join("\n");
}

/** Odpověď modelu → zmínky. Neznámé id, „none“, citace, která ve zprávě není, a duplicity se zahodí. */
export function parseMentions(raw: unknown, candidates: MentionCandidate[], message: string): DetectedMention[] {
  const list = (raw as { mentions?: unknown } | null)?.mentions;
  if (!Array.isArray(list)) return [];
  const known = new Set(candidates.map((c) => c.id));
  const text = ` ${plainWords(message).join(" ")} `;
  const out: DetectedMention[] = [];
  for (const m of list as Array<Record<string, unknown>>) {
    const playerId = typeof m?.player_id === "string" ? m.player_id : "";
    const kind = m?.kind as HearsayKind;
    const quote = typeof m?.quote === "string" ? m.quote.trim() : "";
    if (!known.has(playerId) || !KINDS.includes(kind)) continue;
    const q = plainWords(quote).join(" ");
    if (q.length < 3 || !text.includes(` ${q} `)) continue;
    if (out.some((o) => o.playerId === playerId && o.kind === kind)) continue;
    out.push({ playerId, kind, quote: quote.slice(0, 200) });
    if (out.length >= MAX_MENTIONS) break;
  }
  return out;
}

export async function detectMentions(
  env: ChatEnv,
  o: { message: string; recipientName: string | null; squadChat: boolean; club: MentionCandidate[]; excludeIds: string[] },
): Promise<DetectedMention[]> {
  const candidates = mentionCandidates(o.club, o.message, o.excludeIds);
  if (candidates.length === 0) return [];
  const raw = await askModelJson<unknown>(env, buildMentionPrompt({ ...o, candidates }), 300);
  const mentions = parseMentions(raw, candidates, o.message);
  if (mentions.length > 0) logger.info({ module: M }, `zmínky: ${mentions.map((m) => `${m.playerId}=${m.kind}`).join(", ")}`);
  return mentions;
}
