"use client";

import { Text } from "@react-three/drei";

interface StadiumSignProps {
  name: string;
  position: [number, number, number];   // base position
  teamColor: string;
}

/**
 * Reklamní cedule s názvem stadionu na 2 sloupcích — billboard styl.
 * Otočená čelem k jihu (k příchozím od cesty/parkoviště).
 */
export function StadiumSign({ name, position, teamColor }: StadiumSignProps) {
  const postH = 3;
  const plateW = 9;
  const plateH = 1.6;
  const plateThickness = 0.15;

  return (
    <group position={position}>
      {/* Levý sloupek */}
      <mesh position={[-plateW / 2 + 0.3, postH / 2, 0]} castShadow>
        <boxGeometry args={[0.25, postH, 0.25]} />
        <meshStandardMaterial color="#525252" />
      </mesh>
      {/* Pravý sloupek */}
      <mesh position={[plateW / 2 - 0.3, postH / 2, 0]} castShadow>
        <boxGeometry args={[0.25, postH, 0.25]} />
        <meshStandardMaterial color="#525252" />
      </mesh>
      {/* Plotna - týmová barva */}
      <mesh position={[0, postH + plateH / 2, 0]} castShadow>
        <boxGeometry args={[plateW, plateH, plateThickness]} />
        <meshStandardMaterial color={teamColor} roughness={0.7} />
      </mesh>
      {/* Bílý okraj plotny (zezadu i zepředu) — pro lepší kontrast */}
      <mesh position={[0, postH + plateH / 2, plateThickness / 2 + 0.005]}>
        <planeGeometry args={[plateW * 0.96, plateH * 0.85]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      {/* Text na ceduli (front) */}
      <Text
        position={[0, postH + plateH / 2, plateThickness / 2 + 0.01]}
        fontSize={0.55}
        color={teamColor}
        anchorX="center"
        anchorY="middle"
        maxWidth={plateW * 0.92}
        textAlign="center"
      >
        {name}
      </Text>
      {/* Text zezadu (vidíš to i když přicházíš ze severu) */}
      <Text
        position={[0, postH + plateH / 2, -plateThickness / 2 - 0.01]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.55}
        color={teamColor}
        anchorX="center"
        anchorY="middle"
        maxWidth={plateW * 0.92}
        textAlign="center"
      >
        {name}
      </Text>
    </group>
  );
}
