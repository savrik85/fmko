/**
 * Fotka stránky ke sdílení: pod snímek se přidá pruh v barvě hry s klubem
 * a adresou prales.fun, aby kdo fotku dostane, věděl, odkud je a kde hru najde.
 */

/** Výška pruhu v CSS pixelech stránky; v obrázku se násobí měřítkem snímku. */
const BAND_HEIGHT = 52;
const PADDING = 16;
const SITE_LABEL = "prales.fun";
const FALLBACK_BAND_COLOR = "#153615";

function bandColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--color-chrome").trim();
  return value || FALLBACK_BAND_COLOR;
}

/** Písmo nadpisů hry (horní lišta), ať pruh vypadá jako hra. */
function headingFont(): string {
  const heading = document.querySelector("header h1") ?? document.body;
  return getComputedStyle(heading).fontFamily || "system-ui, sans-serif";
}

async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Zkrátí text s výpustkou, aby se vešel do šířky. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * Snímek + pruh dole: vlevo „Prales · klub“, vpravo „prales.fun“.
 * `cssWidth` je šířka stránky v CSS pixelech; z ní se počítá měřítko pruhu.
 */
export async function brandScreenshot(
  source: Blob,
  cssWidth: number,
  clubName: string | null,
): Promise<HTMLCanvasElement> {
  const image = await decodeImage(source);
  const ratio = cssWidth > 0 ? image.naturalWidth / cssWidth : 1;
  const band = Math.round(BAND_HEIGHT * ratio);
  const pad = Math.round(PADDING * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight + band;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D kontext není k dispozici");

  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = bandColor();
  ctx.fillRect(0, image.naturalHeight, canvas.width, band);

  const font = headingFont();
  const middle = image.naturalHeight + band / 2;
  ctx.textBaseline = "middle";

  ctx.font = `700 ${Math.round(15 * ratio)}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(SITE_LABEL, canvas.width - pad, middle);
  const siteWidth = ctx.measureText(SITE_LABEL).width;

  ctx.font = `800 ${Math.round(17 * ratio)}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  const label = clubName ? `Prales · ${clubName}` : "Prales";
  ctx.fillText(fitText(ctx, label, canvas.width - siteWidth - pad * 3), pad, middle);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Obrázek se nepodařilo vytvořit"))), type, quality);
  });
}
