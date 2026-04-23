"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { drawJerseyWithSponsor, type JerseyPattern } from "@/lib/jersey-pattern-canvas";

// Jersey silhouette — zjednodušený T-shirt outline.
// Centrovaný na [0,0], výška ~200, šířka ~190.
function buildJerseyShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Body z JerseyPreview outline — centrujeme odečtením 100 a obracíme Y (v Three.js +Y je nahoru)
  // Points order: start at left shoulder, around clockwise
  s.moveTo(-30, 70);    // top left shoulder
  s.lineTo(-70, 55);
  s.lineTo(-95, 25);
  s.lineTo(-90, -10);
  s.lineTo(-60, 5);
  s.lineTo(-60, -100);  // left bottom
  s.lineTo(60, -100);   // right bottom
  s.lineTo(60, 5);
  s.lineTo(90, -10);
  s.lineTo(95, 25);
  s.lineTo(70, 55);
  s.lineTo(30, 70);     // top right shoulder
  // Krk - bezier dolů a zpátky
  s.bezierCurveTo(20, 82, 10, 88, 0, 88);
  s.bezierCurveTo(-10, 88, -20, 82, -30, 70);
  return s;
}

const JERSEY_SHAPE = buildJerseyShape();

// Spočítáme BoundingBox pro UV mapping
const SHAPE_BBOX = { minX: -95, maxX: 95, minY: -100, maxY: 88 };

function computePlanarUV(geometry: THREE.BufferGeometry, bbox: typeof SHAPE_BBOX, flipX = false) {
  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    let u = (x - bbox.minX) / w;
    const v = 1 - (y - bbox.minY) / h;
    if (flipX) u = 1 - u;
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

interface JerseyMeshProps {
  primary: string;
  secondary: string;
  pattern: JerseyPattern;
  sponsor: string | null;
  position: [number, number, number];
  rotationY?: number;
}

export function JerseyMesh({ primary, secondary, pattern, sponsor, position, rotationY = 0 }: JerseyMeshProps) {
  const groupRef = useRef<THREE.Group>(null);

  const { texture, frontGeom, backGeom } = useMemo(() => {
    // Canvas textura se vzorem + sponsorem
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 560;
    const ctx = canvas.getContext("2d");
    if (ctx) drawJerseyWithSponsor(ctx, canvas.width, canvas.height, primary, secondary, pattern, sponsor);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    // Front shape — čelní strana
    const frontG = new THREE.ShapeGeometry(JERSEY_SHAPE);
    computePlanarUV(frontG, SHAPE_BBOX, false);

    // Back shape — zadní strana (mirror X aby text nebyl zrcadleně)
    const backG = new THREE.ShapeGeometry(JERSEY_SHAPE);
    computePlanarUV(backG, SHAPE_BBOX, true);

    return { texture: tex, frontGeom: frontG, backGeom: backG };
  }, [primary, secondary, pattern, sponsor]);

  // Lehké houpání + malá rotace okolo Y aby byly vidět obě strany
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.z = Math.sin(t * 0.6 + position[0]) * 0.05;
    groupRef.current.position.y = position[1] + Math.sin(t * 0.5 + position[0] * 0.3) * 0.06;
  });

  const scale = 0.015;
  const depth = 0.25;

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {/* Přední strana */}
      <mesh geometry={frontGeom} position={[0, 0, depth]} castShadow receiveShadow>
        <meshStandardMaterial map={texture} roughness={0.65} metalness={0.08} side={THREE.FrontSide} />
      </mesh>
      {/* Zadní strana — pootočená 180° okolo Y, s mirror UV */}
      <mesh geometry={backGeom} position={[0, 0, -depth]} rotation={[0, Math.PI, 0]} castShadow>
        <meshStandardMaterial map={texture} roughness={0.65} metalness={0.08} side={THREE.FrontSide} />
      </mesh>
      {/* Rim — tenká vrstva solid color na bocích pro pocit hloubky */}
      <mesh geometry={frontGeom} position={[0, 0, 0]} scale={[1.0, 1.0, 1.0]}>
        <meshStandardMaterial color={primary} roughness={0.7} metalness={0.05} side={THREE.DoubleSide} opacity={0} transparent />
      </mesh>
      {/* Věšák — tenký krouzek nahoře */}
      <mesh position={[0, 100, 0]}>
        <torusGeometry args={[10, 1.2, 8, 18, Math.PI]} />
        <meshStandardMaterial color="#a0a0a0" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}
