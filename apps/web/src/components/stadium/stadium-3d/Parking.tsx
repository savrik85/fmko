"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { CAR_COLORS, PARKING_DIMS, PARKING_POSITION } from "./constants";

interface ParkingProps {
  level: number;
}

export function Parking({ level }: ParkingProps) {
  if (level <= 0) return null;
  const dims = PARKING_DIMS[Math.min(level, 3)];
  const [px, pz] = PARKING_POSITION;

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
  dims,
}: {
  count: number;
  cols: number;
  rows: number;
  carWidth: number;
  carDepth: number;
  padding: number;
  dims: { width: number; depth: number };
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const totalW = cols * (carWidth + padding) + padding;
  const totalD = rows * (carDepth + padding) + padding;
  const startX = -totalW / 2;
  const startZ = -totalD / 2;

  useEffect(() => {
    if (!bodyRef.current) return;
    let idx = 0;
    for (let r = 0; r < rows && idx < count; r++) {
      for (let c = 0; c < cols && idx < count; c++) {
        const x = startX + padding + c * (carWidth + padding) + carWidth / 2;
        const z = startZ + padding + r * (carDepth + padding) + carDepth / 2;
        matrix.makeTranslation(x, 0.5, z);
        bodyRef.current.setMatrixAt(idx, matrix);
        color.set(CAR_COLORS[idx % CAR_COLORS.length]);
        bodyRef.current.setColorAt(idx, color);
        idx++;
      }
    }
    bodyRef.current.instanceMatrix.needsUpdate = true;
    if (bodyRef.current.instanceColor) bodyRef.current.instanceColor.needsUpdate = true;
  }, [count, cols, rows, carWidth, carDepth, padding, startX, startZ, matrix, color]);

  if (count === 0) return null;
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} castShadow>
        <boxGeometry args={[carWidth * 0.85, 0.8, carDepth * 0.85]} />
        <meshStandardMaterial vertexColors roughness={0.4} metalness={0.3} />
      </instancedMesh>
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
