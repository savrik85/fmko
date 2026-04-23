"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { drawJerseyWithSponsor, type JerseyPattern } from "@/lib/jersey-pattern-canvas";

// Jersey silhouette: zjednodušený polygon T-shirtu (matche JerseyPreview).
// Souřadnice v "viewBox" prostoru — Three.js Shape je v 2D, transformuje se uniform scale.
function buildJerseyShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Path z JerseyPreview outline (zrcadlený Y kvůli Three.js orientaci)
  // Body 0..200 v X, 0..220 v Y. V Three.js přepočítáme na centrované souřadnice.
  const pts: Array<[number, number]> = [
    [70, 30], [30, 45], [5, 75], [10, 110], [40, 95], [40, 200],
    [160, 200], [160, 95], [190, 110], [195, 75], [170, 45], [130, 30],
  ];

  s.moveTo(pts[0][0] - 100, -(pts[0][1] - 100));
  for (let i = 1; i < pts.length; i++) {
    s.lineTo(pts[i][0] - 100, -(pts[i][1] - 100));
  }
  // Vrchní oblouk (krk + ramena)
  s.bezierCurveTo(120 - 100, -(18 - 100), 110 - 100, -(12 - 100), 100 - 100, -(12 - 100));
  s.bezierCurveTo(90 - 100, -(12 - 100), 80 - 100, -(18 - 100), 70 - 100, -(30 - 100));
  return s;
}

const JERSEY_SHAPE = buildJerseyShape();

interface JerseyMeshProps {
  primary: string;
  secondary: string;
  pattern: JerseyPattern;
  sponsor: string | null;
  position: [number, number, number];
  rotationY?: number;
  hovered?: boolean;
}

export function JerseyMesh({ primary, secondary, pattern, sponsor, position, rotationY = 0 }: JerseyMeshProps) {
  const groupRef = useRef<THREE.Group>(null);

  const { texture, geometry } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 560;
    const ctx = canvas.getContext("2d");
    if (ctx) drawJerseyWithSponsor(ctx, canvas.width, canvas.height, primary, secondary, pattern, sponsor);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    // Extrude pro mírnou 3D hloubku
    const geom = new THREE.ExtrudeGeometry(JERSEY_SHAPE, {
      depth: 6,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 1.2,
      bevelThickness: 1.2,
      curveSegments: 8,
    });
    geom.center();
    // UV — extrude defaulty UV mapy nepokrývají celý shape čistě, přepočítáme planar UV
    const positions = geom.attributes.position;
    const uvs = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      uvs[i * 2] = (x + 100) / 200;
      uvs[i * 2 + 1] = 1 - (y + 100) / 200;
    }
    geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    return { texture: tex, geometry: geom };
  }, [primary, secondary, pattern, sponsor]);

  // Lehké houpání jako zavěšený dres
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.z = Math.sin(t * 0.6 + position[0]) * 0.04;
    groupRef.current.position.y = position[1] + Math.sin(t * 0.5 + position[0] * 0.3) * 0.08;
  });

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]} scale={[0.018, 0.018, 0.018]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial map={texture} roughness={0.7} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* Věšák — hanger naznačen jako tenká čára nahoře */}
      <mesh position={[0, 105, 0]}>
        <torusGeometry args={[8, 0.8, 6, 16, Math.PI]} />
        <meshStandardMaterial color="#888" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}
