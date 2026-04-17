"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { GROUND_SIZE, GROUND_COLOR, TREE_POSITIONS, ROAD } from "./constants";

export function Surroundings() {
  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
      </mesh>

      {/* Příjezdová cesta */}
      <Road />

      {/* Stromy */}
      <Trees />
    </group>
  );
}

function Road() {
  const [sx, sz] = ROAD.start;
  const [ex, ez] = ROAD.end;
  const dx = ex - sx;
  const dz = ez - sz;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  return (
    <mesh
      position={[(sx + ex) / 2, 0.01, (sz + ez) / 2]}
      rotation={[-Math.PI / 2, 0, -angle]}
      receiveShadow
    >
      <planeGeometry args={[length, ROAD.width]} />
      <meshStandardMaterial color="#3F3F46" roughness={0.95} />
    </mesh>
  );
}

function Trees() {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // Pseudo-random varianty velikosti
  const trees = useMemo(() => {
    let seed = 7777;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return TREE_POSITIONS.map(([x, z]) => ({
      x,
      z,
      scale: 0.7 + rand() * 0.6,
      crownColor: rand() > 0.6 ? "#3D5A28" : "#4A7A2C",
    }));
  }, []);

  useEffect(() => {
    if (!trunkRef.current || !crownRef.current) return;
    trees.forEach((t, i) => {
      // Trunk - cylinder, base at 0
      matrix.makeScale(t.scale, t.scale, t.scale);
      matrix.setPosition(t.x, 1.2 * t.scale, t.z);
      trunkRef.current!.setMatrixAt(i, matrix);

      // Crown - cone above trunk
      matrix.makeScale(t.scale, t.scale, t.scale);
      matrix.setPosition(t.x, (2.4 + 1.5) * t.scale, t.z);
      crownRef.current!.setMatrixAt(i, matrix);
      color.set(t.crownColor);
      crownRef.current!.setColorAt(i, color);
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    crownRef.current.instanceMatrix.needsUpdate = true;
    if (crownRef.current.instanceColor) crownRef.current.instanceColor.needsUpdate = true;
  }, [trees, matrix, color]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2.4, 6]} />
        <meshStandardMaterial color="#5C3A1E" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[1.6, 3, 8]} />
        <meshStandardMaterial vertexColors roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
