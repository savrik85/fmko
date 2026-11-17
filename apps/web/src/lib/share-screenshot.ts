/**
 * Fotka stránky ke sdílení: snímek v tenkém rámečku v barvě hry s klubem
 * a adresou prales.fun, aby kdo fotku dostane, věděl, odkud je a kde hru najde.
 */

/** Tloušťka rámečku v CSS pixelech stránky; v obrázku se násobí měřítkem snímku. */
const FRAME = 6;
/** Spodní okraj rámečku, je v něm drobný popisek. */
const FRAME_BOTTOM = 22;
const CORNER = 10;
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
 * Snímek v tenkém rámečku v barvě hry: po stranách a nahoře úzký okraj, dole
 * o kousek širší s drobným „Prales · klub“ vlevo a „prales.fun“ vpravo.
 * `cssWidth` je šířka snímku v CSS pixelech; z ní se počítá měřítko rámečku.
 */
export async function brandScreenshot(
  source: Blob,
  cssWidth: number,
  clubName: string | null,
): Promise<HTMLCanvasElement> {
  const image = await decodeImage(source);
  const ratio = cssWidth > 0 ? image.naturalWidth / cssWidth : 1;
  const edge = Math.round(FRAME * ratio);
  const bottom = Math.round(FRAME_BOTTOM * ratio);
  const radius = Math.round(CORNER * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth + edge * 2;
  canvas.height = image.naturalHeight + edge + bottom;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D kontext není k dispozici");

  ctx.fillStyle = bandColor();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Snímek se zaoblenými rohy uvnitř rámečku.
  ctx.save();
  ctx.beginPath();
  // roundRect umí Safari až od 16; na starším telefonu bez zaoblení.
  if (typeof ctx.roundRect === "function") ctx.roundRect(edge, edge, image.naturalWidth, image.naturalHeight, radius);
  else ctx.rect(edge, edge, image.naturalWidth, image.naturalHeight);
  ctx.clip();
  ctx.drawImage(image, edge, edge);
  ctx.restore();

  const font = headingFont();
  const middle = edge + image.naturalHeight + bottom / 2;
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(11 * ratio)}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(SITE_LABEL, canvas.width - edge - Math.round(4 * ratio), middle);
  const siteWidth = ctx.measureText(SITE_LABEL).width;
  ctx.font = `800 ${Math.round(11 * ratio)}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  const label = clubName ? `Prales · ${clubName}` : "Prales";
  ctx.fillText(fitText(ctx, label, canvas.width - siteWidth - edge * 2 - Math.round(16 * ratio)), edge + Math.round(4 * ratio), middle);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Obrázek se nepodařilo vytvořit"))), type, quality);
  });
}
