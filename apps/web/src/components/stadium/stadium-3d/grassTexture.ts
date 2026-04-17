import * as THREE from "three";

/**
 * Procedurální tráva — canvas noise texture s mírnými barevnými variacemi.
 * Generuje se jednou (podle seed) a cachuje se podle base color.
 */
const cache = new Map<string, THREE.CanvasTexture>();

export function generateGrassTexture(baseColor: string, size = 512): THREE.CanvasTexture {
  const cached = cache.get(baseColor);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Base
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Parse base color → RGB
  const baseRGB = hexToRgb(baseColor);

  // Noise overlay — pseudo-random pixel variance
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  let seed = 9876;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < data.length; i += 4) {
    const variance = (rand() - 0.5) * 30;
    data[i] = clamp(baseRGB.r + variance);
    data[i + 1] = clamp(baseRGB.g + variance * 1.2);
    data[i + 2] = clamp(baseRGB.b + variance * 0.7);
  }
  ctx.putImageData(imageData, 0, 0);

  // Plus subtle "blade" lines
  ctx.strokeStyle = `rgba(${baseRGB.r + 20}, ${baseRGB.g + 25}, ${baseRGB.b + 10}, 0.15)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 2 + rand() * 4;
    const angle = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 6);   // tile po hřišti
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  cache.set(baseColor, tex);
  return tex;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
