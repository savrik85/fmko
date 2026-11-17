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

function captureTarget(): HTMLElement {
  return document.querySelector<HTMLElement>(".app-shell") ?? document.body;
}

/**
 * `main` hry scrolluje sám, okno stojí. Knihovny fotí kopii stránky a ta začíná
 * nahoře, takže by snímek ukázal začátek stránky místo místa, kam hráč dojel.
 * Posun se proto na dobu focení převede na `transform` dětí `main`: vizuálně se nic
 * nehne a kopie už posunutá je. Vrácená funkce stav obnoví.
 */
function freezeMainScroll(target: HTMLElement): () => void {
  const main = target.querySelector("main");
  if (!main || main.scrollTop === 0) return () => undefined;
  const scrollTop = main.scrollTop;
  const children = [...main.children] as HTMLElement[];
  const previousTransforms = children.map((child) => child.style.transform);
  children.forEach((child) => { child.style.transform = `translateY(-${scrollTop}px)`; });
  main.scrollTop = 0;
  return () => {
    children.forEach((child, i) => { child.style.transform = previousTransforms[i]; });
    main.scrollTop = scrollTop;
  };
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
  const restoreScroll = freezeMainScroll(target);
  try {
    const blob = await renderWith(engine, target);
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
    restoreScroll();
  }
}
