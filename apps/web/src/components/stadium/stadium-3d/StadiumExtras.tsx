"use client";

import { PITCH, STAND_DIMS } from "./constants";

const STAND_GAP = 1;

/**
 * Zastřešení tribun — stříška nad severní/jižní (a od L2 i V/Z) tribunou.
 * Renderuje se jen když je postavené (roofLevel>0) a existují tribuny (standsLevel>0).
 */
export function StandRoof({
  standsLevel,
  roofLevel,
  roofColor,
}: {
  standsLevel: number;
  roofLevel: number;
  roofColor?: string | null;
}) {
  if (roofLevel <= 0 || standsLevel <= 0) return null;
  const dims = STAND_DIMS[Math.min(standsLevel, 3)];
  const color = roofColor ?? "#9A9DA4"; // světlejší plech
  const overhang = 0.5 + roofLevel * 0.35; // přesah nad hřiště roste s levelem

  // Stejné umístění jako Stand: skupina na okraji hřiště, lokální +Z = od hřiště dozadu.
  const nsDistance = PITCH.depth / 2 + STAND_GAP + dims.depth / 2;
  const ewDistance = PITCH.width / 2 + STAND_GAP + dims.depth / 2;

  // Stříška v LOKÁLNÍCH souřadnicích tribuny: kryje zadní 2/3 sedaček,
  // klesá od zadku (výš) k hřišti (níž) — jako reálná krytá tribuna.
  const Canopy = ({ alongLen }: { alongLen: number }) => {
    const roofDepth = dims.depth * 0.7 + overhang;
    const roofZ = dims.depth * 0.45;               // těžiště nad zadní částí sedaček
    const roofY = dims.height + 1.1;               // jasně nad sedačkami
    const backZ = dims.depth + overhang * 0.5;      // zadní podpěry
    return (
      <group>
        {/* Nakloněná plocha stříšky */}
        <mesh position={[0, roofY, roofZ]} rotation={[-0.32, 0, 0]} castShadow>
          <boxGeometry args={[alongLen + 1, 0.14, roofDepth]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.35} />
        </mesh>
        {/* Zadní sloupky (2) */}
        {[-alongLen * 0.4, alongLen * 0.4].map((x, i) => (
          <mesh key={i} position={[x, dims.height * 0.55, backZ]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, dims.height + 1.1, 6]} />
            <meshStandardMaterial color="#4A4D54" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
      </group>
    );
  };

  return (
    <group>
      <group position={[0, 0, nsDistance]} rotation={[0, 0, 0]}><Canopy alongLen={PITCH.width} /></group>
      <group position={[0, 0, -nsDistance]} rotation={[0, Math.PI, 0]}><Canopy alongLen={PITCH.width} /></group>
      {standsLevel >= 2 && <group position={[ewDistance, 0, 0]} rotation={[0, Math.PI / 2, 0]}><Canopy alongLen={PITCH.depth} /></group>}
      {standsLevel >= 2 && <group position={[-ewDistance, 0, 0]} rotation={[0, -Math.PI / 2, 0]}><Canopy alongLen={PITCH.depth} /></group>}
    </group>
  );
}

/**
 * Sektor kotle — řada vlajkových banerů + buben před jižní tribunou (u hřiště).
 * Počet a výška roste s levelem.
 */
export function UltrasSector({
  level,
  primaryColor,
  secondaryColor,
}: {
  level: number;
  primaryColor: string;
  secondaryColor?: string;
}) {
  if (level <= 0) return null;
  const lvl = Math.min(level, 3);
  const count = [0, 3, 5, 7][lvl];
  const poleH = 3 + lvl * 0.6;
  // Před jižní brankou (z-), u čáry hřiště
  const z = -(PITCH.depth / 2 + STAND_GAP + 0.5);
  const spread = PITCH.width * 0.7;
  const sec = secondaryColor ?? "#ffffff";

  return (
    <group>
      {Array.from({ length: count }).map((_, i) => {
        const x = -spread / 2 + (spread / Math.max(count - 1, 1)) * i;
        const banner = i % 2 === 0 ? primaryColor : sec;
        return (
          <group key={i} position={[x, 0, z]}>
            {/* Žerď */}
            <mesh position={[0, poleH / 2, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.06, poleH, 6]} />
              <meshStandardMaterial color="#3A3A3A" metalness={0.5} roughness={0.5} />
            </mesh>
            {/* Svislý baner */}
            <mesh position={[0, poleH * 0.6, 0.05]} castShadow>
              <planeGeometry args={[0.9, poleH * 0.7]} />
              <meshStandardMaterial color={banner} side={2} roughness={0.8} />
            </mesh>
          </group>
        );
      })}
      {/* Velký buben uprostřed (od L2) */}
      {lvl >= 2 && (
        <group position={[0, 0, z - 0.6]}>
          <mesh position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.8, 0.8, 1.0, 20]} />
            <meshStandardMaterial color={primaryColor} roughness={0.6} />
          </mesh>
          {/* Blány bubnu */}
          <mesh position={[0.5, 0.9, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.82, 0.82, 0.04, 20]} />
            <meshStandardMaterial color="#F5F0E8" />
          </mesh>
        </group>
      )}
    </group>
  );
}
