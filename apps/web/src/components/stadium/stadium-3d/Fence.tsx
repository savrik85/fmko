"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
interface FenceProps {
  level: number;
  bounds: { width: number; depth: number };
}

const GATE_WIDTH = 8;

export function Fence({ level, bounds }: FenceProps) {
  if (level <= 0) return null;
  const halfW = bounds.width / 2;
  const halfD = bounds.depth / 2;

  if (level === 1) return <TapeFence halfW={halfW} halfD={halfD} totalW={bounds.width} totalD={bounds.depth} />;
  if (level === 2) return <WireFence halfW={halfW} halfD={halfD} totalW={bounds.width} totalD={bounds.depth} />;
  return <BrickWall halfW={halfW} halfD={halfD} totalD={bounds.depth} />;
}

// L1 — žluto-černá páska (jednoduchý ohraničený obdélník)
function TapeFence({ halfW, halfD, totalW, totalD }: { halfW: number; halfD: number; totalW: number; totalD: number }) {
  const lines: Array<{ pos: [number, number, number]; rot: [number, number, number]; len: number }> = [];
  lines.push({ pos: [0, 0.5, -halfD], rot: [0, 0, 0], len: totalW });
  lines.push({ pos: [0, 0.5, halfD], rot: [0, 0, 0], len: totalW });
  lines.push({ pos: [-halfW, 0.5, 0], rot: [0, Math.PI / 2, 0], len: totalD });
  lines.push({ pos: [halfW, 0.5, 0], rot: [0, Math.PI / 2, 0], len: totalD });

  return (
    <group>
      {lines.map((l, i) => (
        <mesh key={i} position={l.pos} rotation={l.rot}>
          <boxGeometry args={[l.len, 0.2, 0.05]} />
          <meshStandardMaterial color="#F4C430" />
        </mesh>
      ))}
      {[
        [-halfW, -halfD], [halfW, -halfD],
        [-halfW, halfD],  [halfW, halfD],
        [0, -halfD],       [0, halfD],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], 0.5, p[1]]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 1, 6]} />
          <meshStandardMaterial color="#1A1A1A" />
        </mesh>
      ))}
    </group>
  );
}

// L2 — drátěný plot (sloupky + vodorovné tyče, řídké)
function WireFence({ halfW, halfD, totalW, totalD }: { halfW: number; halfD: number; totalW: number; totalD: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  const posts = useMemo(() => {
    const out: Array<[number, number]> = [];
    const spacing = 4;
    for (let x = -halfW; x <= halfW; x += spacing) {
      if (Math.abs(x) > GATE_WIDTH / 2) out.push([x, -halfD]);
      out.push([x, halfD]);
    }
    for (let z = -halfD + spacing; z <= halfD - spacing; z += spacing) {
      out.push([-halfW, z]);
      out.push([halfW, z]);
    }
    return out;
  }, [halfW, halfD]);

  useEffect(() => {
    if (!ref.current) return;
    posts.forEach((p, i) => {
      matrix.makeTranslation(p[0], 1, p[1]);
      ref.current!.setMatrixAt(i, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [posts, matrix]);

  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, posts.length]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 2, 6]} />
        <meshStandardMaterial color="#525252" />
      </instancedMesh>
      {[0.4, 1.7].map((y) => (
        <group key={y}>
          <mesh position={[0, y, -halfD]} castShadow>
            <boxGeometry args={[totalW, 0.06, 0.06]} />
            <meshStandardMaterial color="#525252" />
          </mesh>
          <mesh position={[0, y, halfD]} castShadow>
            <boxGeometry args={[totalW, 0.06, 0.06]} />
            <meshStandardMaterial color="#525252" />
          </mesh>
          <mesh position={[-halfW, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[totalD, 0.06, 0.06]} />
            <meshStandardMaterial color="#525252" />
          </mesh>
          <mesh position={[halfW, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[totalD, 0.06, 0.06]} />
            <meshStandardMaterial color="#525252" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1, -halfD]}>
        <boxGeometry args={[totalW, 2, 0.02]} />
        <meshStandardMaterial color="#888" wireframe transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 1, halfD]}>
        <boxGeometry args={[totalW, 2, 0.02]} />
        <meshStandardMaterial color="#888" wireframe transparent opacity={0.5} />
      </mesh>
      <mesh position={[-halfW, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[totalD, 2, 0.02]} />
        <meshStandardMaterial color="#888" wireframe transparent opacity={0.5} />
      </mesh>
      <mesh position={[halfW, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[totalD, 2, 0.02]} />
        <meshStandardMaterial color="#888" wireframe transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// L3 — zděná zídka s 2 branami (S + N)
function BrickWall({ halfW, halfD, totalD }: { halfW: number; halfD: number; totalD: number }) {
  const wallHeight = 1.6;
  const wallThickness = 0.4;
  const color = "#A89078";
  const segmentLen = halfW - GATE_WIDTH / 2;

  return (
    <group>
      <mesh position={[-(halfW + GATE_WIDTH / 2) / 2, wallHeight / 2, -halfD]} castShadow receiveShadow>
        <boxGeometry args={[segmentLen, wallHeight, wallThickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[(halfW + GATE_WIDTH / 2) / 2, wallHeight / 2, -halfD]} castShadow receiveShadow>
        <boxGeometry args={[segmentLen, wallHeight, wallThickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[-(halfW + GATE_WIDTH / 2) / 2, wallHeight / 2, halfD]} castShadow receiveShadow>
        <boxGeometry args={[segmentLen, wallHeight, wallThickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[(halfW + GATE_WIDTH / 2) / 2, wallHeight / 2, halfD]} castShadow receiveShadow>
        <boxGeometry args={[segmentLen, wallHeight, wallThickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[-halfW, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, totalD]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[halfW, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, totalD]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {[
        [-GATE_WIDTH / 2, -halfD], [GATE_WIDTH / 2, -halfD],
        [-GATE_WIDTH / 2, halfD],  [GATE_WIDTH / 2, halfD],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], wallHeight * 0.6, p[1]]} castShadow>
          <boxGeometry args={[wallThickness * 1.5, wallHeight * 1.2, wallThickness * 1.5]} />
          <meshStandardMaterial color="#8B7256" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
