import * as THREE from "three";

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

export function generatePitchSurface(
  baseColor: string,
  pitchType: string,
  hasMowingStripes: boolean,
): SurfaceTextureSet {
  const key = `pitch:${baseColor}:${pitchType}:${hasMowingStripes}`;
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
    for (let i = 0; i < 8; i++) {
      const y = (height / 8) * i;
      albedoCtx.fillStyle = i % 2 === 0
        ? "rgba(255, 255, 225, 0.035)"
        : "rgba(8, 38, 10, 0.035)";
      albedoCtx.fillRect(0, y, width, height / 8);
    }
  }

  const fibreCount = artificial ? 1700 : hybrid ? 2300 : 2800;
  drawFibres(albedoCtx, width, height, seed + 11, fibreCount, artificial);
  drawBumpFibres(bumpCtx, width, height, seed + 11, fibreCount, artificial);

  const result = createTextureSet(albedo, bump, 1, 1, false);
  surfaceCache.set(key, result);
  return result;
}

export function generateSnowPitchSurface(hasMowingStripes: boolean): SurfaceTextureSet {
  const key = `pitch:snow:${hasMowingStripes}`;
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
    for (let i = 0; i < 8; i++) {
      const y = (height / 8) * i;
      albedoCtx.fillStyle = i % 2 === 0
        ? "rgba(255, 255, 255, 0.14)"
        : "rgba(175, 200, 185, 0.09)";
      albedoCtx.fillRect(0, y, width, height / 8);
    }
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

export function generateAsphaltSurface(repeatX = 3, repeatY = 2): SurfaceTextureSet {
  return generateAggregateSurface("asphalt", "#3F3F46", repeatX, repeatY, false);
}

export function generateGravelSurface(repeatX = 4, repeatY = 3): SurfaceTextureSet {
  return generateAggregateSurface("gravel", "#928A7E", repeatX, repeatY, true);
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
