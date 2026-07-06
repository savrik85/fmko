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
  const color = roofColor ?? "#6B6E76";
  const overhang = 0.6 + roofLevel * 0.3;

  const nsDistance = PITCH.depth / 2 + STAND_GAP + dims.depth / 2;
  const ewDistance = PITCH.width / 2 + STAND_GAP + dims.depth / 2;
  const canopyY = dims.height + 0.9;

  // Jedna stříška nad tribunou. `axis` = podél které osy jde délka tribuny.
  const Canopy = ({ pos, alongX, rot }: { pos: [number, number, number]; alongX: boolean; rot: number }) => {
    const lengthAlong = (alongX ? PITCH.width : PITCH.depth) + 2;
    const spanDepth = dims.depth + overhang * 2;
    return (
      <group position={pos} rotation={[0, rot, 0]}>
        <mesh position={[0, 0, 0]} rotation={[-0.12, 0, 0]} castShadow>
          <boxGeometry args={[lengthAlong, 0.18, spanDepth]} />
          <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
        </mesh>
        {/* Přední nosník (okraj u hřiště) */}
        <mesh position={[0, -0.35, -spanDepth / 2]} castShadow>
          <boxGeometry args={[lengthAlong, 0.12, 0.12]} />
          <meshStandardMaterial color="#4A4D54" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
    );
  };

  return (
    <group>
      {/* Sever (z+) a jih (z-) */}
      <Canopy pos={[0, canopyY, nsDistance + dims.depth * 0.1]} alongX rot={0} />
      <Canopy pos={[0, canopyY, -(nsDistance + dims.depth * 0.1)]} alongX rot={Math.PI} />
      {/* Východ/Západ jen když stojí (stands >= 2) */}
      {standsLevel >= 2 && <Canopy pos={[ewDistance + dims.depth * 0.1, canopyY, 0]} alongX={false} rot={Math.PI / 2} />}
      {standsLevel >= 2 && <Canopy pos={[-(ewDistance + dims.depth * 0.1), canopyY, 0]} alongX={false} rot={-Math.PI / 2} />}
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
