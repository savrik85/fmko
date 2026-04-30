/**
 * Gemini-driven AI player chat service.
 * Generuje úvodní zprávu hráče, jeho odpověď v threadu, a vyhodnocení dopadu na atributy.
 *
 * Žádný fallback na šablony — pokud Gemini selže nebo chybí klíč, funkce vyhodí výjimku
 * a volající (cron / reply hook) má za úkol thread čistě skipnout / nechat pro pozdější retry.
 */

import { logger } from "../lib/logger";
import type { PlayerSnapshot, AiScenario } from "./ai-player-scenarios";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface ThreadMessage {
  sender: "player" | "coach";
  body: string;
}

export interface TeamContext {
  teamName: string;
  villageName?: string;
  leaguePosition?: number;
  lastMatchResult?: string;
  managerName?: string;
}

export interface ResolutionResult {
  morale_delta: number;        // -15..+15
  condition_delta: number;     // -5..+5
  relationship_delta: number;  // -15..+15
  summary: string;             // krátké česky shrnutí (~1 věta)
  tone: "positive" | "negative" | "neutral";
}

class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

function buildPersonalityHints(p: PlayerSnapshot): string {
  const hints: string[] = [];
  const flag = (label: string, value: number, threshold = 65) => {
    if (value >= threshold) hints.push(`vysoký ${label} (${value})`);
    else if (value <= 100 - threshold) hints.push(`nízký ${label} (${value})`);
  };
  flag("temperament", p.temper);
  flag("disciplína", p.discipline);
  flag("alkohol", p.alcohol);
  flag("vůdcovství", p.leadership);
  flag("pracovitost", p.workRate);
  flag("agresivita", p.aggression);
  flag("vlastenectví", p.patriotism);
  return hints.length > 0 ? hints.join(", ") : "průměrná povaha";
}

function buildSystemPrompt(player: PlayerSnapshot, team: TeamContext): string {
  const positionLabel: Record<string, string> = {
    GK: "brankář",
    DEF: "obránce",
    MID: "záložník",
    FWD: "útočník",
  };
  const village = team.villageName ? ` z ${team.villageName}` : "";
  const occupation = player.occupation ? `Civilním povoláním ${player.occupation}.` : "";
  const positionStr = positionLabel[player.position] ?? player.position;

  return [
    `Jsi ${player.firstName} ${player.lastName}, ${player.age}letý ${positionStr} amatérského týmu ${team.teamName}${village} v české vesnické soutěži.`,
    `Tvoje povaha: ${buildPersonalityHints(player)}.`,
    `Aktuální nálada: ${player.morale}/100, kondice: ${player.condition}/100, vztah s trenérem: ${player.coachRelationship}/100.`,
    occupation,
    "Píšeš trenérovi SMS na mobil. Mluv neformálně česky, jako vesničan z malého klubu — používej hovorové výrazy, klidně i nadávku nebo povzdech.",
    "PRAVIDLA STYLU:",
    "- Krátce: 1-2 věty, do 200 znaků.",
    "- UKAZUJ EMOCE: když tě něco štve, dej to najevo (sarkasmus, frustrace, povzdech). Když jsi rád, projev to. Nebuď monotónní.",
    "- NIKDY se neopakuj — nepoužívej stejné fráze nebo slova jako v předchozí své zprávě.",
    "- Zřídka emoji (max 1 a jen když opravdu sedí — ŽÁDNÝ ⚽ nebo 🥅, jsi hráč, ne fanoušek).",
    "- NIKDY nepiš jako AI nebo formálně.",
  ].filter(Boolean).join("\n");
}

async function callGemini(env: { GEMINI_API_KEY?: string }, prompt: string, opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiUnavailableError("GEMINI_API_KEY missing");
  }

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens ?? 256,
    temperature: opts.temperature ?? 0.85,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (opts.json) {
    generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch((e) => { logger.warn({ module: "ai-player-chat" }, "read error body failed", e); return ""; });
    throw new GeminiUnavailableError(`Gemini API ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    throw new GeminiUnavailableError("Gemini returned empty response");
  }
  return text;
}

function trimSms(body: string): string {
  // Gemini občas vrátí uvozovky, podpis nebo "Hráč:" prefix — očistíme.
  let cleaned = body.trim()
    .replace(/^["'„"]+/, "")
    .replace(/["'""]+$/, "")
    .replace(/^(Hráč|Player|SMS|Zpráva)\s*[:\-]\s*/i, "")
    .trim();
  if (cleaned.length > 280) cleaned = cleaned.slice(0, 277).trimEnd() + "…";
  return cleaned;
}

export async function generateInitialMessage(
  env: { GEMINI_API_KEY?: string },
  player: PlayerSnapshot,
  scenario: AiScenario,
  team: TeamContext,
): Promise<string> {
  const system = buildSystemPrompt(player, team);
  const contextLine = team.lastMatchResult ? ` Poslední zápas: ${team.lastMatchResult}.` : "";
  const positionLine = team.leaguePosition ? ` Tým je v lize na ${team.leaguePosition}. místě.` : "";

  const prompt = [
    system,
    "",
    `SCÉNÁŘ: ${scenario.description}${contextLine}${positionLine}`,
    "",
    `Napiš trenérovi PRVNÍ SMS k tomuto scénáři. Drž tón odpovídající své povaze a vztahu s trenérem (${player.coachRelationship}/100). NEPIŠ podpis. Vrať POUZE text SMS.`,
  ].join("\n");

  const raw = await callGemini(env, prompt, { maxTokens: 200, temperature: 0.9 });
  return trimSms(raw);
}

export interface ReplyResult {
  body: string;
  /** Pokud true, AI usoudila že téma je probrané a další výměna nedává smysl — handler spustí resolution. */
  conversationComplete: boolean;
}

export async function generateReply(
  env: { GEMINI_API_KEY?: string },
  player: PlayerSnapshot,
  history: ThreadMessage[],
  scenario: AiScenario,
  team: TeamContext,
  isFinalTurn: boolean,
): Promise<ReplyResult> {
  const system = buildSystemPrompt(player, team);
  const histText = history
    .map((m) => `${m.sender === "player" ? player.firstName : "TRENÉR"}: ${m.body}`)
    .join("\n");

  const closingHint = isFinalTurn
    ? "TOTO JE TVOJE POSLEDNÍ ZPRÁVA — uzavři ji (poděkuj / smiř se / rozluč se / nebo prásknout dveřmi pokud tě trenér naštval). Žádné nové otázky. Pole `conversation_complete` MUSÍ být true."
    : "Můžeš v rozhovoru pokračovat (argumentovat, eskalovat, ptát se), NEBO ho přirozeně uzavřít, pokud trenér už odpověděl ucelené (poděkoval, dal radu, zavřel téma). Pole `conversation_complete` nastav podle toho, jestli je ještě o čem mluvit.";

  // Pokud trenér odpověděl velmi krátce nebo odmítavě, hráč by měl reagovat emocionálně podle temperamentu
  const lastCoachMsg = [...history].reverse().find((m) => m.sender === "coach")?.body ?? "";
  const coachShortOrDismissive = lastCoachMsg.length < 25;
  const reactionHint = coachShortOrDismissive
    ? `Trenér ti odpověděl velmi krátce ("${lastCoachMsg}"). Pokud ti to přijde odmítavé/hrubé a tvůj temperament je ${player.temper}/100, projev to (frustrace, sarkasmus, povzdech). Pokud to byla jasná uzavírací odpověď ("ok", "díky", "v pořádku"), můžeš téma uzavřít.`
    : "";

  const prompt = [
    system,
    "",
    `SCÉNÁŘ: ${scenario.description}`,
    "",
    "HISTORIE KONVERZACE:",
    histText,
    "",
    closingHint,
    reactionHint,
    `Drž svou povahu (temperament ${player.temper}, vztah ${player.coachRelationship}/100). NEOPAKUJ stejné fráze co jsi už použil. NEPIŠ podpis.`,
    "",
    "Vrať POUZE JSON v tomto tvaru (žádný markdown, žádný komentář):",
    `{"body": "<text SMS, max 200 znaků>", "conversation_complete": <true pokud je téma probrané a další výměna nedává smysl, jinak false>}`,
  ].filter(Boolean).join("\n");

  const raw = await callGemini(env, prompt, { json: true, maxTokens: 256, temperature: 1.0 });

  let parsed: { body?: unknown; conversation_complete?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: "ai-player-chat" }, `reply JSON parse failed: ${raw.slice(0, 200)}`, e);
    throw new GeminiUnavailableError("Reply JSON parse failed");
  }

  const body = typeof parsed.body === "string" ? trimSms(parsed.body) : "";
  if (!body) throw new GeminiUnavailableError("Reply JSON missing body");

  return {
    body,
    conversationComplete: parsed.conversation_complete === true || isFinalTurn,
  };
}

export async function evaluateResolution(
  env: { GEMINI_API_KEY?: string },
  player: PlayerSnapshot,
  history: ThreadMessage[],
  scenario: AiScenario,
): Promise<ResolutionResult> {
  const histText = history
    .map((m) => `${m.sender === "player" ? player.firstName : "TRENÉR"}: ${m.body}`)
    .join("\n");

  const prompt = [
    `Vyhodnoť, jak konverzace dopadla pro hráče ${player.firstName} ${player.lastName} (${player.age} let, ${player.position}).`,
    `Scénář: ${scenario.description}`,
    `Aktuální stav hráče: morale ${player.morale}/100, kondice ${player.condition}/100, vztah s trenérem ${player.coachRelationship}/100.`,
    `Povaha: ${buildPersonalityHints(player)}.`,
    "",
    "KONVERZACE:",
    histText,
    "",
    "Vrať POUZE JSON v tomto tvaru (žádný markdown, žádný komentář):",
    `{"morale_delta": <-15..+15>, "condition_delta": <-5..+5>, "relationship_delta": <-15..+15>, "summary": "<1 věta česky o tom jak hráč odchází>", "tone": "positive"|"negative"|"neutral"}`,
    "",
    "Pravidla:",
    "- Pokud trenér reagoval empaticky/správně → kladné delty (zvlášť relationship +5..+12, morale +3..+10).",
    "- Pokud trenér byl odmítavý/hrubý/lhostejný → záporné (relationship -5..-12, morale -3..-10).",
    "- Pokud trenér byl neutrální → malé delty kolem nuly (-3..+3).",
    "- condition_delta je vzácný, jen když scénář souvisí s kondicí (alkohol, zranění, vyčerpání).",
    "- Buď přísný — žádné +15 zadarmo, jen za skutečně skvělé chování.",
  ].join("\n");

  const raw = await callGemini(env, prompt, { json: true, maxTokens: 256, temperature: 0.4 });

  let parsed: ResolutionResult;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: "ai-player-chat" }, `resolution JSON parse failed: ${raw.slice(0, 200)}`, e);
    throw new GeminiUnavailableError("Resolution JSON parse failed");
  }

  // Validate + clamp
  const clamp = (v: unknown, min: number, max: number): number => {
    const n = typeof v === "number" ? v : 0;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  return {
    morale_delta: clamp(parsed.morale_delta, -15, 15),
    condition_delta: clamp(parsed.condition_delta, -5, 5),
    relationship_delta: clamp(parsed.relationship_delta, -15, 15),
    summary: typeof parsed.summary === "string" && parsed.summary.length > 0
      ? parsed.summary.slice(0, 200)
      : "Konverzace skončila bez výrazného závěru.",
    tone: parsed.tone === "positive" || parsed.tone === "negative" ? parsed.tone : "neutral",
  };
}

export { GeminiUnavailableError };
