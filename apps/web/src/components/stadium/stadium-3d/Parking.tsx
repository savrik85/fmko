"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { CAR_COLORS, PARKING_DIMS } from "./constants";

interface ParkingProps {
  level: number;
  position: [number, number];
}

export function Parking({ level, position }: ParkingProps) {
  if (level <= 0) return null;
  const dims = PARKING_DIMS[Math.min(level, 3)];
  const [px, pz] = position;

  // Layout: počet sloupců/řad
  const carWidth = 1.4;
  const carDepth = 2.4;
  const padding = 0.3;
  const cols = Math.floor((dims.width - padding * 2) / (carWidth + padding));
  const rows = Math.floor((dims.depth - padding * 2) / (carDepth + padding));
  const totalSlots = cols * rows;
  // Naplníme do ~80% slotů, na L3 přidáme bus
  const carCount = Math.max(1, Math.floor(totalSlots * 0.7));

  return (
    <group position={[px, 0, pz]}>
      {/* Asfaltová plocha */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[dims.width, dims.depth]} />
        <meshStandardMaterial color="#3F3F46" roughness={0.9} />
      </mesh>

      {/* Bílé čáry parkovacích míst */}
      <ParkingLines cols={cols} rows={rows} carWidth={carWidth} carDepth={carDepth} padding={padding} dims={dims} />

      {/* Auta */}
      <Cars
        count={carCount}
        cols={cols}
        rows={rows}
        carWidth={carWidth}
        carDepth={carDepth}
        padding={padding}
        dims={dims}
      />

      {/* Bus na L3 (na okraji) */}
      {level >= 3 && (
        <Bus position={[-dims.width / 2 + 1.5, 0, dims.depth / 2 - 2.5]} />
      )}
    </group>
  );
}

function ParkingLines({
  cols,
  rows,
  carWidth,
  carDepth,
  padding,
  dims,
}: {
  cols: number;
  rows: number;
  carWidth: number;
  carDepth: number;
  padding: number;
  dims: { width: number; depth: number };
}) {
  const totalW = cols * (carWidth + padding) + padding;
  const totalD = rows * (carDepth + padding) + padding;
  const startX = -totalW / 2;
  const startZ = -totalD / 2;

  const lines: Array<{ x: number; z: number; rotZ?: boolean }> = [];
  // Vertikální čáry mezi sloupci
  for (let c = 0; c <= cols; c++) {
    lines.push({ x: startX + c * (carWidth + padding) + padding / 2, z: 0 });
  }

  return (
    <group>
      {lines.map((l, i) => (
        <mesh key={i} position={[l.x, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.1, totalD]} />
          <meshBasicMaterial color="#fff" transparent opacity={0.4} />
        </mesh>
      ))}
      {/* Horizontální oddělovací čára (mezi řadami pokud je víc než 1) */}
      {rows > 1 && (
        <mesh position={[0, 0.04, startZ + (carDepth + padding) + padding / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[totalW, 0.1]} />
          <meshBasicMaterial color="#fff" transparent opacity={0.4} />
        </mesh>
      )}
    </group>
  );
}

function Cars({
  count,
  cols,
  rows,
  carWidth,
  carDepth,
  padding,
}: {
  count: number;
  cols: number;
  rows: number;
  carWidth: number;
  carDepth: number;
  padding: number;
  dims: { width: number; depth: number };
}) {
  const cars = useMemo(() => {
    const totalW = cols * (carWidth + padding) + padding;
    const totalD = rows * (carDepth + padding) + padding;
    const startX = -totalW / 2;
    const startZ = -totalD / 2;
    const out: Array<{ x: number; z: number; color: string; type: number }> = [];
    let idx = 0;
    for (let r = 0; r < rows && idx < count; r++) {
      for (let c = 0; c < cols && idx < count; c++) {
        const x = startX + padding + c * (carWidth + padding) + carWidth / 2;
        const z = startZ + padding + r * (carDepth + padding) + carDepth / 2;
        out.push({
          x, z,
          color: CAR_COLORS[idx % CAR_COLORS.length],
          type: idx % 3,    // 0=sedan, 1=suv, 2=hatchback
        });
        idx++;
      }
    }
    return out;
  }, [count, cols, rows, carWidth, carDepth, padding]);

  if (count === 0) return null;
  return (
    <group>
      {cars.map((c, i) => (
        <Car key={i} position={[c.x, 0, c.z]} color={c.color} type={c.type} />
      ))}
    </group>
  );
}

/**
 * Realističtější auto — tělo (spodní širší) + kabina (horní užší) + 4 kola + světla.
 * 3 typy: 0=sedan (delší kapota), 1=SUV (vyšší), 2=hatchback (kratší zadek).
 */
function Car({ position, color, type }: { position: [number, number, number]; color: string; type: number }) {
  const w = 1.4, d = 2.4;
  const isSuv = type === 1;
  const bodyH = 0.55;
  const cabinH = isSuv ? 0.85 : 0.6;
  const wheelR = 0.22;
  const wheelW = 0.18;

  // Sedan = kabina vzadu, SUV = uprostřed velký, hatchback = kabina blíže středu
  const cabinZOffset = type === 0 ? -0.15 : type === 2 ? 0.05 : 0;
  const cabinDepth = type === 0 ? d * 0.55 : type === 1 ? d * 0.7 : d * 0.6;

  return (
    <group position={position}>
      {/* Tělo (spodní část) */}
      <mesh position={[0, wheelR + bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bodyH, d]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.45} />
      </mesh>
      {/* Kabina (horní užší část) */}
      <mesh position={[0, wheelR + bodyH + cabinH / 2, cabinZOffset]} castShadow>
        <boxGeometry args={[w * 0.92, cabinH, cabinDepth]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.45} />
      </mesh>
      {/* Okna (čtyři strany kabiny) */}
      <mesh position={[0, wheelR + bodyH + cabinH * 0.55, cabinZOffset + cabinDepth / 2 + 0.001]}>
        <planeGeometry args={[w * 0.7, cabinH * 0.55]} />
        <meshStandardMaterial color="#1a2a3a" roughness={0.1} metalness={0.7} />
      </mesh>
      <mesh position={[0, wheelR + bodyH + cabinH * 0.55, cabinZOffset - cabinDepth / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w * 0.7, cabinH * 0.55]} />
        <meshStandardMaterial color="#1a2a3a" roughness={0.1} metalness={0.7} />
      </mesh>
      <mesh position={[w * 0.46 + 0.001, wheelR + bodyH + cabinH * 0.55, cabinZOffset]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[cabinDepth * 0.85, cabinH * 0.55]} />
        <meshStandardMaterial color="#1a2a3a" roughness={0.1} metalness={0.7} />
      </mesh>
      <mesh position={[-w * 0.46 - 0.001, wheelR + bodyH + cabinH * 0.55, cabinZOffset]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[cabinDepth * 0.85, cabinH * 0.55]} />
        <meshStandardMaterial color="#1a2a3a" roughness={0.1} metalness={0.7} />
      </mesh>
      {/* 4 kola */}
      {[
        [-w / 2, d / 2 - 0.4],
        [w / 2, d / 2 - 0.4],
        [-w / 2, -d / 2 + 0.4],
        [w / 2, -d / 2 + 0.4],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], wheelR, p[1]]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[wheelR, wheelR, wheelW, 12]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.85} />
        </mesh>
      ))}
      {/* Přední světla (bílá) */}
      <mesh position={[-w * 0.3, wheelR + bodyH * 0.6, d / 2 + 0.001]}>
        <planeGeometry args={[w * 0.22, bodyH * 0.35]} />
        <meshStandardMaterial color="#FFF8E0" emissive="#FFF8E0" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[w * 0.3, wheelR + bodyH * 0.6, d / 2 + 0.001]}>
        <planeGeometry args={[w * 0.22, bodyH * 0.35]} />
        <meshStandardMaterial color="#FFF8E0" emissive="#FFF8E0" emissiveIntensity={0.5} />
      </mesh>
      {/* Zadní světla (červená) */}
      <mesh position={[-w * 0.3, wheelR + bodyH * 0.6, -d / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w * 0.22, bodyH * 0.35]} />
        <meshStandardMaterial color="#C13A3A" emissive="#C13A3A" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[w * 0.3, wheelR + bodyH * 0.6, -d / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w * 0.22, bodyH * 0.35]} />
        <meshStandardMaterial color="#C13A3A" emissive="#C13A3A" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Bus({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[2, 1.8, 5]} />
        <meshStandardMaterial color="#2E5518" roughness={0.5} />
      </mesh>
      {/* Okna */}
      {[-1.5, 0, 1.5].map((z, i) => (
        <mesh key={i} position={[1.01, 1.4, z]}>
          <planeGeometry args={[0.6, 0.4]} />
          <meshStandardMaterial color="#9BC4E2" emissive="#9BC4E2" emissiveIntensity={0.1} />
        </mesh>
      ))}
      {[-1.5, 0, 1.5].map((z, i) => (
        <mesh key={i} position={[-1.01, 1.4, z]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.6, 0.4]} />
          <meshStandardMaterial color="#9BC4E2" emissive="#9BC4E2" emissiveIntensity={0.1} />
        </mesh>
      ))}
    </group>
  );
}
