/**
 * Majitel firmy v telefonu odpovídá modelem, stejně jako hráči (placená SMS).
 *
 * Model dělá jen řeč: vyčte ze zprávy trenéra, o co žádá (`extractMoneyAsk`), a napíše
 * odpověď (`writeOwnerReply`). O penězích rozhoduje hra (requests.ts), model dostane
 * hotový výsledek a má ho jen říct. Když částku nebo termín v odpovědi popletl, nebo
 * model nejede, volající použije připravenou větu.
 */
import { cleanDashes } from "../lib/dashes";
import { logger } from "../lib/logger";
import type { OwnerPersonality } from "./owners";
import { isRequestPurpose, PURPOSE_LABELS, type RequestPurpose, type RequestRelation } from "./requests";

const M = "owner-chat";

export interface OwnerChatEnv {
  CACHE_KV?: KVNamespace;
  GEMINI_API_KEY?: string;
  AI?: Ai;
  AI_GATEWAY_URL?: string;
}

export interface OwnerChatFacts {
  ownerName: string;
  age: number;
  personality: OwnerPersonality;
  firmName: string;
  teamName: string;
  favor: number;
  relation: RequestRelation;
  /** Co firma klubu dala za posledních 90 dní. */
  given: number;
  /** Rozhovor od nejstaršího, bez poslední zprávy trenéra. */
  history: Array<{ from: "coach" | "owner"; body: string }>;
  coachText: string;
}

const PERSONALITY_TEXT: Record<OwnerPersonality, string> = {
  businessman: "obchodník. Počítáš každou korunu a chceš vidět, že se peníze vrátí",
  cautious: "opatrný člověk. Bojíš se rizika a mluvíš spíš zdrženlivě",
  patriot: "patriot. Fandíš místnímu klubu, záleží ti na mladých klucích a na obci",
  fan: "fanoušek, žiješ fotbalem a prožíváš ho",
};

function favorText(favor: number): string {
  if (favor >= 80) return "klubu fandíš a trenéra máš rád";
  if (favor >= 60) return "ke klubu máš dobrý vztah";
  if (favor >= 40) return "ke klubu máš neutrální vztah";
  if (favor >= 20) return "ke klubu jsi spíš chladný";
  return "klub ani trenéra nemusíš";
}

const RELATION_TEXT: Record<RequestRelation, string> = {
  main: "Tvoje firma je hlavní sponzor klubu, klub nese její jméno.",
  stadium: "Tvoje firma dává jméno stadionu klubu.",
  banner: "Tvoje firma má u klubu reklamní banner.",
  none: "S klubem nemáš žádnou smlouvu.",
};

export function kc(n: number): string {
  return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
}

export function dayMonth(day: string): string {
  const [, m, d] = day.slice(0, 10).split("-").map(Number);
  return `${d}. ${m}.`;
}

function conversationBlock(f: OwnerChatFacts): string {
  const lines = f.history.map((m) => `${m.from === "coach" ? "Trenér" : "Ty"}: ${m.body}`);
  return lines.length > 0 ? lines.join("\n") : "(zatím nic)";
}

async function callModel(env: OwnerChatEnv, prompt: string, maxTokens: number, temperature: number): Promise<string | null> {
  const { aiContextFromEnv, generateText } = await import("../lib/ai-provider");
  const ctx = await aiContextFromEnv(env);
  if (ctx.provider === "off") return null;
  return generateText(ctx, prompt, { json: true, maxTokens, temperature, module: M });
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  const candidates = [raw.trim(), raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim(), raw.match(/\{[\s\S]*\}/)?.[0] ?? ""];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c) as T;
    } catch (e) {
      logger.warn({ module: M }, "nečitelný JSON z modelu, zkouším další tvar", e);
    }
  }
  return null;
}

export interface MoneyAsk { wantsMoney: boolean; purpose: RequestPurpose | null; amount: number | null }

/** Žádá trenér o peníze, na co a kolik? null = model nejede nebo odpověděl nesmysl. */
export async function extractMoneyAsk(env: OwnerChatEnv, f: OwnerChatFacts): Promise<MoneyAsk | null> {
  const prompt = `Z SMS trenéra fotbalového klubu majiteli firmy zjisti, jestli trenér žádá o peníze, na co a kolik.

Účely:
- coach: vzdělání trenéra (kurz, licence, škola trenérů)
- transfer: přestup (nový hráč, posila)
- equipment: vybavení (dresy, míče, kopačky, výstroj)
- stadium: stadion (hřiště, tribuna, šatny, osvětlení, zázemí)
- youth: mládež (dorost, žáci, akademie)

Když zpráva zmiňuje víc věcí, vyber tu, na kterou chce peníze teď (ne to, co už udělal).
Když trenér jen odpovídá na tvou otázku (třeba napíše jen částku), vezmi účel z předchozího rozhovoru.
Částku převeď na celé koruny (20 tisíc = 20000). Když částku neuvedl, dej null.

Předchozí rozhovor:
${conversationBlock(f)}

Nová zpráva trenéra: "${f.coachText}"

Odpověz jen JSON: {"chce_penize": true nebo false, "ucel": "coach" | "transfer" | "equipment" | "stadium" | "youth" | null, "castka": číslo nebo null}`;
  const parsed = parseJson<{ chce_penize?: unknown; ucel?: unknown; castka?: unknown }>(await callModel(env, prompt, 128, 0.1));
  if (!parsed || typeof parsed.chce_penize !== "boolean") return null;
  const amount = typeof parsed.castka === "number" && Number.isFinite(parsed.castka) && parsed.castka > 0 ? Math.round(parsed.castka) : null;
  return { wantsMoney: parsed.chce_penize, purpose: isRequestPurpose(parsed.ucel) ? parsed.ucel : null, amount };
}

export interface JobAsk { wantsJob: boolean; playerName: string | null }

/**
 * Shání trenér u majitele práci pro hráče, a pro kterého (F8)? `roster` = jména hráčů klubu.
 * null = model nejede nebo odpověděl nesmysl, rozhodne pak `parseJobAsk`.
 */
export async function extractJobAsk(env: OwnerChatEnv, f: OwnerChatFacts, roster: readonly string[]): Promise<JobAsk | null> {
  const prompt = `Z SMS trenéra fotbalového klubu majiteli firmy zjisti, jestli trenér shání práci ve firmě (místo, brigádu, zaměstnání) pro některého svého hráče.
Žádost o peníze, sponzorský příspěvek, pozvání na zápas nebo na pivo NENÍ shánění práce.
Když trenér jen odpovídá na tvou otázku, pro koho práci chce (třeba napíše jen jméno), je to shánění práce.

Hráči klubu: ${roster.join(", ") || "(neznámí)"}

Předchozí rozhovor:
${conversationBlock(f)}

Nová zpráva trenéra: "${f.coachText}"

Odpověz jen JSON: {"wants_job": true nebo false, "player": "jméno a příjmení hráče ze seznamu, jak ho trenér myslí" nebo null}`;
  const parsed = parseJson<{ wants_job?: unknown; player?: unknown }>(await callModel(env, prompt, 96, 0.1));
  if (!parsed || typeof parsed.wants_job !== "boolean") return null;
  const name = typeof parsed.player === "string" && parsed.player.trim() ? parsed.player.trim().slice(0, 80) : null;
  return { wantsJob: parsed.wants_job, playerName: name };
}

/** Pouze číslice: „15 000 Kč" i „15.000" → „15000". */
function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, "");
}

/** Co musí odpověď modelu obsahovat přesně (jinak volající použije připravenou větu). */
export interface OwnerReplyChecks {
  amounts?: number[];
  days?: string[];
  allowed?: number[];
  /** Kmeny slov malými písmeny bez diakritiky (např. příjmení hráče). */
  words?: string[];
}

/**
 * Napíše odpověď majitele. `instruction` = co má sdělit (výsledek od hry). `mustContain` =
 * částky a data, která v odpovědi musí být přesně; když chybí, vrací null a volající
 * použije připravenou větu.
 */
export async function writeOwnerReply(
  env: OwnerChatEnv, f: OwnerChatFacts, instruction: string,
  mustContain: OwnerReplyChecks = {},
): Promise<string | null> {
  const prompt = `Jsi ${f.ownerName}, je ti ${f.age} let a vlastníš firmu ${f.firmName}. Povahou jsi ${PERSONALITY_TEXT[f.personality]}.
Právě si píšeš SMS s trenérem klubu ${f.teamName}. Trenér je ten, kdo ti píše: vykej mu a nemluv o něm ve třetí osobě.
${RELATION_TEXT[f.relation]} Momentálně ${favorText(f.favor)}.${f.given > 0 ? ` Za poslední tři měsíce jsi klubu dal ${kc(f.given)}.` : ""}

Rozhovor od nejstaršího:
${conversationBlock(f)}

Poslední zpráva trenéra: "${f.coachText}"

CO MÁŠ V ODPOVĚDI SDĚLIT: ${instruction}

Pravidla:
- česky, jako obyčejná SMS: jedna až tři krátké věty, mluv jako ty, podle své povahy
- reaguj na to, co trenér napsal, ale nic nad rámec toho, co máš sdělit, neslibuj
- částky a data piš přesně tak, jak jsou uvedené, žádné jiné částky nevymýšlej
- nevymýšlej si fakta o klubu, zápasech ani hráčích
- nepoužívej dlouhou pomlčku (—)

Odpověz jen JSON: {"body": "text SMS"}`;
  const parsed = parseJson<{ body?: unknown }>(await callModel(env, prompt, 256, 0.85));
  return checkOwnerReply(typeof parsed?.body === "string" ? parsed.body : "", mustContain);
}

/**
 * Očistí odpověď modelu a ověří, že říká přesně to, co hra rozhodla: požadované částky a data
 * v ní jsou a jiná částka (od 1 000 Kč) ne. Jinak null a volající použije připravenou větu.
 */
export function checkOwnerReply(raw: string, mustContain: OwnerReplyChecks = {}): string | null {
  const body = cleanDashes(raw.trim().replace(/^["„“]+|["“”]+$/g, "")).trim();
  if (!body || body.length > 600) return null;
  const digits = digitsOnly(body);
  for (const a of mustContain.amounts ?? []) {
    if (!digits.includes(String(a))) {
      logger.warn({ module: M }, `odpověď majitele bez částky ${a}, beru připravenou větu: ${body}`);
      return null;
    }
  }
  // Jiná částka, než kterou hra povolila, je slib, který by hra nedodržela.
  const allowed = new Set([...(mustContain.amounts ?? []), ...(mustContain.allowed ?? [])]);
  for (const m of body.matchAll(/\d{1,3}(?:[ \u00a0.]\d{3})+|\d{4,}/g)) {
    const n = Number(m[0].replace(/[^\d]/g, ""));
    if (n >= 1000 && !allowed.has(n)) {
      logger.warn({ module: M }, `odpověď majitele s cizí částkou ${n}, beru připravenou větu: ${body}`);
      return null;
    }
  }
  // Slova (kmeny bez diakritiky), která v odpovědi musí být: u práce pro hráče jeho příjmení.
  const plain = body.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const w of mustContain.words ?? []) {
    if (!plain.includes(w)) {
      logger.warn({ module: M }, `odpověď majitele bez slova ${w}, beru připravenou větu: ${body}`);
      return null;
    }
  }
  const compact = body.replace(/\s/g, "");
  for (const d of mustContain.days ?? []) {
    if (!compact.includes(dayMonth(d).replace(/\s/g, "").replace(/\.$/, ""))) {
      logger.warn({ module: M }, `odpověď majitele bez data ${d}, beru připravenou větu: ${body}`);
      return null;
    }
  }
  return body;
}

export function purposeLabel(p: RequestPurpose | null): string {
  return p ? PURPOSE_LABELS[p] : "to, co chce";
}
