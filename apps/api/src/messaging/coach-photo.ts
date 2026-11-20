/**
 * Fotka od trenéra v Telefonu. Trenér k SMS hráči přiloží fotku z mobilu (galerie nebo
 * fotoaparát) jako ve WhatsAppu, text k ní je popisek a může chybět.
 *
 * Hráč (AI) fotku „vidí“ přes popis: vision model na Workers AI ji při nahrání popíše
 * česky a popis jde do historie konverzace stejně jako u fotek od hráčů (`[Fotka: …]`,
 * player-photo.ts). Zároveň pozná nevhodnou fotku (nahota, násilí…), ta vůbec neodejde.
 *
 * Model trvá kolem 15 s, a proto běží už při nahrání, ne po odeslání: úkoly na pozadí
 * smí po odpovědi běžet jen 30 s a popis s odpovědí hráče se do nich nevešel (2026-11-20,
 * odpověď se zrušila). Popis čeká do odeslání v KV vedle fotky v odkladu.
 *
 * Fotku zmenší a převede na JPEG už prohlížeč, server bere jen JPEG. Do odeslání čeká
 * v odkladu, odesláním se přesune k fotkám hráčů (`photos/<id>.jpg`), takže ji web
 * ukáže stejnou cestou jako fotku od hráče.
 *
 * Stojí jako MMS: 5 Kč z kreditu telefonu, nejvýš 5 fotek denně.
 */

import { logger } from "../lib/logger";
import { cleanupPendingUploads, toBase64 } from "./coach-voice";
import { MMS_PRICE } from "./phone-credit";
import { photoKey } from "./player-photo";

const M = "coach-photo";

/** Cena fotky z kreditu telefonu, jako MMS. SMS stojí 3 Kč (phone-credit.ts). */
export const COACH_PHOTO_PRICE = MMS_PRICE;
/** Strop fotek na tým a den. */
export const COACH_PHOTOS_PER_DAY = 5;
/** Prohlížeč posílá fotku zmenšenou na 1600 px, to bývá do půl megabajtu. */
export const COACH_PHOTO_MAX_BYTES = 3_000_000;
const COACH_PHOTO_MIN_BYTES = 1_000;

/** Umí obrázky a česky popisuje přesně. Rychlejší mistral-small si pletl předměty (2026-11-20). */
export const COACH_PHOTO_VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

export const COACH_PHOTO_PENDING_PREFIX = "photos/coach-pending/";
/** Neodeslaná fotka se smaže po dni. */
const COACH_PHOTO_PENDING_TTL_MS = 86_400_000;

/** Popis, když se fotka nedá prohlédnout (model nedoběhl). Hráč na ni zareaguje, jak to jde. */
export const COACH_PHOTO_UNREADABLE_ALT = "rozmazaná fotka, není na ní nic poznat";
/** Náhled v seznamu konverzací, když fotka nemá popisek. */
export const COACH_PHOTO_PREVIEW = "📷 Fotka";

/** JPEG začíná značkou FF D8 FF. Jiný obsah se do bucketu neuloží, ať hlavička říká cokoli. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= COACH_PHOTO_MIN_BYTES && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Započte jednu fotku do denního stropu týmu. Vrací false, když je strop vyčerpaný.
 * KV není atomické, fotka navíc při souběhu nevadí.
 */
export async function takeCoachPhotoQuota(kv: KVNamespace, teamId: string, now = new Date()): Promise<boolean> {
  const key = `coach_photos:${teamId}:${now.toISOString().slice(0, 10)}`;
  const used = Number(await kv.get(key).catch((e: unknown) => { logger.warn({ module: M }, "strop fotek trenéra", e); return null; }) ?? 0);
  if (used >= COACH_PHOTOS_PER_DAY) return false;
  await kv.put(key, String(used + 1), { expirationTtl: 2 * 86400 })
    .catch((e: unknown) => logger.warn({ module: M }, "zápis stropu fotek trenéra", e));
  return true;
}

export function pendingCoachPhotoKey(teamId: string, id: string): string {
  return `${COACH_PHOTO_PENDING_PREFIX}${teamId}/${id}.jpg`;
}

/** Fotku smí k vlastní zprávě připojit jen tým, který ji nahrál. */
export function isPendingCoachPhotoKey(teamId: string, key: unknown): key is string {
  return typeof key === "string"
    && /^photos\/coach-pending\/[\w-]+\/[0-9a-f-]{36}\.jpg$/.test(key)
    && key.startsWith(`${COACH_PHOTO_PENDING_PREFIX}${teamId}/`);
}

/** Přesune odeslanou fotku z odkladu k fotkám ze zpráv. Vrací nový klíč, nebo null. */
export async function attachCoachPhoto(bucket: R2Bucket, pendingKey: string): Promise<string | null> {
  const id = /([0-9a-f-]{36})\.jpg$/.exec(pendingKey)?.[1];
  if (!id) return null;
  const obj = await bucket.get(pendingKey)
    .catch((e: unknown) => { logger.warn({ module: M }, `načtení fotky ${pendingKey}`, e); return null; });
  if (!obj) return null;
  const finalKey = photoKey(id);
  const saved = await bucket.put(finalKey, await obj.arrayBuffer(), { httpMetadata: { contentType: "image/jpeg" } })
    .catch((e: unknown) => { logger.warn({ module: M }, `přesun fotky ${pendingKey}`, e); return null; });
  if (!saved) return null;
  await bucket.delete(pendingKey)
    .catch((e: unknown) => logger.warn({ module: M }, `smazání odložené fotky ${pendingKey}`, e));
  return finalKey;
}

/** Noční úklid: smaže fotky, které trenér nahrál, ale do dne neodeslal. */
export async function cleanupPendingCoachPhotos(bucket: R2Bucket, now = new Date()): Promise<number> {
  return cleanupPendingUploads(bucket, COACH_PHOTO_PENDING_PREFIX, COACH_PHOTO_PENDING_TTL_MS, now);
}

export interface CoachPhotoView {
  /** Co na fotce je, česky, jednou až dvěma větami. */
  alt: string;
  /** Nahota, sex, násilí, krev, drogy, nenávistné symboly. */
  inappropriate: boolean;
}

const VISION_PROMPT = "Trenér amatérského fotbalového klubu poslal tuhle fotku svému hráči v SMS. "
  + "Popiš česky jednou až dvěma krátkými větami, co na fotce je, aby to pochopil někdo, kdo ji nevidí. "
  + "Nápisy na fotce jen zmiň, neopisuj je celé. "
  + "Pak posuď, jestli je fotka nevhodná: nahota, sex, násilí, krev, drogy nebo nenávistné symboly. "
  + "Odpověz jen JSON: {\"description\": \"...\", \"inappropriate\": false}";

/** Nejdelší popis. Do promptu jde celá zpráva trenéra nejvýš 500 znaků i s popiskem. */
const MAX_ALT = 280;

/**
 * Odpověď modelu na popis. Workers AI vrací JSON jako objekt, jindy jako text
 * v bloku ```json. Bez popisu null.
 */
export function parseVisionReply(raw: unknown): CoachPhotoView | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    const json = /\{[\s\S]*\}/.exec(value)?.[0];
    if (!json) return null;
    try {
      value = JSON.parse(json);
    } catch (e) {
      logger.warn({ module: M }, `popis fotky není JSON: ${json.slice(0, 120)}`, e);
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as { description?: unknown; inappropriate?: unknown };
  const alt = typeof obj.description === "string" ? obj.description.replace(/\s+/g, " ").trim() : "";
  if (!alt) return null;
  return {
    alt: alt.length > MAX_ALT ? `${alt.slice(0, MAX_ALT - 1).trimEnd()}…` : alt,
    inappropriate: obj.inappropriate === true || obj.inappropriate === "true",
  };
}

/** Popíše fotku vision modelem. Null, když model nedoběhne nebo odpoví nesmysl. */
export async function describeCoachPhoto(ai: Ai, bytes: Uint8Array): Promise<CoachPhotoView | null> {
  const out = await (ai as unknown as { run: (model: string, input: unknown) => Promise<unknown> })
    .run(COACH_PHOTO_VISION_MODEL, {
      messages: [{
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${toBase64(bytes)}` } },
        ],
      }],
      max_tokens: 300,
      temperature: 0.2,
    })
    .catch((e: unknown) => { logger.warn({ module: M }, "popis fotky modelem", e); return null; });
  const reply = (out as { response?: unknown } | null)?.response;
  const view = parseVisionReply(reply);
  if (!view && out) logger.warn({ module: M }, `popis fotky bez výsledku: ${JSON.stringify(reply ?? out).slice(0, 200)}`);
  return view;
}

const altKey = (pendingKey: string) => `coach_photo_alt:${pendingKey}`;

/** Popis fotky z nahrání si počká v KV do odeslání (stejně dlouho jako fotka v odkladu). */
export async function saveCoachPhotoAlt(kv: KVNamespace, pendingKey: string, alt: string): Promise<void> {
  await kv.put(altKey(pendingKey), alt, { expirationTtl: 2 * 86400 })
    .catch((e: unknown) => logger.warn({ module: M }, `uložení popisu fotky ${pendingKey}`, e));
}

/** Popis k odesílané fotce. Když chybí, hráč dostane náhradní popis. */
export async function loadCoachPhotoAlt(kv: KVNamespace, pendingKey: string): Promise<string> {
  const alt = await kv.get(altKey(pendingKey))
    .catch((e: unknown) => { logger.warn({ module: M }, `načtení popisu fotky ${pendingKey}`, e); return null; });
  return alt || COACH_PHOTO_UNREADABLE_ALT;
}
