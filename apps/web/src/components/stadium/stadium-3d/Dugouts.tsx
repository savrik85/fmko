"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { type WeatherType, PITCH } from "./constants";

interface DugoutsProps {
  teamColor: string;
  secondaryColor?: string;
  weather?: WeatherType;
}

const HALF_W = PITCH.width / 2;

export function Dugouts({ teamColor, secondaryColor = "#ffffff", weather }: DugoutsProps) {
  // Střídačky jsou podél západní postranní čáry (x = -HALF_W - 2.5)
  const dugoutX = -HALF_W - 2.2;

  return (
    <group>
      {/* Domácí střídačka (z = -7) */}
      <Dugout
        position={[dugoutX, 0, -7.5]}
        rotationY={Math.PI / 2}
        label="DOMÁCÍ"
        mainColor={teamColor}
        accentColor={secondaryColor}
        seatCount={6}
        weather={weather}
      />

      {/* Hostující střídačka (z = 7.5) */}
      <Dugout
        position={[dugoutX, 0, 7.5]}
        rotationY={Math.PI / 2}
        label="HOSTÉ"
        mainColor="#374151"
        accentColor="#9CA3AF"
        seatCount={6}
        weather={weather}
      />
    </group>
  );
}

function Dugout({
  position,
  rotationY,
  label,
  mainColor,
  accentColor,
  seatCount = 6,
  weather,
}: {
  position: [number, number, number];
  rotationY: number;
  label: string;
  mainColor: string;
  accentColor: string;
  seatCount: number;
  weather?: WeatherType;
}) {
  const isSnow = weather === "snow";
  const width = 5.0;
  const height = 2.1;
  const depth = 1.6;

  // Textura s nápisem DOMÁCÍ / HOSTÉ
  const labelTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = mainColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 44px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [label, mainColor]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Betonový sokl / podlaha pod střídačkou */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.4, 0.1, depth + 0.3]} />
        <meshStandardMaterial color="#6B7280" roughness={0.9} />
      </mesh>

      {/* Ocelový nosný rám střídačky */}
      {/* Zadní sloupky */}
      {[-width / 2 + 0.1, 0, width / 2 - 0.1].map((x, i) => (
        <mesh key={`post-${i}`} position={[x, height / 2, -depth / 2 + 0.1]} castShadow>
          <boxGeometry args={[0.08, height, 0.08]} />
          <meshStandardMaterial color="#1F2937" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* Přední sloupky */}
      {[-width / 2 + 0.1, width / 2 - 0.1].map((x, i) => (
        <mesh key={`fpost-${i}`} position={[x, height / 2, depth / 2 - 0.1]} castShadow>
          <boxGeometry args={[0.08, height, 0.08]} />
          <meshStandardMaterial color="#1F2937" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* Zadní stěna — plexisklo / polykarbonát */}
      <mesh position={[0, height / 2, -depth / 2 + 0.1]}>
        <planeGeometry args={[width - 0.2, height - 0.2]} />
        <meshPhysicalMaterial
          color="#D1E8F2"
          transparent
          opacity={0.55}
          roughness={0.1}
          metalness={0.1}
          transmission={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Boční stěny — plexisklo */}
      <mesh position={[-width / 2 + 0.1, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth - 0.2, height - 0.2]} />
        <meshPhysicalMaterial
          color="#D1E8F2"
          transparent
          opacity={0.55}
          roughness={0.1}
          metalness={0.1}
          transmission={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[width / 2 - 0.1, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth - 0.2, height - 0.2]} />
        <meshPhysicalMaterial
          color="#D1E8F2"
          transparent
          opacity={0.55}
          roughness={0.1}
          metalness={0.1}
          transmission={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Oblouková / šikmá stříška */}
      <mesh position={[0, height + 0.05, 0]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[width + 0.2, 0.08, depth + 0.3]} />
        <meshStandardMaterial color={mainColor} roughness={0.4} metalness={0.2} />
      </mesh>

      {/* Sněhová vrstva na stříšce v zimě */}
      {isSnow && (
        <mesh position={[0, height + 0.1, 0]} rotation={[0.15, 0, 0]} castShadow>
          <boxGeometry args={[width + 0.22, 0.05, depth + 0.32]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.9} />
        </mesh>
      )}

      {/* Přední štítek s nápisem */}
      {labelTexture && (
        <mesh position={[0, height - 0.15, depth / 2 - 0.05]} castShadow>
          <planeGeometry args={[width * 0.7, 0.35]} />
          <meshBasicMaterial map={labelTexture} toneMapped={false} />
        </mesh>
      )}

      {/* Lavička se sedadly uvnitř */}
      <mesh position={[0, 0.45, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[width - 0.4, 0.08, 0.5]} />
        <meshStandardMaterial color="#4B5563" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.7, -0.42]} castShadow>
        <boxGeometry args={[width - 0.4, 0.45, 0.08]} />
        <meshStandardMaterial color="#374151" roughness={0.8} />
      </mesh>

      {/* Individuální sedačky na lavičce */}
      {Array.from({ length: seatCount }).map((_, i) => {
        const step = (width - 0.8) / (seatCount - 1);
        const x = -((width - 0.8) / 2) + i * step;
        return (
          <group key={i} position={[x, 0.48, -0.2]}>
            <mesh castShadow>
              <boxGeometry args={[0.42, 0.06, 0.42]} />
              <meshStandardMaterial color={mainColor} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.25, -0.19]} castShadow>
              <boxGeometry args={[0.42, 0.45, 0.06]} />
              <meshStandardMaterial color={mainColor} roughness={0.5} />
            </mesh>
          </group>
        );
      })}

      {/* Detaily: bidon / bedna s pitím u nohou */}
      <mesh position={[width / 2 - 0.4, 0.25, 0.4]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.35]} />
        <meshStandardMaterial color="#D97706" />
      </mesh>
      <mesh position={[width / 2 - 0.35, 0.45, 0.4]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.15, 8]} />
        <meshStandardMaterial color="#F59E0B" />
      </mesh>
    </group>
  );
}
