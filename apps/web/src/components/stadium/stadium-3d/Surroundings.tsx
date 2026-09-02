"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { GROUND_SIZE, GROUND_COLOR, TREE_POSITIONS, ROAD, type TimeOfDay, type WeatherType } from "./constants";
import { generateAsphaltSurface, generateTerrainSurface, generateSnowTerrainSurface } from "./grassTexture";

interface SurroundingsProps {
  reduceTrees?: boolean;
  timeOfDay?: TimeOfDay;
  weather?: WeatherType;
}

export function Surroundings({ reduceTrees = false, timeOfDay = "day", weather = "sunny" }: SurroundingsProps) {
  const isSnow = weather === "snow";
  const groundSurface = useMemo(
    // Opakování textury roste s velikostí terénu (360 m), aby texel zůstal stejně velký jako dřív.
    () => isSnow ? generateSnowTerrainSurface(25, 25) : generateTerrainSurface(GROUND_COLOR, 25, 25),
    [isSnow],
  );

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          map={groundSurface.map}
          bumpMap={groundSurface.bumpMap}
          bumpScale={isSnow ? 0.08 : 0.12}
          roughness={1}
        />
      </mesh>

      {/* Zvlněné kopečky v krajině na horizontu */}
      <LandscapeHills isSnow={isSnow} />

      {/* Příjezdová cesta */}
      <Road />

      {/* Stromy a lesíky kolem areálu */}
      <Trees reduce={reduceTrees} isSnow={isSnow} />

      {/* Silueta vesničky na horizontu (domky a kostelík) */}
      <DistantVillage timeOfDay={timeOfDay} isSnow={isSnow} />
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
function LandscapeHills({ isSnow = false }: { isSnow?: boolean }) {
  // Dřív čtyři obří koule hned za plotem, které z nadhledu vypadaly jako zelené kupole.
  // Teď nižší a širší vlny dál v krajině (vnitřní okraj ≥ ~95 m, aby nepohltily
  // stromy ani vesničku), hladce stínované — vzdálené kopce nemají hrany.
  const hills: Array<{ pos: [number, number, number]; scale: [number, number, number]; tint: string }> = [
    { pos: [-130, -2.5, -110], scale: [65, 9, 45], tint: "#3F6E26" },
    { pos: [110, -2.5, -130], scale: [80, 11, 55], tint: "#457A2B" },
    { pos: [-140, -2.5, 60], scale: [65, 8, 50], tint: "#4A7A2C" },
    { pos: [125, -2.5, 110], scale: [75, 10, 50], tint: "#3F6E26" },
    { pos: [-20, -2.5, -155], scale: [85, 9, 45], tint: "#457A2B" },
    { pos: [30, -2.5, 155], scale: [80, 8, 45], tint: "#4A7A2C" },
    { pos: [-155, -2.5, -20], scale: [55, 7, 60], tint: "#568A34" },
    { pos: [160, -2.5, -10], scale: [55, 7.5, 60], tint: "#457A2B" },
  ];

  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={h.pos} scale={h.scale} receiveShadow>
          <sphereGeometry args={[1, 28, 14]} />
          <meshStandardMaterial color={isSnow ? "#E2E8F0" : h.tint} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Vesnička na horizontu (domky se sedlovými střechami a věž kostela) */
function DistantVillage({ timeOfDay, isSnow = false }: { timeOfDay: TimeOfDay; isSnow?: boolean }) {
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
        <meshStandardMaterial color={isSnow ? "#F8FAFC" : "#883A2D"} roughness={0.7} />
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
            <meshStandardMaterial color={isSnow ? "#F8FAFC" : d.roof} roughness={0.7} />
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

function Trees({ reduce = false, isSnow = false }: { reduce?: boolean; isSnow?: boolean }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);
  const broadRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);
  // Světlejší zeleně: tmavé odstíny s flat shadingem četly jako černé siluety.
  // (Stromy byly ve skutečnosti černé kvůli `vertexColors` bez atributu barvy — viz materiály níže.)
  const crownColors = useMemo(
    () => isSnow
      ? ["#2F5A28", "#3D6E30", "#E2E8F0", "#F8FAFC"]
      : ["#3F7D2E", "#4E8F38", "#5FA043", "#6FAE4C"],
    [isSnow]
  );

  // Pseudo-random varianty velikosti + typ koruny
  const trees = useMemo(() => {
    let seed = 7777;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const positions = reduce ? TREE_POSITIONS.filter((_, i) => i % 2 === 0) : TREE_POSITIONS;
    return positions.map(([x, z]) => {
      const kindRoll = rand();
      return {
        x,
        z,
        scale: 0.8 + rand() * 0.7,
        crownColor: crownColors[Math.floor(rand() * crownColors.length)],
        // Tři tvary koruny: smrk (kužel), kulatý listnáč a široký rozložitý listnáč
        kind: (kindRoll < 0.36 ? "cone" : kindRoll < 0.7 ? "round" : "broad") as "cone" | "round" | "broad",
        yaw: rand() * Math.PI * 2,
      };
    });
  }, [reduce, crownColors]);

  useEffect(() => {
    if (!trunkRef.current || !coneRef.current || !roundRef.current || !broadRef.current) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const rot = new THREE.Matrix4();
    trees.forEach((t, i) => {
      matrix.makeScale(t.scale, t.scale, t.scale);
      matrix.setPosition(t.x, 1.2 * t.scale, t.z);
      trunkRef.current!.setMatrixAt(i, matrix);
      color.set(t.crownColor);
      coneRef.current!.setMatrixAt(i, zero);
      roundRef.current!.setMatrixAt(i, zero);
      broadRef.current!.setMatrixAt(i, zero);
      rot.makeRotationY(t.yaw);
      if (t.kind === "round") {
        matrix.makeScale(t.scale, t.scale * 0.95, t.scale).multiply(rot);
        matrix.setPosition(t.x, (2.4 + 1.1) * t.scale, t.z);
        roundRef.current!.setMatrixAt(i, matrix);
        roundRef.current!.setColorAt(i, color);
      } else if (t.kind === "broad") {
        matrix.makeScale(t.scale * 1.25, t.scale * 0.85, t.scale * 1.25).multiply(rot);
        matrix.setPosition(t.x, (2.4 + 1.3) * t.scale, t.z);
        broadRef.current!.setMatrixAt(i, matrix);
        broadRef.current!.setColorAt(i, color);
      } else {
        matrix.makeScale(t.scale, t.scale, t.scale).multiply(rot);
        matrix.setPosition(t.x, (2.4 + 1.5) * t.scale, t.z);
        coneRef.current!.setMatrixAt(i, matrix);
        coneRef.current!.setColorAt(i, color);
      }
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    [coneRef, roundRef, broadRef].forEach((r) => {
      if (!r.current) return;
      r.current.instanceMatrix.needsUpdate = true;
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
      // Shader se musí překompilovat s podporou instančních barev — bez toho
      // (a s dřívějším `vertexColors` bez atributu barvy) byly koruny černé.
      (r.current.material as THREE.Material).needsUpdate = true;
    });
  }, [trees, matrix, color]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2.4, 6]} />
        <meshStandardMaterial color="#6B4423" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={coneRef} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[1.6, 3, 8]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={roundRef} args={[undefined, undefined, trees.length]} castShadow>
        <icosahedronGeometry args={[1.6, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={broadRef} args={[undefined, undefined, trees.length]} castShadow>
        <icosahedronGeometry args={[1.7, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  );
}
