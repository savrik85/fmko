/**
 * Jazykový model AI trenéra (Cloudflare Workers AI).
 *
 * Model jen vybírá z nabídky přípustných možností a vrací JSON. Všechno počítání
 * a kontrolu dělá kód, takže výpadek, zpoždění nebo nesmysl modelu nikdy nic nerozbije:
 * volající dostane `json: null` a rozhodne náhradní pravidlo podle povahy trenéra.
 *
 * Výběr modelu: docs/ai-coach-model-eval-2026-10-25.md (měření na skutečných rozhodnutích
 * z kopie produkce). Kredity pokrývají jen modely hostované Cloudflarem.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";

/**
 * Model vybraný měřením (docs/ai-coach-model-eval-2026-10-25.md): gpt-oss-120b se střední silou
 * úvahy. Na 56 zápasových a 36 týdenních rozhodnutích z kopie produkce byl ze všech kandidátů
 * nejspolehlivější (žádný překročený čas), nejlépe držel povahu trenéra a jeho sestavy byly
 * v simulaci enginem nejblíž silnému náhradnímu pravidlu. Úvaha „high" přemýšlela třikrát déle
 * bez měřitelného zisku a 4 % odpovědí nestihla.
 */
export const COACH_MODEL = "@cf/openai/gpt-oss-120b";

/** Kandidáti ze srovnání; jen modely hostované Cloudflarem (kryjí je startupové kredity). */
export const COACH_MODEL_CANDIDATES = [
  "@cf/openai/gpt-oss-120b",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/qwen/qwen3.8-27b",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/moonshotai/kimi-k2.5",
] as const;

interface ModelProfile {
  /** Uvažující model: kolik tokenů si nechat na úvahu navíc k odpovědi. */
  reasoningBudget: number;
  /** Parametry navíc (síla úvahy apod.). */
  extra?: Record<string, unknown>;
  /** Umí `response_format` s JSON schématem. */
  schema: boolean;
}

const MODEL_PROFILES: Record<string, ModelProfile> = {
  // Medium spotřebuje na úvahu kolem 1 700 tokenů; rozpočet je velkorysý, ať úvaha nikdy nedojde.
  "@cf/openai/gpt-oss-120b": { reasoningBudget: 12000, extra: { reasoning_effort: "medium" }, schema: true },
  "@cf/nvidia/nemotron-3-120b-a12b": { reasoningBudget: 12000, schema: true },
  "@cf/qwen/qwen3.8-27b": { reasoningBudget: 12000, schema: true },
  "@cf/meta/llama-4-scout-17b-16e-instruct": { reasoningBudget: 0, schema: true },
  "@cf/moonshotai/kimi-k2.5": { reasoningBudget: 4000, schema: true },
};

const DEFAULT_PROFILE: ModelProfile = { reasoningBudget: 4000, schema: false };

/**
 * Jak dlouho se na model čeká. Úloha běží ve frontě, zápas ani tick na ni nečekají.
 * gpt-oss medium odpovídal do 42 s (90. percentil 37 s); platforma sama končí kolem 120 s.
 */
export const DEFAULT_TIMEOUT_MS = 120_000;

export interface CoachModelRequest {
  system: string;
  user: string;
  /** Tokeny na samotnou odpověď (JSON); úvaha uvažujícího modelu se přičítá zvlášť. */
  maxTokens?: number;
  /** JSON schéma odpovědi (structured outputs), když ho model umí. */
  schema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  timeoutMs?: number;
  /** Jiný model než COACH_MODEL (srovnání modelů, admin). */
  model?: string;
  /** Síla úvahy u modelů, které ji umí (gpt-oss); bez ní platí profil modelu. */
  reasoningEffort?: "low" | "medium" | "high";
}

export interface CoachModelResult {
  json: unknown | null;
  raw: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  error?: string;
}

interface ExtractedOutput {
  text: string;
  /** Odpověď už jako objekt (některé modely JSON samy naparsují). */
  object: unknown | null;
  tokensIn?: number;
  tokensOut?: number;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Vytáhne text odpovědi z kteréhokoli tvaru, který Workers AI vrací:
 * `{ response }` (string i objekt), OpenAI `choices[0].message.content`,
 * Responses API `output[].content[].text`. Úvaha (`reasoning`, `reasoning_content`)
 * se schválně nebere: je to vnitřní monolog, ne odpověď.
 */
export function extractModelOutput(res: unknown): ExtractedOutput {
  if (typeof res === "string") return { text: res, object: null };
  if (!res || typeof res !== "object") return { text: "", object: null };
  const r = res as Record<string, unknown>;
  const usage = (r.usage && typeof r.usage === "object" ? r.usage : {}) as Record<string, unknown>;
  const tokensIn = num(usage.prompt_tokens) ?? num(usage.input_tokens);
  const tokensOut = num(usage.completion_tokens) ?? num(usage.output_tokens);

  const choices = Array.isArray(r.choices) ? r.choices : null;
  const message = choices && choices[0] && typeof choices[0] === "object"
    ? (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined
    : undefined;
  if (message && typeof message.content === "string" && message.content.trim()) {
    return { text: message.content, object: null, tokensIn, tokensOut };
  }

  if (typeof r.response === "string" && r.response.trim()) return { text: r.response, object: null, tokensIn, tokensOut };
  if (r.response && typeof r.response === "object") {
    return { text: JSON.stringify(r.response), object: r.response, tokensIn, tokensOut };
  }

  if (Array.isArray(r.output)) {
    const parts: string[] = [];
    for (const item of r.output) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      if (it.type !== "message" || !Array.isArray(it.content)) continue;
      for (const c of it.content) {
        if (c && typeof c === "object" && typeof (c as Record<string, unknown>).text === "string") {
          parts.push((c as Record<string, unknown>).text as string);
        }
      }
    }
    if (parts.length > 0) return { text: parts.join(""), object: null, tokensIn, tokensOut };
  }

  return { text: "", object: null, tokensIn, tokensOut };
}

const CODE_FENCE = new RegExp("\u0060{3}(?:json)?\\s*([\\s\\S]*?)\u0060{3}", "i");

/** První vyvážený objekt `{…}` v textu (respektuje řetězce a escapování). */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Neplatný JSON je u modelu běžný, zkusí se další způsob; do logu jen krátce.
    logger.debug({ module: "ai-coach-llm" }, `JSON se nepodařilo přečíst: ${String(e).slice(0, 120)}`);
    return null;
  }
}

/**
 * JSON z odpovědi modelu: hotový objekt, čistý řetězec, blok kódu ```json …```,
 * nebo první objekt v textu. Pole a skaláry neplatí (rozhodnutí je vždy objekt).
 */
export function parseModelJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;

  const candidates: string[] = [text];
  // Blok kódu ```json … ``` (zpětné apostrofy přes \u0060, ať je kontrola odkazů nebere jako řetězec).
  const fence = text.match(CODE_FENCE);
  if (fence) candidates.push(fence[1].trim());
  const obj = firstJsonObject(text);
  if (obj) candidates.push(obj);

  for (const c of candidates) {
    const parsed = tryParse(c);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return null;
}

type AiRunner = { run: (model: string, input: unknown, options?: unknown) => Promise<unknown> };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Sestaví vstup pro `env.AI.run` podle profilu modelu. */
export function buildModelInput(model: string, req: CoachModelRequest): Record<string, unknown> {
  const profile = MODEL_PROFILES[model] ?? DEFAULT_PROFILE;
  const input: Record<string, unknown> = {
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    max_tokens: (req.maxTokens ?? 1200) + profile.reasoningBudget,
    temperature: req.temperature ?? 0.6,
    ...(profile.extra ?? {}),
  };
  if (req.reasoningEffort && "reasoning_effort" in input) input.reasoning_effort = req.reasoningEffort;
  if (req.schema && profile.schema) {
    input.response_format = {
      type: "json_schema",
      json_schema: { name: req.schema.name, schema: req.schema.schema, strict: true },
    };
  }
  return input;
}

/**
 * Zavolá model AI trenéra. Nikdy nehází: chyba, překročený čas i nečitelná odpověď
 * vrátí `json: null` a důvod v `error`, volající pak použije náhradní pravidlo.
 */
export async function callCoachModel(env: Pick<Bindings, "AI">, req: CoachModelRequest): Promise<CoachModelResult> {
  // Prázdný řetězec (nevyplněný parametr v adminu) znamená výchozí model.
  const model = req.model || COACH_MODEL;
  const started = Date.now();
  const ai = env.AI as unknown as AiRunner | undefined;
  if (!ai) {
    return { json: null, raw: "", model, latencyMs: 0, error: "chybí binding AI" };
  }

  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const input = buildModelInput(model, req);
  let res: unknown;
  try {
    res = await withTimeout(ai.run(model, input, { tags: ["ai-coach"] }), timeoutMs);
  } catch (first) {
    // Přechodná chyba platformy (5017, 8008, výpadek sítě) přijde do pár vteřin: jednou zopakovat.
    // Vlastní překročený čas ani pomalou chybu ne, to by úlohu jen protáhlo.
    const elapsed = Date.now() - started;
    const message = String((first as Error)?.message ?? first);
    if (message.startsWith("timeout") || elapsed > 30_000) {
      logger.warn({ module: "ai-coach-llm" }, `volání modelu ${model} selhalo`, first);
      return { json: null, raw: "", model, latencyMs: elapsed, error: message.slice(0, 500) };
    }
    logger.warn({ module: "ai-coach-llm" }, `volání modelu ${model} selhalo, zkouším znovu`, first);
    try {
      res = await withTimeout(ai.run(model, input, { tags: ["ai-coach"] }), Math.max(10_000, timeoutMs - elapsed));
    } catch (e) {
      logger.warn({ module: "ai-coach-llm" }, `volání modelu ${model} selhalo i podruhé`, e);
      return { json: null, raw: "", model, latencyMs: Date.now() - started, error: String((e as Error)?.message ?? e).slice(0, 500) };
    }
  }

  const out = extractModelOutput(res);
  const json = out.object && typeof out.object === "object" && !Array.isArray(out.object)
    ? out.object as Record<string, unknown>
    : parseModelJson(out.text);
  const latencyMs = Date.now() - started;
  if (!json) {
    return {
      json: null, raw: out.text.slice(0, 8000), model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, latencyMs,
      error: out.text ? "odpověď není JSON objekt" : "prázdná odpověď",
    };
  }
  return { json, raw: out.text.slice(0, 8000), model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, latencyMs };
}
