/**
 * Hlasovky od hráčů.
 *
 * Když se hráč ozve sám (`ai-player-spawn`), může místo SMS poslat hlasovku:
 * text zprávy namluví Gemini TTS jeho stálým hlasem. Text zůstává v těle zprávy
 * jako přepis, takže AI má při odpovědi trenéra stejný kontext jako u SMS.
 *
 * Nanejvýš `VOICE_MESSAGES_PER_WEEK` na tým za 7 dní a jen přes Gemini
 * (Workers AI mluvit neumí). Když namluvení selže, odejde obyčejná SMS.
 */

import { logger } from "../lib/logger";

const M = "voice-message";

export const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";
export const VOICE_MESSAGES_PER_WEEK = 2;
/** Šance, že zpráva od hráče půjde hlasem, dokud tým nemá týdenní strop. Část zůstane SMS. */
export const VOICE_MESSAGE_CHANCE = 0.75;

const SAMPLE_RATE = 24000;
const PEAK_BARS = 40;

/**
 * Mužské hlasy Gemini podle věku hráče. Rozdělené podle naměřené výšky hlasu
 * (2026-10-24, medián F0 krátké věty): mladí 140–188 Hz, dospělí 128–144 Hz,
 * starší 100–133 Hz. Orus zní nejvýš, proto jen mladým.
 */
export const VOICES_BY_AGE = {
  young: ["Orus", "Zubenelgenubi", "Achird", "Iapetus", "Puck", "Fenrir"],
  adult: ["Charon", "Umbriel", "Sadachbia", "Alnilam", "Rasalgethi"],
  senior: ["Algieba", "Enceladus", "Sadaltager", "Schedar", "Algenib"],
} as const;

/**
 * Rozlišovací rys, aby dva hráči se stejným hlasem nezněli stejně. Anglicky,
 * protože jde do režijních poznámek pro model.
 */
export const VOICE_TRAITS = [
  "slightly raspy voice",
  "speaks fast",
  "speaks slowly and calmly",
  "a bit nasal",
  "deep, warm voice",
  "slight lisp",
  "strong South Bohemian accent",
  "loud and direct",
  "swallows word endings",
  "soft-spoken",
] as const;

export interface PlayerVoice {
  name: string;
  trait: string;
}

export interface VoiceMessageMeta {
  type: "voice";
  audioKey: string;
  durationSec: number;
  peaks: number[];
  voice: string;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function ageGroup(age: number): keyof typeof VOICES_BY_AGE {
  if (age <= 23) return "young";
  if (age <= 31) return "adult";
  return "senior";
}

function isPlayerVoice(value: unknown): value is PlayerVoice {
  const v = value as Partial<PlayerVoice> | null;
  return !!v && typeof v.name === "string" && typeof v.trait === "string"
    && Object.values(VOICES_BY_AGE).some((pool) => (pool as readonly string[]).includes(v.name!));
}

/**
 * Stálý hlas hráče. Uložený má přednost: věk se každou sezónu mění a hráč
 * nesmí jednoho dne začít mluvit cizím hlasem.
 */
export function pickPlayerVoice(playerId: string, age: number, stored?: unknown): PlayerVoice {
  if (isPlayerVoice(stored)) return stored;
  const pool = VOICES_BY_AGE[ageGroup(age)];
  const h = hash(playerId);
  return { name: pool[h % pool.length], trait: VOICE_TRAITS[Math.floor(h / pool.length) % VOICE_TRAITS.length] };
}

/** Text k namluvení: bez emoji, které by model buď přečetl, nebo zakoktal. */
export function spokenText(body: string): string {
  return body
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Opilý hlas. Pokyny samotné dají huhlání a pauzy, smích ale skoro ne
 * (ověřeno přepisem tří variant 2026-10-24). Proto se do textu ke čtení
 * přidávají značky, které model zahraje a nepřečte. V přepisu ve hře nejsou.
 */
const DRUNK_NOTES = "Drunk: heavily slurred speech and poor articulation, mushy consonants, words running into each other, "
  + "stretched vowels. Slow, uneven tempo; he loses his train of thought, makes long pauses in the middle of sentences "
  + "and restarts words. He giggles and laughs at his own words and hiccups a couple of times.";

const DRUNK_TAG_LIMIT = 2;

/** Značky do textu ke čtení: smích po zvolání, dlouhá pauza u trojtečky, občas škytnutí. Každé nanejvýš dvakrát. */
export function drunkTranscript(text: string, random: () => number = Math.random): string {
  let laughs = 0;
  let pauses = 0;
  let hiccups = 0;
  return text.replace(/([.!?…]+)(\s+|$)/g, (match, punct: string, space: string) => {
    if (punct.includes("!") && laughs < DRUNK_TAG_LIMIT) {
      laughs++;
      return `${punct} [laughs]${space}`;
    }
    if ((punct.startsWith("...") || punct === "…") && pauses < DRUNK_TAG_LIMIT) {
      pauses++;
      return `${punct} [long pause]${space}`;
    }
    if (hiccups < DRUNK_TAG_LIMIT && random() < 0.35) {
      hiccups++;
      return `${punct} [hiccup]${space}`;
    }
    return match;
  });
}

function languageNote(nationality: string | null): string {
  switch (nationality) {
    case null:
    case "CZ":
      return "native Czech speaker from a South Bohemian village, casual spoken Czech.";
    case "SK":
      return "native Slovak speaker. Read the transcript exactly as written, with a Slovak accent.";
    case "DE":
    case "AT":
      return "native German speaker. Read the transcript exactly as written, with a strong German accent.";
    case "UA":
      return "native Ukrainian speaker. Read the transcript exactly as written, with a Ukrainian accent.";
    default:
      return "foreign player living in Bohemia. Read the transcript exactly as written, with a noticeable foreign accent.";
  }
}

/**
 * Pokyny a text oddělené nadpisy. Když pokyn stál jen před dvojtečkou,
 * model ho přečetl nahlas spolu se zprávou.
 */
export function buildVoicePrompt(opts: {
  firstName: string;
  age: number;
  scene: string;
  voice: PlayerVoice;
  nationality: string | null;
  transcript: string;
  drunk?: boolean;
}): string {
  return [
    `# AUDIO PROFILE: ${opts.firstName}, ${opts.age}, player of a village football club in South Bohemia`,
    "## THE SCENE",
    `He records a voice message to his coach on his phone${opts.drunk ? " after far too many beers in the village pub" : ""}. `
      + `Situation: ${opts.scene}`,
    "### DIRECTOR'S NOTES",
    "Style: completely natural and unscripted, like a real WhatsApp voice message recorded on a phone by an ordinary person. "
      + "Not a performance, not a radio or audiobook voice. Natural breathing, small hesitations and short pauses where the commas "
      + "and dots are. The mood follows the situation and the words.",
    ...(opts.drunk ? [DRUNK_NOTES] : []),
    `Voice: ${opts.voice.trait}.`,
    `Language: ${languageNote(opts.nationality)}`,
    "#### TRANSCRIPT",
    opts.transcript,
  ].join("\n");
}

/** WAV obálka kolem PCM z Gemini (24 kHz, 16 bit, mono). */
export function pcmToWav(pcm: Uint8Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** Obrys nahrávky pro bublinu: hlasitost úseků 0–1. Odmocnina zvedá tiché části, ať je vidět i šepot. */
export function peaksFromPcm(pcm: Uint8Array, bars = PEAK_BARS): number[] {
  const samples = Math.floor(pcm.length / 2);
  const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);
  const segment = Math.max(1, Math.floor(samples / bars));
  const rms: number[] = [];
  for (let b = 0; b < bars; b++) {
    let sum = 0;
    let n = 0;
    for (let i = b * segment; i < Math.min(samples, (b + 1) * segment); i++) {
      const s = view.getInt16(i * 2, true);
      sum += s * s;
      n++;
    }
    rms.push(n ? Math.sqrt(sum / n) : 0);
  }
  const top = Math.max(...rms) || 1;
  return rms.map((r) => Math.round(Math.sqrt(r / top) * 100) / 100);
}

export function durationSecFromPcm(pcm: Uint8Array, sampleRate = SAMPLE_RATE): number {
  return Math.round(pcm.length / 2 / sampleRate);
}

/** Náhled v seznamu konverzací, místo přepisu. */
export function voicePreviewText(durationSec: number): string {
  const s = Math.max(0, Math.round(durationSec));
  return `🎤 Hlasová zpráva (${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")})`;
}

export async function synthesizeSpeech(apiKey: string, prompt: string, voiceName: string): Promise<Uint8Array | null> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }),
  }).catch((e) => { logger.warn({ module: M }, "TTS se nepodařilo zavolat", e); return null; });

  if (!res || !res.ok) {
    const errBody = res ? await res.text().catch((e) => { logger.warn({ module: M }, "tělo chybové odpovědi TTS", e); return ""; }) : "";
    logger.warn({ module: M }, `TTS http ${res?.status ?? "no-response"}: ${errBody.slice(0, 200)}`);
    return null;
  }

  const json = await res.json().catch((e) => { logger.warn({ module: M }, "odpověď TTS není JSON", e); return null; }) as
    | { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> }
    | null;
  const b64 = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) {
    logger.warn({ module: M }, "TTS nevrátil zvuk");
    return null;
  }
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

/** Kolik hlasovek tým dostal za posledních 7 dní. */
export async function voiceMessagesLastWeek(db: D1Database, teamId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const row = await db.prepare(
    `SELECT COUNT(*) AS n
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND m.sent_at > ? AND json_extract(m.metadata, '$.type') = 'voice'`,
  ).bind(teamId, since).first<{ n: number }>();
  return row?.n ?? 0;
}

export interface VoicePlayer {
  id: string;
  firstName: string;
  age: number;
  nationality: string | null;
  /** `players.life_context` tak, jak leží v DB (JSON text). */
  lifeContext: string | null;
}

/**
 * Zkusí zprávu od hráče namluvit a uložit do R2. Vrací metadata hlasovky,
 * nebo null, když má odejít obyčejná SMS: týdenní strop, náhoda, jiný
 * poskytovatel než Gemini, chybějící úložiště nebo chyba namluvení.
 *
 * `force` obchází strop i náhodu, je jen pro ruční spuštění z adminu.
 */
export async function recordVoiceMessage(
  db: D1Database,
  env: { GEMINI_API_KEY?: string; CACHE_KV?: KVNamespace; SEED_DATA?: R2Bucket },
  opts: {
    teamId: string;
    messageId: string;
    player: VoicePlayer;
    scene: string;
    body: string;
    /** Hráč volá z hospody: opilý hlas se smíchem a škytáním. */
    drunk?: boolean;
    force?: boolean;
    random?: () => number;
    now?: Date;
  },
): Promise<VoiceMessageMeta | null> {
  if (!env.GEMINI_API_KEY || !env.SEED_DATA) return null;
  const { readAiProvider } = await import("../lib/ai-provider");
  if ((await readAiProvider(env.CACHE_KV)) !== "gemini") return null;

  if (!opts.force) {
    const sent = await voiceMessagesLastWeek(db, opts.teamId, opts.now ?? new Date())
      .catch((e) => { logger.warn({ module: M }, "počet hlasovek za týden", e); return null; });
    // Když se počet nedá zjistit, radši SMS než hlasovky bez stropu.
    if (sent === null || sent >= VOICE_MESSAGES_PER_WEEK) return null;
    if ((opts.random ?? Math.random)() >= VOICE_MESSAGE_CHANCE) return null;
  }

  const plain = spokenText(opts.body);
  if (!plain) return null;
  const transcript = opts.drunk ? drunkTranscript(plain, opts.random ?? Math.random) : plain;

  let stored: unknown = null;
  try {
    stored = opts.player.lifeContext ? (JSON.parse(opts.player.lifeContext) as { voice?: unknown }).voice : null;
  } catch (e) {
    logger.warn({ module: M }, `life_context hráče ${opts.player.id} není JSON`, e);
  }
  const voice = pickPlayerVoice(opts.player.id, opts.player.age, stored);
  if (!isPlayerVoice(stored)) {
    await db.prepare(
      "UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.voice', json(?)) WHERE id = ?",
    ).bind(JSON.stringify(voice), opts.player.id).run()
      .catch((e) => { logger.warn({ module: M }, `uložení hlasu hráče ${opts.player.id}`, e); return null; });
  }

  const prompt = buildVoicePrompt({
    firstName: opts.player.firstName,
    age: opts.player.age,
    scene: opts.scene,
    voice,
    nationality: opts.player.nationality,
    transcript,
    drunk: opts.drunk,
  });
  const pcm = await synthesizeSpeech(env.GEMINI_API_KEY, prompt, voice.name);
  // Pod půl vteřiny to není hlasovka, ale useknutá odpověď.
  if (!pcm || pcm.length < SAMPLE_RATE) return null;

  const audioKey = `voice/${opts.messageId}.wav`;
  const saved = await env.SEED_DATA.put(audioKey, pcmToWav(pcm), { httpMetadata: { contentType: "audio/wav" } })
    .catch((e) => { logger.warn({ module: M }, `uložení hlasovky ${audioKey}`, e); return null; });
  if (!saved) return null;

  return { type: "voice", audioKey, durationSec: durationSecFromPcm(pcm), peaks: peaksFromPcm(pcm), voice: voice.name };
}
