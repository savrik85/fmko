/**
 * Přepínač poskytovatele AI textů.
 *
 * Důvod vzniku: testing dostal vlastní crony (2026-08-17) a sdílí s produkcí
 * hodnotu `GEMINI_API_KEY`. Bez přepínače by testovací prostředí ujídalo
 * produkční kvótu každý den.
 *
 * Hodnoty:
 *   "gemini"     — výchozí, produkční chování (Gemini 2.5 Flash)
 *   "workers-ai" — Cloudflare Workers AI (etapa B, zatím jen pro testing)
 *   "off"        — negenerovat nic; generátory dostanou prázdný klíč a samy
 *                  se přeskočí (všechny mají `if (!apiKey) return` větev)
 *
 * DEFAULT JE "gemini" — když klíč v KV chybí, chová se všechno přesně jako dosud.
 * Produkce tak zůstává nedotčená, dokud ji někdo výslovně nepřepne.
 */

import { logger } from "./logger";

export type AiProvider = "gemini" | "workers-ai" | "off";

export const AI_PROVIDER_KEY = "ai_provider";

export async function readAiProvider(kv: KVNamespace | undefined): Promise<AiProvider> {
  if (!kv) return "gemini";
  const raw = await kv.get(AI_PROVIDER_KEY).catch((e) => {
    logger.warn({ module: "ai-provider" }, "čtení ai_provider z KV selhalo", e);
    return null;
  });
  if (raw === "workers-ai" || raw === "off") return raw;
  return "gemini";
}

/**
 * Model pro Workers AI.
 *
 * Vybraný 2026-08-17 srovnáním na českém zápasovém promptu:
 *   - llama-4-scout      → správné skloňování ("nad Rapidem Tvrzice"), čistý výstup ✅
 *   - llama-3.3-70b      → chybná shoda ("přidala Petr Kraus"), text zdvojený,
 *                          přilepená meta-poznámka „názvy jsou výmysly" ❌
 *   - mistral-small-3.1  → použitelná čeština, ale rozbitá struktura odstavce
 *   - gpt-oss-120b, glm-5.2, gemma-4 → reasoning modely, celý budget spotřebují
 *                          na vnitřní úvahu a vrátí prázdný obsah ❌
 */
export const WORKERS_AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

export interface AiContext {
  provider: AiProvider;
  ai?: Ai;
  geminiApiKey?: string;
}

export interface GenerateOpts {
  maxTokens?: number;
  temperature?: number;
  /** Vynutit JSON výstup (jen Gemini). */
  json?: boolean;
  /** Gemini safetySettings — plachty kotle bývají provokativní. */
  safetySettings?: unknown[];
  module?: string;
}

/**
 * Vygeneruje text vybraným poskytovatelem. Vrací čistý text nebo null.
 *
 * Kontrakt je schválně stejný jako u původního `callGemini`, aby se volající
 * místa dala přepojit beze změny jejich chybových větví.
 */
export async function generateText(
  ctx: AiContext,
  prompt: string,
  opts: GenerateOpts = {},
): Promise<string | null> {
  const mod = opts.module ?? "ai";

  if (ctx.provider === "off") return null;

  if (ctx.provider === "workers-ai") {
    if (!ctx.ai) {
      logger.warn({ module: mod }, "provider=workers-ai, ale binding AI chybí — negeneruji");
      return null;
    }
    const res = await (ctx.ai as unknown as {
      run: (model: string, input: unknown) => Promise<{ response?: string }>;
    })
      .run(WORKERS_AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.6,
      })
      .catch((e) => {
        logger.warn({ module: mod }, "workers-ai run selhal", e);
        return null;
      });
    const text = (res?.response ?? "").trim();
    if (!text) logger.warn({ module: mod }, "workers-ai vrátil prázdnou odpověď");
    return text || null;
  }

  // ── Gemini (default) ──
  if (!ctx.geminiApiKey) return null;
  const { callGemini } = await import("../news/gemini-helper");
  return callGemini(ctx.geminiApiKey, prompt, {
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
    json: opts.json,
    safetySettings: opts.safetySettings,
    module: mod,
  });
}

/** Sestaví kontext z env — jedno místo, ať to volající neskládají ručně. */
export async function aiContextFromEnv(env: {
  CACHE_KV?: KVNamespace;
  GEMINI_API_KEY?: string;
  AI?: Ai;
}): Promise<AiContext> {
  return {
    provider: await readAiProvider(env.CACHE_KV),
    ai: env.AI,
    geminiApiKey: env.GEMINI_API_KEY,
  };
}

/**
 * Vrátí kopii env upravenou podle přepínače.
 *
 * Pro "off" vyprázdní GEMINI_API_KEY — generátory pak spadnou do své existující
 * skip větve. Tím se nemusí sahat do dvanácti generátorů, což je přesně to,
 * co u produkčně běžícího kódu nechceme dělat kvůli testovacímu prostředí.
 */
export async function applyAiProvider<T extends { CACHE_KV?: KVNamespace; GEMINI_API_KEY?: string }>(
  env: T,
): Promise<{ env: T; provider: AiProvider }> {
  const provider = await readAiProvider(env.CACHE_KV);
  if (provider === "off") {
    return { env: { ...env, GEMINI_API_KEY: "" }, provider };
  }
  return { env, provider };
}
