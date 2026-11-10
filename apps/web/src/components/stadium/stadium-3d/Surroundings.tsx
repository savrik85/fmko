"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useWind } from "./wind";
import { GROUND_SIZE, GROUND_COLOR, TREE_POSITIONS, ROAD, FENCE_BOUNDS, PITCH, APRON_MARGIN, type TimeOfDay, type WeatherType } from "./constants";
import { generateAsphaltSurface, generateGravelSurface, generateTerrainSurface, generateSnowTerrainSurface } from "./grassTexture";
import { Landscape, HILLS, HILL_BASE_Y, MAIN_ROAD_Z, MAIN_ROAD_WIDTH } from "./Landscape";

interface SurroundingsProps {
  reduceTrees?: boolean;
  timeOfDay?: TimeOfDay;
  weather?: WeatherType;
  /** Rozměry oplocení: podle nich se kreslí posekaný trávník areálu a chodník u plotu. */
  fence?: { width: number; depth: number };
  /** Bez plotu (úroveň 0) se chodník podél něj nekreslí. */
  fenceLevel?: number;
}

export function Surroundings({
  reduceTrees = false,
  timeOfDay = "day",
  weather = "sunny",
  fence = FENCE_BOUNDS,
  fenceLevel = 0,
}: SurroundingsProps) {
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

      {/* Posekaný trávník areálu a štěrkový chodník podél plotu: oddělí areál od louky */}
      <CompoundGround fence={fence} showWalkway={fenceLevel > 0} isSnow={isSnow} />

      {/* Zvlněné kopečky v krajině na horizontu */}
      <LandscapeHills isSnow={isSnow} />

      {/* Pole, les, okresní silnice, ves a hřebeny na obzoru */}
      <Landscape timeOfDay={timeOfDay} weather={weather} reduced={reduceTrees} />

      {/* Příjezdová cesta */}
      <Road />

      {/* Stromy a lesíky kolem areálu */}
      <Trees reduce={reduceTrees} isSnow={isSnow} />
    </group>
  );
}

function Road() {
  // Příjezdovka vede od parkoviště až na okresní silnici.
  const [sx] = ROAD.start;
  const sz = MAIN_ROAD_Z + MAIN_ROAD_WIDTH / 2;
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
      position={[(sx + ex) / 2, 0.07, (sz + ez) / 2]}
      rotation={[-Math.PI / 2, 0, -angle]}
      receiveShadow
    >
      <planeGeometry args={[length, ROAD.width]} />
      <meshStandardMaterial
        map={roadSurface.map}
        bumpMap={roadSurface.bumpMap}
        bumpScale={0.045}
        roughness={0.96}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

/** Posekaný trávník uvnitř plotu a štěrkový chodník podél něj. */
function CompoundGround({
  fence,
  showWalkway,
  isSnow,
}: {
  fence: { width: number; depth: number };
  showWalkway: boolean;
  isSnow: boolean;
}) {
  const walkwayWidth = 3;
  const halfW = fence.width / 2;
  const halfD = fence.depth / 2;
  const lawn = useMemo(
    () => (isSnow ? null : generateTerrainSurface("#7C9F48", fence.width / 14, fence.depth / 14)),
    [isSnow, fence.width, fence.depth],
  );
  // Rám s dírou pod hřištěm a výběhovou zónou. Plná deska by se díky polygonOffsetu
  // z dálky vykreslila přes trávník hřiště a smazala čáry i pruhy sekání.
  const lawnGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, -halfD);
    shape.lineTo(halfW, -halfD);
    shape.lineTo(halfW, halfD);
    shape.lineTo(-halfW, halfD);
    shape.closePath();
    const holeW = PITCH.width / 2 + APRON_MARGIN - 0.2;
    const holeD = PITCH.depth / 2 + APRON_MARGIN - 0.2;
    const hole = new THREE.Path();
    hole.moveTo(-holeW, -holeD);
    hole.lineTo(-holeW, holeD);
    hole.lineTo(holeW, holeD);
    hole.lineTo(holeW, -holeD);
    hole.closePath();
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape);
    // ShapeGeometry dává UV v metrech; textura počítá s rozsahem 0–1 přes celou plochu.
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) / fence.width + 0.5, uv.getY(i) / fence.depth + 0.5);
    }
    uv.needsUpdate = true;
    return g;
  }, [halfW, halfD, fence.width, fence.depth]);
  useEffect(() => () => lawnGeometry.dispose(), [lawnGeometry]);
  const gravelX = useMemo(() => generateGravelSurface(fence.width / 4, 1), [fence.width]);
  const gravelZ = useMemo(() => generateGravelSurface(1, fence.depth / 4), [fence.depth]);
  const strips: Array<{ pos: [number, number, number]; size: [number, number]; alongX: boolean }> = [
    { pos: [0, 0.03, -(halfD - walkwayWidth / 2)], size: [fence.width, walkwayWidth], alongX: true },
    { pos: [0, 0.03, halfD - walkwayWidth / 2], size: [fence.width, walkwayWidth], alongX: true },
    { pos: [-(halfW - walkwayWidth / 2), 0.03, 0], size: [walkwayWidth, fence.depth - walkwayWidth * 2], alongX: false },
    { pos: [halfW - walkwayWidth / 2, 0.03, 0], size: [walkwayWidth, fence.depth - walkwayWidth * 2], alongX: false },
  ];
  return (
    <group>
      {lawn && (
        <mesh geometry={lawnGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} receiveShadow>
          <meshStandardMaterial
            map={lawn.map}
            bumpMap={lawn.bumpMap}
            bumpScale={0.08}
            roughness={1}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      {showWalkway &&
        strips.map((strip, i) => {
          const surface = strip.alongX ? gravelX : gravelZ;
          return (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={strip.pos} receiveShadow>
              <planeGeometry args={strip.size} />
              <meshStandardMaterial
                // Pod sněhem je chodník jen prošlapaná světlá stopa, bez textury štěrku.
                map={isSnow ? null : surface.map}
                bumpMap={surface.bumpMap}
                bumpScale={0.05}
                color={isSnow ? "#D5DDE5" : "#FFFFFF"}
                roughness={1}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
          );
        })}
    </group>
  );
}

/** Zvlněný terén / nízké kopečky kolem areálu */
function LandscapeHills({ isSnow = false }: { isSnow?: boolean }) {
  // Dřív čtyři obří koule hned za plotem, které z nadhledu vypadaly jako zelené kupole.
  // Teď nižší a širší vlny dál v krajině, hladce stínované — vzdálené kopce nemají hrany.
  // Rozmístění sdílí s krajinou (les a domy na nich stojí podle `terrainHeight`).
  return (
    <group>
      {HILLS.map((h, i) => (
        <mesh key={i} position={[h.pos[0], HILL_BASE_Y, h.pos[1]]} scale={h.scale} receiveShadow>
          <sphereGeometry args={[1, 28, 14]} />
          <meshStandardMaterial color={isSnow ? "#E2E8F0" : h.tint} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Stromy navíc k pevným pozicím kolem plotu: alej podél okresní silnice a příjezdovky
 * a pár solitérů v polích.
 */
const EXTRA_TREE_POSITIONS: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  const edge = MAIN_ROAD_WIDTH / 2 + 3.2;
  for (let x = -172; x <= 44; x += 13) {
    // Ves má místo aleje domy; u odbočky k hřišti je mezera.
    if (Math.abs(x - 42) < 7) continue;
    out.push([x, MAIN_ROAD_Z - edge], [x + 6.5, MAIN_ROAD_Z + edge]);
  }
  for (let z = -60; z > MAIN_ROAD_Z + 8; z -= 9) out.push([42 + 5.5, z]);
  out.push([-92, -36], [-118, 4], [-84, 62], [-104, 96], [84, 86], [98, 14], [112, -52], [-40, 112], [56, 118], [-78, -118]);
  return out;
})();

function Trees({ reduce = false, isSnow = false }: { reduce?: boolean; isSnow?: boolean }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);
  const broadRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const wind = useWind();
  const crownBase = useRef<Array<{
    mesh: React.RefObject<THREE.InstancedMesh | null>;
    local: THREE.Matrix4;
    x: number;
    y: number;
    z: number;
    phase: number;
  }>>([]);
  const tilt = useMemo(() => new THREE.Matrix4(), []);

  // Koruny se kývají po větru (+X): náklon kolem paty kmene, poryvy v různé fázi.
  useFrame(({ clock }) => {
    const base = crownBase.current;
    if (base.length === 0) return;
    const t = clock.elapsedTime;
    const touched = new Set<THREE.InstancedMesh>();
    base.forEach((c, i) => {
      const mesh = c.mesh.current;
      if (!mesh) return;
      const gust = 0.5 + 0.5 * Math.sin(t * 0.7 + c.phase * 0.5);
      const sway = wind * (0.03 + 0.05 * gust) + Math.sin(t * (1.2 + wind * 1.6) + c.phase) * (0.01 + wind * 0.035);
      tilt.makeRotationZ(-sway);
      matrix.multiplyMatrices(tilt, c.local);
      // Náklon kolem paty: koruna se posune po větru úměrně své výšce.
      matrix.setPosition(c.x + Math.sin(sway) * c.y, c.y * Math.cos(sway), c.z);
      mesh.setMatrixAt(i, matrix);
      touched.add(mesh);
    });
    touched.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  });
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
    const all = [...TREE_POSITIONS, ...EXTRA_TREE_POSITIONS];
    const positions = reduce ? all.filter((_, i) => i % 2 === 0) : all;
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
    // Výchozí matice korun pro kývání ve větru (useFrame níže je jen natáčí).
    crownBase.current = trees.map((t) => {
      const m = new THREE.Matrix4();
      rot.makeRotationY(t.yaw);
      const ref = t.kind === "round" ? roundRef : t.kind === "broad" ? broadRef : coneRef;
      if (t.kind === "round") m.makeScale(t.scale, t.scale * 0.95, t.scale).multiply(rot);
      else if (t.kind === "broad") m.makeScale(t.scale * 1.25, t.scale * 0.85, t.scale * 1.25).multiply(rot);
      else m.makeScale(t.scale, t.scale, t.scale).multiply(rot);
      const y = (2.4 + (t.kind === "round" ? 1.1 : t.kind === "broad" ? 1.3 : 1.5)) * t.scale;
      return { mesh: ref, local: m, x: t.x, y, z: t.z, phase: (t.x * 0.37 + t.z * 0.21) % (Math.PI * 2) };
    });
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
