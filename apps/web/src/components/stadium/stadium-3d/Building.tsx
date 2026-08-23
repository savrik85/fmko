"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { type TimeOfDay } from "./constants";
import {
  generateWoodTexture,
  generateBrickTexture,
  generateConcreteTexture,
  generateRoofTileTexture,
  generateCorrugatedTexture,
} from "./materialTextures";

export interface BuildingProps {
  kind: "refreshments" | "changing_rooms" | "showers" | "toilets";
  level: number;
  position: [number, number];
  roofColorOverride?: string | null;
  timeOfDay?: TimeOfDay;
}

export function Building({ kind, level, position, roofColorOverride, timeOfDay = "day" }: BuildingProps) {
  if (level <= 0) return null;
  const lvl = Math.min(level, 3);
  const rotationY = position[1] > 0 ? Math.PI : 0;
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotationY, 0]}>
      {kind === "refreshments" && <Refreshments level={lvl} roofColor={roofColorOverride} timeOfDay={timeOfDay} />}
      {kind === "changing_rooms" && <ChangingRooms level={lvl} roofColor={roofColorOverride} timeOfDay={timeOfDay} />}
      {kind === "showers" && <Showers level={lvl} roofColor={roofColorOverride} timeOfDay={timeOfDay} />}
      {kind === "toilets" && <Toilets level={lvl} roofColor={roofColorOverride} timeOfDay={timeOfDay} />}
    </group>
  );
}

// ─── TOALETY (L1 Kadibudka, L2 Zděné, L3 Moderní) ───────────────
function Toilets({ level, roofColor, timeOfDay = "day" }: { level: number; roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  if (level === 1) return <Outhouse roofColor={roofColor} />;
  if (level === 2) return <BrickToilets roofColor={roofColor} timeOfDay={timeOfDay} />;
  return <ModernToilets roofColor={roofColor} timeOfDay={timeOfDay} />;
}

/** L1 Kadibudka — dřevěná budka s vyřezaným srdíčkem */
function Outhouse({ roofColor }: { roofColor?: string | null }) {
  const w = 1.3, h = 2.2, d = 1.3;
  const woodTex = useMemo(() => generateWoodTexture("#85562B", 1, 2), []);
  const roofTex = useMemo(() => generateCorrugatedTexture(roofColor ?? "#4B5563", 2, 1), [roofColor]);

  return (
    <group>
      {/* Dřevěné stěny s texturou */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={woodTex.map}
          bumpMap={woodTex.bumpMap}
          bumpScale={0.1}
          roughness={0.9}
        />
      </mesh>

      {/* Šikmá plechová stříška */}
      <mesh position={[0, h + 0.1, 0.05]} rotation={[0.2, 0, 0]} castShadow>
        <boxGeometry args={[w + 0.3, 0.08, d + 0.3]} />
        <meshStandardMaterial
          map={roofTex.map}
          bumpMap={roofTex.bumpMap}
          bumpScale={0.12}
          roughness={0.6}
          metalness={0.4}
        />
      </mesh>

      {/* Dveře se srdíčkem */}
      <mesh position={[0, h * 0.48, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.65, h * 0.8]} />
        <meshStandardMaterial color="#6B4226" roughness={0.95} />
      </mesh>
      {/* Srdíčko na dveřích */}
      <mesh position={[0, h * 0.72, d / 2 + 0.02]}>
        <circleGeometry args={[0.08, 12]} />
        <meshStandardMaterial color="#2B1A0E" />
      </mesh>
    </group>
  );
}

/** L2 Zděné toalety */
function BrickToilets({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 3.2, h = 2.4, d = 2.4;
  const isNight = timeOfDay === "night";
  const brickTex = useMemo(() => generateBrickTexture("#A3493A", "#D1CCC2", 2, 2), []);
  const roofTex = useMemo(() => generateRoofTileTexture(roofColor ?? "#8B3A2B", 3, 2), [roofColor]);

  return (
    <group>
      {/* Cihlová stavba */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={brickTex.map}
          bumpMap={brickTex.bumpMap}
          bumpScale={0.1}
          roughness={0.9}
        />
      </mesh>

      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={0.9} roofTex={roofTex} />

      {/* Vchody (M/Ž) */}
      <mesh position={[-w * 0.25, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.25, h * 0.7]} />
        <meshStandardMaterial color="#2C3E50" />
      </mesh>
      <mesh position={[w * 0.25, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.25, h * 0.7]} />
        <meshStandardMaterial color="#884444" />
      </mesh>

      {/* Větrací okénko nahoře */}
      <mesh position={[0, h * 0.82, d / 2 + 0.01]}>
        <planeGeometry args={[0.7, 0.25]} />
        <meshStandardMaterial
          color="#9BC4E2"
          emissive={isNight ? "#FFD580" : "#000000"}
          emissiveIntensity={isNight ? 1.2 : 0}
        />
      </mesh>
    </group>
  );
}

/** L3 Moderní toalety s keramickým/kompozitním obkladem */
function ModernToilets({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 4.2, h = 2.8, d = 3.0;
  const isNight = timeOfDay === "night";
  const concreteTex = useMemo(() => generateConcreteTexture("#E2E8F0", 2, 2), []);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={concreteTex.map}
          bumpMap={concreteTex.bumpMap}
          bumpScale={0.05}
          roughness={0.5}
        />
      </mesh>
      {/* Plochá střecha s lemem */}
      <mesh position={[0, h + 0.08, 0]} castShadow>
        <boxGeometry args={[w + 0.3, 0.16, d + 0.3]} />
        <meshStandardMaterial color={roofColor ?? "#334155"} roughness={0.4} />
      </mesh>
      {/* Prosklené světlíky */}
      <mesh position={[0, h * 0.75, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.8, 0.4]} />
        <meshStandardMaterial
          color="#60A5FA"
          emissive={isNight ? "#93C5FD" : "#475569"}
          emissiveIntensity={isNight ? 1.5 : 0.2}
        />
      </mesh>
    </group>
  );
}

// ─── ŠATNY (L1 Srub, L2 Zděné TJ Sokol, L3 Klubové centrum) ─────
function ChangingRooms({ level, roofColor, timeOfDay = "day" }: { level: number; roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  if (level === 1) return <BasicChangingRooms roofColor={roofColor} timeOfDay={timeOfDay} />;
  if (level === 2) return <SolidChangingRooms roofColor={roofColor} timeOfDay={timeOfDay} />;
  return <ModernChangingComplex roofColor={roofColor} timeOfDay={timeOfDay} />;
}

/** L1 Dřevěná klubovna / unimo buňka */
function BasicChangingRooms({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 7.0, h = 2.8, d = 4.5;
  const isNight = timeOfDay === "night";
  const woodTex = useMemo(() => generateWoodTexture("#784C28", 3, 2), []);
  const roofTex = useMemo(() => generateCorrugatedTexture(roofColor ?? "#374151", 4, 2), [roofColor]);

  return (
    <group>
      {/* Dřevěná konstrukce s texturou */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={woodTex.map}
          bumpMap={woodTex.bumpMap}
          bumpScale={0.1}
          roughness={0.9}
        />
      </mesh>

      {/* Sedlová vlnitá střecha */}
      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={1.1} roofTex={roofTex} />

      {/* Dveře do šatny */}
      <mesh position={[-w * 0.22, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.16, h * 0.7]} />
        <meshStandardMaterial color="#3E2723" />
      </mesh>

      {/* Špaletová okénka s teplým světlem v noci */}
      {[-w * 0.02, w * 0.25].map((x, i) => (
        <mesh key={i} position={[x, h * 0.58, d / 2 + 0.01]}>
          <planeGeometry args={[0.9, 0.75]} />
          <meshStandardMaterial
            color={isNight ? "#FEF08A" : "#93C5FD"}
            emissive={isNight ? "#F59E0B" : "#000000"}
            emissiveIntensity={isNight ? 1.4 : 0}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Nástěnka TJ vedle dveří */}
      <mesh position={[-w * 0.4, h * 0.55, d / 2 + 0.02]} castShadow>
        <boxGeometry args={[0.9, 0.7, 0.05]} />
        <meshStandardMaterial color="#D97706" />
      </mesh>
    </group>
  );
}

/** L2 Zděná klubovna TJ Sokol / Slavoj */
function SolidChangingRooms({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 9.0, h = 3.6, d = 5.5;
  const isNight = timeOfDay === "night";
  const brickTex = useMemo(() => generateBrickTexture("#9A4032", "#CDC8BF", 4, 3), []);
  const roofTex = useMemo(() => generateRoofTileTexture(roofColor ?? "#7F2A1E", 5, 3), [roofColor]);

  return (
    <group>
      {/* Cihlová stavba */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={brickTex.map}
          bumpMap={brickTex.bumpMap}
          bumpScale={0.1}
          roughness={0.9}
        />
      </mesh>

      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={1.6} roofTex={roofTex} />

      {/* Vstupní dveře */}
      <mesh position={[0, h * 0.38, d / 2 + 0.01]}>
        <planeGeometry args={[1.4, 2.0]} />
        <meshStandardMaterial color="#1E293B" />
      </mesh>

      {/* Okna se špaletami */}
      {[-3.0, -1.5, 1.5, 3.0].map((x, i) => (
        <mesh key={i} position={[x, h * 0.55, d / 2 + 0.01]}>
          <planeGeometry args={[0.9, 1.1]} />
          <meshStandardMaterial
            color={isNight ? "#FEF08A" : "#BAE6FD"}
            emissive={isNight ? "#F59E0B" : "#000000"}
            emissiveIntensity={isNight ? 1.5 : 0}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Okap a svody na rozích */}
      {[-w / 2, w / 2].map((x, i) => (
        <mesh key={i} position={[x, h / 2, d / 2 + 0.05]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, h, 8]} />
          <meshStandardMaterial color="#64748B" metalness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** L3 Moderní 2-patrové tréninkové a klubové centrum */
function ModernChangingComplex({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 11.0, h = 5.2, d = 6.5;
  const isNight = timeOfDay === "night";
  const concreteTex = useMemo(() => generateConcreteTexture("#F1F5F9", 4, 3), []);

  return (
    <group>
      {/* Hlavní betonová 2-patrová hmota */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={concreteTex.map}
          bumpMap={concreteTex.bumpMap}
          bumpScale={0.06}
          roughness={0.6}
        />
      </mesh>

      {/* Plochá střecha se solárními panely a vzduchotechnikou */}
      <mesh position={[0, h + 0.1, 0]} castShadow>
        <boxGeometry args={[w + 0.4, 0.2, d + 0.4]} />
        <meshStandardMaterial color={roofColor ?? "#1E293B"} roughness={0.4} />
      </mesh>

      {/* Solární panely na střeše */}
      {[-3, 0, 3].map((x, i) => (
        <mesh key={i} position={[x, h + 0.35, 0]} rotation={[0.3, 0, 0]} castShadow>
          <boxGeometry args={[2.2, 0.05, 1.8]} />
          <meshStandardMaterial color="#1E3A8A" metalness={0.9} roughness={0.1} />
        </mesh>
      ))}

      {/* Vzduchotechnika HVAC */}
      <mesh position={[4, h + 0.45, -1.5]} castShadow>
        <boxGeometry args={[1.5, 0.7, 1.2]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.8} />
      </mesh>

      {/* Velkoformátové prosklení v 1. i 2. patře */}
      <mesh position={[0, h * 0.7, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.75, 1.4]} />
        <meshStandardMaterial
          color="#38BDF8"
          emissive={isNight ? "#60A5FA" : "#0284C7"}
          emissiveIntensity={isNight ? 1.6 : 0.25}
          metalness={0.9}
          roughness={0.1}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, h * 0.28, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.5, 1.4]} />
        <meshStandardMaterial
          color="#38BDF8"
          emissive={isNight ? "#60A5FA" : "#0284C7"}
          emissiveIntensity={isNight ? 1.6 : 0.25}
          metalness={0.9}
          roughness={0.1}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ─── OBČERSTVENÍ / HOSPODA (L1 Kiosk, L2 Hospoda, L3 Sports Bar) ──
function Refreshments({ level, roofColor, timeOfDay = "day" }: { level: number; roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  if (level === 1) return <Kiosk roofColor={roofColor} timeOfDay={timeOfDay} />;
  if (level === 2) return <PubBuilding roofColor={roofColor} timeOfDay={timeOfDay} />;
  return <ModernRestaurant roofColor={roofColor} timeOfDay={timeOfDay} />;
}

/** L1 Dřevěný kiosk "U Klobásy" */
function Kiosk({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 4.0, h = 2.6, d = 3.2;
  const isNight = timeOfDay === "night";
  const woodTex = useMemo(() => generateWoodTexture("#92592B", 2, 2), []);
  const roofTex = useMemo(() => generateCorrugatedTexture(roofColor ?? "#B91C1C", 3, 2), [roofColor]);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={woodTex.map}
          bumpMap={woodTex.bumpMap}
          bumpScale={0.1}
          roughness={0.9}
        />
      </mesh>

      {/* Pultová střecha */}
      <mesh position={[0, h + 0.15, 0.1]} rotation={[0.12, 0, 0]} castShadow>
        <boxGeometry args={[w + 0.5, 0.1, d + 0.6]} />
        <meshStandardMaterial
          map={roofTex.map}
          bumpMap={roofTex.bumpMap}
          bumpScale={0.12}
          roughness={0.6}
        />
      </mesh>

      {/* Výdejní okno s výklopnou okenicí */}
      <mesh position={[0, h * 0.52, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.65, 0.9]} />
        <meshStandardMaterial
          color={isNight ? "#FEF08A" : "#1E293B"}
          emissive={isNight ? "#F59E0B" : "#000000"}
          emissiveIntensity={isNight ? 1.6 : 0}
          toneMapped={false}
        />
      </mesh>
      {/* Výdejní pult */}
      <mesh position={[0, h * 0.35, d / 2 + 0.2]} castShadow>
        <boxGeometry args={[w * 0.75, 0.08, 0.35]} />
        <meshStandardMaterial color="#78350F" />
      </mesh>

      {/* Pivní sudy složené vedle stánku */}
      {[-w / 2 - 0.4, -w / 2 - 0.4].map((x, i) => (
        <mesh key={i} position={[x, 0.3 + i * 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.5, 10]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** L2 Autentická zděná vesnická hospoda "Na Hřišti" */
function PubBuilding({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 6.5, h = 3.6, d = 5.2;
  const roofH = 1.8;
  const isNight = timeOfDay === "night";
  const isSunset = timeOfDay === "sunset";
  const glow = isNight ? 1.8 : isSunset ? 0.9 : 0.2;
  const windowColor = isNight || isSunset ? "#FFD060" : "#9BC4E2";

  const brickTex = useMemo(() => generateBrickTexture("#993D2E", "#D4CEC3", 3, 2), []);
  const roofTex = useMemo(() => generateRoofTileTexture(roofColor ?? "#842A1E", 4, 3), [roofColor]);

  return (
    <group>
      {/* Cihlová stavba hospody */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={brickTex.map}
          bumpMap={brickTex.bumpMap}
          bumpScale={0.1}
          roughness={0.9}
        />
      </mesh>

      {/* Sedlová střecha s taškami */}
      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={roofH} roofTex={roofTex} />

      {/* Vchodové dveře */}
      <mesh position={[0, h * 0.38, d / 2 + 0.01]}>
        <planeGeometry args={[1.3, 2.1]} />
        <meshStandardMaterial color="#3B2817" />
      </mesh>

      {/* Osvětlená okna */}
      {[-w * 0.3, w * 0.3].map((x, i) => (
        <mesh key={i} position={[x, h * 0.58, d / 2 + 0.01]}>
          <planeGeometry args={[1.1, 0.9]} />
          <meshStandardMaterial
            color={windowColor}
            emissive="#FFD580"
            emissiveIntensity={glow}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Kouřící komín */}
      <mesh position={[w * 0.25, h + roofH * 0.65, 0]} castShadow>
        <boxGeometry args={[0.7, 1.2, 0.7]} />
        <meshStandardMaterial color="#573D26" />
      </mesh>

      {/* Vývěsní cedule "HOSPODA" */}
      <mesh position={[0, h * 1.05, d / 2 + 0.08]} castShadow>
        <boxGeometry args={[w * 0.45, 0.45, 0.08]} />
        <meshStandardMaterial color="#451A03" />
      </mesh>
    </group>
  );
}

/** L3 Moderní Sports Bar & Restaurant s výhledem na hřiště */
function ModernRestaurant({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 9.5, h = 4.8, d = 6.5;
  const isNight = timeOfDay === "night";
  const concreteTex = useMemo(() => generateConcreteTexture("#1E293B", 3, 3), []);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={concreteTex.map}
          bumpMap={concreteTex.bumpMap}
          bumpScale={0.06}
          roughness={0.4}
        />
      </mesh>

      {/* Terasa a střešní lem */}
      <mesh position={[0, h + 0.1, 0]} castShadow>
        <boxGeometry args={[w + 0.4, 0.2, d + 0.4]} />
        <meshStandardMaterial color={roofColor ?? "#0F172A"} />
      </mesh>

      {/* Panoramatická prosklená fasáda s neonovým leskem */}
      <mesh position={[0, h * 0.55, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.85, h * 0.65]} />
        <meshStandardMaterial
          color="#38BDF8"
          emissive={isNight ? "#60A5FA" : "#0284C7"}
          emissiveIntensity={isNight ? 1.8 : 0.3}
          metalness={0.95}
          roughness={0.05}
          toneMapped={false}
        />
      </mesh>

      {/* Neonový nápis "SPORTS BAR" */}
      <mesh position={[0, h * 0.92, d / 2 + 0.05]}>
        <boxGeometry args={[3.2, 0.3, 0.06]} />
        <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={isNight ? 2.5 : 0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ─── SPRCHY (L1 Plechové, L2 Zděné, L3 Wellness) ────────────────
function Showers({ level, roofColor, timeOfDay = "day" }: { level: number; roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  if (level === 1) return <BasicShowerHouse roofColor={roofColor} timeOfDay={timeOfDay} />;
  if (level === 2) return <SolidShowerHouse roofColor={roofColor} timeOfDay={timeOfDay} />;
  return <ModernShowerHouse roofColor={roofColor} timeOfDay={timeOfDay} />;
}

function BasicShowerHouse({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 4.2, h = 2.6, d = 3.2;
  const woodTex = useMemo(() => generateWoodTexture("#6B4D2B", 2, 2), []);
  const roofTex = useMemo(() => generateCorrugatedTexture(roofColor ?? "#475569", 3, 2), [roofColor]);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={woodTex.map}
          bumpMap={woodTex.bumpMap}
          bumpScale={0.08}
          roughness={0.85}
        />
      </mesh>
      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={1.0} roofTex={roofTex} />
      {/* Vchody */}
      <mesh position={[-w * 0.22, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.18, h * 0.7]} />
        <meshStandardMaterial color="#1E3A8A" />
      </mesh>
      <mesh position={[w * 0.22, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.18, h * 0.7]} />
        <meshStandardMaterial color="#991B1B" />
      </mesh>
    </group>
  );
}

function SolidShowerHouse({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 5.2, h = 3.0, d = 4.0;
  const brickTex = useMemo(() => generateBrickTexture("#9A4032", "#D1CCC2", 3, 2), []);
  const roofTex = useMemo(() => generateRoofTileTexture(roofColor ?? "#7F2A1E", 3, 2), [roofColor]);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={brickTex.map}
          bumpMap={brickTex.bumpMap}
          bumpScale={0.1}
          roughness={0.9}
        />
      </mesh>
      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={1.2} roofTex={roofTex} />
      <mesh position={[-w * 0.22, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[0.9, 1.8]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[w * 0.22, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[0.9, 1.8]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
    </group>
  );
}

function ModernShowerHouse({ roofColor, timeOfDay = "day" }: { roofColor?: string | null; timeOfDay?: TimeOfDay }) {
  const w = 6.0, h = 3.4, d = 4.5;
  const isNight = timeOfDay === "night";
  const concreteTex = useMemo(() => generateConcreteTexture("#F8FAFC", 3, 2), []);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          map={concreteTex.map}
          bumpMap={concreteTex.bumpMap}
          bumpScale={0.05}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, h + 0.1, 0]} castShadow>
        <boxGeometry args={[w + 0.4, 0.2, d + 0.4]} />
        <meshStandardMaterial color={roofColor ?? "#1E293B"} />
      </mesh>
      {/* Wellness modré sklo */}
      <mesh position={[0, h * 0.6, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.7, 1.2]} />
        <meshStandardMaterial
          color="#38BDF8"
          emissive={isNight ? "#60A5FA" : "#0284C7"}
          emissiveIntensity={isNight ? 1.5 : 0.3}
          metalness={0.9}
          roughness={0.1}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Pomocná sedlová střecha s texturou */
function SaddleRoof({
  width,
  depth,
  baseY,
  roofHeight,
  roofTex,
  color = "#8B3A2B",
}: {
  width: number;
  depth: number;
  baseY: number;
  roofHeight: number;
  roofTex?: any;
  color?: string;
}) {
  const overhang = 0.3;
  const w = width + overhang * 2;
  const d = depth + overhang * 2;

  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(0, roofHeight);
    shape.lineTo(w / 2, 0);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: d,
      bevelEnabled: false,
    });
  }, [w, d, roofHeight]);

  return (
    <mesh
      geometry={geom}
      position={[0, baseY, -d / 2]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        map={roofTex?.map}
        bumpMap={roofTex?.bumpMap}
        bumpScale={0.1}
        color={roofTex ? undefined : color}
        roughness={0.7}
      />
    </mesh>
  );
}
