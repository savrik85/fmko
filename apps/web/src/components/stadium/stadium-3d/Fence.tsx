"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { generateWoodTexture, generateBrickTexture, generateCorrugatedTexture } from "./materialTextures";

interface FenceProps {
  level: number;
  bounds: { width: number; depth: number };
  colorOverride?: string | null;
}

const GATE_WIDTH = 8;

function makeMeshTexture(repeatX: number, repeatY: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.strokeStyle = "rgba(180, 180, 180, 0.75)";
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
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export function Fence({ level, bounds, colorOverride }: FenceProps) {
  if (level <= 0) return null;
  const halfW = bounds.width / 2;
  const halfD = bounds.depth / 2;

  if (level === 1) return <WoodPostRailFence halfW={halfW} halfD={halfD} totalW={bounds.width} totalD={bounds.depth} colorOverride={colorOverride} />;
  if (level === 2) return <WireMeshFence halfW={halfW} halfD={halfD} totalW={bounds.width} totalD={bounds.depth} colorOverride={colorOverride} />;
  return <BrickBoundaryWall halfW={halfW} halfD={halfD} totalD={bounds.depth} totalW={bounds.width} colorOverride={colorOverride} />;
}

/** L1 Dřevěný plaňkový / ráhnový plot s texturou */
function WoodPostRailFence({
  halfW,
  halfD,
  totalW,
  totalD,
  colorOverride,
}: {
  halfW: number;
  halfD: number;
  totalW: number;
  totalD: number;
  colorOverride?: string | null;
}) {
  const woodTex = useMemo(() => generateWoodTexture(colorOverride ?? "#8B5A2B", 3, 1), [colorOverride]);
  const segmentLen = halfW - GATE_WIDTH / 2;

  const sides = [
    { x: -(halfW + GATE_WIDTH / 2) / 2, z: -halfD, rot: [0, 0, 0] as [number, number, number], len: segmentLen },
    { x: (halfW + GATE_WIDTH / 2) / 2, z: -halfD, rot: [0, 0, 0] as [number, number, number], len: segmentLen },
    { x: 0, z: halfD, rot: [0, 0, 0] as [number, number, number], len: totalW },
    { x: -halfW, z: 0, rot: [0, Math.PI / 2, 0] as [number, number, number], len: totalD },
    { x: halfW, z: 0, rot: [0, Math.PI / 2, 0] as [number, number, number], len: totalD },
  ];
  const railsY = [0.45, 0.95];

  const posts: Array<[number, number]> = [];
  const spacing = 4.5;
  for (let x = -halfW; x <= halfW; x += spacing) {
    if (Math.abs(x) > GATE_WIDTH / 2) posts.push([x, -halfD]);
    posts.push([x, halfD]);
  }
  for (let z = -halfD + spacing; z <= halfD - spacing; z += spacing) {
    posts.push([-halfW, z]);
    posts.push([halfW, z]);
  }

  return (
    <group>
      {/* Vodorovná dřevěná ráhna */}
      {sides.flatMap((s, i) => railsY.map((y, j) => (
        <mesh key={`${i}-${j}`} position={[s.x, y, s.z]} rotation={s.rot} castShadow>
          <boxGeometry args={[s.len, 0.12, 0.06]} />
          <meshStandardMaterial
            map={woodTex.map}
            bumpMap={woodTex.bumpMap}
            bumpScale={0.08}
            roughness={0.9}
          />
        </mesh>
      )))}

      {/* Dřevěné sloupky */}
      {posts.map((p, i) => (
        <mesh key={i} position={[p[0], 0.6, p[1]]} castShadow>
          <boxGeometry args={[0.16, 1.2, 0.16]} />
          <meshStandardMaterial
            map={woodTex.map}
            bumpMap={woodTex.bumpMap}
            bumpScale={0.08}
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

/** L2 Pozinkované drátěné pletivo s trubkovým rámem */
function WireMeshFence({
  halfW,
  halfD,
  totalW,
  totalD,
  colorOverride,
}: {
  halfW: number;
  halfD: number;
  totalW: number;
  totalD: number;
  colorOverride?: string | null;
}) {
  const wireColor = colorOverride ?? "#4B5563";
  const segmentLen = halfW - GATE_WIDTH / 2;
  const texSeg = useMemo(() => makeMeshTexture(Math.max(1, Math.round(segmentLen)), 2), [segmentLen]);
  const texW = useMemo(() => makeMeshTexture(Math.max(1, Math.round(totalW)), 2), [totalW]);
  const texD = useMemo(() => makeMeshTexture(Math.max(1, Math.round(totalD)), 2), [totalD]);
  useEffect(() => () => {
    texSeg?.dispose();
    texW?.dispose();
    texD?.dispose();
  }, [texSeg, texW, texD]);

  const postPositions = useMemo(() => {
    const positions: Array<[number, number]> = [];
    const spacing = 4;
    for (let x = -halfW; x <= halfW; x += spacing) {
      if (Math.abs(x) > GATE_WIDTH / 2 + 0.25) positions.push([x, -halfD]);
      positions.push([x, halfD]);
    }
    for (let z = -halfD + spacing; z <= halfD - spacing; z += spacing) {
      positions.push([-halfW, z], [halfW, z]);
    }
    return positions;
  }, [halfW, halfD]);

  const leftCenterX = -(halfW + GATE_WIDTH / 2) / 2;
  const rightCenterX = (halfW + GATE_WIDTH / 2) / 2;

  return (
    <group>
      {/* Pletivo — průhledné plochy */}
      <mesh position={[leftCenterX, 1, -halfD]}>
        <planeGeometry args={[segmentLen, 2]} />
        <meshBasicMaterial map={texSeg ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
      </mesh>
      <mesh position={[rightCenterX, 1, -halfD]}>
        <planeGeometry args={[segmentLen, 2]} />
        <meshBasicMaterial map={texSeg ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
      </mesh>
      <mesh position={[0, 1, halfD]}>
        <planeGeometry args={[totalW, 2]} />
        <meshBasicMaterial map={texW ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
      </mesh>
      <mesh position={[-halfW, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[totalD, 2]} />
        <meshBasicMaterial map={texD ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
      </mesh>
      <mesh position={[halfW, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[totalD, 2]} />
        <meshBasicMaterial map={texD ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
      </mesh>

      {/* Horní a spodní vodící ocelová trubka */}
      {[0.1, 2.0].map((y) => (
        <group key={y}>
          <mesh position={[leftCenterX, y, -halfD]} castShadow>
            <boxGeometry args={[segmentLen, 0.05, 0.05]} />
            <meshStandardMaterial color={wireColor} metalness={0.7} />
          </mesh>
          <mesh position={[rightCenterX, y, -halfD]} castShadow>
            <boxGeometry args={[segmentLen, 0.05, 0.05]} />
            <meshStandardMaterial color={wireColor} metalness={0.7} />
          </mesh>
          <mesh position={[0, y, halfD]} castShadow>
            <boxGeometry args={[totalW, 0.05, 0.05]} />
            <meshStandardMaterial color={wireColor} metalness={0.7} />
          </mesh>
          <mesh position={[-halfW, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[totalD, 0.05, 0.05]} />
            <meshStandardMaterial color={wireColor} metalness={0.7} />
          </mesh>
          <mesh position={[halfW, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[totalD, 0.05, 0.05]} />
            <meshStandardMaterial color={wireColor} metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Pravidelné nosné sloupky, aby dlouhé panely pletiva nevisely ve vzduchu. */}
      <WireFencePosts positions={postPositions} color={wireColor} />
    </group>
  );
}

function WireFencePosts({ positions, color }: { positions: Array<[number, number]>; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    if (!ref.current) return;
    positions.forEach(([x, z], index) => {
      matrix.makeTranslation(x, 1.05, z);
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [matrix, positions]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]} castShadow>
      <cylinderGeometry args={[0.075, 0.075, 2.1, 8]} />
      <meshStandardMaterial color={color} metalness={0.75} roughness={0.35} />
    </instancedMesh>
  );
}

/** L3 Zděná cihlová / kamenná ohradní zeď s turnikety */
function BrickBoundaryWall({
  halfW,
  halfD,
  totalD,
  totalW,
  colorOverride,
}: {
  halfW: number;
  halfD: number;
  totalD: number;
  totalW: number;
  colorOverride?: string | null;
}) {
  const wallH = 1.8;
  const wallT = 0.35;
  const brickTex = useMemo(() => generateBrickTexture(colorOverride ?? "#993D2E", "#D1CCC2", 4, 2), [colorOverride]);
  const segmentLen = halfW - GATE_WIDTH / 2;

  return (
    <group>
      {/* Jih - 2 segmenty se vstupní bránou */}
      <mesh position={[-(halfW + GATE_WIDTH / 2) / 2, wallH / 2, -halfD]} castShadow receiveShadow>
        <boxGeometry args={[segmentLen, wallH, wallT]} />
        <meshStandardMaterial map={brickTex.map} bumpMap={brickTex.bumpMap} bumpScale={0.1} roughness={0.9} />
      </mesh>
      <mesh position={[(halfW + GATE_WIDTH / 2) / 2, wallH / 2, -halfD]} castShadow receiveShadow>
        <boxGeometry args={[segmentLen, wallH, wallT]} />
        <meshStandardMaterial map={brickTex.map} bumpMap={brickTex.bumpMap} bumpScale={0.1} roughness={0.9} />
      </mesh>

      {/* Sever - celá zeď */}
      <mesh position={[0, wallH / 2, halfD]} castShadow receiveShadow>
        <boxGeometry args={[totalW, wallH, wallT]} />
        <meshStandardMaterial map={brickTex.map} bumpMap={brickTex.bumpMap} bumpScale={0.1} roughness={0.9} />
      </mesh>

      {/* Východ + Západ */}
      <mesh position={[-halfW, wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallT, wallH, totalD]} />
        <meshStandardMaterial map={brickTex.map} bumpMap={brickTex.bumpMap} bumpScale={0.1} roughness={0.9} />
      </mesh>
      <mesh position={[halfW, wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallT, wallH, totalD]} />
        <meshStandardMaterial map={brickTex.map} bumpMap={brickTex.bumpMap} bumpScale={0.1} roughness={0.9} />
      </mesh>

      {/* Sloupky brány s ozdobnými hlavicemi */}
      {[-GATE_WIDTH / 2, GATE_WIDTH / 2].map((x, i) => (
        <group key={i} position={[x, 0, -halfD]}>
          <mesh position={[0, (wallH + 0.4) / 2, 0]} castShadow>
            <boxGeometry args={[0.55, wallH + 0.4, 0.55]} />
            <meshStandardMaterial color="#475569" roughness={0.8} />
          </mesh>
          <mesh position={[0, wallH + 0.45, 0]} castShadow>
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshStandardMaterial color="#F59E0B" metalness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
