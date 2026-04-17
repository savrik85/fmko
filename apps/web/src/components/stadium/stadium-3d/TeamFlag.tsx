"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

interface TeamFlagProps {
  size: number;            // 1=malá 3m, 2=střední 5m, 3=velká 8m
  primaryColor: string;
  secondaryColor: string;
  pattern: string;         // shield/circle/diamond/...
  initials: string;
  position: [number, number, number];
}

const HEIGHTS = [0, 3, 5, 8];        // poleHeight per level
const FLAG_W_RATIO = 0.55;            // flag width relative to pole height
const FLAG_H_RATIO = 0.35;

export function TeamFlag({ size, primaryColor, secondaryColor, pattern, initials, position }: TeamFlagProps) {
  if (size <= 0) return null;
  const lvl = Math.min(size, 3);
  const poleHeight = HEIGHTS[lvl];
  const flagW = poleHeight * FLAG_W_RATIO;
  const flagH = poleHeight * FLAG_H_RATIO;

  // Logo texture z BadgePreview SVG
  const texture = useBadgeTexture(primaryColor, secondaryColor, pattern, initials);

  // Flipnutá texturu pro zadní stranu (BackSide rendering by jinak ukázal mirror)
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

  // Animace vlnění — synchronizovaná wave pro oba meshes (stejná lokální poloha)
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
      {/* Vlajka — single mesh, oboustranná. Front strana = original texture.
          Back strana má `BackSide` material s flipnutou texturou aby logo
          bylo správně orientované i z opačného úhlu. */}
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
 * Vyrenderuje team badge přímo na canvas (bez SVG → Image conversion).
 * Reused logic z BadgePreview ale jako Canvas API draw calls.
 */
function useBadgeTexture(primary: string, secondary: string, pattern: string, initials: string): THREE.Texture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const s = 512;
    const c = document.createElement("canvas");
    c.width = s; c.height = s;
    const ctx = c.getContext("2d")!;

    // Bílé pozadí
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, s, s);

    const lum = (hex: string) => {
      const h = hex.replace("#", "");
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000;
    };
    const primaryLight = lum(primary) > 200;
    const stroke = primaryLight && lum(secondary) > 200 ? "#bbbbbb" : secondary;
    const textFill = primaryLight ? "#333333" : "#ffffff";
    const half = s / 2;

    // Draw shape
    ctx.fillStyle = primary;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = s * 0.04;
    ctx.lineJoin = "round";
    ctx.beginPath();

    if (pattern === "circle") {
      ctx.arc(half, half, half * 0.85, 0, Math.PI * 2);
    } else if (pattern === "square") {
      const x = s * 0.1, w = s * 0.8, r = s * 0.12;
      roundedRectPath(ctx, x, x, w, w, r);
    } else if (pattern === "diamond") {
      ctx.moveTo(half, s * 0.05);
      ctx.lineTo(s * 0.92, half);
      ctx.lineTo(half, s * 0.95);
      ctx.lineTo(s * 0.08, half);
      ctx.closePath();
    } else if (pattern === "hexagon") {
      ctx.moveTo(half, s * 0.05);
      ctx.lineTo(s * 0.9, s * 0.27);
      ctx.lineTo(s * 0.9, s * 0.73);
      ctx.lineTo(half, s * 0.95);
      ctx.lineTo(s * 0.1, s * 0.73);
      ctx.lineTo(s * 0.1, s * 0.27);
      ctx.closePath();
    } else if (pattern === "pennant") {
      ctx.moveTo(s * 0.15, s * 0.05);
      ctx.lineTo(s * 0.85, s * 0.05);
      ctx.lineTo(half, s * 0.95);
      ctx.closePath();
    } else {
      // shield (default), crest, rounded_shield — all approximated as shield path
      ctx.moveTo(half, s * 0.05);
      ctx.lineTo(s * 0.9, s * 0.25);
      ctx.lineTo(s * 0.9, s * 0.6);
      ctx.quadraticCurveTo(s * 0.9, s * 0.85, half, s * 0.95);
      ctx.quadraticCurveTo(s * 0.1, s * 0.85, s * 0.1, s * 0.6);
      ctx.lineTo(s * 0.1, s * 0.25);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // Text
    const fontSize = s * 0.28;
    ctx.font = `800 ${fontSize * 0.85}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Stroke pro lepší čitelnost
    ctx.strokeStyle = primaryLight ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.4)";
    ctx.lineWidth = s * 0.02;
    ctx.strokeText(initials, half, half);
    ctx.fillStyle = textFill;
    ctx.fillText(initials, half, half);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, [primary, secondary, pattern, initials]);
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}
