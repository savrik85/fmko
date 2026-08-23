"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { GROUND_SIZE, GROUND_COLOR, TREE_POSITIONS, ROAD, type TimeOfDay } from "./constants";
import { generateAsphaltSurface, generateTerrainSurface } from "./grassTexture";

interface SurroundingsProps {
  reduceTrees?: boolean;
  timeOfDay?: TimeOfDay;
}

export function Surroundings({ reduceTrees = false, timeOfDay = "day" }: SurroundingsProps) {
  const groundSurface = useMemo(
    () => generateTerrainSurface(GROUND_COLOR, 14, 14),
    [],
  );

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          map={groundSurface.map}
          bumpMap={groundSurface.bumpMap}
          bumpScale={0.12}
          roughness={1}
        />
      </mesh>

      {/* Zvlněné kopečky v krajině na horizontu */}
      <LandscapeHills />

      {/* Příjezdová cesta */}
      <Road />

      {/* Stromy a lesíky kolem areálu */}
      <Trees reduce={reduceTrees} />

      {/* Silueta vesničky na horizontu (domky a kostelík) */}
      <DistantVillage timeOfDay={timeOfDay} />
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
  const roadSurface = useMemo(
    () => generateAsphaltSurface(Math.max(1, length / 4), Math.max(1, ROAD.width / 4)),
    [length],
  );

  return (
    <mesh
      position={[(sx + ex) / 2, 0.01, (sz + ez) / 2]}
      rotation={[-Math.PI / 2, 0, -angle]}
      receiveShadow
    >
      <planeGeometry args={[length, ROAD.width]} />
      <meshStandardMaterial
        map={roadSurface.map}
        bumpMap={roadSurface.bumpMap}
        bumpScale={0.045}
        roughness={0.96}
      />
    </mesh>
  );
}

/** Zvlněný terén / nízké kopečky kolem areálu */
function LandscapeHills() {
  const hills = [
    { pos: [-80, -2, -75] as [number, number, number], scale: [35, 12, 35] as [number, number, number] },
    { pos: [75, -2, -80] as [number, number, number], scale: [40, 14, 40] as [number, number, number] },
    { pos: [-85, -2, 70] as [number, number, number], scale: [38, 11, 38] as [number, number, number] },
    { pos: [80, -2, 75] as [number, number, number], scale: [32, 10, 32] as [number, number, number] },
  ];

  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={h.pos} scale={h.scale} receiveShadow>
          <sphereGeometry args={[1, 16, 8]} />
          <meshStandardMaterial color="#3D6A24" roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Vesnička na horizontu (domky se sedlovými střechami a věž kostela) */
function DistantVillage({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const isNight = timeOfDay === "night";

  return (
    <group position={[-70, 0, -65]} rotation={[0, 0.4, 0]}>
      {/* Kostelní věž */}
      <mesh position={[0, 6, 0]} castShadow>
        <boxGeometry args={[4, 12, 4]} />
        <meshStandardMaterial color="#E2DCD5" roughness={0.9} />
      </mesh>
      {/* Jehlanová střecha kostela */}
      <mesh position={[0, 15, 0]} castShadow>
        <coneGeometry args={[3.2, 7, 4]} />
        <meshStandardMaterial color="#883A2D" roughness={0.7} />
      </mesh>

      {/* Vesnické domky */}
      {[
        { x: -10, z: -4, w: 6, h: 4, d: 5, roof: "#A0432C" },
        { x: 8, z: 2, w: 7, h: 4.5, d: 5.5, roof: "#8B4513" },
        { x: 18, z: -2, w: 5.5, h: 3.8, d: 5, roof: "#9A3412" },
      ].map((d, i) => (
        <group key={i} position={[d.x, 0, d.z]}>
          <mesh position={[0, d.h / 2, 0]} castShadow>
            <boxGeometry args={[d.w, d.h, d.d]} />
            <meshStandardMaterial color="#F3EFEA" roughness={0.9} />
          </mesh>
          <mesh position={[0, d.h + 1.2, 0]} rotation={[0, 0, 0]} castShadow>
            <coneGeometry args={[d.w * 0.7, 2.5, 4]} />
            <meshStandardMaterial color={d.roof} roughness={0.7} />
          </mesh>
          {/* Rozsvícená okna v noci */}
          {isNight && (
            <mesh position={[0, d.h * 0.5, d.d / 2 + 0.05]}>
              <planeGeometry args={[1.2, 1]} />
              <meshBasicMaterial color="#FDE047" toneMapped={false} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function Trees({ reduce = false }: { reduce?: boolean }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const crownColors = useMemo(() => ["#2D4A1D", "#3D6A24", "#4A7A2C", "#5B8C3A"], []);

  // Pseudo-random varianty velikosti + typ koruny
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
      scale: 0.8 + rand() * 0.7,
      crownColor: crownColors[Math.floor(rand() * crownColors.length)],
      round: rand() > 0.45,
    }));
  }, [reduce, crownColors]);

  useEffect(() => {
    if (!trunkRef.current || !coneRef.current || !roundRef.current) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    trees.forEach((t, i) => {
      matrix.makeScale(t.scale, t.scale, t.scale);
      matrix.setPosition(t.x, 1.2 * t.scale, t.z);
      trunkRef.current!.setMatrixAt(i, matrix);
      color.set(t.crownColor);
      if (t.round) {
        matrix.makeScale(t.scale, t.scale * 0.95, t.scale);
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
