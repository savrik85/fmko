"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { drawBadgeOnCanvas, type BadgePattern } from "@/components/ui/badge-preview";

interface TeamFlagProps {
  size: number;            // 1=malá 3m, 2=střední 5m, 3=velká 8m
  primaryColor: string;    // dresová primární — pole vlajky
  secondaryColor?: string; // dresová sekundární (nepoužito přímo, drženo pro kompatibilitu)
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

export function TeamFlag({ size, primaryColor, badgePrimary, badgeSecondary, pattern, initials, symbol, position }: TeamFlagProps) {
  const lvl = Math.min(Math.max(size, 0), 3);
  const poleHeight = HEIGHTS[lvl];
  const flagW = poleHeight * FLAG_W_RATIO;
  const flagH = poleHeight * FLAG_H_RATIO;

  // Klubová vlajka jako textura — SYNCHRONNĚ (žádný async/<img>, tedy žádné canvas tainting).
  // Celá plocha týmovou barvou + kotouč se znakem kresleným přímo přes drawBadgeOnCanvas.
  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const W = 512, H = Math.round(W * (FLAG_H_RATIO / FLAG_W_RATIO)); // aspekt vlajky → bez deformace
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // CELÁ plocha týmovou barvou (jemný svislý gradient pro hloubku)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(primaryColor, 0.10));
    g.addColorStop(1, shade(primaryColor, -0.16));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Jemný tmavší lem téže barvy
    ctx.strokeStyle = shade(primaryColor, -0.32);
    ctx.lineWidth = Math.max(3, H * 0.03);
    ctx.strokeRect(0, 0, W, H);

    // Kotouč pod znakem — bílý s prstencem, ať znak vynikne na jakékoli barvě
    const discCx = W / 2, discCy = H / 2, discR = H * 0.4;
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

    // Znak přímo na canvas (stejná geometrie jako profil)
    drawBadgeOnCanvas(ctx, {
      primary: badgePrimary, secondary: badgeSecondary,
      pattern: pattern as BadgePattern, initials, symbol,
      cx: discCx, cy: discCy, size: discR * 1.8,
    });

    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }, [primaryColor, badgePrimary, badgeSecondary, pattern, initials, symbol]);

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

  // Dispose textur při změně/unmountu
  useEffect(() => () => { texture?.dispose(); flippedTexture?.dispose(); }, [texture, flippedTexture]);

  // Animace vlnění — synchronizovaná wave pro oba meshes
  const flagRefFront = useRef<THREE.Mesh>(null);
  const flagRefBack = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2.5;
    const amp = flagW * 0.11;            // amplituda škáluje s velikostí vlajky
    const updateMesh = (m: THREE.Mesh | null) => {
      if (!m) return;
      const geom = m.geometry as THREE.PlaneGeometry;
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const distance = (x + flagW / 2) / flagW; // 0 u žerdi, 1 na volném konci
        // Hlavní vlna + jemnější druhá vlna (závislá i na y) = organické vlání
        const wave =
          Math.sin(t + distance * 5) * amp * distance +
          Math.sin(t * 1.7 + distance * 9 + y * 2.5) * amp * 0.35 * distance;
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
