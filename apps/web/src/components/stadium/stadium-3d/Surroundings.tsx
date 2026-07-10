"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { GROUND_SIZE, GROUND_COLOR, TREE_POSITIONS, ROAD } from "./constants";

interface SurroundingsProps {
  reduceTrees?: boolean;
}

export function Surroundings({ reduceTrees = false }: SurroundingsProps) {
  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
      </mesh>

      {/* Příjezdová cesta */}
      <Road />

      {/* Stromy — na mobilu jen polovina pro výkon */}
      <Trees reduce={reduceTrees} />
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

function Trees({ reduce = false }: { reduce?: boolean }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const crownColors = useMemo(() => ["#3D5A28", "#4A7A2C", "#5B8C3A"], []);

  // Pseudo-random varianty velikosti + typ koruny (jehličnatá kužel / listnatá kulatá)
  const trees = useMemo(() => {
    let seed = 7777;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const positions = reduce ? TREE_POSITIONS.filter((_, i) => i % 2 === 0) : TREE_POSITIONS;
    return positions.map(([x, z]) => ({
      x,
      z,
      scale: 0.7 + rand() * 0.6,
      crownColor: crownColors[Math.floor(rand() * crownColors.length)],
      round: rand() > 0.5,
    }));
  }, [reduce, crownColors]);

  useEffect(() => {
    if (!trunkRef.current || !coneRef.current || !roundRef.current) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); // skryté instance druhého typu
    trees.forEach((t, i) => {
      matrix.makeScale(t.scale, t.scale, t.scale);
      matrix.setPosition(t.x, 1.2 * t.scale, t.z);
      trunkRef.current!.setMatrixAt(i, matrix);
      color.set(t.crownColor);
      if (t.round) {
        matrix.makeScale(t.scale, t.scale * 0.9, t.scale);
        matrix.setPosition(t.x, (2.4 + 1.1) * t.scale, t.z);
        roundRef.current!.setMatrixAt(i, matrix);
        roundRef.current!.setColorAt(i, color);
        coneRef.current!.setMatrixAt(i, zero);
      } else {
        matrix.makeScale(t.scale, t.scale, t.scale);
        matrix.setPosition(t.x, (2.4 + 1.5) * t.scale, t.z);
        coneRef.current!.setMatrixAt(i, matrix);
        coneRef.current!.setColorAt(i, color);
        roundRef.current!.setMatrixAt(i, zero);
      }
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    coneRef.current.instanceMatrix.needsUpdate = true;
    roundRef.current.instanceMatrix.needsUpdate = true;
    if (coneRef.current.instanceColor) coneRef.current.instanceColor.needsUpdate = true;
    if (roundRef.current.instanceColor) roundRef.current.instanceColor.needsUpdate = true;
  }, [trees, matrix, color]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2.4, 6]} />
        <meshStandardMaterial color="#5C3A1E" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={coneRef} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[1.6, 3, 8]} />
        <meshStandardMaterial vertexColors roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={roundRef} args={[undefined, undefined, trees.length]} castShadow>
        <icosahedronGeometry args={[1.6, 0]} />
        <meshStandardMaterial vertexColors roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  );
}
