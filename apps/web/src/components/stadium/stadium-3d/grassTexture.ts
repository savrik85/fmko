import * as THREE from "three";
import { GROUND_COLOR } from "./constants";

/**
 * Jemné procedurální materiály pro stadion.
 *
 * Textury jsou deterministické a cachované. Místo ostrého per-pixelového šumu
 * používají vyhlazenou víceškálovou variaci, takže v dálce neblikají ani netvoří
 * moiré. Barevná mapa je v sRGB, výšková mapa zůstává v lineárním prostoru.
 */
export interface SurfaceTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

const surfaceCache = new Map<string, SurfaceTextureSet>();

export type MowingPattern = "stripes" | "checkerboard" | "circles" | "crooked";

/**
 * Vykreslí zvolený vzor sekání trávníku
 */
function paintMowingPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pattern: MowingPattern = "stripes",
  isSnow = false,
) {
  const lightFill = isSnow ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 225, 0.04)";
  const darkFill = isSnow ? "rgba(175, 200, 185, 0.09)" : "rgba(8, 38, 10, 0.04)";

  if (pattern === "checkerboard") {
    // Anglická šachovnice: 8 řad x 6 sloupců
    const rows = 8;
    const cols = 6;
    const cellW = width / cols;
    const cellH = height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? lightFill : darkFill;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
  } else if (pattern === "circles") {
    // Soustředné kruhy a prstence rozbíhající se od středu hřiště
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const ringStep = maxR / 7;
    for (let r = 7; r >= 1; r--) {
      ctx.fillStyle = r % 2 === 0 ? lightFill : darkFill;
      ctx.beginPath();
      ctx.arc(cx, cy, r * ringStep, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === "crooked") {
    // „Křivé sekání od správce Franty“ — nepravidelné zvlněné pruhy
    const rows = 8;
    const rowH = height / rows;
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = i % 2 === 0 ? lightFill : darkFill;
      ctx.beginPath();
      const yBase = i * rowH;
      const yNext = (i + 1) * rowH;

      ctx.moveTo(0, yBase);
      for (let x = 0; x <= width; x += 16) {
        const wave = Math.sin(x * 0.02 + i * 1.8) * 16 + Math.cos(x * 0.045) * 8;
        ctx.lineTo(x, yBase + wave);
      }
      ctx.lineTo(width, yNext);
      for (let x = width; x >= 0; x -= 16) {
        const wave = Math.sin(x * 0.02 + (i + 1) * 1.8) * 16 + Math.cos(x * 0.045) * 8;
        ctx.lineTo(x, yNext + wave);
      }
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Klasické vodorovné pruhy (stripes)
    const rows = 8;
    const rowH = height / rows;
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = i % 2 === 0 ? lightFill : darkFill;
      ctx.fillRect(0, i * rowH, width, rowH);
    }
  }
}

export function generatePitchSurface(
  baseColor: string,
  pitchType: string,
  hasMowingStripes: boolean,
  mowingPattern: MowingPattern = "stripes",
): SurfaceTextureSet {
  const key = `pitch:${baseColor}:${pitchType}:${hasMowingStripes}:${mowingPattern}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const width = 512;
  const height = 768;
  const seed = hashString(key);
  const albedo = createCanvas(width, height);
  const bump = createCanvas(width, height);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);
  const artificial = pitchType === "artificial";
  const hybrid = pitchType === "hybrid";

  paintLowFrequencyNoise(
    albedoCtx,
    hexToRgb(baseColor),
    width,
    height,
    seed,
    artificial ? 1 : hybrid ? 2 : 3,
    38,
    56,
  );
  paintLowFrequencyNoise(
    bumpCtx,
    { r: 128, g: 128, b: 128 },
    width,
    height,
    seed,
    artificial ? 4 : hybrid ? 6 : 8,
    38,
    56,
  );

  if (hasMowingStripes) {
    paintMowingPattern(albedoCtx, width, height, mowingPattern, false);
  }

  const fibreCount = artificial ? 1700 : hybrid ? 2300 : 2800;
  drawFibres(albedoCtx, width, height, seed + 11, fibreCount, artificial);
  drawBumpFibres(bumpCtx, width, height, seed + 11, fibreCount, artificial);

  const result = createTextureSet(albedo, bump, 1, 1, false);
  surfaceCache.set(key, result);
  return result;
}

export function generateSnowPitchSurface(
  hasMowingStripes: boolean,
  mowingPattern: MowingPattern = "stripes",
): SurfaceTextureSet {
  const key = `pitch:snow:${hasMowingStripes}:${mowingPattern}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const width = 512;
  const height = 768;
  const seed = hashString(key);
  const albedo = createCanvas(width, height);
  const bump = createCanvas(width, height);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);

  // Podklad: zasněžený trávník s prosvítající zimní trávou
  paintLowFrequencyNoise(albedoCtx, hexToRgb("#DDE7DF"), width, height, seed, 4, 38, 56);
  paintLowFrequencyNoise(bumpCtx, { r: 128, g: 128, b: 128 }, width, height, seed, 6, 38, 56);

  if (hasMowingStripes) {
    paintMowingPattern(albedoCtx, width, height, mowingPattern, true);
  }

  // Jemné krystalky a sněhové závěje
  drawFibres(albedoCtx, width, height, seed + 11, 2000, false);
  drawBumpFibres(bumpCtx, width, height, seed + 11, 2000, false);

  const result = createTextureSet(albedo, bump, 1, 1, false);
  surfaceCache.set(key, result);
  return result;
}

export function generateTerrainSurface(
  baseColor: string,
  repeatX = 14,
  repeatY = 14,
): SurfaceTextureSet {
  const key = `terrain:${baseColor}:${repeatX}:${repeatY}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const size = 512;
  const seed = hashString(key);
  const albedo = createCanvas(size, size);
  const bump = createCanvas(size, size);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);

  paintLowFrequencyNoise(albedoCtx, hexToRgb(baseColor), size, size, seed, 10, 34, 34);
  paintLowFrequencyNoise(bumpCtx, { r: 128, g: 128, b: 128 }, size, size, seed, 14, 34, 34);
  drawFibres(albedoCtx, size, size, seed + 31, 1350, false);
  drawBumpFibres(bumpCtx, size, size, seed + 31, 1350, false);

  const rand = seededRandom(seed + 57);
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = 0.8 + rand() * 2.2;
    albedoCtx.fillStyle = `rgba(92, 73, 43, ${0.025 + rand() * 0.035})`;
    albedoCtx.beginPath();
    albedoCtx.ellipse(x, y, radius * 1.8, radius, rand() * Math.PI, 0, Math.PI * 2);
    albedoCtx.fill();
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  surfaceCache.set(key, result);
  return result;
}

export function generateSnowTerrainSurface(repeatX = 14, repeatY = 14): SurfaceTextureSet {
  const key = `terrain:snow:${repeatX}:${repeatY}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const size = 512;
  const seed = hashString(key);
  const albedo = createCanvas(size, size);
  const bump = createCanvas(size, size);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);

  paintLowFrequencyNoise(albedoCtx, hexToRgb("#F1F5F9"), size, size, seed, 12, 34, 34);
  paintLowFrequencyNoise(bumpCtx, { r: 128, g: 128, b: 128 }, size, size, seed, 16, 34, 34);

  // Krystalický sníh a jemné stopy
  const rand = seededRandom(seed + 99);
  for (let i = 0; i < 120; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = 1.0 + rand() * 3.0;
    albedoCtx.fillStyle = `rgba(226, 232, 240, ${0.04 + rand() * 0.06})`;
    albedoCtx.beginPath();
    albedoCtx.ellipse(x, y, radius * 2.0, radius, rand() * Math.PI, 0, Math.PI * 2);
    albedoCtx.fill();
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  surfaceCache.set(key, result);
  return result;
}

export type SurroundSurfaceType = "grass" | "cinders" | "paving" | "tartan" | "astro";

export function generateAsphaltSurface(repeatX = 3, repeatY = 2): SurfaceTextureSet {
  return generateAggregateSurface("asphalt", "#3F3F46", repeatX, repeatY, false);
}

export function generateGravelSurface(repeatX = 4, repeatY = 3): SurfaceTextureSet {
  return generateAggregateSurface("gravel", "#928A7E", repeatX, repeatY, true);
}

/** Tmavá okresní škvára / antuka */
export function generateCindersSurface(repeatX = 10, repeatY = 14): SurfaceTextureSet {
  const key = `cinders:${repeatX}:${repeatY}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const size = 512;
  const seed = hashString(key);
  const albedo = createCanvas(size, size);
  const bump = createCanvas(size, size);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);

  // Teplý tmavý škvárový podklad
  paintLowFrequencyNoise(albedoCtx, hexToRgb("#322825"), size, size, seed, 10, 24, 24);
  paintLowFrequencyNoise(bumpCtx, { r: 128, g: 128, b: 128 }, size, size, seed, 16, 24, 24);

  const rand = seededRandom(seed + 42);
  // Škvárové uhlíky, černá drť a cihlový prach
  for (let i = 0; i < 1200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.5 + rand() * 2.2;
    const v = rand();
    if (v > 0.65) {
      albedoCtx.fillStyle = `rgba(18, 14, 12, ${0.25 + rand() * 0.35})`; // černý uhel
      bumpCtx.fillStyle = "#151515";
    } else if (v > 0.3) {
      albedoCtx.fillStyle = `rgba(95, 68, 55, ${0.15 + rand() * 0.25})`; // antukový prach
      bumpCtx.fillStyle = "#A0A0A0";
    } else {
      albedoCtx.fillStyle = `rgba(140, 115, 95, ${0.1 + rand() * 0.2})`; // světlý kamínek
      bumpCtx.fillStyle = "#E0E0E0";
    }
    albedoCtx.beginPath();
    albedoCtx.arc(x, y, r, 0, Math.PI * 2);
    albedoCtx.fill();

    bumpCtx.beginPath();
    bumpCtx.arc(x, y, r, 0, Math.PI * 2);
    bumpCtx.fill();
  }

  // Jemné podélné stopy po válcování dráhy
  for (let y = 0; y < size; y += 4) {
    const a = 0.02 + rand() * 0.03;
    albedoCtx.fillStyle = `rgba(0, 0, 0, ${a})`;
    albedoCtx.fillRect(0, y, size, 1.5);
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  surfaceCache.set(key, result);
  return result;
}

/** Červený atletický polyuretanový tartan */
export function generateTartanSurface(repeatX = 10, repeatY = 14): SurfaceTextureSet {
  const key = `tartan:${repeatX}:${repeatY}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const size = 512;
  const seed = hashString(key);
  const albedo = createCanvas(size, size);
  const bump = createCanvas(size, size);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);

  // Sytá cihlová sportovní červeň
  paintLowFrequencyNoise(albedoCtx, hexToRgb("#A32815"), size, size, seed, 6, 20, 20);
  paintLowFrequencyNoise(bumpCtx, { r: 128, g: 128, b: 128 }, size, size, seed, 14, 20, 20);

  const rand = seededRandom(seed + 88);
  // Gumový polyuretanový granulát
  for (let i = 0; i < 1400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.4 + rand() * 1.6;
    const v = rand();
    if (v > 0.6) {
      albedoCtx.fillStyle = `rgba(220, 75, 45, ${0.15 + rand() * 0.2})`;
      bumpCtx.fillStyle = "#E0E0E0";
    } else if (v > 0.2) {
      albedoCtx.fillStyle = `rgba(115, 20, 10, ${0.18 + rand() * 0.25})`;
      bumpCtx.fillStyle = "#252525";
    } else {
      albedoCtx.fillStyle = `rgba(60, 10, 5, ${0.12 + rand() * 0.18})`;
      bumpCtx.fillStyle = "#101010";
    }
    albedoCtx.beginPath();
    albedoCtx.arc(x, y, r, 0, Math.PI * 2);
    albedoCtx.fill();

    bumpCtx.beginPath();
    bumpCtx.arc(x, y, r, 0, Math.PI * 2);
    bumpCtx.fill();
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  surfaceCache.set(key, result);
  return result;
}

/** Zámková betonová dlažba se spárami */
export function generatePaverSurface(repeatX = 12, repeatY = 16): SurfaceTextureSet {
  const key = `paver:${repeatX}:${repeatY}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const size = 512;
  const seed = hashString(key);
  const albedo = createCanvas(size, size);
  const bump = createCanvas(size, size);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);

  paintLowFrequencyNoise(albedoCtx, hexToRgb("#8E95A0"), size, size, seed, 6, 18, 18);
  bumpCtx.fillStyle = "#808080";
  bumpCtx.fillRect(0, 0, size, size);

  // Dlaždice 8x8 se spárami a jemnou texturou betonu
  const cols = 8;
  const rows = 8;
  const cellW = size / cols;
  const cellH = size / rows;
  const rand = seededRandom(seed + 19);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = c * cellW;
      const py = r * cellH;
      const toneVar = (rand() - 0.5) * 28;
      const baseGray = clamp(148 + toneVar);

      // Tělo dlaždice
      albedoCtx.fillStyle = `rgb(${baseGray}, ${baseGray + 2}, ${baseGray + 6})`;
      albedoCtx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4);

      // Zkosená hrana dlaždice (světlejší nahoře/vlevo, tmavší dole/vpravo)
      albedoCtx.fillStyle = "rgba(255, 255, 255, 0.15)";
      albedoCtx.fillRect(px + 2, py + 2, cellW - 4, 1.5);
      albedoCtx.fillRect(px + 2, py + 2, 1.5, cellH - 4);

      albedoCtx.fillStyle = "rgba(0, 0, 0, 0.25)";
      albedoCtx.fillRect(px + 2, py + cellH - 3.5, cellW - 4, 1.5);
      albedoCtx.fillRect(px + cellW - 3.5, py + 2, 1.5, cellH - 4);

      // Hluboká spára mezi dlaždicemi
      bumpCtx.fillStyle = "#151515";
      bumpCtx.strokeRect(px + 1, py + 1, cellW - 2, cellH - 2);
      bumpCtx.fillStyle = "#C0C0C0";
      bumpCtx.fillRect(px + 3, py + 3, cellW - 6, cellH - 6);
    }
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  surfaceCache.set(key, result);
  return result;
}

/** Sytě zelený syntetický trávník (AstroTurf surround) */
export function generateAstroSurroundSurface(repeatX = 10, repeatY = 14): SurfaceTextureSet {
  const key = `astro:${repeatX}:${repeatY}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const size = 512;
  const seed = hashString(key);
  const albedo = createCanvas(size, size);
  const bump = createCanvas(size, size);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);

  paintLowFrequencyNoise(albedoCtx, hexToRgb("#156B30"), size, size, seed, 4, 20, 20);
  paintLowFrequencyNoise(bumpCtx, { r: 128, g: 128, b: 128 }, size, size, seed, 10, 20, 20);
  drawFibres(albedoCtx, size, size, seed + 13, 2600, true);
  drawBumpFibres(bumpCtx, size, size, seed + 13, 2600, true);

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  surfaceCache.set(key, result);
  return result;
}

/** VIP syntetický koberec v klubových barvách */
export function generateClubCarpetSurface(teamColor: string, repeatX = 6, repeatY = 8): SurfaceTextureSet {
  const key = `club_carpet:${teamColor}:${repeatX}:${repeatY}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const size = 512;
  const seed = hashString(key);
  const albedo = createCanvas(size, size);
  const bump = createCanvas(size, size);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);

  const rgb = hexToRgb(teamColor || "#1E40AF");
  paintLowFrequencyNoise(albedoCtx, rgb, size, size, seed, 4, 18, 18);
  paintLowFrequencyNoise(bumpCtx, { r: 128, g: 128, b: 128 }, size, size, seed, 8, 18, 18);
  drawFibres(albedoCtx, size, size, seed + 77, 2800, true);
  drawBumpFibres(bumpCtx, size, size, seed + 77, 2800, true);

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  surfaceCache.set(key, result);
  return result;
}

/** Vrátí sadu textur pro zvolený typ povrchu areálu */
export function getSurroundSurfaceSet(
  type: SurroundSurfaceType = "grass",
  isSnow = false,
  repeatX = 10,
  repeatY = 14,
  teamColor = "#1E40AF",
): SurfaceTextureSet {
  if (isSnow) return generateSnowTerrainSurface(repeatX, repeatY);
  if (type === "cinders") return generateCindersSurface(repeatX, repeatY);
  if (type === "tartan") return generateClubCarpetSurface(teamColor, repeatX, repeatY);
  if (type === "paving") return generatePaverSurface(repeatX, repeatY);
  if (type === "astro") return generateAstroSurroundSurface(repeatX, repeatY);
  return generateTerrainSurface(GROUND_COLOR, repeatX, repeatY);
}

/** Zpětně kompatibilní pomocník pro případné další použití samotné mapy trávy. */
export function generateGrassTexture(baseColor: string): THREE.CanvasTexture {
  return generateTerrainSurface(baseColor, 4, 6).map;
}

function generateAggregateSurface(
  kind: "asphalt" | "gravel",
  baseColor: string,
  repeatX: number,
  repeatY: number,
  largeStones: boolean,
): SurfaceTextureSet {
  const key = `${kind}:${repeatX}:${repeatY}`;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const size = 384;
  const seed = hashString(key);
  const albedo = createCanvas(size, size);
  const bump = createCanvas(size, size);
  const albedoCtx = getContext(albedo);
  const bumpCtx = getContext(bump);
  paintLowFrequencyNoise(albedoCtx, hexToRgb(baseColor), size, size, seed, largeStones ? 9 : 5, 30, 30);
  paintLowFrequencyNoise(bumpCtx, { r: 128, g: 128, b: 128 }, size, size, seed, largeStones ? 16 : 8, 30, 30);

  const rand = seededRandom(seed + 101);
  const count = largeStones ? 760 : 980;
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = largeStones ? 0.7 + rand() * 2.1 : 0.25 + rand() * 0.85;
    const light = rand() > 0.5;
    albedoCtx.fillStyle = largeStones
      ? (light ? "rgba(214, 207, 194, 0.18)" : "rgba(58, 52, 46, 0.15)")
      : (light ? "rgba(205, 205, 210, 0.10)" : "rgba(12, 12, 15, 0.10)");
    albedoCtx.beginPath();
    albedoCtx.ellipse(x, y, radius * (0.8 + rand() * 0.7), radius, rand() * Math.PI, 0, Math.PI * 2);
    albedoCtx.fill();

    bumpCtx.fillStyle = light ? "rgba(180, 180, 180, 0.32)" : "rgba(82, 82, 82, 0.22)";
    bumpCtx.beginPath();
    bumpCtx.arc(x, y, radius, 0, Math.PI * 2);
    bumpCtx.fill();
  }

  if (!largeStones) drawAsphaltCracks(albedoCtx, bumpCtx, size, seed + 151);

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  surfaceCache.set(key, result);
  return result;
}

function paintLowFrequencyNoise(
  target: CanvasRenderingContext2D,
  base: RGB,
  width: number,
  height: number,
  seed: number,
  variance: number,
  gridWidth: number,
  gridHeight: number,
) {
  const low = createCanvas(gridWidth, gridHeight);
  const lowCtx = getContext(low);
  const image = lowCtx.createImageData(gridWidth, gridHeight);
  const rand = seededRandom(seed);

  for (let i = 0; i < image.data.length; i += 4) {
    const delta = (rand() - 0.5) * variance * 2;
    image.data[i] = clamp(base.r + delta);
    image.data[i + 1] = clamp(base.g + delta * 1.05);
    image.data[i + 2] = clamp(base.b + delta * 0.9);
    image.data[i + 3] = 255;
  }
  lowCtx.putImageData(image, 0, 0);
  target.imageSmoothingEnabled = true;
  target.imageSmoothingQuality = "high";
  target.drawImage(low, 0, 0, width, height);
}

function drawFibres(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  count: number,
  artificial: boolean,
) {
  const rand = seededRandom(seed);
  ctx.lineWidth = artificial ? 0.55 : 0.7;
  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const length = artificial ? 1.2 + rand() * 2.2 : 1.8 + rand() * 4.2;
    const angle = artificial
      ? -Math.PI / 2 + (rand() - 0.5) * 0.25
      : rand() * Math.PI * 2;
    ctx.strokeStyle = rand() > 0.48
      ? "rgba(225, 242, 178, 0.045)"
      : "rgba(8, 52, 14, 0.04)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
}

function drawBumpFibres(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  count: number,
  artificial: boolean,
) {
  const rand = seededRandom(seed);
  ctx.lineWidth = artificial ? 0.5 : 0.8;
  ctx.strokeStyle = artificial ? "rgba(166, 166, 166, 0.22)" : "rgba(184, 184, 184, 0.28)";
  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const length = artificial ? 1.2 + rand() * 2.2 : 1.8 + rand() * 4.2;
    const angle = artificial
      ? -Math.PI / 2 + (rand() - 0.5) * 0.25
      : rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
}

function drawAsphaltCracks(
  albedoCtx: CanvasRenderingContext2D,
  bumpCtx: CanvasRenderingContext2D,
  size: number,
  seed: number,
) {
  const rand = seededRandom(seed);
  for (let i = 0; i < 5; i++) {
    let x = rand() * size;
    let y = rand() * size;
    albedoCtx.strokeStyle = "rgba(10, 10, 12, 0.14)";
    bumpCtx.strokeStyle = "rgba(74, 74, 74, 0.25)";
    albedoCtx.lineWidth = 0.7;
    bumpCtx.lineWidth = 1;
    albedoCtx.beginPath();
    bumpCtx.beginPath();
    albedoCtx.moveTo(x, y);
    bumpCtx.moveTo(x, y);
    for (let segment = 0; segment < 4; segment++) {
      x += (rand() - 0.5) * 24;
      y += 8 + rand() * 18;
      albedoCtx.lineTo(x, y);
      bumpCtx.lineTo(x, y);
    }
    albedoCtx.stroke();
    bumpCtx.stroke();
  }
}

function createTextureSet(
  albedoCanvas: HTMLCanvasElement,
  bumpCanvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  repeats: boolean,
): SurfaceTextureSet {
  const map = new THREE.CanvasTexture(albedoCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  bumpMap.colorSpace = THREE.NoColorSpace;

  for (const texture of [map, bumpMap]) {
    texture.wrapS = repeats ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.wrapT = repeats ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }
  return { map, bumpMap };
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context není dostupný");
  return ctx;
}

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  const normalized = value.length === 3
    ? value.split("").map((part) => part + part).join("")
    : value;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
