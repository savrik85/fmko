/**
 * Fotky plachet do reportu Prales Ultras. Místo kreslené plachty (`/kotel-foto`)
 * fotka fanoušků, kteří drží plachtu se skutečným nápisem kotle, namalovaným
 * přímo na látku. Kreslí FLUX.2 klein 9B na Workers AI (startupové kredity).
 *
 * Nápis s diakritikou model většinou trefí, asi u každé čtvrté plachty ale namaluje
 * čárku místo háčku nebo kroužku (KOVÁĆIK, ZÚSTÁVÁ). Proto si fotku přečte Gemini,
 * a když nápis nesedí, zkusí se jiný seed. Když se nepovede ani na čtvrtý pokus,
 * zůstane kreslená plachta.
 *
 * Celý stadion na fotce není (uživatel: AI by ho pokaždé postavila jinak), jen tribuna
 * kotle za levou brankou podle úrovně z dat klubu; bez tribuny plot a kopce za ním.
 */

import { logger } from "../lib/logger";
import { GEMINI_TEXT_MODEL } from "./gemini-helper";

const M = "ultras-photo";

export const ULTRAS_PHOTO_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
/**
 * Strop fotek na report. Galerie ukazuje kotel každého domácího a liga má nanejvýš
 * 14 týmů (7 zápasů), takže se vyfotí všechny a kreslená plachta nezůstane vedle fotek.
 */
export const ULTRAS_PHOTOS_PER_REPORT = 8;
// Dlouhý nápis (třeba Spůle, 44 znaků) vyjde správně asi na třetinu pokusů, se čtyřmi to dá ~80 %.
const ATTEMPTS = 4;
export const BANNER_READ_PROMPT = "Přepiš nápis na plachtě přesně tak, jak je namalovaný, písmeno po písmenu. Neopravuj pravopis ani jména: když je nad písmenem čárka místo háčku (třeba Ć místo Č nebo Ś místo Š), napiš to tak, jak to je. Odpověz jen tím nápisem.";

export function ultrasPhotoKey(id: string): string {
  return `photos/ultras/${id}.jpg`;
}

/** Barva slovy pro zadání modelu (anglicky). Hex model nechápe, „burgundy“ ano. */
export function colorName(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  if ([r, g, b].some((v) => Number.isNaN(v))) return "white";
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  if (light < 0.15) return "black";
  if (light > 0.88) return "white";
  if (sat < 0.18) return light < 0.5 ? "dark grey" : "light grey";
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  const dark = light < 0.35 ? "dark " : "";
  // Bordó dresů leží kolem 340° (#920c32 = 343°), proto červená začíná už na 335°.
  if (hue < 15 || hue >= 335) return light < 0.35 ? "burgundy" : "red";
  if (hue < 40) return `${dark}orange`;
  if (hue < 65) return light < 0.4 ? "olive" : "yellow";
  if (hue < 160) return `${dark}green`;
  if (hue < 200) return `${dark}teal`;
  if (hue < 255) return light < 0.35 ? "navy blue" : "blue";
  if (hue < 290) return `${dark}purple`;
  return light < 0.35 ? "dark magenta" : "pink";
}

export interface UltrasBanner {
  ultrasText: string;
  bannerColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  /** Velikost kotle 1–3 (`stadiums.ultras_stand`). */
  level: number;
  /**
   * Kde kotel stojí: tribuna za levou brankou (`stand_goal_west`, ve 3D jih), střecha (`roof`)
   * a mříž nebo plexi před kotlem (`cage`). Bez údaje stojí fanoušci u plotu bez tribuny.
   */
  stand?: { level: number; roof: number; cage: number };
}

/**
 * Tribuna kotle ze sloupců `stadiums`. Kotel stojí za levou brankou (ve 3D jih,
 * `SEKTOR_STRANY.kotel`); stadion bez sloupců stran má jen `stands`.
 */
export function ultrasStandFromStadium(s: {
  stand_goal_west?: number | null;
  stands?: number | null;
  roof?: number | null;
  cage?: number | null;
}): NonNullable<UltrasBanner["stand"]> {
  return { level: s.stand_goal_west ?? s.stands ?? 0, roof: s.roof ?? 0, cage: s.cage ?? 0 };
}

/** Tribuna kotle slovy pro model, podle popisů úrovní ve hře (`UPGRADE_EFFECTS`). */
function standScene(stand: UltrasBanner["stand"]): { place: string; extra: string } {
  const level = Math.max(0, Math.min(3, Math.round(stand?.level ?? 0)));
  if (level === 0) {
    return { place: "standing behind a low metal fence by the pitch", extra: "Spruce-covered hills behind, no stadium stands in the picture." };
  }
  const roof = level >= 2 && (stand?.roof ?? 0) >= 1 ? " under a simple metal roof" : "";
  const place = [
    "",
    // „Stání s ohrádkou za brankou“
    "standing on a few low concrete terrace steps with a simple metal railing behind the goal",
    // „Tribunka za brankou“
    `standing in a small stand behind the goal${roof}, a few rows of plain plastic seats rising behind them`,
    // „Velká tribuna za brankou“
    `standing at the front of a large stand behind the goal${roof}, many rows of plain plastic seats rising high behind them`,
  ][level];
  const cage = stand?.cage ?? 0;
  const barrier = cage >= 2
    ? " Tall clear plexiglass panels stand between them and the pitch, the banner hangs on the pitch side of the panels."
    : cage === 1
      ? " A tall metal mesh fence stands between them and the pitch, the banner is tied to the pitch side of the mesh."
      : "";
  return { place, extra: `Photo taken from the edge of the pitch, spruce-covered hills visible above the stand.${barrier} The seats are plain, without any lettering.` };
}

export function ultrasPhotoPrompt(b: UltrasBanner): string {
  const primary = colorName(b.primaryColor);
  const secondary = colorName(b.secondaryColor);
  // Vlajky bez znaku: jinak si model vymyslí klubové erby.
  const flags = `plain ${primary} and ${secondary} flags without any emblem`;
  const crowd = b.level >= 3
    ? `a big crowd of loud local fans with ${flags} and a drum`
    : b.level === 2
      ? `a group of about fifteen local fans, a few waving ${flags}`
      : "a small group of local fans";
  const banner = colorName(b.bannerColor);
  let letters = colorName(b.textColor);
  // Nápis v barvě plachty by nešel přečíst (klub si je někdy nastaví stejně).
  if (letters === banner) letters = ["white", "light grey", "yellow", "pink"].includes(banner) ? "black" : "white";
  // Bez nápovědy model maluje háček jako čárku (KOVÁĆIK 6× ze 6), s ní 3× ze 3 správně (2026-10-24).
  // Ů nenamaluje ani s nápovědou, takovou plachtu zachrání jen kontrola a kreslená plachta.
  const carons = [...new Set(b.ultrasText.toLocaleUpperCase("cs").match(/[ČŠŘŽĚŇŤĎ]/g) ?? [])];
  const scene = standScene(b.stand);
  return [
    `Candid smartphone photo of ${crowd} of a village football club in South Bohemia, wearing ${primary} and ${secondary} scarves, ${scene.place}.`,
    `They hold up a long ${banner} cloth banner hand-painted with uneven ${letters} brush letters that read exactly "${b.ultrasText}".`,
    `The paint is slightly smudged and follows the folds of the fabric. Overcast autumn afternoon. ${scene.extra}`,
    "No other text or logos anywhere.",
    ...(carons.length > 0
      ? [`Czech letters painted carefully: ${carons.join(", ")} ${carons.length > 1 ? "have" : "has"} a small v-shaped caron above, not an acute accent.`]
      : []),
  ].join(" ");
}

/**
 * Nápis na fotce sedí, když sedí písmena i s diakritikou. Mezery a interpunkce se nepočítají.
 * Samostatná znaménka (\p{M}) zůstávají: Gemini píše háček nad Y jako „Y̌“ a bez nich by
 * chybná plachta prošla jako „Y“.
 */
export function bannerTextMatches(expected: string, read: string): boolean {
  const norm = (s: string) => s.normalize("NFC").toLocaleUpperCase("cs").replace(/[^\p{L}\p{M}\p{N}]/gu, "");
  return norm(expected) === norm(read);
}

/**
 * Gemini přečte nápis na plachtě. Null, když čtení selže (pak se fotka bere bez kontroly).
 * Musí mít výslovně zakázáno opravovat: s obyčejným „přepiš přesně“ četlo KOVÁĆIK jako
 * KOVÁČIK a chybnou plachtu pustilo (2026-10-24, z 9 fotek nenašlo ani jednu ze 2 chyb).
 */
export async function readBannerText(apiKey: string, jpeg: Uint8Array): Promise<string | null> {
  let bin = "";
  for (let i = 0; i < jpeg.length; i += 0x8000) bin += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: btoa(bin) } },
          { text: BANNER_READ_PROMPT },
        ],
      }],
      generationConfig: { thinkingConfig: { thinkingBudget: 0 }, temperature: 0 },
    }),
  }).catch((e: unknown) => { logger.warn({ module: M }, "čtení nápisu plachty", e); return null; });
  if (!res || !res.ok) {
    logger.warn({ module: M }, `čtení nápisu plachty http ${res?.status ?? "bez odpovědi"}`);
    return null;
  }
  const json = await res.json().catch((e: unknown) => { logger.warn({ module: M }, "odpověď čtení plachty", e); return null; }) as
    | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    | null;
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  return text || null;
}

/**
 * Nakreslí fotku plachty a uloží ji do R2. S klíčem Gemini fotku přečte a vezme
 * jen tu, kde nápis sedí. Vrací id fotky, nebo null (zůstane kreslená plachta).
 */
export async function generateUltrasPhoto(
  ai: Ai,
  bucket: R2Bucket,
  banner: UltrasBanner,
  id: string,
  seed: number,
  geminiApiKey?: string,
  retryDelayMs = 1500,
): Promise<string | null> {
  // Ů model nenamaluje (na testu 0 z 16 pokusů, vždy Ú nebo Ű) a šablona „… ZŮSTÁVÁ“ je častá:
  // pokusy by se jen spálily, plachta zůstane rovnou kreslená.
  if (/[Ůů]/.test(banner.ultrasText)) return null;
  const prompt = ultrasPhotoPrompt(banner);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0 && retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", "1024");
    form.append("height", "640");
    form.append("seed", String((seed + attempt * 7919) % 2147483647));
    const packed = new Response(form);
    const out = await ai.run(ULTRAS_PHOTO_MODEL as keyof AiModels, {
      multipart: { body: packed.body, contentType: packed.headers.get("content-type") ?? "" },
    } as never).catch((e: unknown) => { logger.warn({ module: M }, `plachta, pokus ${attempt + 1}`, e); return null; }) as
      | { image?: string }
      | null;
    if (!out?.image) continue;
    const jpeg = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
    if (geminiApiKey) {
      const read = await readBannerText(geminiApiKey, jpeg);
      if (read !== null && !bannerTextMatches(banner.ultrasText, read)) {
        logger.info({ module: M }, `nápis nesedí („${read}“ místo „${banner.ultrasText}“), zkouším jiný seed`);
        continue;
      }
    }
    const saved = await bucket.put(ultrasPhotoKey(id), jpeg, { httpMetadata: { contentType: "image/jpeg" } })
      .catch((e: unknown) => { logger.warn({ module: M }, `uložení fotky plachty ${id}`, e); return null; });
    return saved ? id : null;
  }
  return null;
}
