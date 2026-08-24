"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { CAR_COLORS, PARKING_DIMS, type WeatherType, type StadiumMode } from "./constants";
import { generateAsphaltSurface, generateGravelSurface, generateTerrainSurface, generateSnowTerrainSurface } from "./grassTexture";
import { generateWoodTexture, generateConcreteTexture } from "./materialTextures";

interface ParkingProps {
  level: number;
  position: [number, number];
  weather?: WeatherType;
  mode?: StadiumMode;
}

export function Parking({ level, position, weather, mode = "match_day" }: ParkingProps) {
  if (level <= 0) return null;
  return <ActiveParking level={level} position={position} weather={weather} mode={mode} />;
}

function ActiveParking({ level, position, weather, mode = "match_day" }: ParkingProps) {
  const isSnow = weather === "snow";
  const isTrainingDay = mode === "training_day";
  const dims = PARKING_DIMS[Math.min(level, 3)];
  const [px, pz] = position;

  const carWidth = 1.6;
  const carDepth = 2.8;
  const padding = 0.4;
  const cols = Math.floor((dims.width - padding * 2) / (carWidth + padding));
  const rows = Math.floor((dims.depth - padding * 2) / (carDepth + padding));
  const totalSlots = cols * rows;
  const carCount = isTrainingDay ? 1 : Math.max(1, Math.floor(totalSlots * 0.75));

  const surface = level === 1
    ? (isSnow ? generateSnowTerrainSurface(Math.max(1, dims.width / 3), Math.max(1, dims.depth / 3)) : generateTerrainSurface("#607746", Math.max(1, dims.width / 3), Math.max(1, dims.depth / 3)))
    : level === 2
      ? generateGravelSurface(Math.max(1, dims.width / 2.5), Math.max(1, dims.depth / 2.5))
      : generateAsphaltSurface(Math.max(1, dims.width / 4), Math.max(1, dims.depth / 4));

  const concreteTex = useMemo(() => generateConcreteTexture("#CBD5E1", 4, 1), []);

  return (
    <group position={[px, 0, pz]}>
      {/* 1. Povrch parkoviště */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[dims.width, dims.depth]} />
        <meshStandardMaterial
          map={surface.map}
          bumpMap={surface.bumpMap}
          bumpScale={level === 1 ? 0.08 : level === 2 ? 0.11 : 0.05}
          roughness={level === 3 ? 0.92 : 0.98}
        />
      </mesh>

      {/* 2. Betonové obrubníky (L2 a L3) */}
      {level >= 2 && (
        <group>
          {[-dims.depth / 2, dims.depth / 2].map((z, i) => (
            <mesh key={`curb-z-${i}`} position={[0, 0.06, z]} castShadow receiveShadow>
              <boxGeometry args={[dims.width, 0.12, 0.2]} />
              <meshStandardMaterial
                map={concreteTex.map}
                bumpMap={concreteTex.bumpMap}
                bumpScale={0.06}
                roughness={0.9}
              />
            </mesh>
          ))}
          {[-dims.width / 2, dims.width / 2].map((x, i) => (
            <mesh key={`curb-x-${i}`} position={[x, 0.06, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.2, 0.12, dims.depth]} />
              <meshStandardMaterial
                map={concreteTex.map}
                bumpMap={concreteTex.bumpMap}
                bumpScale={0.06}
                roughness={0.9}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* 3. Bílé čáry stání */}
      {level >= 2 && (
        <ParkingLines
          cols={cols}
          rows={rows}
          carWidth={carWidth}
          carDepth={carDepth}
          padding={padding}
          dims={dims}
          opacity={level >= 3 ? 0.75 : 0.35}
        />
      )}

      {/* 4. Zaparkovaná auta */}
      <Cars
        count={carCount}
        cols={cols}
        rows={rows}
        carWidth={carWidth}
        carDepth={carDepth}
        padding={padding}
      />

      {/* 5. EV nabíječky na L3 */}
      {level >= 3 && (
        <EVCharger position={[dims.width / 2 - 1.2, 0, -dims.depth / 2 + 1.2]} />
      )}

      {/* 6. Klubový autobus hostů na L3 */}
      {level >= 3 && (
        <ClubBus position={[-dims.width / 2 + 2.0, 0, dims.depth / 2 - 3.2]} />
      )}
    </group>
  );
}

function ParkingLines({
  cols,
  rows,
  carWidth,
  carDepth,
  padding,
  opacity,
}: {
  cols: number;
  rows: number;
  carWidth: number;
  carDepth: number;
  padding: number;
  dims: { width: number; depth: number };
  opacity: number;
}) {
  const totalW = cols * (carWidth + padding) + padding;
  const totalD = rows * (carDepth + padding) + padding;
  const startX = -totalW / 2;

  const lines: Array<{ x: number; z: number }> = [];
  for (let c = 0; c <= cols; c++) {
    lines.push({ x: startX + c * (carWidth + padding) + padding / 2, z: 0 });
  }

  return (
    <group>
      {lines.map((l, i) => (
        <mesh key={i} position={[l.x, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, totalD]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

function Cars({
  count,
  cols,
  rows,
  carWidth,
  carDepth,
  padding,
}: {
  count: number;
  cols: number;
  rows: number;
  carWidth: number;
  carDepth: number;
  padding: number;
}) {
  const cars = useMemo(() => {
    const totalW = cols * (carWidth + padding) + padding;
    const totalD = rows * (carDepth + padding) + padding;
    const startX = -totalW / 2;
    const startZ = -totalD / 2;
    const out: Array<{ x: number; z: number; color: string; type: number }> = [];
    let idx = 0;
    for (let r = 0; r < rows && idx < count; r++) {
      for (let c = 0; c < cols && idx < count; c++) {
        const x = startX + padding + c * (carWidth + padding) + carWidth / 2;
        const z = startZ + padding + r * (carDepth + padding) + carDepth / 2;
        out.push({
          x,
          z,
          color: CAR_COLORS[idx % CAR_COLORS.length],
          type: idx % 3,
        });
        idx++;
      }
    }
    return out;
  }, [count, cols, rows, carWidth, carDepth, padding]);

  if (count === 0) return null;
  return (
    <group>
      {cars.map((c, i) => (
        <Car key={i} position={[c.x, 0, c.z]} color={c.color} type={c.type} />
      ))}
    </group>
  );
}

function Car({ position, color, type }: { position: [number, number, number]; color: string; type: number }) {
  const w = 1.35, d = 2.4;
  const isSuv = type === 1;
  const bodyH = 0.52;
  const cabinH = isSuv ? 0.8 : 0.58;
  const wheelR = 0.22;
  const wheelW = 0.16;

  const cabinZOffset = type === 0 ? -0.15 : type === 2 ? 0.05 : 0;
  const cabinDepth = type === 0 ? d * 0.52 : type === 1 ? d * 0.68 : d * 0.58;

  return (
    <group position={position}>
      {/* Karoserie */}
      <mesh position={[0, wheelR + bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bodyH, d]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>

      {/* Kabina */}
      <mesh position={[0, wheelR + bodyH + cabinH / 2, cabinZOffset]} castShadow>
        <boxGeometry args={[w * 0.9, cabinH, cabinDepth]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>

      {/* Tónovaná okna */}
      <mesh position={[0, wheelR + bodyH + cabinH * 0.55, cabinZOffset + cabinDepth / 2 + 0.005]}>
        <planeGeometry args={[w * 0.75, cabinH * 0.6]} />
        <meshStandardMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
      </mesh>
      <mesh position={[0, wheelR + bodyH + cabinH * 0.55, cabinZOffset - cabinDepth / 2 - 0.005]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w * 0.75, cabinH * 0.6]} />
        <meshStandardMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
      </mesh>
      <mesh position={[w * 0.45 + 0.005, wheelR + bodyH + cabinH * 0.55, cabinZOffset]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[cabinDepth * 0.85, cabinH * 0.6]} />
        <meshStandardMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
      </mesh>
      <mesh position={[-w * 0.45 - 0.005, wheelR + bodyH + cabinH * 0.55, cabinZOffset]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[cabinDepth * 0.85, cabinH * 0.6]} />
        <meshStandardMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
      </mesh>

      {/* 4 Kola */}
      {[
        [-w / 2, d / 2 - 0.4],
        [w / 2, d / 2 - 0.4],
        [-w / 2, -d / 2 + 0.4],
        [w / 2, -d / 2 + 0.4],
      ].map((p, i) => {
        const side = p[0] < 0 ? -1 : 1;
        return (
          <group key={i}>
            <mesh position={[p[0], wheelR, p[1]]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[wheelR, wheelR, wheelW, 12]} />
              <meshStandardMaterial color="#111827" roughness={0.9} />
            </mesh>
            <mesh position={[p[0] + side * (wheelW / 2 + 0.005), wheelR, p[1]]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[wheelR * 0.55, wheelR * 0.55, 0.02, 8]} />
              <meshStandardMaterial color="#94A3B8" metalness={0.8} />
            </mesh>
          </group>
        );
      })}

      {/* Světla */}
      <mesh position={[-w * 0.3, wheelR + bodyH * 0.6, d / 2 + 0.002]}>
        <planeGeometry args={[0.25, 0.15]} />
        <meshStandardMaterial color="#FFFBEB" emissive="#FEF08A" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[w * 0.3, wheelR + bodyH * 0.6, d / 2 + 0.002]}>
        <planeGeometry args={[0.25, 0.15]} />
        <meshStandardMaterial color="#FFFBEB" emissive="#FEF08A" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-w * 0.3, wheelR + bodyH * 0.6, -d / 2 - 0.002]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.25, 0.15]} />
        <meshStandardMaterial color="#DC2626" emissive="#EF4444" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[w * 0.3, wheelR + bodyH * 0.6, -d / 2 - 0.002]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.25, 0.15]} />
        <meshStandardMaterial color="#DC2626" emissive="#EF4444" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function EVCharger({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.4, 1.6, 0.3]} />
        <meshStandardMaterial color="#0F172A" metalness={0.7} />
      </mesh>
      {/* Zelené LED světýlko nabití */}
      <mesh position={[0, 1.2, 0.16]}>
        <circleGeometry args={[0.08, 12]} />
        <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ClubBus({ position }: { position: [number, number, number] }) {
  const busW = 2.2, busH = 2.4, busD = 6.0;
  return (
    <group position={position}>
      {/* Tělo autobusu */}
      <mesh position={[0, busH / 2 + 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[busW, busH, busD]} />
        <meshStandardMaterial color="#1E3A8A" roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Tónovaná okna */}
      <mesh position={[busW / 2 + 0.01, busH * 0.65, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[busD * 0.85, 0.9]} />
        <meshStandardMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
      </mesh>
      <mesh position={[-busW / 2 - 0.01, busH * 0.65, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[busD * 0.85, 0.9]} />
        <meshStandardMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
      </mesh>
      {/* Čelní sklo */}
      <mesh position={[0, busH * 0.65, busD / 2 + 0.01]}>
        <planeGeometry args={[busW * 0.85, 1.0]} />
        <meshStandardMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
      </mesh>
    </group>
  );
}
