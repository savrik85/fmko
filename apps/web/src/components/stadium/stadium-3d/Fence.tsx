"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { FENCE_BOUNDS } from "./constants";

interface FenceProps {
  level: number;   // 0-3
}

// Plot kolem celého stadionu - obdélníkový perimeter
const HALF_W = FENCE_BOUNDS.width / 2;
const HALF_D = FENCE_BOUNDS.depth / 2;
const GATE_WIDTH = 8;   // mezera pro bránu

export function Fence({ level }: FenceProps) {
  if (level <= 0) return null;

  if (level === 1) {
    return <TapeFence />;
  }
  if (level === 2) {
    return <WireFence />;
  }
  return <BrickWall />;
}

// L1 — žluto-černá páska (jednoduchý ohraničený obdélník)
function TapeFence() {
  const lines: Array<{ pos: [number, number, number]; rot: [number, number, number]; len: number }> = [];

  // 4 strany perimetru
  lines.push({ pos: [0, 0.5, -HALF_D], rot: [0, 0, 0], len: FENCE_BOUNDS.width });
  lines.push({ pos: [0, 0.5, HALF_D], rot: [0, 0, 0], len: FENCE_BOUNDS.width });
  lines.push({ pos: [-HALF_W, 0.5, 0], rot: [0, Math.PI / 2, 0], len: FENCE_BOUNDS.depth });
  lines.push({ pos: [HALF_W, 0.5, 0], rot: [0, Math.PI / 2, 0], len: FENCE_BOUNDS.depth });

  return (
    <group>
      {lines.map((l, i) => (
        <mesh key={i} position={l.pos} rotation={l.rot}>
          <boxGeometry args={[l.len, 0.2, 0.05]} />
          <meshStandardMaterial color="#F4C430" />
        </mesh>
      ))}
      {/* Sloupky */}
      {[
        [-HALF_W, -HALF_D], [HALF_W, -HALF_D],
        [-HALF_W, HALF_D],  [HALF_W, HALF_D],
        [0, -HALF_D],       [0, HALF_D],
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
function WireFence() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  // Sloupky každé 3m podél perimetru
  const posts = useMemo(() => {
    const out: Array<[number, number]> = [];
    const spacing = 4;
    // South + North walls (X axis), s mezerou pro bránu uprostřed na S
    for (let x = -HALF_W; x <= HALF_W; x += spacing) {
      if (Math.abs(x) > GATE_WIDTH / 2) {
        out.push([x, -HALF_D]);
      }
      out.push([x, HALF_D]);
    }
    // East + West walls (Z axis)
    for (let z = -HALF_D + spacing; z <= HALF_D - spacing; z += spacing) {
      out.push([-HALF_W, z]);
      out.push([HALF_W, z]);
    }
    return out;
  }, []);

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
      {/* Vodorovné tyče - jen 2 (horní + dolní) */}
      {[0.4, 1.7].map((y) => (
        <group key={y}>
          <mesh position={[0, y, -HALF_D]} castShadow>
            <boxGeometry args={[FENCE_BOUNDS.width, 0.06, 0.06]} />
            <meshStandardMaterial color="#525252" />
          </mesh>
          <mesh position={[0, y, HALF_D]} castShadow>
            <boxGeometry args={[FENCE_BOUNDS.width, 0.06, 0.06]} />
            <meshStandardMaterial color="#525252" />
          </mesh>
          <mesh position={[-HALF_W, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[FENCE_BOUNDS.depth, 0.06, 0.06]} />
            <meshStandardMaterial color="#525252" />
          </mesh>
          <mesh position={[HALF_W, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[FENCE_BOUNDS.depth, 0.06, 0.06]} />
            <meshStandardMaterial color="#525252" />
          </mesh>
        </group>
      ))}
      {/* Drátěná síť - tenké průhledné panely */}
      <mesh position={[0, 1, -HALF_D]}>
        <boxGeometry args={[FENCE_BOUNDS.width, 2, 0.02]} />
        <meshStandardMaterial color="#888" wireframe transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 1, HALF_D]}>
        <boxGeometry args={[FENCE_BOUNDS.width, 2, 0.02]} />
        <meshStandardMaterial color="#888" wireframe transparent opacity={0.5} />
      </mesh>
      <mesh position={[-HALF_W, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[FENCE_BOUNDS.depth, 2, 0.02]} />
        <meshStandardMaterial color="#888" wireframe transparent opacity={0.5} />
      </mesh>
      <mesh position={[HALF_W, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[FENCE_BOUNDS.depth, 2, 0.02]} />
        <meshStandardMaterial color="#888" wireframe transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// L3 — zděná zídka s 2 branami (S + N)
function BrickWall() {
  const wallHeight = 1.6;
  const wallThickness = 0.4;
  const color = "#A89078";

  return (
    <group>
      {/* Jih - 2 segmenty s mezerou pro bránu */}
      <mesh position={[-(HALF_W + GATE_WIDTH / 2) / 2, wallHeight / 2, -HALF_D]} castShadow receiveShadow>
        <boxGeometry args={[HALF_W - GATE_WIDTH / 2, wallHeight, wallThickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[(HALF_W + GATE_WIDTH / 2) / 2, wallHeight / 2, -HALF_D]} castShadow receiveShadow>
        <boxGeometry args={[HALF_W - GATE_WIDTH / 2, wallHeight, wallThickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* Sever */}
      <mesh position={[-(HALF_W + GATE_WIDTH / 2) / 2, wallHeight / 2, HALF_D]} castShadow receiveShadow>
        <boxGeometry args={[HALF_W - GATE_WIDTH / 2, wallHeight, wallThickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[(HALF_W + GATE_WIDTH / 2) / 2, wallHeight / 2, HALF_D]} castShadow receiveShadow>
        <boxGeometry args={[HALF_W - GATE_WIDTH / 2, wallHeight, wallThickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* Východ + Západ - celé */}
      <mesh position={[-HALF_W, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, FENCE_BOUNDS.depth]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[HALF_W, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, FENCE_BOUNDS.depth]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* Sloupky bran (4x na rozích bran) */}
      {[
        [-GATE_WIDTH / 2, -HALF_D], [GATE_WIDTH / 2, -HALF_D],
        [-GATE_WIDTH / 2, HALF_D],  [GATE_WIDTH / 2, HALF_D],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], wallHeight * 0.6, p[1]]} castShadow>
          <boxGeometry args={[wallThickness * 1.5, wallHeight * 1.2, wallThickness * 1.5]} />
          <meshStandardMaterial color="#8B7256" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
