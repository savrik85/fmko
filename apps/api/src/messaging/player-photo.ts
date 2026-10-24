/**
 * Fotky od hráčů v Telefonu. Hráč k SMS přiloží fotku z mobilu jako ve WhatsAppu:
 * z hospody, zranění, z práce. Fotku kreslí FLUX.2 klein 9B na Workers AI
 * (Cloudflare-hosted, platí se ze startupových kreditů, asi $0,012 za fotku).
 *
 * Fotky jsou vždy pohled hráče (stůl, noha, pracoviště), ne selfie: vymyšlené
 * obličeje by neseděly na kreslené hráče ve hře. Stadion na nich není nikdy,
 * AI by ho pokaždé postavila jinak (uživatel 2026-10-24).
 *
 * Český popis fotky (`photoAlt`) jde do historie konverzace, takže si hráč
 * pamatuje, co poslal, a na „hezký panáky“ odpoví k věci.
 */

import { logger } from "../lib/logger";
import type { Ambience } from "./voice-message";

const M = "player-photo";

export const PHOTO_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
/** Šance, že hráč k běžné zprávě přiloží fotku, když k situaci nějaká sedí. */
export const PHOTO_CHANCE = 0.35;

export interface PhotoScene {
  id: string;
  /** Zadání pro model, anglicky. */
  prompt: string;
  /** Co na fotce je, česky. Jde do historie konverzace pro AI a do alt textu. */
  alt: string;
  /** Na výšku jako fotka z mobilu, nebo na šířku. */
  portrait: boolean;
}

// „Pohled hráče“ musí být řečeno výslovně: jen „taken by the person himself“ dalo u obchodu selfie (2026-10-24).
const PHONE_PHOTO = "Candid smartphone photo from the person's own point of view, showing what he sees in front of him; he is not in the photo, it is not a selfie. Natural colors, slightly tilted, ordinary and unglamorous, not staged.";
const NO_TEXT = "No logos, no labels, no printed text, no writing anywhere. No faces looking at the camera.";

/** Fotky podle situace. Klíče používá `pickPhotoScene` a ruční téma `pub_invite`. */
export const PHOTO_SCENES: Record<string, PhotoScene> = {
  pub_round: {
    id: "pub_round",
    prompt: `${PHONE_PHOTO} A worn wooden table in a small village pub in South Bohemia in the evening: several plain dimpled glass mugs of Czech lager with thick white foam and no print on the glass, a row of small plain shot glasses with clear and golden spirits, plain white beer mats without any print, friends' hands and arms at the edges of the frame slightly blurred, warm yellow lamps. ${NO_TEXT}`,
    alt: "stůl v hospodě plný piv a panáků, kolem ruce kamarádů",
    portrait: true,
  },
  pub_celebration: {
    id: "pub_celebration",
    prompt: `${PHONE_PHOTO} Close-up of many hands raising plain dimpled glass mugs of lager with no print in a toast over a long wooden table in a village pub after a won amateur football match, faces out of the frame, warm light, evening. ${NO_TEXT}`,
    alt: "přípitek v hospodě po výhře, nad stolem zvednuté půllitry",
    portrait: false,
  },
  injury: {
    id: "injury",
    prompt: `${PHONE_PHOTO} First-person view looking down at his own leg resting on a footstool, the ankle wrapped in a beige elastic bandage with a blue ice pack on top, grey tracksuit trousers rolled up, living room carpet, evening lamp light. ${NO_TEXT}`,
    alt: "obvázaný kotník s ledem na stoličce",
    portrait: true,
  },
  training: {
    id: "training",
    prompt: `${PHONE_PHOTO} Close-up of muddy football boots and a dirty ball on wet grass at the edge of a training pitch, a few orange training cones, overcast evening. ${NO_TEXT}`,
    alt: "zablácené kopačky a míč na tréninku",
    portrait: true,
  },
};

/** Pohled z práce podle pracoviště (`WORKPLACE_AMBIENCE` ve voice-message.ts). */
const WORK_SCENES: Partial<Record<Ambience, { prompt: string; alt: string }>> = {
  farm: {
    prompt: "Inside a cowshed on a Czech farm, a row of black and white dairy cows eating hay, straw on the concrete floor, rubber boots in the corner, morning light through dusty windows.",
    alt: "kravín s krávami u žlabu",
  },
  forest: {
    prompt: "A spruce forest clearing with freshly cut logs stacked in a pile, a chainsaw resting on a stump, sawdust, overcast day.",
    alt: "paseka v lese, nařezané klády a motorovka na pařezu",
  },
  construction: {
    prompt: "A small building site of a family house in a Czech village, an orange concrete mixer, stacks of grey bricks, scaffolding, muddy ground, autumn afternoon.",
    alt: "stavba rodinného domu s míchačkou a cihlami",
  },
  workshop: {
    prompt: "A small car repair garage, an old car lifted on a hydraulic ramp, tools on a workbench, oil stains on the concrete floor, harsh fluorescent light.",
    alt: "autodílna, auto na zvedáku",
  },
  car: {
    prompt: "View from the driver's seat of a van on a narrow country road in South Bohemia, only the top rim of the steering wheel at the bottom edge of the frame with the centre hub out of frame, fields and spruce forest outside, overcast.",
    alt: "pohled za volantem dodávky na okresce",
  },
  office: {
    prompt: "A messy office desk with a computer monitor, a mug of coffee and stacks of papers, a window with a grey sky, fluorescent light.",
    alt: "pracovní stůl v kanceláři s kafem a papíry",
  },
  shop: {
    prompt: "View over the counter of a small village grocery shop: a cash register and a basket of bread rolls in the foreground, shelves with goods behind, morning light, nobody in the frame.",
    alt: "za pultem malého obchodu",
  },
  kitchen: {
    prompt: "A busy restaurant kitchen seen from the cook's position, pans on a gas stove, plates waiting on the steel counter, steam.",
    alt: "kuchyně v restauraci, pánve na plotně",
  },
};

export function workPhotoScene(workplace: Ambience): PhotoScene | null {
  const w = WORK_SCENES[workplace];
  return w ? { id: `work_${workplace}`, prompt: `${PHONE_PHOTO} ${w.prompt} ${NO_TEXT}`, alt: w.alt, portrait: true } : null;
}

/**
 * Fotka, která k běžné zprávě dává smysl, nebo null. O tom, jestli ji hráč
 * opravdu pošle, rozhoduje volající s `PHOTO_CHANCE`.
 */
export function pickPhotoScene(opts: {
  scenarioId: string;
  scenarioCategory: string;
  /** Zrovna v práci: pracoviště podle povolání, jinak null. */
  workplace: Ambience | null;
}): PhotoScene | null {
  switch (opts.scenarioId) {
    case "alcohol_struggle":
      return PHOTO_SCENES.pub_round;
    case "injury_concern":
      return PHOTO_SCENES.injury;
    case "training_complaint":
      return PHOTO_SCENES.training;
    case "praise_after_win":
    case "winning_streak_hype":
    case "goal_pride":
      return PHOTO_SCENES.pub_celebration;
  }
  return opts.workplace ? workPhotoScene(opts.workplace) : null;
}

/** Klíč fotky v R2. Nezávisí na zprávě, takže koncept (dry run) a odeslání sdílí jednu fotku. */
export function photoKey(id: string): string {
  return `photos/${id}.jpg`;
}

/**
 * Nakreslí fotku a uloží ji do R2. Při výpadku (3043), přetížení (400) nebo zablokování
 * filtrem (3030) zkusí po pauze jiný seed, nanejvýš čtyřikrát. Vrací klíč, nebo null, když se nepovedla (zpráva pak odejde bez fotky).
 */
export async function generatePlayerPhoto(
  ai: Ai,
  bucket: R2Bucket,
  scene: PhotoScene,
  id: string,
  seed: number,
  /** Pauza před dalším pokusem. Rychlé dotazy za sebou model občas odmítne (400/3043). */
  retryDelayMs = 1500,
): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0 && retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    const form = new FormData();
    form.append("prompt", scene.prompt);
    form.append("width", scene.portrait ? "768" : "1024");
    form.append("height", scene.portrait ? "1024" : "640");
    form.append("seed", String((seed + attempt * 7919) % 2147483647));
    const packed = new Response(form);
    const out = await ai.run(PHOTO_MODEL as keyof AiModels, {
      multipart: { body: packed.body, contentType: packed.headers.get("content-type") ?? "" },
    } as never).catch((e: unknown) => { logger.warn({ module: M }, `fotka ${scene.id}, pokus ${attempt + 1}`, e); return null; }) as
      | { image?: string }
      | null;
    if (!out?.image) continue;
    const key = photoKey(id);
    const bytes = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
    const saved = await bucket.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } })
      .catch((e: unknown) => { logger.warn({ module: M }, `uložení fotky ${key}`, e); return null; });
    return saved ? key : null;
  }
  return null;
}

/** Zpráva v historii pro AI: fotka se popíše, ať hráč ví, co poslal. */
export function historyBody(body: string, photoAlt: string | null | undefined): string {
  return photoAlt ? `[Fotka: ${photoAlt}] ${body}` : body;
}
