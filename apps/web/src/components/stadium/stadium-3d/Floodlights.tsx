"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { TimeOfDay } from "./constants";

interface FloodlightsProps {
  timeOfDay: TimeOfDay;
  level: number;
  standsLevel?: number;
  isMobile?: boolean;
}

type FloodlightLevel = 1 | 2 | 3;

interface FloodlightConfig {
  poleHeight: number;
  headWidth: number;
  headHeight: number;
  lampColumns: number;
  lampRows: number;
  spotIntensity: number;
  fieldFillIntensity: number;
  beamRadius: number;
  lightColor: string;
}

const LEVEL_CONFIG: Record<FloodlightLevel, FloodlightConfig> = {
  1: {
    poleHeight: 11,
    headWidth: 2.2,
    headHeight: 0.9,
    lampColumns: 3,
    lampRows: 1,
    spotIntensity: 320,
    fieldFillIntensity: 0.30,
    beamRadius: 12,
    lightColor: "#FFF2D2",
  },
  2: {
    poleHeight: 15,
    headWidth: 3.2,
    headHeight: 1.5,
    lampColumns: 4,
    lampRows: 2,
    spotIntensity: 460,
    fieldFillIntensity: 0.40,
    beamRadius: 14,
    lightColor: "#FFF7E6",
  },
  3: {
    poleHeight: 19,
    headWidth: 4.4,
    headHeight: 2.4,
    lampColumns: 5,
    lampRows: 3,
    spotIntensity: 620,
    fieldFillIntensity: 0.52,
    beamRadius: 16,
    lightColor: "#F4F8FF",
  },
};

export function Floodlights({ timeOfDay, level, standsLevel = 0, isMobile = false }: FloodlightsProps) {
  const normalizedLevel = Math.max(0, Math.min(3, Math.floor(level)));
  if (normalizedLevel <= 0) return null;
  return (
    <ActiveFloodlights
      timeOfDay={timeOfDay}
      level={normalizedLevel}
      standsLevel={standsLevel}
      isMobile={isMobile}
    />
  );
}

function ActiveFloodlights({ timeOfDay, level, standsLevel = 0, isMobile = false }: FloodlightsProps) {
  const normalizedLevel = Math.max(1, Math.min(3, Math.floor(level)));
  const floodlightLevel = normalizedLevel as FloodlightLevel;
  const config = LEVEL_CONFIG[floodlightLevel];
  const isNight = timeOfDay === "night";
  const lightsActive = isNight || timeOfDay === "sunset";

  // Stožáry v ikonických 4 rozích stadionu
  const cornerX = standsLevel >= 1 ? 26 : 23.5;
  const cornerZ = standsLevel >= 1 ? 34 : 32.5;

  const positions: Array<[number, number]> = useMemo(() => (
    floodlightLevel === 1
      ? [[-cornerX, -cornerZ], [cornerX, cornerZ]]
      : [
          [-cornerX, -cornerZ],
          [cornerX, -cornerZ],
          [-cornerX, cornerZ],
          [cornerX, cornerZ],
        ]
  ), [cornerX, cornerZ, floodlightLevel]);

  return (
    <group>
      {positions.map(([x, z]) => {
        // Lokální +Z natočíme přesně z rohu ke středu hřiště.
        const rotationY = Math.atan2(-x, -z);
        return (
          <FloodlightTower
            key={`${x}-${z}`}
            level={floodlightLevel}
            config={config}
            position={[x, z]}
            rotationY={rotationY}
            lightsActive={lightsActive}
            isNight={isNight}
            isMobile={isMobile}
          />
        );
      })}

      {/* Jemné a vyvážené plošné noční světlo pro čistou čitelnost trávníku */}
      {isNight && (
        <directionalLight
          position={[0, 36, 4]}
          intensity={config.fieldFillIntensity}
          color={config.lightColor}
          castShadow={false}
        />
      )}
    </group>
  );
}

function FloodlightTower({
  level,
  config,
  position,
  rotationY,
  lightsActive,
  isNight,
  isMobile,
}: {
  level: FloodlightLevel;
  config: FloodlightConfig;
  position: [number, number];
  rotationY: number;
  lightsActive: boolean;
  isNight: boolean;
  isMobile: boolean;
}) {
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const horizontalDistance = Math.hypot(position[0], position[1]);
  const headY = config.poleHeight + (level === 1 ? 0.55 : 1.05);
  const targetY = 0.6;
  const headTilt = Math.atan2(headY - targetY, horizontalDistance);

  const beam = useMemo(() => {
    const origin = new THREE.Vector3(0, headY, 0.3);
    // Kužel končí lehce před středem, aby jeho základna pokryla trávník,
    // ale osa stále mířila stejným směrem jako reflektor.
    const target = new THREE.Vector3(0, targetY, horizontalDistance * 0.84);
    const direction = target.clone().sub(origin);
    const length = direction.length();
    const midpoint = origin.clone().add(target).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, -1, 0),
      direction.normalize(),
    );
    return { length, midpoint, quaternion };
  }, [headY, horizontalDistance]);

  useEffect(() => {
    if (spotRef.current && targetRef.current) {
      spotRef.current.target = targetRef.current;
    }
  }, [lightsActive, isMobile]);

  const activeIntensity = isNight ? config.spotIntensity : config.spotIntensity * 0.45;
  const emissiveIntensity = lightsActive ? (isNight ? 2.8 + level * 0.35 : 1.35 + level * 0.2) : 0;

  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotationY, 0]}>
      {/* Betonová patka roste s hmotností konstrukce. */}
      <mesh position={[0, 0.25 + level * 0.05, 0]} castShadow>
        <boxGeometry args={[1.05 + level * 0.22, 0.5 + level * 0.1, 1.05 + level * 0.22]} />
        <meshStandardMaterial color="#8C8F94" roughness={0.92} />
      </mesh>

      {level === 1 && <SimplePole height={config.poleHeight} />}
      {level === 2 && <ReinforcedPole height={config.poleHeight} />}
      {level === 3 && <LatticeTower height={config.poleHeight} />}

      {level >= 2 && (
        <>
          {/* Servisní plošina a subtilní zábradlí. */}
          <mesh position={[0, config.poleHeight, 0]} castShadow>
            <boxGeometry args={[config.headWidth + 0.5, 0.14, 1.25]} />
            <meshStandardMaterial color="#202833" metalness={0.72} roughness={0.34} />
          </mesh>
          <mesh position={[0, config.poleHeight + 0.38, 0.53]} castShadow>
            <boxGeometry args={[config.headWidth + 0.5, 0.62, 0.05]} />
            <meshStandardMaterial color="#4B5563" metalness={0.58} roughness={0.45} />
          </mesh>
        </>
      )}

      {/* Panel je skloněný podle skutečné výšky a vzdálenosti od středu. */}
      <group position={[0, headY, 0.2]} rotation={[headTilt, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[config.headWidth, config.headHeight, level === 3 ? 0.3 : 0.22]} />
          <meshStandardMaterial color={level === 3 ? "#0F172A" : "#1F2937"} metalness={0.82} roughness={0.28} />
        </mesh>

        {Array.from({ length: config.lampColumns }).flatMap((_, column) =>
          Array.from({ length: config.lampRows }).map((__, row) => {
            const cellW = config.headWidth / config.lampColumns;
            const cellH = config.headHeight / config.lampRows;
            const x = -config.headWidth / 2 + cellW * (column + 0.5);
            const y = -config.headHeight / 2 + cellH * (row + 0.5);
            return (
              <mesh key={`${column}-${row}`} position={[x, y, level === 3 ? 0.17 : 0.13]}>
                <boxGeometry args={[cellW * 0.7, cellH * 0.66, 0.07]} />
                <meshStandardMaterial
                  color={lightsActive ? "#FFFFFF" : "#64748B"}
                  emissive={lightsActive ? config.lightColor : "#000000"}
                  emissiveIntensity={emissiveIntensity}
                  metalness={0.08}
                  roughness={0.18}
                  toneMapped={false}
                />
              </mesh>
            );
          }),
        )}
      </group>

      {/* Cíl je součástí stejné natočené skupiny: lokální +Z vede do
          světového středu hřiště, takže SpotLight míří přesně na hrací plochu. */}
      <object3D ref={targetRef} position={[0, targetY, horizontalDistance * 0.88]} />

      {lightsActive && !isMobile && (
        <spotLight
          ref={spotRef}
          position={[0, headY, 0.3]}
          intensity={activeIntensity}
          distance={95}
          decay={1.6}
          angle={Math.PI / 3.0}
          penumbra={0.85}
          color={config.lightColor}
          castShadow={false}
        />
      )}

      {/* Stylizovaný jemný paprsek světelného kuželu */}
      {isNight && !isMobile && (
        <mesh position={beam.midpoint} quaternion={beam.quaternion}>
          <coneGeometry args={[config.beamRadius, beam.length, 16, 1, true]} />
          <meshBasicMaterial
            color={config.lightColor}
            opacity={0.012 + level * 0.004}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

function SimplePole({ height }: { height: number }) {
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, height, 10]} />
        <meshStandardMaterial color="#58616B" metalness={0.68} roughness={0.42} />
      </mesh>
      <mesh position={[0, height - 0.05, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 2.45, 8]} />
        <meshStandardMaterial color="#3D4650" metalness={0.7} roughness={0.38} />
      </mesh>
    </group>
  );
}

function ReinforcedPole({ height }: { height: number }) {
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.23, height, 10]} />
        <meshStandardMaterial color="#47515C" metalness={0.72} roughness={0.38} />
      </mesh>
      {[0.28, 0.53, 0.78].map((fraction) => (
        <mesh key={fraction} position={[0, height * fraction, 0]} castShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.08, 10]} />
          <meshStandardMaterial color="#303945" metalness={0.75} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function LatticeTower({ height }: { height: number }) {
  const legOffset = 0.38;
  const braceLevels = 7;

  return (
    <group>
      {[-legOffset, legOffset].flatMap((x) =>
        [-legOffset, legOffset].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, height / 2, z]} castShadow>
            <cylinderGeometry args={[0.065, 0.105, height, 6]} />
            <meshStandardMaterial color="#36404B" metalness={0.72} roughness={0.36} />
          </mesh>
        )),
      )}
      {Array.from({ length: braceLevels }).map((_, index) => {
        const y = 1.8 + index * ((height - 2.2) / (braceLevels - 1));
        return (
          <group key={index} position={[0, y, 0]}>
            <mesh castShadow>
              <boxGeometry args={[legOffset * 2 + 0.12, 0.065, legOffset * 2 + 0.12]} />
              <meshStandardMaterial color="#4B5563" metalness={0.62} roughness={0.42} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
