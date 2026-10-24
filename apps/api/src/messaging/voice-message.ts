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
 * Opilý hlas. Pokyny samotné dají huhlání a pauzy, smích ale skoro ne.
 * Ze tří variant (2026-10-24) vyhrála ta, kde je opilý i samotný text:
 * natažené samohlásky, „hehe“, „ehm“ a opakovaná slova. Model je pak zahraje.
 */
const DRUNK_NOTES = "Drunk: heavily slurred speech and poor articulation, mushy consonants, words running into each other, "
  + "stretched vowels. Slow, uneven tempo; he loses his train of thought, makes long pauses in the middle of sentences "
  + "and restarts words. He giggles and laughs at his own words.";

/** Co opilý hráč v hospodě utrousí. */
const DRUNK_SWEARS = ["kurva", "ty vole", "do prdele", "kurva fix", "do píči"] as const;

/** Krátká slova, která opilý člověk opakuje („vy… vy jste“). U jmen by opakování znělo divně. */
const REPEATABLE_WORDS = new Set(["vy", "ty", "já", "my", "to", "ale", "hele", "jo", "no", "tak", "fakt", "prostě", "víte"]);

/**
 * Text, jak ho namluví opilý hráč: natažená samohláska v prvním slově
 * (Šééfe), smích po zvoláních, „ehm“ uprostřed, zopakované krátké slovo,
 * „fakt fakt“ a zopakované krátké rozloučení. Obsah zprávy zůstává stejný.
 */
/**
 * Bez oslovení „trenére“. Opilý model ho zhruba napůl vyslovuje „trenéře“, i když se
 * nenatahuje a dostane pokyn k výslovnosti (2026-10-24). Komu hráč mluví, je z hlasovky jasné.
 */
export function withoutCoachAddress(text: string): string {
  const t = text
    .replace(/\s*,?\s*\btrenére\b\s*,?\s*/giu, ", ")
    .replace(/^,\s*/, "")
    .replace(/,\s*([.!?…])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t.charAt(0).toLocaleUpperCase("cs") + t.slice(1);
}

export function drunkSpeech(input: string): string {
  const text = withoutCoachAddress(input);
  const sentences = (text.match(/[^.!?…]+[.!?…]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return text;

  sentences[0] = sentences[0].replace(/[áéíóúůý]|[aeiouy]/i, (vowel) => vowel + vowel);

  let laughs = 0;
  for (let i = 0; i < sentences.length && laughs < 2; i++) {
    if (sentences[i].endsWith("!")) {
      sentences[i] += laughs === 0 ? " Hehehe." : " Hehe.";
      laughs++;
    }
  }

  if (sentences.length >= 2) {
    const middle = Math.max(1, Math.floor(sentences.length / 2));
    sentences[middle] = `Ehm... ${sentences[middle]}`;
  }

  // „fakt fakt“ jen ve delší větě, samotné „Fakt.“ si nechá opakování níž.
  const emphasisIndex = sentences.findIndex((s, i) => i > 0 && /\bfakt\b/i.test(s) && s.split(/\s+/).length >= 3);
  if (emphasisIndex >= 0) {
    sentences[emphasisIndex] = sentences[emphasisIndex].replace(/\bfakt\b/i, (word) => `${word} ${word.toLocaleLowerCase("cs")}`);
  }

  for (let i = sentences.length - 2; i >= 1; i--) {
    const first = sentences[i].match(/^\p{L}+/u)?.[0];
    if (i !== emphasisIndex && first && REPEATABLE_WORDS.has(first.toLocaleLowerCase("cs"))) {
      sentences[i] = `${first}... ${first.toLocaleLowerCase("cs")}${sentences[i].slice(first.length)}`;
      break;
    }
  }

  const last = sentences.length - 1;
  const farewell = sentences[last].match(/^(\p{L}+)([.!?…]*)$/u);
  if (last > 0 && farewell) {
    sentences[last] = `${farewell[1]}... ${farewell[1].toLocaleLowerCase("cs")}${farewell[2] || "."}`;
  }

  // Opilý nadává (přání uživatele 2026-10-24): za oslovením a na konci nejdelší věty uprostřed.
  const swear = (salt: number) => DRUNK_SWEARS[(hash(text) + salt) % DRUNK_SWEARS.length];
  const opener = swear(0);
  sentences[0] = sentences[0].includes(",")
    ? sentences[0].replace(/,\s*/, `, ${opener}, `)
    : `${sentences[0]} ${opener.charAt(0).toLocaleUpperCase("cs")}${opener.slice(1)}.`;
  let longest = -1;
  for (let i = 1; i < last; i++) {
    if (longest < 0 || sentences[i].length > sentences[longest].length) longest = i;
  }
  // Krátká zpráva nemá větu uprostřed, druhá nadávka pak přijde do poslední.
  const target = longest > 0 ? longest : last;
  if (target > 0) {
    const closer = swear(1) === opener ? swear(2) : swear(1);
    sentences[target] = sentences[target].replace(/([.!?…]*)( Hehe(?:he)?\.)?$/, (_m, punct: string, laugh: string | undefined) =>
      `, ${closer}${punct || "."}${laugh ?? ""}`);
  }

  return sentences.join(" ");
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
    // Bez českého popisu situace: model ho občas přečetl nahlas jako součást zprávy (2026-10-24).
    `He records a voice message to his coach on his phone${opts.drunk ? " after far too many beers in the village pub" : ""}.`,
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

/** Nahrávka hospody pod opilé hlasovky (CC0, freesound 376456 „Pub in Cambridge“), PCM 24 kHz mono 16 bit. */
export const PUB_AMBIENCE_KEY = "voice/ambience/pub-24k.pcm";

/**
 * Pod hlas přimíchá šum hospody: začne 0,6 s před hlasem, 0,8 s po něm dozní,
 * okraje se prolnou a hlasitost je kolem pětiny hlasu. Odladěno uživatelem
 * na ukázkových hlasovkách 2026-10-24 („zvuk hospody je top“).
 */
export function mixAmbience(voice: Uint8Array, ambience: Uint8Array, seed: number): Uint8Array {
  const v = new Int16Array(voice.buffer.slice(voice.byteOffset, voice.byteOffset + (voice.length & ~1)));
  const a = new Int16Array(ambience.buffer.slice(ambience.byteOffset, ambience.byteOffset + (ambience.length & ~1)));
  if (a.length === 0) return voice;
  const pre = Math.round(0.6 * SAMPLE_RATE);
  const post = Math.round(0.8 * SAMPLE_RATE);
  const fade = Math.round(0.3 * SAMPLE_RATE);
  const total = pre + v.length + post;
  const start = seed % Math.max(1, a.length - total);
  const at = (i: number) => a[(start + i) % a.length];

  let voiceSum = 0;
  let voiceCount = 0;
  for (const sample of v) {
    if (sample !== 0) { voiceSum += sample * sample; voiceCount++; }
  }
  let bedSum = 0;
  for (let i = 0; i < total; i++) bedSum += at(i) * at(i);
  const voiceRms = voiceCount ? Math.sqrt(voiceSum / voiceCount) : 3000;
  const gain = (voiceRms * 0.22) / (Math.sqrt(bedSum / total) || 1);

  const mix = new Float64Array(total);
  let peak = 0;
  for (let i = 0; i < total; i++) {
    const ramp = i < fade ? i / fade : i >= total - fade ? (total - 1 - i) / fade : 1;
    mix[i] = at(i) * gain * ramp + (i >= pre && i < pre + v.length ? v[i - pre] : 0);
    peak = Math.max(peak, Math.abs(mix[i]));
  }
  const scale = peak > 31128 ? 31128 / peak : 1;
  const out = new Uint8Array(total * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < total; i++) view.setInt16(i * 2, Math.round(mix[i] * scale), true);
  return out;
}

async function withPubAmbience(bucket: R2Bucket, voice: Uint8Array, seedText: string): Promise<Uint8Array> {
  const obj = await bucket.get(PUB_AMBIENCE_KEY)
    .catch((e) => { logger.warn({ module: M }, "načtení nahrávky hospody", e); return null; });
  if (!obj) {
    logger.warn({ module: M }, "nahrávka hospody chybí, opilá hlasovka jde bez ní");
    return voice;
  }
  return mixAmbience(voice, new Uint8Array(await obj.arrayBuffer()), hash(seedText));
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

export interface RecordedVoiceMessage {
  meta: VoiceMessageMeta;
  /** Co v nahrávce zazní. U opilé hlasovky se liší od textu SMS, proto jde do těla zprávy jako přepis. */
  transcript: string;
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
 * Zkusí zprávu od hráče namluvit a uložit do R2. Vrací metadata hlasovky a přepis,
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
): Promise<RecordedVoiceMessage | null> {
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
  const transcript = opts.drunk ? drunkSpeech(plain) : plain;

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
  const raw = await synthesizeSpeech(env.GEMINI_API_KEY, prompt, voice.name);
  // Pod půl vteřiny to není hlasovka, ale useknutá odpověď.
  if (!raw || raw.length < SAMPLE_RATE) return null;
  // Opilý volá z hospody, pod hlas se přimíchá její šum.
  const pcm = opts.drunk ? await withPubAmbience(env.SEED_DATA, raw, opts.messageId) : raw;

  const audioKey = `voice/${opts.messageId}.wav`;
  const saved = await env.SEED_DATA.put(audioKey, pcmToWav(pcm), { httpMetadata: { contentType: "audio/wav" } })
    .catch((e) => { logger.warn({ module: M }, `uložení hlasovky ${audioKey}`, e); return null; });
  if (!saved) return null;

  return {
    meta: { type: "voice", audioKey, durationSec: durationSecFromPcm(pcm), peaks: peaksFromPcm(pcm), voice: voice.name },
    transcript,
  };
}

/**
 * Přehraje už odeslané hlasovky s daným tématem opilým hlasem (varianta C):
 * stejný hráč, stejný hlas i text, jen opilá mluva. Přepíše nahrávku v R2,
 * přepis v těle zprávy, délku a obrys. Zprávy se nemažou.
 *
 * Po `limit` kusech, ať jeden požadavek nečeká minuty. Hotové mají v metadatech
 * `drunk: 1`, takže opakované volání pokračuje tam, kde skončilo.
 */
export async function rerecordVoiceMessagesDrunk(
  db: D1Database,
  env: { GEMINI_API_KEY?: string; SEED_DATA?: R2Bucket },
  /** `fixAddress`: jen už opilé hlasovky, které začínají „Treenére“ (model četl „trenéře“), oslovení se opraví. */
  opts: { scenarioId: string; scene: string; limit: number; fixAddress?: boolean },
): Promise<{ done: Array<{ messageId: string; player: string; durationSec: number }>; failed: string[]; left: number }> {
  const pending = opts.fixAddress
    ? "json_extract(m.metadata, '$.drunk') = 1 AND m.body LIKE 'Treen%'"
    : "json_extract(m.metadata, '$.drunk') IS NULL";
  if (!env.GEMINI_API_KEY || !env.SEED_DATA) throw new Error("chybí klíč Gemini nebo úložiště");
  const rows = await db.prepare(
    `SELECT m.id, m.conversation_id, m.body, m.metadata, p.first_name, p.age, p.nationality, p.life_context
       FROM messages m JOIN players p ON p.id = m.sender_id
      WHERE json_extract(m.metadata, '$.scenario_id') = ? AND json_extract(m.metadata, '$.type') = 'voice'
        AND ${pending}
      ORDER BY m.sent_at LIMIT ?`,
  ).bind(opts.scenarioId, opts.limit).all<{
    id: string; conversation_id: string; body: string; metadata: string;
    first_name: string; age: number; nationality: string | null; life_context: string | null;
  }>();

  const done: Array<{ messageId: string; player: string; durationSec: number }> = [];
  const failed: string[] = [];
  for (const row of rows.results) {
    const meta = JSON.parse(row.metadata) as VoiceMessageMeta;
    let stored: unknown = null;
    try {
      stored = row.life_context ? (JSON.parse(row.life_context) as { voice?: unknown }).voice : null;
    } catch (e) {
      logger.warn({ module: M }, `life_context zprávy ${row.id} není JSON`, e);
    }
    const voice: PlayerVoice = isPlayerVoice(stored) ? stored : { name: meta.voice, trait: VOICE_TRAITS[0] };
    const transcript = opts.fixAddress ? row.body.replace(/^Treenére/, "Trenére") : drunkSpeech(spokenText(row.body));
    const prompt = buildVoicePrompt({
      firstName: row.first_name, age: row.age, scene: opts.scene, voice,
      nationality: row.nationality, transcript, drunk: true,
    });
    const raw = await synthesizeSpeech(env.GEMINI_API_KEY, prompt, voice.name);
    if (!raw || raw.length < SAMPLE_RATE) {
      failed.push(row.id);
      continue;
    }
    const pcm = await withPubAmbience(env.SEED_DATA, raw, row.id);
    await env.SEED_DATA.put(meta.audioKey, pcmToWav(pcm), { httpMetadata: { contentType: "audio/wav" } });
    const durationSec = durationSecFromPcm(pcm);
    await db.batch([
      db.prepare(
        `UPDATE messages SET body = ?, metadata = json_set(metadata, '$.durationSec', ?, '$.peaks', json(?), '$.drunk', 1, '$.rev', ?)
          WHERE id = ?`,
      ).bind(transcript, durationSec, JSON.stringify(peaksFromPcm(pcm)), opts.fixAddress ? 3 : 2, row.id),
      db.prepare(
        "UPDATE conversations SET last_message_text = ? WHERE id = ? AND last_message_text LIKE '🎤%'",
      ).bind(voicePreviewText(durationSec), row.conversation_id),
    ]);
    done.push({ messageId: row.id, player: row.first_name, durationSec });
  }

  const left = await db.prepare(
    `SELECT COUNT(*) AS n FROM messages m
      WHERE json_extract(m.metadata, '$.scenario_id') = ? AND json_extract(m.metadata, '$.type') = 'voice'
        AND ${pending}`,
  ).bind(opts.scenarioId).first<{ n: number }>();
  return { done, failed, left: left?.n ?? 0 };
}
