"use client";

import { useMemo } from "react";
import { PITCH, pitchColor } from "./constants";

interface PitchProps {
  condition: number;
  pitchType: string;
}

const HALF_W = PITCH.width / 2;
const HALF_D = PITCH.depth / 2;

// Paleta hnědo-žlutých odstínů pro vyšlapaná místa
const WEAR_COLORS = ["#8B6F47", "#9B7E55", "#A08560", "#7A5C3A", "#6B5836", "#B89868"];

interface DamageSpot {
  nx: number;     // -1..1
  nz: number;
  rx: number;     // 0..1 (relative)
  rz: number;
  threshold: number;
  opacity: number;
  color: string;
  rotation: number;
}

// Generuje pseudo-random procedurální damage spoty (deterministic seed)
function generateDamageSpots(): DamageSpot[] {
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pickColor = () => WEAR_COLORS[Math.floor(rand() * WEAR_COLORS.length)];
  const out: DamageSpot[] = [];

  // Hotspoty: méně skvrn + skromnější rozšíření, viditelné jen při výrazném poškození
  const clusters = [
    { cx: 0,    cz: -0.9, range: 0.22, count: 14, baseThr: 70, sizeMin: 0.02,  sizeMax: 0.04 },   // S brankoviště
    { cx: 0,    cz: 0.9,  range: 0.22, count: 14, baseThr: 70, sizeMin: 0.02,  sizeMax: 0.04 },   // N brankoviště
    { cx: 0,    cz: 0,    range: 0.2,  count: 10, baseThr: 50, sizeMin: 0.018, sizeMax: 0.035 },  // střed
    { cx: -0.92, cz: 0,   range: 0.7,  count: 8,  baseThr: 35, sizeMin: 0.015, sizeMax: 0.03 },   // Z sideline
    { cx: 0.92,  cz: 0,   range: 0.7,  count: 8,  baseThr: 35, sizeMin: 0.015, sizeMax: 0.03 },   // V sideline
    { cx: 0,    cz: 0,    range: 0.95, count: 20, baseThr: 18, sizeMin: 0.01,  sizeMax: 0.025 }, // náhodné, jen extreme damage
  ];

  clusters.forEach((cl) => {
    for (let i = 0; i < cl.count; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.pow(rand(), 0.7) * cl.range;
      let nx = cl.cx + Math.cos(angle) * dist;
      let nz = cl.cz + Math.sin(angle) * dist * 1.5;
      nx = Math.max(-0.97, Math.min(0.97, nx));
      nz = Math.max(-0.97, Math.min(0.97, nz));
      const sz = cl.sizeMin + rand() * (cl.sizeMax - cl.sizeMin);
      out.push({
        nx,
        nz,
        rx: sz,
        rz: sz * (0.6 + rand() * 0.7),
        threshold: cl.baseThr - Math.floor(rand() * 15),
        opacity: 0.3 + rand() * 0.3,    // méně neprůhledné
        color: pickColor(),
        rotation: rand() * Math.PI,
      });
    }
  });
  return out;
}

const DAMAGE_SPOTS = generateDamageSpots();

export function Pitch({ condition, pitchType }: PitchProps) {
  const hasLines = condition >= 20;
  const hasCenter = condition >= 40;
  const hasFull = condition >= 65;
  const hasStripes = condition >= 55;

  // Hřiště je naplocho na zemi (rotation -π/2 kolem X)
  const pitchRotation: [number, number, number] = [-Math.PI / 2, 0, 0];

  // Base barva trávníku - i pro nízkou condition zachovat trochu zeleně
  // (poškození pak overlay přidává hnědou)
  const finalGrassColor = useMemo(() => {
    if (pitchType === "artificial") return condition >= 30 ? "#2E8B1F" : "#5A8245";
    // Pro natural/hybrid: condition ovlivňuje sytost zelené, ale nepřejde do hnědé
    if (condition >= 70) return pitchColor(condition);
    if (condition >= 40) return "#6B8240";
    if (condition >= 20) return "#5C7138";
    return "#566B30";
  }, [pitchType, condition]);

  // Vidím damage spoty s threshold > condition (čím nižší kondice, tím víc viditelných)
  const visibleSpots = useMemo(
    () => DAMAGE_SPOTS.filter((s) => condition < s.threshold),
    [condition]
  );

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

      {/* Damage spots — mnoho malých nepravidelných skvrn */}
      {visibleSpots.map((s, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, s.rotation]}
          position={[s.nx * HALF_W, 0.025 + (i % 3) * 0.001, s.nz * HALF_D]}
          scale={[s.rx * PITCH.width, s.rz * PITCH.depth, 1]}
        >
          <circleGeometry args={[1, 8]} />
          <meshBasicMaterial color={s.color} opacity={s.opacity} transparent depthWrite={false} />
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
