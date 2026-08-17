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
