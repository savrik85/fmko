/**
 * Focení stránky tak, jak ji hráč vidí (pro nahlášení chyby).
 *
 * Fotí se `.app-shell`: obal hry má výšku okna, takže snímek odpovídá screenu
 * tlačítky telefonu i s horní a spodní lištou, ne celé dlouhé stránce.
 *
 * Zkouška (fáze 1) porovnává dvě knihovny, vítěz zůstane ve fázi 2.
 * Obě se načtou až při focení, do běžného načtení stránky nic nepřidávají.
 */

export type CaptureEngine = "modern-screenshot" | "snapdom";

export interface CaptureResult {
  engine: CaptureEngine;
  blob: Blob | null;
  width: number;
  height: number;
  /** Doba focení včetně načtení knihovny. */
  ms: number;
  error?: string;
}

const JPEG_QUALITY = 0.85;
const MAX_SCALE = 2;
const IGNORE_ATTRIBUTE = "data-capture-ignore";
/** Zaseknuté stahování obrázku nesmí nechat hráče čekat napořád. */
const CAPTURE_TIMEOUT_MS = 15_000;

function captureTarget(): HTMLElement {
  return document.querySelector<HTMLElement>(".app-shell") ?? document.body;
}

function isIgnored(node: Node): boolean {
  return node instanceof Element && node.hasAttribute(IGNORE_ATTRIBUTE);
}

async function renderWith(engine: CaptureEngine, target: HTMLElement): Promise<Blob> {
  const scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
  const backgroundColor = getComputedStyle(document.body).backgroundColor;
  if (engine === "modern-screenshot") {
    const { domToBlob } = await import("modern-screenshot");
    return domToBlob(target, {
      type: "image/jpeg",
      quality: JPEG_QUALITY,
      scale,
      backgroundColor,
      filter: (node) => !isIgnored(node),
      // `main` hry scrolluje sám, okno stojí. Bez toho by kopie začínala nahoře
      // a snímek ukázal začátek stránky. Posun se dělá jen na kopii, živá
      // stránka (přilepené lišty) zůstává, jak je. snapdom to umí sám.
      features: { restoreScrollPosition: true },
    });
  }
  const { snapdom } = await import("@zumer/snapdom");
  // snapdom násobí `scale` ještě hustotou displeje (`dpr`, výchozí devicePixelRatio);
  // se `scale` vyšel snímek na iPhonu 4× místo 2×. Rozlišení proto nese `dpr`.
  return snapdom.toBlob(target, {
    format: "jpg",
    quality: JPEG_QUALITY,
    scale: 1,
    dpr: scale,
    backgroundColor,
    exclude: `[${IGNORE_ATTRIBUTE}]`,
  });
}

/** Vyfotí viditelnou část hry. Nikdy nevyhodí: chyba je v `error`, `blob` je pak `null`. */
export async function captureVisibleApp(engine: CaptureEngine): Promise<CaptureResult> {
  const target = captureTarget();
  const width = target.clientWidth;
  const height = target.clientHeight;
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Focení trvalo déle než 15 s")), CAPTURE_TIMEOUT_MS);
    });
    const blob = await Promise.race([renderWith(engine, target), timeout]);
    return { engine, blob, width, height, ms: Math.round(performance.now() - started) };
  } catch (e) {
    console.error("Focení stránky selhalo:", engine, e);
    return {
      engine,
      blob: null,
      width,
      height,
      ms: Math.round(performance.now() - started),
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
