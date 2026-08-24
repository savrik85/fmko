"use client";

import { useMemo } from "react";
import * as THREE from "three";

interface TrainingProps3DProps {
  isSnow?: boolean;
  isMobile?: boolean;
}

export function TrainingProps3D({ isSnow = false, isMobile = false }: TrainingProps3DProps) {
  return (
    <group>
      {/* 1. Oranžové a žluté tréninkové kužely (slalom + čtverec pro bago) */}
      <TrainingConeCluster isSnow={isSnow} />

      {/* 2. Slalomové tyče zapíchané v trávníku */}
      <SlalomPolesCluster isSnow={isSnow} />

      {/* 3. Plastová tréninková zeď (figuríni na přímáky) */}
      <TrainingDummyWall position={[0, 0, -16]} isSnow={isSnow} />

      {/* 4. Přenosná malá hliníková minibranka na trénink */}
      <PortableMiniGoal position={[0, 0, 10]} rotationY={0} isSnow={isSnow} />

      {/* 5. Zásobník / koš s fotbalovými míči u střídačky */}
      <BallTub position={[-20.8, 0, -2]} isSnow={isSnow} />

      {/* 6. Rozlišovací dresy (rozlišováky) přehozené přes zábradlí u střídačky */}
      <HangingBibs position={[-20.5, 0.85, 3]} />
    </group>
  );
}

/** Jednotlivý tréninkový kužel */
function Cone({
  position,
  color = "#F97316",
}: {
  position: [number, number, number];
  color?: string;
}) {
  return (
    <group position={position}>
      {/* Čtvercová základna */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <boxGeometry args={[0.35, 0.04, 0.35]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* Tělo kuželu */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <coneGeometry args={[0.13, 0.42, 16]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Bílý reflexní proužek */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.075, 0.095, 0.1, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Skupina kuželů: slalomová linie + čtverec pro bago */
function TrainingConeCluster({ isSnow }: { isSnow?: boolean }) {
  // Slalomová dráha na východní straně hřiště
  const slalomPositions: Array<[number, number, number]> = [
    [10, 0, -12],
    [12, 0, -7],
    [9.5, 0, -2],
    [12.5, 0, 3],
    [10, 0, 8],
    [12, 0, 13],
  ];

  // Čtverec na bago (rondo) na západní polovině
  const boxPositions: Array<[number, number, number]> = [
    [-12, 0, -6],
    [-6, 0, -6],
    [-6, 0, 0],
    [-12, 0, 0],
  ];

  return (
    <group>
      {slalomPositions.map((pos, i) => (
        <Cone key={`slalom-${i}`} position={pos} color={i % 2 === 0 ? "#F97316" : "#EAB308"} />
      ))}
      {boxPositions.map((pos, i) => (
        <Cone key={`box-${i}`} position={pos} color="#F97316" />
      ))}
    </group>
  );
}

/** Slalomové tyče (vzpřímené tyčky se závažím) */
function SlalomPolesCluster({ isSnow }: { isSnow?: boolean }) {
  const poles: Array<[number, number, number, string]> = [
    [5, 0, -8, "#EAB308"],   // žlutá
    [6, 0, -4, "#2563EB"],   // modrá
    [4.5, 0, 0, "#EAB308"],  // žlutá
    [6.2, 0, 4, "#2563EB"],  // modrá
  ];

  return (
    <group>
      {poles.map(([x, y, z, col], i) => (
        <group key={i} position={[x, y, z]}>
          {/* Černý gumový podstavec */}
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.22, 0.12, 16]} />
            <meshStandardMaterial color="#1F2937" roughness={0.9} />
          </mesh>
          {/* Tyč */}
          <mesh position={[0, 0.85, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 1.5, 12]} />
            <meshStandardMaterial color={col} roughness={0.6} />
          </mesh>
          {/* Špička tyče */}
          <mesh position={[0, 1.62, 0]}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Tréninková zeď — 3 žlutí figuríni na nácvik přímých kopů */
function TrainingDummyWall({
  position,
  isSnow = false,
}: {
  position: [number, number, number];
  isSnow?: boolean;
}) {
  return (
    <group position={position}>
      {[-0.9, 0, 0.9].map((offset, i) => (
        <group key={i} position={[offset, 0, 0]}>
          {/* Kovové nožky se závažím */}
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[0.45, 0.08, 0.3]} />
            <meshStandardMaterial color="#374151" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.45, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.8, 8]} />
            <meshStandardMaterial color="#4B5563" metalness={0.5} />
          </mesh>

          {/* Plastové žluté tělo figuríny */}
          <group position={[0, 1.25, 0]}>
            {/* Trup figuríny */}
            <mesh castShadow>
              <boxGeometry args={[0.42, 0.75, 0.06]} />
              <meshStandardMaterial color="#FACC15" roughness={0.4} />
            </mesh>
            {/* Výřezy / žebrování těla figuríny */}
            {[-0.18, 0, 0.18].map((y, yi) => (
              <mesh key={yi} position={[0, y, 0.035]}>
                <boxGeometry args={[0.32, 0.06, 0.02]} />
                <meshStandardMaterial color="#CA8A04" />
              </mesh>
            ))}
            {/* Hlava figuríny */}
            <mesh position={[0, 0.52, 0]} castShadow>
              <sphereGeometry args={[0.13, 14, 14]} />
              <meshStandardMaterial color="#FACC15" roughness={0.4} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/** Přenosná hliníková minibranka se sítí */
function PortableMiniGoal({
  position,
  rotationY = 0,
  isSnow = false,
}: {
  position: [number, number, number];
  rotationY?: number;
  isSnow?: boolean;
}) {
  const goalW = 2.4;
  const goalH = 1.4;
  const goalD = 0.9;
  const postR = 0.035;

  const netMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: isSnow ? "#E2E8F0" : "#FFFFFF",
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      }),
    [isSnow]
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Hliníkový bílý rám branky */}
      {/* Břevno */}
      <mesh position={[0, goalH, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[postR, postR, goalW, 12]} />
        <meshStandardMaterial color="#FFFFFF" metalness={0.2} roughness={0.4} />
      </mesh>

      {/* Levá a pravá tyč */}
      <mesh position={[-goalW / 2, goalH / 2, 0]} castShadow>
        <cylinderGeometry args={[postR, postR, goalH, 12]} />
        <meshStandardMaterial color="#FFFFFF" metalness={0.2} roughness={0.4} />
      </mesh>
      <mesh position={[goalW / 2, goalH / 2, 0]} castShadow>
        <cylinderGeometry args={[postR, postR, goalH, 12]} />
        <meshStandardMaterial color="#FFFFFF" metalness={0.2} roughness={0.4} />
      </mesh>

      {/* Spodní a zadní rám na trávě */}
      <mesh position={[-goalW / 2, 0.03, goalD / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[postR * 0.8, postR * 0.8, goalD, 8]} />
        <meshStandardMaterial color="#E5E7EB" roughness={0.6} />
      </mesh>
      <mesh position={[goalW / 2, 0.03, goalD / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[postR * 0.8, postR * 0.8, goalD, 8]} />
        <meshStandardMaterial color="#E5E7EB" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.03, goalD]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[postR * 0.8, postR * 0.8, goalW, 8]} />
        <meshStandardMaterial color="#E5E7EB" roughness={0.6} />
      </mesh>

      {/* Šikmé zadní vzpěry */}
      <mesh
        position={[-goalW / 2, goalH / 2, goalD / 2]}
        rotation={[-Math.atan2(goalD, goalH), 0, 0]}
      >
        <cylinderGeometry args={[postR * 0.7, postR * 0.7, Math.hypot(goalH, goalD), 8]} />
        <meshStandardMaterial color="#E5E7EB" />
      </mesh>
      <mesh
        position={[goalW / 2, goalH / 2, goalD / 2]}
        rotation={[-Math.atan2(goalD, goalH), 0, 0]}
      >
        <cylinderGeometry args={[postR * 0.7, postR * 0.7, Math.hypot(goalH, goalD), 8]} />
        <meshStandardMaterial color="#E5E7EB" />
      </mesh>

      {/* Síť branky (zadní šikmá stěna + boky) */}
      <mesh
        position={[0, goalH / 2, goalD / 2]}
        rotation={[-Math.atan2(goalD, goalH), 0, 0]}
        material={netMaterial}
      >
        <planeGeometry args={[goalW, Math.hypot(goalH, goalD), 8, 8]} />
      </mesh>
    </group>
  );
}

/** Koš / bedna s fotbalovými míči u střídaček */
function BallTub({
  position,
  isSnow = false,
}: {
  position: [number, number, number];
  isSnow?: boolean;
}) {
  return (
    <group position={position}>
      {/* Plastová modrá / černá přepravka */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.38, 0.55, 16, 1, true]} />
        <meshStandardMaterial color="#1E3A8A" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.04, 16]} />
        <meshStandardMaterial color="#1E3A8A" />
      </mesh>

      {/* Fotbalové míče uvnitř */}
      {[
        [-0.12, 0.38, -0.1],
        [0.14, 0.4, 0.08],
        [-0.05, 0.44, 0.14],
        [0.08, 0.52, -0.05],
      ].map((p, idx) => (
        <mesh key={idx} position={p as [number, number, number]} castShadow>
          <sphereGeometry args={[0.11, 14, 14]} />
          <meshStandardMaterial color="#F9FAFB" roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Rozlišováky visící přes zábradlí */
function HangingBibs({ position }: { position: [number, number, number] }) {
  const bibs = [
    { color: "#FACC15", offset: -0.4 }, // svítivě žlutý
    { color: "#22C55E", offset: 0 },    // neonově zelený
    { color: "#06B6D4", offset: 0.4 },  // tyrkysový
  ];

  return (
    <group position={position}>
      {bibs.map((b, idx) => (
        <mesh key={idx} position={[0, -0.15, b.offset]} castShadow>
          <boxGeometry args={[0.06, 0.4, 0.28]} />
          <meshStandardMaterial color={b.color} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}
