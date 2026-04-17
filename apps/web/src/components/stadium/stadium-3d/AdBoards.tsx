"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { PITCH } from "./constants";

interface AdBoardsProps {
  sponsors: string[];
  teamColor: string;
}

const HALF_W = PITCH.width / 2;
const HALF_D = PITCH.depth / 2;

const BOARD_HEIGHT = 0.8;
const BOARD_THICKNESS = 0.05;
const BOARD_OFFSET = 0.6;

const BANNER_COLORS = [
  "#E63946", "#1D3557", "#2A9D8F", "#F4A261", "#264653",
  "#E76F51", "#6A4C93", "#0077B6", "#A03A4C", "#3D5A28",
];

const PERIMETER = 2 * (PITCH.width + PITCH.depth);   // 200
const MAX_SLOTS = 6;
const SLOT_LENGTH = 10;      // šířka bannera v metrech

export function AdBoards({ sponsors, teamColor }: AdBoardsProps) {
  const boards = useMemo(() => {
    if (sponsors.length === 0) return [];
    const slotSpacing = PERIMETER / MAX_SLOTS;   // 25m

    // Vždy 8 fixních pozic. Sponzoři se cyklicky opakují:
    // 1 sponzor → 8x stejný; 2 → každý 4x; 4 → každý 2x; 8 → po jednom.
    return Array.from({ length: MAX_SLOTS }, (_, i) => {
      const sponsor = sponsors[i % sponsors.length];
      const dist = i * slotSpacing + slotSpacing / 2;
      const { x, z, rotY } = perimeterToXZ(dist);
      const sponsorIdx = i % sponsors.length;
      const color = sponsorIdx === 0 ? teamColor : BANNER_COLORS[sponsorIdx % BANNER_COLORS.length];
      return { x, z, rotY, text: sponsor, color, len: SLOT_LENGTH };
    });
  }, [sponsors, teamColor]);

  return (
    <group>
      {boards.map((b, i) => (
        <AdBoard
          key={i}
          position={[b.x, BOARD_HEIGHT / 2, b.z]}
          rotation={[0, b.rotY, 0]}
          text={b.text}
          color={b.color}
          length={b.len}
        />
      ))}
    </group>
  );
}

/**
 * Mapuje vzdálenost po perimetru hřiště (0..PERIMETER) na (x, z) pozici a Y rotaci.
 * Pořadí stran: jih → východ → sever → západ.
 */
function perimeterToXZ(dist: number): { x: number; z: number; rotY: number } {
  const south = PITCH.width;       // 0..40
  const east = PITCH.depth;        // 40..100
  const north = PITCH.width;       // 100..140
  // west: 140..200

  let d = dist % PERIMETER;
  if (d < south) {
    return {
      x: -HALF_W + d,
      z: -HALF_D - BOARD_OFFSET,
      rotY: 0,
    };
  }
  d -= south;
  if (d < east) {
    return {
      x: HALF_W + BOARD_OFFSET,
      z: -HALF_D + d,
      rotY: -Math.PI / 2,
    };
  }
  d -= east;
  if (d < north) {
    return {
      x: HALF_W - d,
      z: HALF_D + BOARD_OFFSET,
      rotY: Math.PI,
    };
  }
  d -= north;
  return {
    x: -HALF_W - BOARD_OFFSET,
    z: HALF_D - d,
    rotY: Math.PI / 2,
  };
}

function AdBoard({
  position,
  rotation,
  text,
  color,
  length,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  text: string;
  color: string;
  length: number;
}) {
  const texture = useMemo(() => makeBoardTexture(text, color), [text, color]);

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[length, BOARD_HEIGHT, BOARD_THICKNESS]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, BOARD_THICKNESS / 2 + 0.005]}>
        <planeGeometry args={[length * 0.97, BOARD_HEIGHT * 0.92]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function makeBoardTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Auto-shrink font dokud text nevejde
  const display = text.toUpperCase();
  const maxWidth = canvas.width - 40;
  let fontSize = 90;
  do {
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    if (ctx.measureText(display).width <= maxWidth) break;
    fontSize -= 4;
  } while (fontSize > 30);

  ctx.fillText(display, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
