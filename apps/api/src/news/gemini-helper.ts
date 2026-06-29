/**
 * Sdílený helper pro volání Gemini 2.5 Flash.
 * Vrací čistý text (thinking parts odfiltrovány) nebo null při chybě.
 */

import { logger } from "../lib/logger";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export interface GeminiOpts {
  maxOutputTokens?: number;
  temperature?: number;
  /** Vynutit JSON výstup (responseMimeType: application/json). */
  json?: boolean;
  module?: string;
}

export async function callGemini(apiKey: string, prompt: string, opts: GeminiOpts = {}): Promise<string | null> {
  const mod = opts.module ?? "gemini";
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        temperature: opts.temperature ?? 0.6,
        thinkingConfig: { thinkingBudget: 0 },
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
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
