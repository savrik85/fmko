"use client";

import { useMemo } from "react";
import { PITCH, pitchColor } from "./constants";

interface PitchProps {
  condition: number;   // 0-100
  pitchType: string;   // natural | hybrid | artificial
}

const HALF_W = PITCH.width / 2;
const HALF_D = PITCH.depth / 2;

// Pre-computed damage spots: [x_norm (-1..1), z_norm (-1..1), rx_norm, rz_norm, conditionThreshold, opacity, color]
const DAMAGE_SPOTS: Array<[number, number, number, number, number, number, string]> = [
  [0,    -0.93, 0.42, 0.07, 80, 0.5,  "#8B7350"],   // S goal mouth
  [0,     0.93, 0.42, 0.07, 80, 0.5,  "#8B7350"],   // N goal mouth
  [-0.5, -0.5,  0.18, 0.05, 65, 0.3,  "#8B7B50"],
  [0.6,   0.4,  0.16, 0.04, 65, 0.25, "#8B7B50"],
  [0.4,  -0.6,  0.21, 0.05, 50, 0.4,  "#8B7350"],
  [-0.6,  0.6,  0.19, 0.05, 50, 0.35, "#8B7350"],
  [0.2,  -0.2,  0.24, 0.06, 40, 0.45, "#7A6840"],
  [-0.4,  0.3,  0.23, 0.06, 40, 0.40, "#7A6840"],
  [0.55,  0,    0.29, 0.07, 30, 0.55, "#6B5830"],
  [-0.5, -0.8,  0.27, 0.06, 30, 0.50, "#6B5830"],
  [0,     0.2,  0.38, 0.08, 20, 0.6,  "#5A4820"],
];

export function Pitch({ condition, pitchType }: PitchProps) {
  const grassColor = pitchColor(condition);
  const hasLines = condition >= 20;
  const hasCenter = condition >= 40;
  const hasFull = condition >= 65;
  const hasStripes = condition >= 55;

  // Hřiště je naplocho na zemi (rotation -π/2 kolem X)
  const pitchRotation: [number, number, number] = [-Math.PI / 2, 0, 0];

  // Přírodní ↔ umělý: artificial má sytější barvu, hybrid mezi
  const finalGrassColor = useMemo(() => {
    if (pitchType === "artificial") return condition >= 30 ? "#2E8B1F" : "#5A8245";
    return grassColor;
  }, [grassColor, pitchType, condition]);

  return (
    <group>
      {/* Hlavní hřiště */}
      <mesh rotation={pitchRotation} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[PITCH.width, PITCH.depth]} />
        <meshStandardMaterial color={finalGrassColor} roughness={0.95} />
      </mesh>

      {/* Mowing stripes — alternující světlejší pruhy */}
      {hasStripes && (
        <group>
          {Array.from({ length: 8 }).map((_, i) => (
            <mesh key={i} rotation={pitchRotation} position={[0, 0.02, -HALF_D + i * 7.5 + 3.75]}>
              <planeGeometry args={[PITCH.width, 3.75]} />
              <meshStandardMaterial color={i % 2 === 0 ? "#000" : "#fff"} opacity={0.07} transparent depthWrite={false} />
            </mesh>
          ))}
        </group>
      )}

      {/* Damage spots — hnědé skvrny */}
      {DAMAGE_SPOTS.filter(([, , , , thr]) => condition < thr).map(([nx, nz, rx, rz, , op, col], i) => (
        <mesh
          key={i}
          rotation={pitchRotation}
          position={[nx * HALF_W, 0.03, nz * HALF_D]}
          scale={[rx * PITCH.width, rz * PITCH.depth, 1]}
        >
          <circleGeometry args={[1, 16]} />
          <meshStandardMaterial color={col} opacity={op} transparent depthWrite={false} />
        </mesh>
      ))}

      {/* Hrací čáry */}
      {hasLines && (
        <PitchLines hasFull={hasFull} hasCenter={hasCenter} opacity={hasFull ? 0.85 : condition < 30 ? 0.15 : 0.35} />
      )}

      {/* Branky */}
      <Goal position={[0, 0, -HALF_D]} />
      <Goal position={[0, 0, HALF_D]} flip />
    </group>
  );
}

function PitchLines({ hasFull, hasCenter, opacity }: { hasFull: boolean; hasCenter: boolean; opacity: number }) {
  const lineY = 0.05;
  const lineColor = "#fff";
  const lineWidth = hasFull ? 0.25 : 0.15;

  return (
    <group>
      {/* Obvod */}
      <Line points={[
        [-HALF_W, lineY, -HALF_D],
        [HALF_W,  lineY, -HALF_D],
        [HALF_W,  lineY, HALF_D],
        [-HALF_W, lineY, HALF_D],
        [-HALF_W, lineY, -HALF_D],
      ]} color={lineColor} width={lineWidth} opacity={opacity} />

      {/* Středová čára */}
      <Line points={[[-HALF_W, lineY, 0], [HALF_W, lineY, 0]]} color={lineColor} width={lineWidth} opacity={opacity} />

      {/* Středový kruh */}
      {hasCenter && <Circle radius={6} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />}

      {/* Středový bod */}
      <mesh position={[0, lineY + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 8]} />
        <meshBasicMaterial color={lineColor} transparent opacity={opacity} />
      </mesh>

      {/* Pokutová území - velké */}
      <Rect x={0} z={-HALF_D + 9} w={22} h={18} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />
      <Rect x={0} z={HALF_D - 9}  w={22} h={18} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />

      {/* Brankovista - malá (jen na full) */}
      {hasFull && (
        <>
          <Rect x={0} z={-HALF_D + 3.5} w={14} h={7} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />
          <Rect x={0} z={HALF_D - 3.5}  w={14} h={7} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />
        </>
      )}
    </group>
  );
}

// Tenký line proužek z meshů (pro 3D čáry, protože line v R3F je 1px wide)
function Line({ points, color, width, opacity }: { points: Array<[number, number, number]>; color: string; width: number; opacity: number }) {
  const segments: Array<{ pos: [number, number, number]; rot: [number, number, number]; len: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1, z1] = points[i];
    const [x2, , z2] = points[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);
    segments.push({
      pos: [(x1 + x2) / 2, y1, (z1 + z2) / 2],
      rot: [-Math.PI / 2, 0, -angle],
      len,
    });
  }
  return (
    <group>
      {segments.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot}>
          <planeGeometry args={[s.len, width]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} side={2} />
        </mesh>
      ))}
    </group>
  );
}

function Rect({ x, z, w, h, y, color, width, opacity }: { x: number; z: number; w: number; h: number; y: number; color: string; width: number; opacity: number }) {
  const halfW = w / 2, halfH = h / 2;
  return (
    <Line
      points={[
        [x - halfW, y, z - halfH],
        [x + halfW, y, z - halfH],
        [x + halfW, y, z + halfH],
        [x - halfW, y, z + halfH],
        [x - halfW, y, z - halfH],
      ]}
      color={color}
      width={width}
      opacity={opacity}
    />
  );
}

function Circle({ radius, y, color, width, opacity }: { radius: number; y: number; color: string; width: number; opacity: number }) {
  const segments = 32;
  const points: Array<[number, number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
  }
  return <Line points={points} color={color} width={width} opacity={opacity} />;
}

function Goal({ position, flip }: { position: [number, number, number]; flip?: boolean }) {
  // Branka: 2 sloupky + břevno + jednoduchá síť (linkami)
  const goalWidth = 7;
  const goalHeight = 2.5;
  const goalDepth = 1.5;
  const postRadius = 0.1;
  const dir = flip ? 1 : -1;

  return (
    <group position={position}>
      {/* Levý sloupek */}
      <mesh position={[-goalWidth / 2, goalHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 8]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      {/* Pravý sloupek */}
      <mesh position={[goalWidth / 2, goalHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 8]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      {/* Břevno */}
      <mesh position={[0, goalHeight, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, goalWidth, 8]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      {/* Síť - jednoduchý průhledný blok za brankou */}
      <mesh position={[0, goalHeight / 2, dir * goalDepth / 2]}>
        <boxGeometry args={[goalWidth, goalHeight, goalDepth]} />
        <meshStandardMaterial color="#fff" opacity={0.15} transparent wireframe />
      </mesh>
    </group>
  );
}
