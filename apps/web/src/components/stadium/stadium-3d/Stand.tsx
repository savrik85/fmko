"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { PITCH, STAND_DIMS } from "./constants";

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

const STAND_GAP = 1;

export function Stand({ side, level, teamColor, standColor, seatColor, accentColor, reducedDetail = false }: StandProps) {
  if (level <= 0) return null;
  const dims = STAND_DIMS[Math.min(level, 3)];
  const baseColor = standColor ?? dims.color;          // null → původní per-level barva (dřevo/beton)
  const finalSeatColor = seatColor ?? teamColor;
  const finalAccent = accentColor ?? "#C9A84C";
  const finalPanelColor = standColor ?? teamColor;

  const isEW = side === "east" || side === "west";
  const length = isEW ? PITCH.depth : PITCH.width;
  const spectatorDensity = reducedDetail ? 0.2 : 0.4;
  const seatColMult = reducedDetail ? 0.7 : 1.2;

  const distance = (isEW ? PITCH.width : PITCH.depth) / 2 + STAND_GAP + dims.depth / 2;
  let position: [number, number, number];
  let rotationY: number;
  // Lokální +Z je "back of stand" — sedačky stoupají od pitche pryč
  // Rotace musí orientovat lokální +Z směrem od hřiště
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

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Schodovitá podstava */}
      <StepBase
        length={length}
        rows={seatRows}
        seatDepth={seatDepth}
        seatRise={seatRise}
        color={baseColor}
      />

      <Seats
        rows={seatRows}
        columns={seatColumns}
        seatSize={seatSize}
        seatDepth={seatDepth}
        seatRise={seatRise}
        length={length}
        teamColor={finalSeatColor}
      />

      <Spectators
        rows={seatRows}
        columns={seatColumns}
        seatSize={seatSize}
        seatDepth={seatDepth}
        seatRise={seatRise}
        length={length}
        density={spectatorDensity}
      />

      {/* Střecha (jen L3) */}
      {level >= 3 && (
        <mesh position={[0, dims.height + 0.6, dims.depth / 2 + 0.5]} castShadow>
          <boxGeometry args={[length + 1, 0.3, dims.depth + 1]} />
          <meshStandardMaterial color="#374151" roughness={0.7} />
        </mesh>
      )}

      {/* VIP zlatá pruhový segment (jen L3, uprostřed) */}
      {level >= 3 && (
        <mesh position={[0, dims.height * 0.55, dims.depth * 0.6]} castShadow>
          <boxGeometry args={[length * 0.3, 0.4, dims.depth * 0.7]} />
          <meshStandardMaterial color={finalAccent} emissive={finalAccent} emissiveIntensity={0.2} />
        </mesh>
      )}

      {/* Týmový panel vepředu (L2+) */}
      {level >= 2 && (
        <mesh position={[0, 0.4, -0.05]} castShadow>
          <boxGeometry args={[length, 0.8, 0.15]} />
          <meshStandardMaterial color={finalPanelColor} />
        </mesh>
      )}
    </group>
  );
}

function StepBase({
  length,
  rows,
  seatDepth,
  seatRise,
  color,
}: {
  length: number;
  rows: number;
  seatDepth: number;
  seatRise: number;
  color: string;
}) {
  if (rows === 0) return null;
  return (
    <group>
      {Array.from({ length: rows }).map((_, r) => {
        const y = (r + 0.5) * seatRise;
        const z = (r + 0.5) * seatDepth;
        return (
          <mesh key={r} position={[0, y, z]} castShadow receiveShadow>
            <boxGeometry args={[length, seatRise, seatDepth]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}

function Seats({
  rows,
  columns,
  seatSize,
  seatDepth,
  seatRise,
  length,
  teamColor,
}: {
  rows: number;
  columns: number;
  seatSize: number;
  seatDepth: number;
  seatRise: number;
  length: number;
  teamColor: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const total = rows * columns;
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    if (!ref.current || total === 0) return;
    const stepX = length / columns;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const z = r * seatDepth + seatDepth * 0.5;
      const y = r * seatRise + seatRise + 0.08;
      for (let c = 0; c < columns; c++) {
        const x = -length / 2 + stepX * c + stepX / 2;
        matrix.makeTranslation(x, y, z);
        ref.current.setMatrixAt(i, matrix);
        i++;
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [rows, columns, seatDepth, seatRise, length, matrix, total]);

  if (total === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, total]} castShadow>
      <boxGeometry args={[seatSize * 0.85, 0.15, seatSize * 0.6]} />
      <meshStandardMaterial color={teamColor} roughness={0.6} />
    </instancedMesh>
  );
}

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
  const ref = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(() => ["#E63946", "#1D3557", "#2A9D8F", "#F4A261", "#264653", "#E76F51", "#6A4C93"], []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const filled = useMemo(() => {
    const out: Array<{ r: number; c: number; col: string }> = [];
    let seed = 12345;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (rand() < density) {
          out.push({ r, c, col: colors[Math.floor(rand() * colors.length)] });
        }
      }
    }
    return out;
  }, [rows, columns, density, colors]);

  useEffect(() => {
    if (!ref.current || filled.length === 0) return;
    const stepX = length / columns;
    filled.forEach((f, i) => {
      const x = -length / 2 + stepX * f.c + stepX / 2;
      const z = f.r * seatDepth + seatDepth * 0.5;
      const y = f.r * seatRise + seatRise + 0.45;
      matrix.makeTranslation(x, y, z);
      ref.current!.setMatrixAt(i, matrix);
      color.set(f.col);
      ref.current!.setColorAt(i, color);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [filled, length, columns, seatDepth, seatRise, matrix, color]);

  if (filled.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, filled.length]} castShadow>
      <boxGeometry args={[seatSize * 0.5, 0.5, seatSize * 0.4]} />
      <meshStandardMaterial vertexColors />
    </instancedMesh>
  );
}
