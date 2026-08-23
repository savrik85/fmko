"use client";

import * as THREE from "three";

export interface MaterialTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

const materialCache = new Map<string, MaterialTextureSet>();

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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  const normalized = value.length === 3
    ? value.split("").map((p) => p + p).join("")
    : value;
  return {
    r: parseInt(normalized.slice(0, 2), 16) || 0,
    g: parseInt(normalized.slice(2, 4), 16) || 0,
    b: parseInt(normalized.slice(4, 6), 16) || 0,
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

function createTextureSet(
  albedo: HTMLCanvasElement,
  bump: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  repeats = true,
): MaterialTextureSet {
  const map = new THREE.CanvasTexture(albedo);
  const bumpMap = new THREE.CanvasTexture(bump);
  map.colorSpace = THREE.SRGBColorSpace;
  bumpMap.colorSpace = THREE.NoColorSpace;

  for (const t of [map, bumpMap]) {
    t.wrapS = repeats ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = repeats ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.repeat.set(repeatX, repeatY);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
  }
  return { map, bumpMap };
}

function getFallbackTextureSet(): MaterialTextureSet {
  const fallback = new THREE.Texture() as unknown as THREE.CanvasTexture;
  return { map: fallback, bumpMap: fallback };
}

/**
 * Procedurální textura dřevěných prken (s léty, spárami mezi prkny a jemnou zrnitostí)
 */
export function generateWoodTexture(
  baseColor = "#8B5A2B",
  repeatX = 2,
  repeatY = 2,
): MaterialTextureSet {
  if (typeof document === "undefined") {
    return getFallbackTextureSet();
  }
  const key = `wood:${baseColor}:${repeatX}:${repeatY}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const width = 512;
  const height = 512;
  const seed = hashString(key);
  const albedo = createCanvas(width, height);
  const bump = createCanvas(width, height);
  const aCtx = getContext(albedo);
  const bCtx = getContext(bump);

  const base = hexToRgb(baseColor);
  const rand = seededRandom(seed);

  // Základní barva s lehkým tónováním
  aCtx.fillStyle = baseColor;
  aCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, width, height);

  const plankCount = 8;
  const plankHeight = height / plankCount;

  for (let i = 0; i < plankCount; i++) {
    const y = i * plankHeight;
    const plankVariance = (rand() - 0.5) * 20;

    // Tón prkna
    aCtx.fillStyle = `rgba(${clamp(base.r + plankVariance)}, ${clamp(base.g + plankVariance * 0.9)}, ${clamp(base.b + plankVariance * 0.8)}, 0.25)`;
    aCtx.fillRect(0, y, width, plankHeight);

    // Kreslení let dřeva (vodorovné vlnovky)
    const grainCount = 18;
    for (let g = 0; g < grainCount; g++) {
      const gy = y + rand() * plankHeight;
      const alpha = 0.04 + rand() * 0.06;
      aCtx.strokeStyle = rand() > 0.5 ? `rgba(40, 20, 10, ${alpha})` : `rgba(220, 180, 140, ${alpha * 0.6})`;
      aCtx.lineWidth = 0.6 + rand() * 1.2;
      aCtx.beginPath();
      aCtx.moveTo(0, gy);
      for (let x = 0; x <= width; x += 32) {
        const wave = Math.sin(x * 0.05 + i * 2) * (1.5 + rand() * 2);
        aCtx.lineTo(x, gy + wave);
      }
      aCtx.stroke();

      // Bump mapa pro léta
      bCtx.strokeStyle = `rgba(${clamp(128 + (rand() - 0.5) * 50)}, ${clamp(128 + (rand() - 0.5) * 50)}, ${clamp(128 + (rand() - 0.5) * 50)}, 0.15)`;
      bCtx.lineWidth = 0.8;
      bCtx.beginPath();
      bCtx.moveTo(0, gy);
      for (let x = 0; x <= width; x += 32) {
        bCtx.lineTo(x, gy + Math.sin(x * 0.05 + i * 2) * 1.5);
      }
      bCtx.stroke();
    }

    // Tmavá spára mezi prkny
    aCtx.fillStyle = "rgba(20, 10, 5, 0.6)";
    aCtx.fillRect(0, y + plankHeight - 3, width, 3);

    bCtx.fillStyle = "#202020";
    bCtx.fillRect(0, y + plankHeight - 3, width, 3);

    // Hřebíky na koncích prken
    for (let n = 24; n < width; n += 120) {
      aCtx.fillStyle = "rgba(40, 40, 45, 0.8)";
      aCtx.beginPath();
      aCtx.arc(n, y + plankHeight / 2, 2.5, 0, Math.PI * 2);
      aCtx.fill();

      bCtx.fillStyle = "#E0E0E0";
      bCtx.beginPath();
      bCtx.arc(n, y + plankHeight / 2, 2.5, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  materialCache.set(key, result);
  return result;
}

/**
 * Procedurální textura cihlového zdiva (vazba cihel, maltové spáry, patina)
 */
export function generateBrickTexture(
  brickColor = "#9E4738",
  mortarColor = "#C8C2B8",
  repeatX = 3,
  repeatY = 3,
): MaterialTextureSet {
  if (typeof document === "undefined") {
    return getFallbackTextureSet();
  }
  const key = `brick:${brickColor}:${mortarColor}:${repeatX}:${repeatY}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const width = 512;
  const height = 512;
  const seed = hashString(key);
  const albedo = createCanvas(width, height);
  const bump = createCanvas(width, height);
  const aCtx = getContext(albedo);
  const bCtx = getContext(bump);

  const base = hexToRgb(brickColor);
  const rand = seededRandom(seed);

  // Podklad - malta
  aCtx.fillStyle = mortarColor;
  aCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = "#404040"; // zahloubená malta
  bCtx.fillRect(0, 0, width, height);

  const rows = 16;
  const cols = 8;
  const brickH = height / rows;
  const brickW = width / cols;
  const mortarThickness = 4;

  for (let r = 0; r < rows; r++) {
    const y = r * brickH;
    const isOdd = r % 2 === 1;
    const xOffset = isOdd ? brickW / 2 : 0;

    for (let c = -1; c <= cols; c++) {
      const x = c * brickW + xOffset;
      const brickVariance = (rand() - 0.5) * 35;
      const br = clamp(base.r + brickVariance);
      const bg = clamp(base.g + brickVariance * 0.8);
      const bb = clamp(base.b + brickVariance * 0.7);

      // Tělo cihly
      aCtx.fillStyle = `rgb(${br}, ${bg}, ${bb})`;
      aCtx.fillRect(
        x + mortarThickness / 2,
        y + mortarThickness / 2,
        brickW - mortarThickness,
        brickH - mortarThickness,
      );

      bCtx.fillStyle = "#D0D0D0"; // vyvýšená cihla
      bCtx.fillRect(
        x + mortarThickness / 2,
        y + mortarThickness / 2,
        brickW - mortarThickness,
        brickH - mortarThickness,
      );

      // Jemná zrnitost na cihle
      for (let p = 0; p < 8; p++) {
        const px = x + rand() * (brickW - mortarThickness);
        const py = y + rand() * (brickH - mortarThickness);
        const dark = rand() > 0.5;
        aCtx.fillStyle = dark ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)";
        aCtx.beginPath();
        aCtx.arc(px, py, 1.2 + rand() * 2, 0, Math.PI * 2);
        aCtx.fill();
      }
    }
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  materialCache.set(key, result);
  return result;
}

/**
 * Procedurální textura pohledového betonu (bednění, kotevní otvory, jemný štěrkový povrch)
 */
export function generateConcreteTexture(
  baseColor = "#9CA3AF",
  repeatX = 2,
  repeatY = 2,
): MaterialTextureSet {
  if (typeof document === "undefined") {
    return getFallbackTextureSet();
  }
  const key = `concrete:${baseColor}:${repeatX}:${repeatY}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const width = 512;
  const height = 512;
  const seed = hashString(key);
  const albedo = createCanvas(width, height);
  const bump = createCanvas(width, height);
  const aCtx = getContext(albedo);
  const bCtx = getContext(bump);

  const base = hexToRgb(baseColor);
  const rand = seededRandom(seed);

  aCtx.fillStyle = baseColor;
  aCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, width, height);

  // Velké bloky bednění (spáry šalování)
  const panelH = height / 4;
  const panelW = width / 2;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 2; c++) {
      const px = c * panelW;
      const py = r * panelH;
      const v = (rand() - 0.5) * 12;

      aCtx.fillStyle = `rgba(${clamp(base.r + v)}, ${clamp(base.g + v)}, ${clamp(base.b + v)}, 0.2)`;
      aCtx.fillRect(px, py, panelW, panelH);

      // Kotevní otvory po šalování
      const tieHoles = [
        [px + 30, py + 30],
        [px + panelW - 30, py + 30],
        [px + 30, py + panelH - 30],
        [px + panelW - 30, py + panelH - 30],
      ];
      for (const [hx, hy] of tieHoles) {
        aCtx.fillStyle = "rgba(40, 45, 50, 0.7)";
        aCtx.beginPath();
        aCtx.arc(hx, hy, 4, 0, Math.PI * 2);
        aCtx.fill();

        bCtx.fillStyle = "#303030";
        bCtx.beginPath();
        bCtx.arc(hx, hy, 4, 0, Math.PI * 2);
        bCtx.fill();
      }
    }
  }

  // Jemný šum a póry v betonu
  for (let i = 0; i < 3000; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const dark = rand() > 0.45;
    aCtx.fillStyle = dark ? "rgba(30, 35, 40, 0.05)" : "rgba(255, 255, 255, 0.05)";
    aCtx.beginPath();
    aCtx.arc(x, y, 0.5 + rand() * 1.5, 0, Math.PI * 2);
    aCtx.fill();

    bCtx.fillStyle = dark ? "rgba(60, 60, 60, 0.15)" : "rgba(200, 200, 200, 0.15)";
    bCtx.beginPath();
    bCtx.arc(x, y, 0.5 + rand() * 1.5, 0, Math.PI * 2);
    bCtx.fill();
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  materialCache.set(key, result);
  return result;
}

/**
 * Procedurální textura střešních pálených tašek
 */
export function generateRoofTileTexture(
  tileColor = "#8B3A2B",
  repeatX = 4,
  repeatY = 4,
): MaterialTextureSet {
  if (typeof document === "undefined") {
    return getFallbackTextureSet();
  }
  const key = `roof:${tileColor}:${repeatX}:${repeatY}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const width = 512;
  const height = 512;
  const seed = hashString(key);
  const albedo = createCanvas(width, height);
  const bump = createCanvas(width, height);
  const aCtx = getContext(albedo);
  const bCtx = getContext(bump);

  const base = hexToRgb(tileColor);
  const rand = seededRandom(seed);

  aCtx.fillStyle = tileColor;
  aCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, width, height);

  const rows = 16;
  const cols = 12;
  const tileH = height / rows;
  const tileW = width / cols;

  for (let r = 0; r < rows; r++) {
    const y = r * tileH;
    const isOdd = r % 2 === 1;
    const xOffset = isOdd ? tileW / 2 : 0;

    for (let c = -1; c <= cols; c++) {
      const x = c * tileW + xOffset;
      const v = (rand() - 0.5) * 20;

      // Spodní stín tašky
      aCtx.fillStyle = "rgba(20, 10, 5, 0.4)";
      aCtx.fillRect(x, y + tileH - 3, tileW, 3);

      // Horní lesk tašky
      aCtx.fillStyle = `rgba(${clamp(base.r + v + 25)}, ${clamp(base.g + v + 15)}, ${clamp(base.b + v + 10)}, 0.35)`;
      aCtx.fillRect(x + 1, y + 1, tileW - 2, tileH * 0.4);

      // Bump
      bCtx.fillStyle = "#202020";
      bCtx.fillRect(x, y + tileH - 3, tileW, 3);

      bCtx.fillStyle = "#E0E0E0";
      bCtx.fillRect(x + 1, y + 1, tileW - 2, tileH * 0.4);
    }
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  materialCache.set(key, result);
  return result;
}

/**
 * Procedurální textura vlnitého a trapézového plechu
 */
export function generateCorrugatedTexture(
  color = "#4B5563",
  repeatX = 6,
  repeatY = 2,
): MaterialTextureSet {
  if (typeof document === "undefined") {
    return getFallbackTextureSet();
  }
  const key = `corrugated:${color}:${repeatX}:${repeatY}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const width = 256;
  const height = 256;
  const albedo = createCanvas(width, height);
  const bump = createCanvas(width, height);
  const aCtx = getContext(albedo);
  const bCtx = getContext(bump);

  const base = hexToRgb(color);

  const waves = 16;
  const waveW = width / waves;

  for (let i = 0; i < waves; i++) {
    const x = i * waveW;
    const gradA = aCtx.createLinearGradient(x, 0, x + waveW, 0);
    gradA.addColorStop(0, `rgb(${clamp(base.r - 25)}, ${clamp(base.g - 25)}, ${clamp(base.b - 25)})`);
    gradA.addColorStop(0.5, `rgb(${clamp(base.r + 35)}, ${clamp(base.g + 35)}, ${clamp(base.b + 35)})`);
    gradA.addColorStop(1, `rgb(${clamp(base.r - 25)}, ${clamp(base.g - 25)}, ${clamp(base.b - 25)})`);

    aCtx.fillStyle = gradA;
    aCtx.fillRect(x, 0, waveW, height);

    const gradB = bCtx.createLinearGradient(x, 0, x + waveW, 0);
    gradB.addColorStop(0, "#303030");
    gradB.addColorStop(0.5, "#F0F0F0");
    gradB.addColorStop(1, "#303030");

    bCtx.fillStyle = gradB;
    bCtx.fillRect(x, 0, waveW, height);
  }

  const result = createTextureSet(albedo, bump, repeatX, repeatY, true);
  materialCache.set(key, result);
  return result;
}

/**
 * Textura šestiúhelníkové / diamantové brankové sítě
 */
export function generateNetTexture(repeatX = 16, repeatY = 10): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = createCanvas(64, 64);
  const ctx = getContext(canvas);

  ctx.strokeStyle = "rgba(245, 245, 245, 0.85)";
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  // Hexagonální/diamantová vazba
  for (let y = -32; y <= 96; y += 16) {
    ctx.moveTo(0, y);
    ctx.lineTo(32, y + 8);
    ctx.lineTo(64, y);

    ctx.moveTo(0, y + 16);
    ctx.lineTo(32, y + 8);
    ctx.lineTo(64, y + 16);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
