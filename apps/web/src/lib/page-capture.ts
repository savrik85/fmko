/**
 * Focení celé stránky hry pro nahlášení chyby, jako dlouhý screenshot na telefonu:
 * nahoře horní lišta, pod ní celý obsah stránky od začátku do konce, dole spodní lišta.
 *
 * Fotí se `.app-shell` přes modern-screenshot (vyhrál zkoušku A/B 2026-11-17).
 * Hodně dlouhá stránka se fotí jen kolem místa, kde hráč je (`MAX_CAPTURE_HEIGHT`).
 * Obsah hry scrolluje uvnitř `<main>`, okno stojí. V kopii stránky se proto `main`
 * a obal nad ním natáhnou na plnou výšku obsahu; živá stránka se nemění.
 * Knihovna se načte až při focení, do běžného načtení stránky nic nepřidává.
 */

export interface CaptureResult {
  blob: Blob | null;
  /** Rozměr fotky v CSS pixelech (před měřítkem). */
  width: number;
  height: number;
  /** Stránka je delší než strop, snímek ukazuje jen okolí místa, kde hráč byl. */
  truncated: boolean;
  /** Doba focení včetně načtení knihovny. */
  ms: number;
  error?: string;
}

const JPEG_QUALITY = 0.85;
const MAX_SCALE = 2;
/**
 * Safari na iPhonu neumí plátno větší než ~16,7 Mpx (4096 × 4096) a místo chyby
 * vrátí prázdný obrázek. S rezervou se měřítko sníží tak, aby se fotka vešla.
 */
const MAX_CANVAS_PIXELS = 16_000_000;
const MIN_SCALE = 1;
/**
 * Nejvyšší fotka v CSS pixelech (~7 obrazovek telefonu). Kádr (1 800) i Dres (5 700)
 * se vejdou celé; Zpravodaj (15 800) se fotil 37 s, měl 3 MB a prohlížeč na chvíli
 * zamrzl. Delší stránka se vyfotí jen kolem místa, kde hráč je.
 */
const MAX_CAPTURE_HEIGHT = 6_000;
const IGNORE_ATTRIBUTE = "data-capture-ignore";
/**
 * Jak dlouho knihovna čeká na jeden obrázek (načtení i stažení do snímku). Výchozích
 * 30 s se čekalo vždycky: obrázky s `loading="lazy"` mimo displej se nenačtou nikdy
 * (Zpravodaj). Nenačtený obrázek se do snímku stejně stáhne, nebo zůstane prázdný.
 */
const MEDIA_TIMEOUT_MS = 5_000;
/** Pojistka na celé focení: hráč nesmí čekat napořád. */
const CAPTURE_TIMEOUT_MS = 20_000;

function captureTarget(): HTMLElement {
  return document.querySelector<HTMLElement>(".app-shell") ?? document.body;
}

function isIgnored(node: Node): boolean {
  return node instanceof Element && node.hasAttribute(IGNORE_ATTRIBUTE);
}

export interface PagePlan {
  width: number;
  /** Výška fotky v CSS pixelech: lišty + vyfocený obsah. */
  height: number;
  /** Kolik obsahu `main` se vyfotí. */
  contentHeight: number;
  /** Od kterého místa obsahu `main` se fotí (0 = od začátku). */
  contentOffset: number;
  scale: number;
  /** Stránka je delší než strop, snímek ukazuje jen okolí místa, kde hráč je. */
  truncated: boolean;
}

/**
 * Rozměr fotky: lišty kolem `main` plus jeho obsah, nejvýš `MAX_CAPTURE_HEIGHT`.
 * Delší obsah se vyfotí v okně vystředěném na to, co hráč právě vidí.
 */
export function planPageCapture(page: {
  viewportWidth: number;
  viewportHeight: number;
  mainClientHeight: number;
  mainScrollHeight: number;
  mainScrollTop: number;
  devicePixelRatio: number;
}): PagePlan {
  const chrome = Math.max(0, page.viewportHeight - page.mainClientHeight);
  const fullContent = Math.max(page.mainScrollHeight, page.mainClientHeight);
  const contentHeight = Math.min(fullContent, MAX_CAPTURE_HEIGHT - chrome);
  const truncated = contentHeight < fullContent;
  const centered = page.mainScrollTop + page.mainClientHeight / 2 - contentHeight / 2;
  const contentOffset = truncated ? Math.round(Math.min(Math.max(centered, 0), fullContent - contentHeight)) : 0;
  const height = chrome + contentHeight;
  const wanted = Math.min(page.devicePixelRatio || 1, MAX_SCALE);
  const fitting = Math.sqrt(MAX_CANVAS_PIXELS / (page.viewportWidth * height));
  const scale = Math.max(MIN_SCALE, Math.min(wanted, fitting));
  return { width: page.viewportWidth, height, contentHeight, contentOffset, scale, truncated };
}

/**
 * Obrázky s `loading="lazy"`, ke kterým hráč nedoscrolloval, se samy nenačtou
 * a knihovna by na každý čekala celý `MEDIA_TIMEOUT_MS` (Zpravodaj: 10,4 s místo 2,8 s).
 * Do snímku se stahují tak jako tak, takže se jen pustí načítat dřív.
 */
function loadLazyImages(target: HTMLElement): void {
  target.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((img) => {
    if (!img.complete) img.loading = "eager";
  });
}

async function renderFullPage(target: HTMLElement, plan: PagePlan): Promise<Blob> {
  loadLazyImages(target);
  const { domToBlob } = await import("modern-screenshot");
  const main = target.querySelector("main");
  const column = main?.parentElement ?? null;
  const columnHeight = column && main ? column.clientHeight + (plan.contentHeight - main.clientHeight) : 0;
  return domToBlob(target, {
    type: "image/jpeg",
    quality: JPEG_QUALITY,
    scale: plan.scale,
    width: plan.width,
    height: plan.height,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    filter: (node) => !isIgnored(node),
    timeout: MEDIA_TIMEOUT_MS,
    // Kopie má výšky živé stránky natvrdo ve stylu; `main` a sloupec nad ním se
    // natáhnou na vyfocený obsah, aby se nescrollovalo. Živá stránka se nemění.
    onCloneNode: (cloned) => {
      if (!(cloned instanceof HTMLElement) || !main) return;
      const clonedMain = cloned.querySelector("main");
      if (!clonedMain) return;
      clonedMain.style.setProperty("height", `${plan.contentHeight}px`, "important");
      clonedMain.style.setProperty("max-height", "none", "important");
      clonedMain.style.setProperty("overflow", "hidden", "important");
      if (plan.contentOffset > 0) {
        [...clonedMain.children].forEach((child) => {
          if (child instanceof HTMLElement) {
            child.style.setProperty("transform", `translateY(-${plan.contentOffset}px)`, "important");
          }
        });
      }
      const clonedColumn = clonedMain.parentElement;
      if (clonedColumn && clonedColumn !== cloned) {
        clonedColumn.style.setProperty("height", `${columnHeight}px`, "important");
        clonedColumn.style.setProperty("max-height", "none", "important");
      }
      // Spodní lišta a výplň pod ní mají v kopii vypočtené `top` z displeje
      // (např. 749px) a zůstaly by uprostřed dlouhé fotky. Ke spodku je vrátí `top: auto`.
      cloned.querySelectorAll<HTMLElement>("*").forEach((el) => {
        if (el.style.position === "fixed" && el.style.bottom === "0px") {
          el.style.setProperty("top", "auto", "important");
        }
      });
    },
  });
}

/** Vyfotí celou stránku hry. Nikdy nevyhodí: chyba je v `error`, `blob` je pak `null`. */
export async function capturePage(): Promise<CaptureResult> {
  const target = captureTarget();
  const main = target.querySelector("main");
  const plan = planPageCapture({
    viewportWidth: target.clientWidth,
    viewportHeight: target.clientHeight,
    mainClientHeight: main?.clientHeight ?? target.clientHeight,
    mainScrollHeight: main?.scrollHeight ?? target.clientHeight,
    mainScrollTop: main?.scrollTop ?? 0,
    devicePixelRatio: window.devicePixelRatio,
  });
  const base = { width: plan.width, height: plan.height, truncated: plan.truncated };
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Focení trvalo déle než ${CAPTURE_TIMEOUT_MS / 1000} s`)), CAPTURE_TIMEOUT_MS);
    });
    const blob = await Promise.race([renderFullPage(target, plan), timeout]);
    return { ...base, blob, ms: Math.round(performance.now() - started) };
  } catch (e) {
    console.error("Focení stránky selhalo:", e);
    return {
      ...base,
      blob: null,
      ms: Math.round(performance.now() - started),
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
