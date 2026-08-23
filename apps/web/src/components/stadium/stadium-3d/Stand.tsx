"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { PITCH, STAND_DIMS } from "./constants";
import {
  generateWoodTexture,
  generateConcreteTexture,
} from "./materialTextures";

type Side = "north" | "south" | "east" | "west";

interface StandProps {
  side: Side;
  level: number;
  teamColor: string;
  standColor?: string;
  seatColor?: string;
  accentColor?: string;
  reducedDetail?: boolean;
}

const STAND_GAP = 2.5;

export function Stand({
  side,
  level,
  teamColor,
  standColor,
  seatColor,
  accentColor,
  reducedDetail = false,
}: StandProps) {
  if (level <= 0) return null;
  return (
    <ActiveStand
      side={side}
      level={level}
      teamColor={teamColor}
      standColor={standColor}
      seatColor={seatColor}
      accentColor={accentColor}
      reducedDetail={reducedDetail}
    />
  );
}

function ActiveStand({
  side,
  level,
  teamColor,
  standColor,
  seatColor,
  accentColor,
  reducedDetail = false,
}: StandProps) {
  const dims = STAND_DIMS[Math.min(level, 3)];
  const finalSeatColor = seatColor ?? teamColor;
  const finalAccent = accentColor ?? "#C9A84C";
  const finalPanelColor = standColor ?? teamColor;

  const isEW = side === "east" || side === "west";
  const length = isEW ? PITCH.depth : PITCH.width;
  const spectatorDensity = reducedDetail ? 0.22 : 0.45;
  const seatColMult = reducedDetail ? 0.7 : 1.2;

  const distance = (isEW ? PITCH.width : PITCH.depth) / 2 + STAND_GAP + dims.depth / 2;
  let position: [number, number, number];
  let rotationY: number;

  switch (side) {
    case "north": position = [0, 0, distance]; rotationY = 0; break;
    case "south": position = [0, 0, -distance]; rotationY = Math.PI; break;
    case "east":  position = [distance, 0, 0]; rotationY = Math.PI / 2; break;
    case "west":  position = [-distance, 0, 0]; rotationY = -Math.PI / 2; break;
  }

  const seatRows = dims.rows;
  const seatColumns = Math.floor(length * seatColMult);
  const seatSize = 0.7;
  const seatDepth = dims.depth / Math.max(seatRows, 1);
  const seatRise = dims.height / Math.max(seatRows, 1);

  // Procedurální textury podle úrovně tribuny
  const woodTexture = useMemo(() => generateWoodTexture(standColor ?? "#8B6F47", 4, 2), [standColor]);
  const seatWoodTexture = useMemo(() => generateWoodTexture(finalSeatColor, 6, 1), [finalSeatColor]);
  const concreteTexture = useMemo(() => generateConcreteTexture(standColor ?? "#9CA3AF", 5, 3), [standColor]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 1. Stupňovitá základna s realistickou texturou */}
      <StepBase
        level={level}
        length={length}
        rows={seatRows}
        seatDepth={seatDepth}
        seatRise={seatRise}
        woodTexture={woodTexture}
        concreteTexture={concreteTexture}
      />

      {/* 2. Sedačky (lavičky pro L1/L2, tvarované pro L3) */}
      <Seats
        level={level}
        rows={seatRows}
        columns={seatColumns}
        seatSize={seatSize}
        seatDepth={seatDepth}
        seatRise={seatRise}
        length={length}
        teamColor={finalSeatColor}
        woodTexture={seatWoodTexture}
      />

      {/* 3. Diváci na tribuně */}
      <Spectators
        rows={seatRows}
        columns={seatColumns}
        seatSize={seatSize}
        seatDepth={seatDepth}
        seatRise={seatRise}
        length={length}
        density={spectatorDensity}
      />

      {/* 4. VIP skybox a novinářská lávka (L3). Střecha je samostatné zařízení. */}
      {level >= 3 && (
        <VIPBox
          length={length}
          height={dims.height}
          depth={dims.depth}
          accentColor={finalAccent}
          teamColor={teamColor}
        />
      )}

      {/* 5. Tunel pro nástup hráčů v přízemí (L3 uprostřed) */}
      {level >= 3 && (
        <PlayerTunnel depth={dims.depth} height={dims.height} seatDepth={seatDepth} />
      )}

      {/* 6. Čelní týmový panel / zábradlí */}
      {level >= 2 && (
        <group position={[0, 0.45, -0.05]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[length, 0.85, 0.12]} />
            <meshStandardMaterial color={finalPanelColor} roughness={0.5} metalness={0.2} />
          </mesh>
          {/* Ochranná horní trubka */}
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[length + 0.1, 0.06, 0.15]} />
            <meshStandardMaterial color="#E5E7EB" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Stupňovitá konstrukce tribuny */
function StepBase({
  level,
  length,
  rows,
  seatDepth,
  seatRise,
  woodTexture,
  concreteTexture,
}: {
  level: number;
  length: number;
  rows: number;
  seatDepth: number;
  seatRise: number;
  woodTexture: any;
  concreteTexture: any;
}) {
  if (rows === 0) return null;
  const isWood = level <= 2;
  const tex = isWood ? woodTexture : concreteTexture;

  return (
    <group>
      {Array.from({ length: rows }).map((_, r) => {
        const y = (r + 0.5) * seatRise;
        const z = (r + 0.5) * seatDepth;
        return (
          <group key={r} position={[0, y, z]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[length, seatRise, seatDepth]} />
              <meshStandardMaterial
                map={tex.map}
                bumpMap={tex.bumpMap}
                bumpScale={isWood ? 0.08 : 0.05}
                roughness={isWood ? 0.85 : 0.95}
              />
            </mesh>

            {/* Žlutý bezpečnostní pruh na hraně schodu (L2 a L3) */}
            {level >= 2 && (
              <mesh position={[0, seatRise / 2 + 0.005, -seatDepth / 2 + 0.05]}>
                <planeGeometry args={[length, 0.08]} />
                <meshStandardMaterial color="#FACC15" roughness={0.5} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Zadní a boční stěny tribuny pro ucelený vzhled */}
      {level >= 2 && (
        <>
          {/* Zadní plášť */}
          <mesh
            position={[0, (rows * seatRise) / 2, rows * seatDepth]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[length, rows * seatRise, 0.15]} />
            <meshStandardMaterial
              map={tex.map}
              bumpMap={tex.bumpMap}
              bumpScale={0.06}
              roughness={0.9}
            />
          </mesh>
          {/* Boční štíty */}
          {[-length / 2, length / 2].map((bx, i) => (
            <mesh
              key={i}
              position={[bx, (rows * seatRise) / 2, (rows * seatDepth) / 2]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.2, rows * seatRise, rows * seatDepth]} />
              <meshStandardMaterial
                map={tex.map}
                bumpMap={tex.bumpMap}
                bumpScale={0.06}
                roughness={0.9}
              />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

/** Jednotlivé sedačky (dřevěné latě pro L1/L2, plastová sklápěcí sedadla pro L3) */
function Seats({
  level,
  rows,
  columns,
  seatSize,
  seatDepth,
  seatRise,
  length,
  teamColor,
  woodTexture,
}: {
  level: number;
  rows: number;
  columns: number;
  seatSize: number;
  seatDepth: number;
  seatRise: number;
  length: number;
  teamColor: string;
  woodTexture: any;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);
  const total = rows * columns;
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    if (!ref.current || total === 0) return;
    const stepX = length / columns;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const z = r * seatDepth + seatDepth * 0.55;
      const y = r * seatRise + seatRise + (level >= 3 ? 0.12 : 0.06);
      for (let c = 0; c < columns; c++) {
        // Vynecháme středový průchod u L3 pro tunel
        if (level >= 3 && r < 3 && Math.abs(c - columns / 2) < 3) {
          matrix.makeScale(0, 0, 0);
          ref.current.setMatrixAt(i, matrix);
          if (backRef.current) backRef.current.setMatrixAt(i, matrix);
        } else {
          const x = -length / 2 + stepX * c + stepX / 2;
          matrix.makeTranslation(x, y, z);
          ref.current.setMatrixAt(i, matrix);

          if (backRef.current && level >= 3) {
            const backMatrix = new THREE.Matrix4().makeTranslation(x, y + 0.22, z + seatSize * 0.25);
            backRef.current.setMatrixAt(i, backMatrix);
          }
        }
        i++;
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (backRef.current) backRef.current.instanceMatrix.needsUpdate = true;
  }, [level, rows, columns, seatDepth, seatRise, length, matrix, total, seatSize]);

  if (total === 0) return null;

  if (level <= 2) {
    // Dřevěné lavičkové latě
    return (
      <instancedMesh ref={ref} args={[undefined, undefined, total]} castShadow>
        <boxGeometry args={[seatSize * 0.9, 0.08, seatSize * 0.55]} />
        <meshStandardMaterial
          map={woodTexture.map}
          bumpMap={woodTexture.bumpMap}
          bumpScale={0.06}
          roughness={0.8}
        />
      </instancedMesh>
    );
  }

  // Moderní plastová sklápěcí sedadla s opěradlem
  return (
    <group>
      {/* Sedák */}
      <instancedMesh ref={ref} args={[undefined, undefined, total]} castShadow>
        <boxGeometry args={[seatSize * 0.78, 0.08, seatSize * 0.55]} />
        <meshStandardMaterial color={teamColor} roughness={0.35} metalness={0.15} />
      </instancedMesh>
      {/* Opěradlo */}
      <instancedMesh ref={backRef} args={[undefined, undefined, total]} castShadow>
        <boxGeometry args={[seatSize * 0.78, 0.35, 0.08]} />
        <meshStandardMaterial color={teamColor} roughness={0.35} metalness={0.15} />
      </instancedMesh>
    </group>
  );
}

/** Diváci na tribuně s generovanými barvami oblečení */
function Spectators({
  rows,
  columns,
  seatSize,
  seatDepth,
  seatRise,
  length,
  density,
}: {
  rows: number;
  columns: number;
  seatSize: number;
  seatDepth: number;
  seatRise: number;
  length: number;
  density: number;
}) {
  const torsoRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(() => ["#DC2626", "#1E40AF", "#047857", "#D97706", "#4B5563", "#7C3AED", "#1F2937", "#B91C1C"], []);
  const skins = useMemo(() => ["#E8B48C", "#D19A6A", "#A9713F", "#F0C9A0"], []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const filled = useMemo(() => {
    const out: Array<{ r: number; c: number; col: string; skin: string }> = [];
    let seed = 12345;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (rand() < density) {
          out.push({
            r,
            c,
            col: colors[Math.floor(rand() * colors.length)],
            skin: skins[(r * 3 + c) % skins.length],
          });
        }
      }
    }
    return out;
  }, [rows, columns, density, colors, skins]);

  const TORSO_H = 0.45;
  const HEAD_H = 0.28;

  useEffect(() => {
    if (!torsoRef.current || !headRef.current || filled.length === 0) return;
    const stepX = length / columns;
    filled.forEach((f, i) => {
      const x = -length / 2 + stepX * f.c + stepX / 2;
      const z = f.r * seatDepth + seatDepth * 0.55;
      const yb = f.r * seatRise + seatRise + 0.45;

      // Torzo
      matrix.makeTranslation(x, yb, z);
      torsoRef.current!.setMatrixAt(i, matrix);
      color.set(f.col);
      torsoRef.current!.setColorAt(i, color);

      // Hlava
      matrix.makeTranslation(x, yb + TORSO_H / 2 + HEAD_H / 2, z);
      headRef.current!.setMatrixAt(i, matrix);
      color.set(f.skin);
      headRef.current!.setColorAt(i, color);
    });
    torsoRef.current.instanceMatrix.needsUpdate = true;
    if (torsoRef.current.instanceColor) torsoRef.current.instanceColor.needsUpdate = true;
    headRef.current.instanceMatrix.needsUpdate = true;
    if (headRef.current.instanceColor) headRef.current.instanceColor.needsUpdate = true;
  }, [filled, length, columns, seatDepth, seatRise, matrix, color]);

  if (filled.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={torsoRef} args={[undefined, undefined, filled.length]} castShadow>
        <boxGeometry args={[seatSize * 0.45, TORSO_H, seatSize * 0.35]} />
        <meshStandardMaterial vertexColors roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, filled.length]} castShadow>
        <boxGeometry args={[seatSize * 0.28, HEAD_H, seatSize * 0.28]} />
        <meshStandardMaterial vertexColors roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

/** Prosklené VIP skyboxy pro L3 tribunu */
function VIPBox({
  length,
  height,
  depth,
  accentColor,
  teamColor,
}: {
  length: number;
  height: number;
  depth: number;
  accentColor: string;
  teamColor: string;
}) {
  const boxW = length * 0.45;
  const boxH = 1.4;
  const boxD = depth * 0.45;
  const boxY = height * 0.72;
  const boxZ = depth * 0.75;

  return (
    <group position={[0, boxY, boxZ]}>
      {/* Rám VIP boxu */}
      <mesh position={[0, boxH / 2, 0]} castShadow>
        <boxGeometry args={[boxW, boxH, boxD]} />
        <meshStandardMaterial color="#111827" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Čelní panoramatické tónované sklo */}
      <mesh position={[0, boxH / 2, -boxD / 2 - 0.01]}>
        <planeGeometry args={[boxW * 0.92, boxH * 0.75]} />
        <meshStandardMaterial
          color="#60A5FA"
          emissive="#93C5FD"
          emissiveIntensity={0.35}
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Zlatý / klubový VIP lem */}
      <mesh position={[0, boxH + 0.05, -boxD / 2]} castShadow>
        <boxGeometry args={[boxW + 0.2, 0.1, 0.1]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.3} metalness={0.6} />
      </mesh>

      {/* Nápis VIP LOUNGE */}
      <mesh position={[0, boxH * 0.88, -boxD / 2 - 0.02]}>
        <planeGeometry args={[boxW * 0.35, 0.2]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Vstupní tunel pro nástup hráčů */
function PlayerTunnel({
  depth,
  height,
  seatDepth,
}: {
  depth: number;
  height: number;
  seatDepth: number;
}) {
  const tunnelW = 3.6;
  const tunnelH = 1.6;
  const tunnelD = seatDepth * 4;

  return (
    <group position={[0, tunnelH / 2, tunnelD / 2 - 0.1]}>
      {/* Stěny tunelu */}
      <mesh position={[-tunnelW / 2, 0, 0]} castShadow>
        <boxGeometry args={[0.2, tunnelH, tunnelD]} />
        <meshStandardMaterial color="#1F2937" metalness={0.7} />
      </mesh>
      <mesh position={[tunnelW / 2, 0, 0]} castShadow>
        <boxGeometry args={[0.2, tunnelH, tunnelD]} />
        <meshStandardMaterial color="#1F2937" metalness={0.7} />
      </mesh>
      {/* Stříška tunelu */}
      <mesh position={[0, tunnelH / 2, 0]} castShadow>
        <boxGeometry args={[tunnelW, 0.15, tunnelD]} />
        <meshStandardMaterial color="#111827" metalness={0.8} />
      </mesh>
      {/* Červený koberec v tunelu */}
      <mesh position={[0, -tunnelH / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[tunnelW * 0.6, tunnelD]} />
        <meshStandardMaterial color="#991B1B" roughness={0.9} />
      </mesh>
    </group>
  );
}
