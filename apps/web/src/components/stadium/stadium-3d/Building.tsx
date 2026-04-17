"use client";

import { BUILDING_COLORS, BUILDING_DIMS } from "./constants";

type BuildingKind = "changing_rooms" | "showers" | "refreshments";

interface BuildingProps {
  kind: BuildingKind;
  level: number;
  position: [number, number];   // [x, z]
}

export function Building({ kind, level, position }: BuildingProps) {
  if (level <= 0) return null;
  const dims = BUILDING_DIMS[Math.min(level, 3)];
  const colors = BUILDING_COLORS[kind];

  // Sedlová střecha výška = polovina šířky
  const roofHeight = dims.width * 0.4;

  return (
    <group position={[position[0], 0, position[1]]}>
      {/* Stěny */}
      <mesh position={[0, dims.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[dims.width, dims.height, dims.depth]} />
        <meshStandardMaterial color={colors.wall} roughness={0.8} />
      </mesh>

      {/* Sedlová střecha — trojúhelníkový hranol */}
      <Roof
        width={dims.width}
        depth={dims.depth}
        baseY={dims.height}
        roofHeight={roofHeight}
        color={colors.roof}
      />

      {/* Dveře (jednoduchý tmavý obdélník vepředu) */}
      {level >= 1 && (
        <mesh position={[0, dims.height * 0.35, dims.depth / 2 + 0.01]}>
          <planeGeometry args={[dims.width * 0.25, dims.height * 0.65]} />
          <meshStandardMaterial color="#3B2817" />
        </mesh>
      )}

      {/* Okna (L2+) */}
      {level >= 2 && (
        <>
          <mesh position={[-dims.width * 0.3, dims.height * 0.6, dims.depth / 2 + 0.01]}>
            <planeGeometry args={[dims.width * 0.18, dims.height * 0.3]} />
            <meshStandardMaterial color="#9BC4E2" emissive="#9BC4E2" emissiveIntensity={0.1} />
          </mesh>
          <mesh position={[dims.width * 0.3, dims.height * 0.6, dims.depth / 2 + 0.01]}>
            <planeGeometry args={[dims.width * 0.18, dims.height * 0.3]} />
            <meshStandardMaterial color="#9BC4E2" emissive="#9BC4E2" emissiveIntensity={0.1} />
          </mesh>
        </>
      )}

      {/* Cedule s typem (L3) */}
      {level >= 3 && (
        <mesh position={[0, dims.height + roofHeight + 0.5, 0]} castShadow>
          <boxGeometry args={[dims.width * 0.7, 0.6, 0.15]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
      )}
    </group>
  );
}

function Roof({
  width,
  depth,
  baseY,
  roofHeight,
  color,
}: {
  width: number;
  depth: number;
  baseY: number;
  roofHeight: number;
  color: string;
}) {
  // 2 trojúhelníky bočně + 2 šikmé plochy = sedlová střecha
  // Jednoduchá implementace: 2 šikmé Box nakloněné

  const slopeLength = Math.sqrt((width / 2) ** 2 + roofHeight ** 2);
  const angle = Math.atan2(roofHeight, width / 2);

  return (
    <group position={[0, baseY, 0]}>
      {/* Levá šikmá plocha */}
      <mesh
        position={[-width / 4, roofHeight / 2, 0]}
        rotation={[0, 0, angle]}
        castShadow
      >
        <boxGeometry args={[slopeLength, 0.15, depth + 0.4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Pravá šikmá plocha */}
      <mesh
        position={[width / 4, roofHeight / 2, 0]}
        rotation={[0, 0, -angle]}
        castShadow
      >
        <boxGeometry args={[slopeLength, 0.15, depth + 0.4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Štíty (přední + zadní trojúhelníky) — jednoduchý tenký box */}
      <mesh position={[0, roofHeight / 2, depth / 2 + 0.05]} castShadow>
        <boxGeometry args={[width, roofHeight, 0.1]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, roofHeight / 2, -depth / 2 - 0.05]} castShadow>
        <boxGeometry args={[width, roofHeight, 0.1]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}
