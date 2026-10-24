/**
 * Hlasová odpověď trenéra. Trenér v Telefonu nahraje odpověď, Whisper na Workers AI
 * ji přepíše a zpráva odejde jako hlasovka s přepisem v těle. Hráč (AI) odpovídá
 * na přepis stejně jako na SMS. Whisper umí česky a běží u Cloudflaru, takže se
 * platí ze startupových kreditů (2026-10-24, $0,0005 za minutu).
 */

import { logger } from "../lib/logger";

const M = "coach-voice";

export const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

/** Formáty z prohlížeče: Chrome a Firefox nahrávají webm/opus, Safari mp4/aac. */
export const COACH_AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/** Minuta opusu nebo aac je kolem půl megabajtu, víc trenér nenamluví. */
export const COACH_AUDIO_MAX_BYTES = 2_000_000;
export const COACH_AUDIO_MAX_SEC = 60;

export function coachAudioKey(teamId: string, id: string, ext: string): string {
  return `voice/coach/${teamId}/${id}.${ext}`;
}

/** Nahrávku smí k vlastní zprávě připojit jen tým, který ji nahrál. */
export function isCoachAudioKey(teamId: string, key: unknown): key is string {
  return typeof key === "string"
    && /^voice\/coach\/[\w-]+\/[\w-]+\.(webm|ogg|m4a|mp3|wav)$/.test(key)
    && key.startsWith(`voice/coach/${teamId}/`);
}

/** Obrys z prohlížeče: nanejvýš 64 čísel 0–1, jinak bublina použije náhradní. */
export function sanitizePeaks(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return undefined;
  if (!value.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) return undefined;
  return value.map((v) => Math.round(v * 100) / 100);
}

function toBase64(bytes: Uint8Array): string {
  // Po kouscích: jeden dlouhý řetězec po znacích shodil worker na megabajtové nahrávce.
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Co Whisper „slyší“ v tichu nebo šumu. Takový přepis neodejde. */
const SILENCE_HALLUCINATIONS = [/^děkuji\.?$/i, /^děkuji za pozornost\.?$/i, /^titulky\b/i, /^konec\.?$/i];

export interface WhisperResult {
  text?: string;
  transcription_info?: { duration_after_vad?: number };
  segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }>;
}

/**
 * Přepis, kterému se dá věřit, nebo null. Whisper si v tichu vymýšlí („Děkuji.“)
 * a s nápovědou v `initial_prompt` ji v tichu odříká celou (2026-10-24: „Trenér
 * nahrává hlasová hlasová…“), proto bez nápovědy a s kontrolou jistoty.
 */
export function trustedTranscript(out: WhisperResult | null): string | null {
  const text = out?.text?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const speechSec = out?.transcription_info?.duration_after_vad;
  if (speechSec !== undefined && speechSec < 0.5) return null;
  const segments = out?.segments ?? [];
  if (segments.length > 0 && !segments.some((s) => (s.avg_logprob ?? 0) > -1 && (s.no_speech_prob ?? 0) < 0.6)) return null;
  if (SILENCE_HALLUCINATIONS.some((re) => re.test(text))) return null;
  return text;
}

/** Přepis nahrávky. Vrací null, když přepis selže nebo v nahrávce není řeč. */
export async function transcribeCoachVoice(ai: Ai, audio: Uint8Array): Promise<string | null> {
  const out = await ai.run(WHISPER_MODEL as keyof AiModels, {
    audio: toBase64(audio),
    language: "cs",
    vad_filter: true,
  } as never).catch((e: unknown) => { logger.warn({ module: M }, "přepis hlasové odpovědi", e); return null; }) as
    | WhisperResult
    | null;
  return trustedTranscript(out);
}
