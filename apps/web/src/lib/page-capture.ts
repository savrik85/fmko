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
const MAX_CANVAS_PIXELS = 8_000_000;
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

/** Spodní lišta a výplň pod ní (layout hry); na fotce ke sdílení jen překáží. */
function isBottomNav(node: Node): boolean {
  return node instanceof Element
    && (node.classList.contains("app-bottom-nav") || node.classList.contains("app-bottom-safe-area"));
}

export interface CaptureOptions {
  /** Bez spodní lišty: fotka ke sdílení, ne hlášení chyby. */
  hideBottomNav?: boolean;
  /**
   * Jen to, co je teď na displeji (jako screenshot telefonu), ne celá stránka.
   * Pro sdílení: celá stránka vyšla jako dlouhá nudle, do Socek ani zprávy se nehodí.
   */
  visibleOnly?: boolean;
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
  visibleOnly?: boolean;
}): PagePlan {
  const chrome = Math.max(0, page.viewportHeight - page.mainClientHeight);
  if (page.visibleOnly) {
    const height = page.viewportHeight;
    const wantedScale = Math.min(page.devicePixelRatio || 1, MAX_SCALE);
    const fit = Math.sqrt(MAX_CANVAS_PIXELS / (page.viewportWidth * height));
    return {
      width: page.viewportWidth,
      height,
      contentHeight: page.mainClientHeight,
      contentOffset: Math.max(0, Math.round(page.mainScrollTop)),
      scale: Math.max(MIN_SCALE, Math.min(wantedScale, fit)),
      truncated: false,
    };
  }
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

/**
 * Prázdný snímek: Safari na iPhonu občas obrázek s kopií stránky vůbec nevykreslí
 * a plátno zůstane průhledné (z JPEG pak byla černá fotka). Kontroluje mřížku bodů:
 * když jsou všechny průhledné, nebo všechny stejné jako podklad, snímek je prázdný.
 */
function isBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return true;
  const probe = document.createElement("canvas");
  probe.width = 24;
  probe.height = 48;
  const pctx = probe.getContext("2d");
  if (!pctx) return false;
  pctx.drawImage(canvas, 0, 0, probe.width, probe.height);
  const data = pctx.getImageData(0, 0, probe.width, probe.height).data;
  let opaque = 0;
  const first = [data[0], data[1], data[2]];
  let varied = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) opaque++;
    if (Math.abs(data[i] - first[0]) + Math.abs(data[i + 1] - first[1]) + Math.abs(data[i + 2] - first[2]) > 24) varied = true;
  }
  return opaque === 0 || !varied;
}

/** Snímek na neprůhledný podklad stránky a do JPEG (průhledná místa jinak zčernají). */
async function toJpeg(canvas: HTMLCanvasElement, background: string): Promise<Blob> {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2D kontext není k dispozici");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return new Promise((resolve, reject) => {
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Fotku se nepodařilo uložit"))), "image/jpeg", JPEG_QUALITY);
  });
}

/** Pokusy: Safari často vykreslí až napodruhé, pak ještě v menším rozlišení. */
/**
 * Pokusy: nejdřív s písmem hry (bez něj se texty v systémovém písmu lámou a přetékají),
 * dvakrát, protože Safari občas vykreslí až napodruhé. Bez písma jen jako poslední možnost.
 */
const ATTEMPTS = (scale: number): Array<{ scale: number; fonts: boolean }> => IS_WEBKIT
  ? [{ scale, fonts: false }, { scale, fonts: false }, { scale: 1, fonts: false }]
  : [{ scale, fonts: true }, { scale, fonts: true }, { scale, fonts: false }];

/**
 * Safari na iPhonu (a každý prohlížeč na iOS, i Chrome) kopii stránky s vloženými
 * písmy hry nevykreslí: 16 souborů písma v obrázku = černá fotka nebo vypršení času.
 * Tam se písma nevkládají a v kopii se nahradí vestavěnými písmy iOS, která vypadají
 * a měří podobně (viz `useSystemLookalikeFonts`), aby se texty nelámaly.
 */
const IS_WEBKIT = typeof navigator !== "undefined"
  && /AppleWebKit/.test(navigator.userAgent)
  && !/Chrome\/|Chromium|Edg\/|Android/.test(navigator.userAgent);

const BODY_LOOKALIKE = '"Avenir Next", Avenir, system-ui, sans-serif';
const HEADING_LOOKALIKE = '"Avenir Next Condensed", "Arial Narrow", "Avenir Next", system-ui, sans-serif';

/** V kopii stránky nahradí písma hry (Outfit, Barlow Condensed) vestavěnými podobnými. */
function useSystemLookalikeFonts(root: HTMLElement): void {
  const replace = (el: HTMLElement) => {
    const family = el.style.fontFamily.toLowerCase();
    if (!family) return;
    if (family.includes("barlow")) el.style.setProperty("font-family", HEADING_LOOKALIKE, "important");
    else if (family.includes("outfit")) el.style.setProperty("font-family", BODY_LOOKALIKE, "important");
  };
  replace(root);
  root.querySelectorAll<HTMLElement>("*").forEach(replace);
}

/** Písmo hry do kopie stránky jen ve woff2, ať je kopie co nejmenší. */
function fontOption(fonts: boolean): CanvasOptions["font"] {
  return fonts ? { preferredFormat: "woff2" } : false;
}

type CanvasOptions = import("modern-screenshot").Options;

/** Vykreslí kopii a když vyjde prázdná (Safari napoprvé), zkusí to znovu. */
async function renderWithRetry(target: HTMLElement, baseScale: number, makeOptions: (scale: number, fonts: boolean) => CanvasOptions, background: string): Promise<Blob> {
  loadLazyImages(target);
  const { domToCanvas } = await import("modern-screenshot");
  for (const attempt of ATTEMPTS(baseScale)) {
    const canvas = await domToCanvas(target, makeOptions(attempt.scale, attempt.fonts));
    if (!isBlank(canvas)) return toJpeg(canvas, background);
    console.warn("Focení stránky: prázdný snímek, zkouším znovu", attempt);
  }
  throw new Error("Stránku se nepodařilo vyfotit (prázdný snímek)");
}

async function renderFullPage(target: HTMLElement, plan: PagePlan, options: CaptureOptions): Promise<Blob> {
  const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
  return renderWithRetry(target, plan.scale, (scale, fonts) => canvasOptions(target, plan, options, scale, background, fonts), background);
}

/**
 * Fotka ke sdílení: jen obsah stránky, který je teď na displeji, bez horní lišty
 * a bez spodní navigace (na telefonu ji zakrývá, tak se její výška odečte).
 * Celá stránka ani lišty se do Socek ani do zprávy nehodí.
 */
export async function captureVisibleContent(): Promise<CaptureResult> {
  const main = captureTarget().querySelector("main");
  if (!main) return capturePage({ hideBottomNav: true, visibleOnly: true });
  const navHeight = window.innerWidth < 640
    ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-h")) || 0
    : 0;
  const width = main.clientWidth;
  const height = Math.max(120, Math.round(main.clientHeight - navHeight));
  const scrollTop = Math.round(main.scrollTop);
  const fit = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
  const baseScale = Math.max(MIN_SCALE, Math.min(window.devicePixelRatio || 1, MAX_SCALE, fit));
  // Pozadí obsahu stránky (papír), ne těla: tělo má barvu zelené lišty a fotka pak byla tmavě zelená.
  const mainBackground = getComputedStyle(main).backgroundColor;
  const background = mainBackground && mainBackground !== "rgba(0, 0, 0, 0)" && mainBackground !== "transparent"
    ? mainBackground
    : getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim() || "#f4efe6";
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Focení trvalo déle než ${CAPTURE_TIMEOUT_MS / 1000} s`)), CAPTURE_TIMEOUT_MS);
    });
    const blob = await Promise.race([
      renderWithRetry(main, baseScale, (scale, fonts) => ({
        scale,
        width,
        height,
        backgroundColor: background,
        font: fontOption(fonts),
        filter: (node: Node) => !isIgnored(node),
        timeout: MEDIA_TIMEOUT_MS,
        // Kopie `main` ukáže výřez od místa, kam hráč odscrolloval.
        onCloneNode: (cloned: Node) => {
          if (!(cloned instanceof HTMLElement)) return;
          if (!fonts) useSystemLookalikeFonts(cloned);
          cloned.style.setProperty("height", `${height}px`, "important");
          cloned.style.setProperty("overflow", "hidden", "important");
          if (scrollTop > 0) {
            [...cloned.children].forEach((child) => {
              if (child instanceof HTMLElement) child.style.setProperty("transform", `translateY(-${scrollTop}px)`, "important");
            });
          }
        },
      }), background),
      timeout,
    ]);
    return { blob, width, height, truncated: false, ms: Math.round(performance.now() - started) };
  } catch (e) {
    console.error("Focení obsahu stránky selhalo:", e);
    return { blob: null, width, height, truncated: false, ms: Math.round(performance.now() - started), error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function canvasOptions(target: HTMLElement, plan: PagePlan, options: CaptureOptions, scale: number, background: string, fonts: boolean): CanvasOptions {
  const main = target.querySelector("main");
  const column = main?.parentElement ?? null;
  const columnHeight = column && main ? column.clientHeight + (plan.contentHeight - main.clientHeight) : 0;
  return {
    scale,
    width: plan.width,
    height: plan.height,
    backgroundColor: background,
    font: fontOption(fonts),
    filter: (node: Node) => !isIgnored(node) && !(options.hideBottomNav && isBottomNav(node)),
    timeout: MEDIA_TIMEOUT_MS,
    // Kopie má výšky živé stránky natvrdo ve stylu; `main` a sloupec nad ním se
    // natáhnou na vyfocený obsah, aby se nescrollovalo. Živá stránka se nemění.
    onCloneNode: (cloned: Node) => {
      if (cloned instanceof HTMLElement && !fonts) useSystemLookalikeFonts(cloned);
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
      // V nainstalované aplikaci na iPhonu je lišta `absolute` (globals.css, standalone),
      // jinde `fixed`. `top: 0px` mají překryvy přes celou plochu (inset-0), ty zůstávají.
      cloned.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const { position, top, bottom } = el.style;
        if ((position === "fixed" || position === "absolute") && bottom === "0px" && top !== "0px") {
          el.style.setProperty("top", "auto", "important");
        }
      });
    },
  };
}

/** Vyfotí celou stránku hry. Nikdy nevyhodí: chyba je v `error`, `blob` je pak `null`. */
export async function capturePage(options: CaptureOptions = {}): Promise<CaptureResult> {
  const target = captureTarget();
  const main = target.querySelector("main");
  const plan = planPageCapture({
    viewportWidth: target.clientWidth,
    viewportHeight: target.clientHeight,
    mainClientHeight: main?.clientHeight ?? target.clientHeight,
    mainScrollHeight: main?.scrollHeight ?? target.clientHeight,
    mainScrollTop: main?.scrollTop ?? 0,
    devicePixelRatio: window.devicePixelRatio,
    visibleOnly: options.visibleOnly,
  });
  const base = { width: plan.width, height: plan.height, truncated: plan.truncated };
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Focení trvalo déle než ${CAPTURE_TIMEOUT_MS / 1000} s`)), CAPTURE_TIMEOUT_MS);
    });
    const blob = await Promise.race([renderFullPage(target, plan, options), timeout]);
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
