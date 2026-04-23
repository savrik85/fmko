"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export type BadgePattern = "shield" | "circle" | "diamond" | "hexagon" | "crest" | "rounded_shield" | "pennant" | "square";

interface Badge3DProps {
  primary: string;
  secondary: string;
  pattern: BadgePattern;
  initials: string;
  position: [number, number, number];
  size?: number;
}

// Shape buildery pro každý vzor (souřadnice 0..200, později centrované)
function buildBadgeShape(pattern: BadgePattern): THREE.Shape {
  const s = new THREE.Shape();
  const half = 100;
  const max = 200;

  switch (pattern) {
    case "shield":
      s.moveTo(half - 100, max * 0.05 - 100);
      s.lineTo(max * 0.9 - 100, max * 0.25 - 100);
      s.lineTo(max * 0.9 - 100, max * 0.6 - 100);
      s.quadraticCurveTo(max * 0.9 - 100, max * 0.85 - 100, half - 100, max * 0.95 - 100);
      s.quadraticCurveTo(max * 0.1 - 100, max * 0.85 - 100, max * 0.1 - 100, max * 0.6 - 100);
      s.lineTo(max * 0.1 - 100, max * 0.25 - 100);
      s.closePath();
      break;
    case "circle":
      s.absarc(0, 0, half * 0.85, 0, Math.PI * 2, false);
      break;
    case "diamond":
      s.moveTo(0, max * 0.45);
      s.lineTo(max * 0.42, 0);
      s.lineTo(0, -max * 0.45);
      s.lineTo(-max * 0.42, 0);
      s.closePath();
      break;
    case "hexagon":
      s.moveTo(0, max * 0.45);
      s.lineTo(max * 0.4, max * 0.23);
      s.lineTo(max * 0.4, -max * 0.23);
      s.lineTo(0, -max * 0.45);
      s.lineTo(-max * 0.4, -max * 0.23);
      s.lineTo(-max * 0.4, max * 0.23);
      s.closePath();
      break;
    case "crest":
      s.moveTo(half - 100, max * 0.02 - 100);
      s.lineTo(max * 0.85 - 100, max * 0.15 - 100);
      s.lineTo(max * 0.92 - 100, max * 0.2 - 100);
      s.lineTo(max * 0.88 - 100, max * 0.6 - 100);
      s.quadraticCurveTo(max * 0.85 - 100, max * 0.85 - 100, half - 100, max * 0.98 - 100);
      s.quadraticCurveTo(max * 0.15 - 100, max * 0.85 - 100, max * 0.12 - 100, max * 0.6 - 100);
      s.lineTo(max * 0.08 - 100, max * 0.2 - 100);
      s.lineTo(max * 0.15 - 100, max * 0.15 - 100);
      s.closePath();
      break;
    case "rounded_shield":
      s.moveTo(half - 100, max * 0.08 - 100);
      s.quadraticCurveTo(max * 0.85 - 100, max * 0.08 - 100, max * 0.88 - 100, max * 0.3 - 100);
      s.lineTo(max * 0.88 - 100, max * 0.55 - 100);
      s.quadraticCurveTo(max * 0.88 - 100, max * 0.9 - 100, half - 100, max * 0.95 - 100);
      s.quadraticCurveTo(max * 0.12 - 100, max * 0.9 - 100, max * 0.12 - 100, max * 0.55 - 100);
      s.lineTo(max * 0.12 - 100, max * 0.3 - 100);
      s.quadraticCurveTo(max * 0.15 - 100, max * 0.08 - 100, half - 100, max * 0.08 - 100);
      break;
    case "pennant":
      s.moveTo(max * 0.15 - 100, max * 0.05 - 100);
      s.lineTo(max * 0.85 - 100, max * 0.05 - 100);
      s.lineTo(half - 100, max * 0.95 - 100);
      s.closePath();
      break;
    case "square":
      s.moveTo(-half * 0.8, -half * 0.8);
      s.lineTo(half * 0.8, -half * 0.8);
      s.lineTo(half * 0.8, half * 0.8);
      s.lineTo(-half * 0.8, half * 0.8);
      s.closePath();
      break;
  }
  return s;
}

// Texture s iniciálami (vykreslí se přes badge mesh jako overlay decal)
function buildInitialsTexture(initials: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = color;
    ctx.font = "bold 200px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Stroke pro čitelnost
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 12;
    ctx.lineJoin = "round";
    ctx.strokeText(initials, 256, 256);
    ctx.fillText(initials, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Badge3D({ primary, secondary, pattern, initials, position, size = 1 }: Badge3DProps) {
  const meshRef = useRef<THREE.Group>(null);

  const { geometry, initialsTex, textColor } = useMemo(() => {
    const shape = buildBadgeShape(pattern);
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: 12,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 3,
      bevelThickness: 3,
      curveSegments: 24,
    });
    geom.center();

    const c = primary.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 160;
    const txtColor = isLight ? "#1a1a1a" : "#ffffff";

    return { geometry: geom, initialsTex: buildInitialsTexture(initials, txtColor), textColor: txtColor };
  }, [pattern, primary, initials]);

  // Auto-rotation
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.5;
  });

  void textColor;

  return (
    <group ref={meshRef} position={position} scale={[size * 0.025, size * 0.025, size * 0.025]}>
      {/* Hlavní badge mesh */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={primary} roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Border ring (secondary color) — výrazný outline */}
      <mesh geometry={geometry} scale={[1.06, 1.06, 0.5]} position={[0, 0, -3]}>
        <meshStandardMaterial color={secondary} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Iniciály jako overlay sprite (front face) */}
      <mesh position={[0, 0, 7.5]}>
        <planeGeometry args={[120, 120]} />
        <meshBasicMaterial map={initialsTex} transparent depthWrite={false} />
      </mesh>
      {/* Iniciály mirror na zadní straně */}
      <mesh position={[0, 0, -7.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshBasicMaterial map={initialsTex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
