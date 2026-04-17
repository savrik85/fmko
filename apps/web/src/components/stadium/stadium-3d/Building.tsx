"use client";

import { BUILDING_COLORS, BUILDING_DIMS } from "./constants";

type BuildingKind = "changing_rooms" | "showers" | "refreshments";

interface BuildingProps {
  kind: BuildingKind;
  level: number;
  position: [number, number];
}

export function Building({ kind, level, position }: BuildingProps) {
  if (level <= 0) return null;
  const lvl = Math.min(level, 3);
  return (
    <group position={[position[0], 0, position[1]]}>
      {kind === "refreshments" && <Refreshments level={lvl} />}
      {kind === "changing_rooms" && <ChangingRooms level={lvl} />}
      {kind === "showers" && <Showers level={lvl} />}
    </group>
  );
}

// ─── OBČERSTVENÍ — pivní stan / karavan / hospůdka ───────────────
function Refreshments({ level }: { level: number }) {
  if (level === 1) return <BeerTent />;
  if (level === 2) return <Caravan />;
  return <PubBuilding />;
}

function BeerTent() {
  // Pivní stan z bazaru — barevný stan trojúhelníkový s "barem" vepředu
  const tentH = 2.8;
  return (
    <group>
      {/* Stan jako trojúhelníkový hranol */}
      <mesh position={[0, tentH / 2, 0]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 2, tentH, 4, 1]} />
        <meshStandardMaterial color="#C13A3A" roughness={0.7} />
      </mesh>
      {/* Bar vepředu */}
      <mesh position={[0, 0.6, 1.6]} castShadow>
        <boxGeometry args={[3, 1.2, 0.6]} />
        <meshStandardMaterial color="#8B5A2B" roughness={0.85} />
      </mesh>
      {/* Sud na zemi */}
      <mesh position={[-1.5, 0.5, 0.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.8, 12]} />
        <meshStandardMaterial color="#5C3A1E" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Caravan() {
  // Karavan na kolech — protáhlý box s okny
  const w = 4.5, h = 2.2, d = 2;
  return (
    <group>
      {/* Tělo karavanu */}
      <mesh position={[0, 0.6 + h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#E0C76A" roughness={0.5} />
      </mesh>
      {/* Pásek nad oken (typicky barevný retro) */}
      <mesh position={[0, 0.6 + h * 0.85, d / 2 + 0.005]}>
        <planeGeometry args={[w * 0.95, h * 0.15]} />
        <meshStandardMaterial color="#B8323F" />
      </mesh>
      {/* Okno servírovací (otevřené - tmavý průchod) */}
      <mesh position={[0, 0.6 + h * 0.55, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.5, h * 0.4]} />
        <meshStandardMaterial color="#2A2A2A" />
      </mesh>
      {/* Pultík vepředu */}
      <mesh position={[0, 0.6 + h * 0.35, d / 2 + 0.4]}>
        <boxGeometry args={[w * 0.5, 0.1, 0.8]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      {/* 4 kola */}
      {[[-w / 2 + 0.6, -d / 2 + 0.4], [w / 2 - 0.6, -d / 2 + 0.4], [-w / 2 + 0.6, d / 2 - 0.4], [w / 2 - 0.6, d / 2 - 0.4]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.4, p[1]]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.25, 12]} />
          <meshStandardMaterial color="#1A1A1A" />
        </mesh>
      ))}
      {/* Tažné oje vpředu */}
      <mesh position={[w / 2 + 0.4, 0.5, 0]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.8, 6]} />
        <meshStandardMaterial color="#525252" />
      </mesh>
    </group>
  );
}

function PubBuilding() {
  // Hospůdka — větší budova s komínem a cedulí
  const w = 6, h = 3.5, d = 5;
  const roofH = 1.8;
  return (
    <group>
      {/* Hlavní budova */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#F5E6C8" roughness={0.85} />
      </mesh>
      {/* Sedlová střecha */}
      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={roofH} color="#8B3A2B" />
      {/* Dveře */}
      <mesh position={[0, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.2, h * 0.7]} />
        <meshStandardMaterial color="#3B2817" />
      </mesh>
      {/* Okna */}
      <mesh position={[-w * 0.3, h * 0.6, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.18, h * 0.3]} />
        <meshStandardMaterial color="#9BC4E2" emissive="#FFD580" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[w * 0.3, h * 0.6, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.18, h * 0.3]} />
        <meshStandardMaterial color="#9BC4E2" emissive="#FFD580" emissiveIntensity={0.3} />
      </mesh>
      {/* Komín */}
      <mesh position={[w * 0.25, h + roofH * 0.7, 0]} castShadow>
        <boxGeometry args={[0.6, 1.2, 0.6]} />
        <meshStandardMaterial color="#8B7256" />
      </mesh>
      {/* Cedule "Hospoda" */}
      <mesh position={[0, h * 1.05, d / 2 + 0.05]} castShadow>
        <boxGeometry args={[w * 0.5, 0.5, 0.08]} />
        <meshStandardMaterial color="#5C3A1E" />
      </mesh>
      {/* Pivní zahrádka — stoly vepředu */}
      <mesh position={[-w * 0.35, 0.4, d / 2 + 1.2]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.8]} />
        <meshStandardMaterial color="#A0826D" />
      </mesh>
      <mesh position={[w * 0.35, 0.4, d / 2 + 1.2]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.8]} />
        <meshStandardMaterial color="#A0826D" />
      </mesh>
    </group>
  );
}

// ─── ŠATNY ─────────────────────────────────────────────────
function ChangingRooms({ level }: { level: number }) {
  if (level === 1) return <SmallShed />;       // Bouda s lavicí
  if (level === 2) return <BasicCabin />;      // Šatna se skříňkami
  return <ModernChangingRooms />;              // Moderní s vyhříváním
}

function SmallShed() {
  const w = 3, h = 2, d = 2.5;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#A98B6F" roughness={0.95} />
      </mesh>
      {/* Plochá střecha mírně přečnívající */}
      <mesh position={[0, h + 0.05, 0]} castShadow>
        <boxGeometry args={[w + 0.4, 0.1, d + 0.4]} />
        <meshStandardMaterial color="#5C3A1E" />
      </mesh>
      {/* Dveře */}
      <mesh position={[0, h * 0.45, d / 2 + 0.01]}>
        <planeGeometry args={[0.7, h * 0.85]} />
        <meshStandardMaterial color="#3B2817" />
      </mesh>
      {/* Lavice u zdi */}
      <mesh position={[0, 0.3, -d / 2 - 0.4]} castShadow>
        <boxGeometry args={[w * 0.8, 0.15, 0.3]} />
        <meshStandardMaterial color="#8B6F47" />
      </mesh>
    </group>
  );
}

function BasicCabin() {
  const w = 4.5, h = 2.6, d = 3.5;
  const roofH = 1.2;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#E8DCC4" roughness={0.85} />
      </mesh>
      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={roofH} color="#A0432C" />
      {/* Dveře */}
      <mesh position={[0, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.22, h * 0.7]} />
        <meshStandardMaterial color="#3B2817" />
      </mesh>
      {/* 2 okna */}
      <mesh position={[-w * 0.3, h * 0.6, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.18, h * 0.3]} />
        <meshStandardMaterial color="#9BC4E2" emissive="#9BC4E2" emissiveIntensity={0.1} />
      </mesh>
      <mesh position={[w * 0.3, h * 0.6, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.18, h * 0.3]} />
        <meshStandardMaterial color="#9BC4E2" emissive="#9BC4E2" emissiveIntensity={0.1} />
      </mesh>
    </group>
  );
}

function ModernChangingRooms() {
  const w = 6, h = 3, d = 4.5;
  return (
    <group>
      {/* Hlavní část — moderní plochá střecha */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#D6CFC2" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Plochá střecha s lehkým přesahem */}
      <mesh position={[0, h + 0.1, 0]} castShadow>
        <boxGeometry args={[w + 0.5, 0.2, d + 0.5]} />
        <meshStandardMaterial color="#374151" roughness={0.7} />
      </mesh>
      {/* Velká okenní výplň (moderní design) */}
      <mesh position={[0, h * 0.55, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.7, h * 0.5]} />
        <meshStandardMaterial color="#5588A8" emissive="#9BC4E2" emissiveIntensity={0.25} metalness={0.5} roughness={0.2} />
      </mesh>
      {/* Vchodové dveře (skleněné dvojité) */}
      <mesh position={[0, h * 0.25, d / 2 + 0.02]}>
        <planeGeometry args={[w * 0.25, h * 0.45]} />
        <meshStandardMaterial color="#2A2A2A" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Akcent — barevný vodorovný pruh */}
      <mesh position={[0, h * 0.8, d / 2 + 0.005]}>
        <planeGeometry args={[w * 0.95, 0.15]} />
        <meshStandardMaterial color="#E63946" />
      </mesh>
    </group>
  );
}

// ─── SPRCHY ─────────────────────────────────────────────────
function Showers({ level }: { level: number }) {
  if (level === 1) return <HoseStand />;
  if (level === 2) return <BasicShowerHouse />;
  return <ModernShowerHouse />;
}

function HoseStand() {
  // Hadice na dvoře — sloupek se sprchovou hlavicí
  return (
    <group>
      {/* Sloupek */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 2.4, 8]} />
        <meshStandardMaterial color="#525252" metalness={0.6} />
      </mesh>
      {/* Sprcha nahoře */}
      <mesh position={[0, 2.4, 0.2]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.3]} />
        <meshStandardMaterial color="#7A7A7A" metalness={0.7} />
      </mesh>
      {/* Hadice spletená u země */}
      <mesh position={[0.3, 0.1, 0.3]} castShadow>
        <torusGeometry args={[0.4, 0.05, 6, 16]} />
        <meshStandardMaterial color="#3F3F46" />
      </mesh>
      {/* Betonový základek */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.1, 12]} />
        <meshStandardMaterial color="#9CA3AF" />
      </mesh>
    </group>
  );
}

function BasicShowerHouse() {
  const w = 4, h = 2.5, d = 3;
  const roofH = 1;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#D0DEE6" roughness={0.7} />
      </mesh>
      <SaddleRoof width={w} depth={d} baseY={h} roofHeight={roofH} color="#3B6B8C" />
      {/* Vchody — dvě dvířka (M/Ž) */}
      <mesh position={[-w * 0.22, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.18, h * 0.7]} />
        <meshStandardMaterial color="#3B6B8C" />
      </mesh>
      <mesh position={[w * 0.22, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.18, h * 0.7]} />
        <meshStandardMaterial color="#A03A4C" />
      </mesh>
      {/* Větráček nahoře */}
      <mesh position={[0, h * 0.85, d / 2 + 0.01]}>
        <circleGeometry args={[0.25, 12]} />
        <meshStandardMaterial color="#525252" />
      </mesh>
    </group>
  );
}

function ModernShowerHouse() {
  const w = 5, h = 3, d = 4;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#F5F8FA" roughness={0.5} metalness={0.15} />
      </mesh>
      {/* Plochá střecha s lehkým přesahem */}
      <mesh position={[0, h + 0.1, 0]} castShadow>
        <boxGeometry args={[w + 0.4, 0.2, d + 0.4]} />
        <meshStandardMaterial color="#3B6B8C" />
      </mesh>
      {/* Modré sklo (relax/wellness vibe) */}
      <mesh position={[0, h * 0.55, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.7, h * 0.45]} />
        <meshStandardMaterial color="#5BA9D6" emissive="#9BC4E2" emissiveIntensity={0.3} metalness={0.6} roughness={0.2} />
      </mesh>
      {/* Vchod */}
      <mesh position={[0, h * 0.2, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.2, h * 0.4]} />
        <meshStandardMaterial color="#2A2A2A" metalness={0.5} />
      </mesh>
      {/* Solární panel na střeše */}
      <mesh position={[0, h + 0.25, 0]} rotation={[-Math.PI / 8, 0, 0]} castShadow>
        <boxGeometry args={[w * 0.6, 0.05, d * 0.5]} />
        <meshStandardMaterial color="#1A2842" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ─── REUSABLE: sedlová střecha ──────────────────────────────
function SaddleRoof({
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
  const slopeLength = Math.sqrt((width / 2) ** 2 + roofHeight ** 2);
  const angle = Math.atan2(roofHeight, width / 2);
  return (
    <group position={[0, baseY, 0]}>
      <mesh position={[-width / 4, roofHeight / 2, 0]} rotation={[0, 0, angle]} castShadow>
        <boxGeometry args={[slopeLength, 0.15, depth + 0.4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[width / 4, roofHeight / 2, 0]} rotation={[0, 0, -angle]} castShadow>
        <boxGeometry args={[slopeLength, 0.15, depth + 0.4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Štíty (tenký box jako trojúhelník-substitut) */}
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
