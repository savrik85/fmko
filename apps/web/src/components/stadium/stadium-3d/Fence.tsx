"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
interface FenceProps {
  level: number;
  bounds: { width: number; depth: number };
  colorOverride?: string | null;
}

const GATE_WIDTH = 8;

// Diamantová mřížka pletiva jako textura (průhledné pozadí + šedé diagonály).
function makeMeshTexture(repeatX: number, repeatY: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.strokeStyle = "rgba(150,150,150,0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let o = -64; o <= 128; o += 16) {
    ctx.moveTo(o, 0); ctx.lineTo(o + 64, 64);
    ctx.moveTo(o, 64); ctx.lineTo(o + 64, 0);
  }
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function Fence({ level, bounds, colorOverride }: FenceProps) {
  if (level <= 0) return null;
  const halfW = bounds.width / 2;
  const halfD = bounds.depth / 2;

  if (level === 1) return <TapeFence halfW={halfW} halfD={halfD} totalW={bounds.width} totalD={bounds.depth} colorOverride={colorOverride} />;
  if (level === 2) return <WireFence halfW={halfW} halfD={halfD} totalW={bounds.width} totalD={bounds.depth} colorOverride={colorOverride} />;
  return <BrickWall halfW={halfW} halfD={halfD} totalD={bounds.depth} colorOverride={colorOverride} />;
}

// L1 — žluto-černá páska s mezerou pro bránu na jihu
function TapeFence({ halfW, halfD, totalW, totalD, colorOverride }: { halfW: number; halfD: number; totalW: number; totalD: number; colorOverride?: string | null }) {
  const tapeColor = colorOverride ?? "#F4C430";
  const segmentLen = halfW - GATE_WIDTH / 2;
  const lines: Array<{ pos: [number, number, number]; rot: [number, number, number]; len: number }> = [];
  // Jih — 2 segmenty s mezerou pro bránu
  lines.push({ pos: [-(halfW + GATE_WIDTH / 2) / 2, 0.5, -halfD], rot: [0, 0, 0], len: segmentLen });
  lines.push({ pos: [(halfW + GATE_WIDTH / 2) / 2, 0.5, -halfD], rot: [0, 0, 0], len: segmentLen });
  // Sever — celý
  lines.push({ pos: [0, 0.5, halfD], rot: [0, 0, 0], len: totalW });
  // Východ + Západ — celé
  lines.push({ pos: [-halfW, 0.5, 0], rot: [0, Math.PI / 2, 0], len: totalD });
  lines.push({ pos: [halfW, 0.5, 0], rot: [0, Math.PI / 2, 0], len: totalD });

  return (
    <group>
      {lines.map((l, i) => (
        <mesh key={i} position={l.pos} rotation={l.rot}>
          <boxGeometry args={[l.len, 0.2, 0.05]} />
          <meshStandardMaterial color={tapeColor} />
        </mesh>
      ))}
      {[
        [-halfW, -halfD], [halfW, -halfD],
        [-halfW, halfD],  [halfW, halfD],
        [0, halfD],
        // Sloupky lemující bránu na jihu
        [-GATE_WIDTH / 2, -halfD], [GATE_WIDTH / 2, -halfD],
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
function WireFence({ halfW, halfD, totalW, totalD, colorOverride }: { halfW: number; halfD: number; totalW: number; totalD: number; colorOverride?: string | null }) {
  const wireColor = colorOverride ?? "#525252";
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  // Pletivo — diamantová mřížka jako textura, repeat ~1 buňka/jednotku
  const segLen = halfW - GATE_WIDTH / 2;
  const texSeg = useMemo(() => makeMeshTexture(Math.max(1, Math.round(segLen)), 2), [segLen]);
  const texW = useMemo(() => makeMeshTexture(Math.max(1, Math.round(totalW)), 2), [totalW]);
  const texD = useMemo(() => makeMeshTexture(Math.max(1, Math.round(totalD)), 2), [totalD]);
  useEffect(() => () => { texSeg?.dispose(); texW?.dispose(); texD?.dispose(); }, [texSeg, texW, texD]);

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
        <meshStandardMaterial color={wireColor} />
      </instancedMesh>
      {(() => {
        const segmentLen = halfW - GATE_WIDTH / 2;
        const leftCenterX = -(halfW + GATE_WIDTH / 2) / 2;
        const rightCenterX = (halfW + GATE_WIDTH / 2) / 2;
        return (
          <>
            {[0.4, 1.7].map((y) => (
              <group key={y}>
                {/* Jih - 2 segmenty s mezerou pro bránu */}
                <mesh position={[leftCenterX, y, -halfD]} castShadow>
                  <boxGeometry args={[segmentLen, 0.06, 0.06]} />
                  <meshStandardMaterial color={wireColor} />
                </mesh>
                <mesh position={[rightCenterX, y, -halfD]} castShadow>
                  <boxGeometry args={[segmentLen, 0.06, 0.06]} />
                  <meshStandardMaterial color={wireColor} />
                </mesh>
                {/* Sever - celý */}
                <mesh position={[0, y, halfD]} castShadow>
                  <boxGeometry args={[totalW, 0.06, 0.06]} />
                  <meshStandardMaterial color={wireColor} />
                </mesh>
                {/* Východ + Západ - celé */}
                <mesh position={[-halfW, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
                  <boxGeometry args={[totalD, 0.06, 0.06]} />
                  <meshStandardMaterial color={wireColor} />
                </mesh>
                <mesh position={[halfW, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
                  <boxGeometry args={[totalD, 0.06, 0.06]} />
                  <meshStandardMaterial color={wireColor} />
                </mesh>
              </group>
            ))}
            {/* Pletivo — planes s diamantovou texturou (jih 2 segmenty, sever, V, Z) */}
            <mesh position={[leftCenterX, 1, -halfD]}>
              <planeGeometry args={[segmentLen, 2]} />
              <meshBasicMaterial map={texSeg ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.85} />
            </mesh>
            <mesh position={[rightCenterX, 1, -halfD]}>
              <planeGeometry args={[segmentLen, 2]} />
              <meshBasicMaterial map={texSeg ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.85} />
            </mesh>
            <mesh position={[0, 1, halfD]}>
              <planeGeometry args={[totalW, 2]} />
              <meshBasicMaterial map={texW ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.85} />
            </mesh>
            <mesh position={[-halfW, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[totalD, 2]} />
              <meshBasicMaterial map={texD ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.85} />
            </mesh>
            <mesh position={[halfW, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[totalD, 2]} />
              <meshBasicMaterial map={texD ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.85} />
            </mesh>
          </>
        );
      })()}
    </group>
  );
}

// L3 — zděná zídka s 2 branami (S + N)
function BrickWall({ halfW, halfD, totalD, colorOverride }: { halfW: number; halfD: number; totalD: number; colorOverride?: string | null }) {
  const wallHeight = 1.6;
  const wallThickness = 0.4;
  const color = colorOverride ?? "#A89078";
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
