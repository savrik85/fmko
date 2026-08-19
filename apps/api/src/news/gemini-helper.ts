/**
 * Sdílený helper pro volání Gemini 2.5 Flash.
 * Vrací čistý text (thinking parts odfiltrovány) nebo null při chybě.
 *
 * ── AI Gateway ──────────────────────────────────────────────────────────────
 * Když je nastavená proměnná `AI_GATEWAY_URL`, jde volání přes Cloudflare
 * AI Gateway místo přímo na Google. Dá to přehled o počtu requestů a tokenů
 * per prostředí, cachování, rate limiting a analytiku — Gemini je jediná externí
 * placená závislost projektu a dosud o ní nebylo vidět vůbec nic.
 *
 * Bez té proměnné se volá přímo, tedy přesně jako dosud. Produkce se tím pádem
 * nezmění, dokud se proměnná výslovně nenastaví.
 */

import { logger } from "../lib/logger";

const GEMINI_HOST = "https://generativelanguage.googleapis.com";
const GEMINI_PATH = "/v1beta/models/gemini-2.5-flash:generateContent";

export interface GeminiOpts {
  maxOutputTokens?: number;
  temperature?: number;
  /** Vynutit JSON výstup (responseMimeType: application/json). */
  json?: boolean;
  /** Volnější filtry — texty plachet kotle bývají provokativní a model by odpověď utnul. */
  safetySettings?: unknown[];
  module?: string;
  /**
   * Základ AI Gateway, např.
   * `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/google-ai-studio`.
   * Když chybí, volá se Google přímo.
   */
  gatewayUrl?: string;
}

/**
 * Základ gateway nastavený jednou na vstupu workeru (fetch / scheduled / queue).
 *
 * Alternativou by bylo protáhnout URL parametrem přes všechny volající funkce,
 * jenže ty dostávají jen `apiKey` a řetěz sahá hluboko. Modulová proměnná drží
 * po dobu života isolatu a jeden worker má vždy jedno prostředí, takže se nemají
 * jak pomíchat.
 */
let defaultGatewayUrl: string | undefined;

export function configureAiGateway(url?: string): void {
  defaultGatewayUrl = url || undefined;
}

/**
 * Sestaví cíl volání. Přes gateway se klíč posílá hlavičkou `x-goog-api-key`,
 * napřímo jako query parametr `?key=` — Google podporuje obojí, ale gateway
 * query parametr nepropaguje.
 */
function buildTarget(apiKey: string, gatewayUrl?: string): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (gatewayUrl) {
    return { url: `${gatewayUrl.replace(/\/+$/, "")}${GEMINI_PATH}`, headers: { ...headers, "x-goog-api-key": apiKey } };
  }
  return { url: `${GEMINI_HOST}${GEMINI_PATH}?key=${apiKey}`, headers };
}

export async function callGemini(apiKey: string, prompt: string, opts: GeminiOpts = {}): Promise<string | null> {
  const mod = opts.module ?? "gemini";
  const { url, headers } = buildTarget(apiKey, opts.gatewayUrl ?? defaultGatewayUrl);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        temperature: opts.temperature ?? 0.6,
        thinkingConfig: { thinkingBudget: 0 },
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
      ...(opts.safetySettings ? { safetySettings: opts.safetySettings } : {}),
    }),
  }).catch((e) => { logger.warn({ module: mod }, "gemini fetch failed", e); return null; });

  if (!res || !res.ok) {
    const errBody = res ? await res.text().catch(() => "") : "";
    logger.warn({ module: mod }, `gemini http ${res?.status ?? "no-response"}: ${errBody.slice(0, 200)}`);
    return null;
  }

  const json = await res.json().catch((e) => { logger.warn({ module: mod }, "gemini response parse", e); return null; }) as
    | { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }
    | null;
  if (!json) return null;

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  return text || null;
}
