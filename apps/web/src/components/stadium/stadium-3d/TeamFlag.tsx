"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { badgeSvgMarkup, type BadgePattern } from "@/components/ui/badge-preview";

interface TeamFlagProps {
  size: number;            // 1=malá 3m, 2=střední 5m, 3=velká 8m
  primaryColor: string;    // dresová primární — pole vlajky
  secondaryColor: string;  // dresová sekundární — proužek u žerdi
  badgePrimary: string;    // barvy znaku (jako v profilu)
  badgeSecondary: string;
  pattern: string;         // shield/circle/diamond/...
  initials: string;
  symbol?: string | null;  // emoji / svg:crescent — jako v profilu
  position: [number, number, number];
}

const HEIGHTS = [0, 3, 5, 8];        // poleHeight per level
const FLAG_W_RATIO = 0.55;            // flag width relative to pole height
const FLAG_H_RATIO = 0.35;

// Ztmavení/zesvětlení hex barvy o poměr amt (-1..1)
function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const f = (v: number) => clamp(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return `#${[f(r), f(g), f(b)].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

export function TeamFlag({ size, primaryColor, secondaryColor, badgePrimary, badgeSecondary, pattern, initials, symbol, position }: TeamFlagProps) {
  const lvl = Math.min(Math.max(size, 0), 3);
  const poleHeight = HEIGHTS[lvl];
  const flagW = poleHeight * FLAG_W_RATIO;
  const flagH = poleHeight * FLAG_H_RATIO;

  // Klubová vlajka: pole týmové barvy + proužek u žerdi + kotouč se znakem (identickým s profilem).
  const texture = useClubFlagTexture({
    field: primaryColor, hoist: secondaryColor,
    badgePrimary, badgeSecondary, pattern, initials, symbol,
  });

  // Flipnutá textura pro zadní stranu (BackSide by jinak ukázal mirror)
  const flippedTexture = useMemo(() => {
    if (!texture) return null;
    const c = texture.clone();
    c.center.set(0.5, 0.5);
    c.repeat.set(-1, 1);
    c.wrapS = THREE.RepeatWrapping;
    c.wrapT = THREE.RepeatWrapping;
    c.needsUpdate = true;
    return c;
  }, [texture]);

  // Animace vlnění — synchronizovaná wave pro oba meshes
  const flagRefFront = useRef<THREE.Mesh>(null);
  const flagRefBack = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2;
    const updateMesh = (m: THREE.Mesh | null) => {
      if (!m) return;
      const geom = m.geometry as THREE.PlaneGeometry;
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const distance = (x + flagW / 2) / flagW;
        const wave = Math.sin(t + distance * 4) * 0.15 * distance;
        pos.setZ(i, wave);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
    };
    updateMesh(flagRefFront.current);
    updateMesh(flagRefBack.current);
  });

  if (size <= 0) return null;

  return (
    <group position={position}>
      {/* Stožár */}
      <mesh position={[0, poleHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, poleHeight, 8]} />
        <meshStandardMaterial color="#9CA3AF" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Špička stožáru */}
      <mesh position={[0, poleHeight, 0]} castShadow>
        <coneGeometry args={[0.12, 0.3, 8]} />
        <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Vlajka — dva meshe (front/back), oboustranná. */}
      <mesh
        ref={flagRefFront}
        position={[flagW / 2 + 0.07, poleHeight - flagH / 2 - 0.2, 0]}
        castShadow
      >
        <planeGeometry args={[flagW, flagH, 16, 8]} />
        <meshStandardMaterial map={texture} side={THREE.FrontSide} roughness={0.7} color={texture ? "#fff" : primaryColor} />
      </mesh>
      <mesh
        ref={flagRefBack}
        position={[flagW / 2 + 0.07, poleHeight - flagH / 2 - 0.2, 0]}
        castShadow
      >
        <planeGeometry args={[flagW, flagH, 16, 8]} />
        <meshStandardMaterial map={flippedTexture} side={THREE.BackSide} roughness={0.7} color={flippedTexture ? "#fff" : primaryColor} />
      </mesh>
    </group>
  );
}

/**
 * Klubová vlajka jako textura: pole týmové barvy (jemný gradient) + proužek u žerdi
 * + kotouč se znakem. Znak se rasterizuje ze SDÍLENÉHO badgeSvgMarkup (jako v profilu),
 * takže sedí tvar, barvy i symbol. Load SVG → Image je async → texture přes useState.
 */
function useClubFlagTexture(opts: {
  field: string; hoist: string; badgePrimary: string; badgeSecondary: string;
  pattern: string; initials: string; symbol?: string | null;
}): THREE.Texture | null {
  const { field, hoist, badgePrimary, badgeSecondary, pattern, initials, symbol } = opts;
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;
    const W = 512, H = Math.round(W * (FLAG_H_RATIO / FLAG_W_RATIO)); // aspekt vlajky → bez deformace
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hoistW = W * 0.11;
    const discCx = hoistW + (W - hoistW) / 2;
    const discCy = H / 2;
    const discR = H * 0.4;

    const compose = (crest?: HTMLImageElement) => {
      // Pole — jemný svislý gradient týmové barvy
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, shade(field, 0.06));
      g.addColorStop(1, shade(field, -0.14));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Proužek u žerdi (dresová sekundární) + jemný předěl
      ctx.fillStyle = hoist;
      ctx.fillRect(0, 0, hoistW, H);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(hoistW, 0, Math.max(2, W * 0.006), H);

      // Kotouč pod znakem — bílý, s prstencem, aby znak vynikl na jakékoli barvě
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = H * 0.05;
      ctx.beginPath();
      ctx.arc(discCx, discCy, discR, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(discCx, discCy, discR, 0, Math.PI * 2);
      ctx.lineWidth = H * 0.022;
      ctx.strokeStyle = badgeSecondary;
      ctx.stroke();

      // Znak (transparentní SVG) do kotouče
      if (crest) {
        const cs = discR * 1.8;
        ctx.drawImage(crest, discCx - cs / 2, discCy - cs / 2, cs, cs);
      }

      if (cancelled) return;
      const t = new THREE.CanvasTexture(canvas);
      t.anisotropy = 4;
      t.needsUpdate = true;
      setTex((old) => { old?.dispose(); return t; });
    };

    const inner = badgeSvgMarkup({
      primary: badgePrimary, secondary: badgeSecondary,
      pattern: pattern as BadgePattern, initials, symbol,
      size: 512, font: "Arial, Helvetica, sans-serif",
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${inner}</svg>`;
    const img = new Image();
    img.onload = () => { if (!cancelled) compose(img); };
    img.onerror = (e) => { console.warn("znak vlajky se nenačetl:", e); if (!cancelled) compose(); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

    return () => { cancelled = true; };
  }, [field, hoist, badgePrimary, badgeSecondary, pattern, initials, symbol]);

  // Dispose při unmountu
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  return tex;
}
