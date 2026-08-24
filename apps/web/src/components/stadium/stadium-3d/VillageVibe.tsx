"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PITCH, type TimeOfDay, type WeatherType } from "./constants";
import { generateGravelSurface } from "./grassTexture";

interface VillageVibeProps {
  timeOfDay: TimeOfDay;
  pubPosition?: [number, number];
  changingRoomsPosition?: [number, number];
  isMobile?: boolean;
  weather?: WeatherType;
}

const HALF_W = PITCH.width / 2;
const HALF_D = PITCH.depth / 2;

export function VillageVibe({
  timeOfDay,
  pubPosition = [25, 34],
  changingRoomsPosition = [-25, -34],
  isMobile = false,
  weather = "sunny",
}: VillageVibeProps) {
  const isSnow = weather === "snow";
  // Bezpečné souřadnice mimo hrací plochu (hřiště končí na X = ±20, Z = ±30)
  const pubX = pubPosition[0];
  const pubZ = pubPosition[1];
  const crX = changingRoomsPosition[0];
  const crZ = changingRoomsPosition[1];

  return (
    <group>
      {/* 1. Dřevěné pivní sety a slunečník na travnaté terase vedle hospůdky */}
      <BeerGarden position={[pubX + 5.5, 0, pubZ + 0.5]} isMobile={isMobile} isSnow={isSnow} />

      {/* 2. Kouřící gril na klobásy vedle vchodu do hospůdky */}
      <SausageGrill position={[pubX + 1.2, 0, pubZ - 2.8]} />

      {/* 3. Stojan na jízdní kola */}
      <BicycleStand position={[pubX + 5.5, 0, pubZ - 3.2]} isSnow={isSnow} />

      {/* 4. Sekačka na trávu u šaten / hospodářského rohu */}
      <LawnMower position={[crX - 3.5, 0, crZ + 1.2]} />

      {/* 5. Obvodové zábradlí hřiště (krakorce s trubkou) */}
      <PitchPerimeterRailing isMobile={isMobile} />

      {/* 6. Fanoušci stojící u klandru (podél zábradlí) */}
      <RailSpectators isMobile={isMobile} />

      {/* 7. Reklamní cedule místních sponzorů na zábradlí */}
      <RailSponsorBanners />

      {/* 8. Obecní rozhlas (amplion) na sloupu */}
      <VillageLoudspeaker position={[crX + 3.5, 0, -31.5]} />

      {/* 9. Dlážděné / šotolinové obvodové chodníčky */}
      <Walkways pubPos={pubPosition} crPos={changingRoomsPosition} isSnow={isSnow} />
    </group>
  );
}

/** Hospodská zahrádka: pivní sety, piva a slunečník */
function BeerGarden({ position, isMobile, isSnow = false }: { position: [number, number, number]; isMobile: boolean; isSnow?: boolean }) {
  const gravelSurface = useMemo(() => generateGravelSurface(3, 2.5), []);

  return (
    <group position={position}>
      {/* Šotolinový / dlážděný podklad pod stoly */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[7.2, 5.8]} />
        <meshStandardMaterial
          map={gravelSurface.map}
          bumpMap={gravelSurface.bumpMap}
          bumpScale={0.08}
          roughness={0.97}
          color={isSnow ? "#E2E8F0" : "#FFFFFF"}
        />
      </mesh>

      {/* 2-3 Pivní sety (stůl + 2 lavice) */}
      <BeerTableSet position={[-1.5, 0, -1.2]} rotationY={0.06} isSnow={isSnow} />
      <BeerTableSet position={[-1.5, 0, 1.2]} rotationY={-0.05} isSnow={isSnow} />
      {!isMobile && <BeerTableSet position={[1.7, 0, 0]} rotationY={Math.PI / 2} isSnow={isSnow} />}

      {/* Velký hospodský slunečník */}
      <BeerUmbrella position={[0.2, 0, 0]} color={isSnow ? "#CBD5E1" : "#1E3A2B"} accentColor={isSnow ? "#F8FAFC" : "#F59E0B"} isSnow={isSnow} />
    </group>
  );
}

/** Jeden pivní set: stůl + 2 lavice + 2 půllitry piva */
function BeerTableSet({ position, rotationY, isSnow = false }: { position: [number, number, number]; rotationY: number; isSnow?: boolean }) {
  const tableW = 2.2, tableD = 0.7, tableH = 0.75;
  const benchW = 2.2, benchD = 0.3, benchH = 0.45;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Stůl - dřevěná deska */}
      <mesh position={[0, tableH, 0]} castShadow receiveShadow>
        <boxGeometry args={[tableW, 0.05, tableD]} />
        <meshStandardMaterial color="#8B5A2B" roughness={0.85} />
      </mesh>
      {/* Sníh na stole */}
      {isSnow && (
        <mesh position={[0, tableH + 0.03, 0]} castShadow>
          <boxGeometry args={[tableW + 0.02, 0.02, tableD + 0.02]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.9} />
        </mesh>
      )}
      {/* Nohy stolu (zelená ocel) */}
      {[-tableW / 2 + 0.2, tableW / 2 - 0.2].map((x, i) => (
        <mesh key={`tleg-${i}`} position={[x, tableH / 2, 0]} castShadow>
          <boxGeometry args={[0.06, tableH, tableD * 0.8]} />
          <meshStandardMaterial color="#1E3A2B" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}

      {/* Lavice 1 */}
      <mesh position={[0, benchH, -tableD / 2 - 0.35]} castShadow receiveShadow>
        <boxGeometry args={[benchW, 0.04, benchD]} />
        <meshStandardMaterial color="#8B5A2B" roughness={0.85} />
      </mesh>
      {isSnow && (
        <mesh position={[0, benchH + 0.025, -tableD / 2 - 0.35]} castShadow>
          <boxGeometry args={[benchW + 0.02, 0.02, benchD + 0.02]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.9} />
        </mesh>
      )}
      {[-benchW / 2 + 0.2, benchW / 2 - 0.2].map((x, i) => (
        <mesh key={`bleg1-${i}`} position={[x, benchH / 2, -tableD / 2 - 0.35]} castShadow>
          <boxGeometry args={[0.05, benchH, benchD * 0.8]} />
          <meshStandardMaterial color="#1E3A2B" />
        </mesh>
      ))}

      {/* Lavice 2 */}
      <mesh position={[0, benchH, tableD / 2 + 0.35]} castShadow receiveShadow>
        <boxGeometry args={[benchW, 0.04, benchD]} />
        <meshStandardMaterial color="#8B5A2B" roughness={0.85} />
      </mesh>
      {isSnow && (
        <mesh position={[0, benchH + 0.025, tableD / 2 + 0.35]} castShadow>
          <boxGeometry args={[benchW + 0.02, 0.02, benchD + 0.02]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.9} />
        </mesh>
      )}
      {[-benchW / 2 + 0.2, benchW / 2 - 0.2].map((x, i) => (
        <mesh key={`bleg2-${i}`} position={[x, benchH / 2, tableD / 2 + 0.35]} castShadow>
          <boxGeometry args={[0.05, benchH, benchD * 0.8]} />
          <meshStandardMaterial color="#1E3A2B" />
        </mesh>
      ))}

      {/* Půllitry s pivem */}
      <mesh position={[-0.4, tableH + 0.1, 0.1]} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.16, 8]} />
        <meshStandardMaterial color="#D97706" transparent opacity={0.85} roughness={0.2} />
      </mesh>
      {/* Pěna */}
      <mesh position={[-0.4, tableH + 0.19, 0.1]}>
        <cylinderGeometry args={[0.062, 0.062, 0.04, 8]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.6} />
      </mesh>

      <mesh position={[0.4, tableH + 0.1, -0.1]} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.16, 8]} />
        <meshStandardMaterial color="#D97706" transparent opacity={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[0.4, tableH + 0.19, -0.1]}>
        <cylinderGeometry args={[0.062, 0.062, 0.04, 8]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Velký zahradní slunečník */
function BeerUmbrella({ position, color, accentColor, isSnow = false }: { position: [number, number, number]; color: string; accentColor: string; isSnow?: boolean }) {
  const poleH = 2.8;
  const umbrellaR = 2.4;

  return (
    <group position={position}>
      {/* Litinová těžká základna */}
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.5, 0.12, 12]} />
        <meshStandardMaterial color="#1F2937" metalness={0.8} />
      </mesh>
      {/* Středová tyč */}
      <mesh position={[0, poleH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, poleH, 8]} />
        <meshStandardMaterial color="#D1D5DB" metalness={0.7} />
      </mesh>
      {/* Plachta slunečníku (šestiboký kužel) */}
      <mesh position={[0, poleH + 0.4, 0]} castShadow>
        <coneGeometry args={[umbrellaR, 0.8, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Sníh na špičce slunečníku */}
      {isSnow && (
        <mesh position={[0, poleH + 0.5, 0]} castShadow>
          <coneGeometry args={[umbrellaR * 0.7, 0.6, 8]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.9} />
        </mesh>
      )}
      {/* Lem / pruh v akcentní barvě */}
      <mesh position={[0, poleH + 0.02, 0]}>
        <cylinderGeometry args={[umbrellaR + 0.02, umbrellaR + 0.02, 0.1, 8, 1, true]} />
        <meshStandardMaterial color={accentColor} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Gril na klobásy s animovaným stoupajícím kouřem */
function SausageGrill({ position }: { position: [number, number, number]; }) {
  const smokePuffs = useRef<THREE.Group>(null);

  // Animace stoupajících obláčků kouře
  useFrame(({ clock }) => {
    if (!smokePuffs.current) return;
    const t = clock.elapsedTime;
    smokePuffs.current.children.forEach((child, i) => {
      const offset = i * 0.8;
      const progress = ((t * 0.8 + offset) % 2.5) / 2.5; // 0..1
      child.position.y = progress * 2.2;
      child.position.x = Math.sin(t * 1.5 + i) * 0.15 * progress;
      child.position.z = Math.cos(t * 1.2 + i) * 0.15 * progress;
      const scale = (0.2 + progress * 0.6);
      child.scale.set(scale, scale, scale);
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = (1 - progress) * 0.4;
      }
    });
  });

  return (
    <group position={position}>
      {/* Tělo grilu (černý válec na nožičkách) */}
      <mesh position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.35, 0.35, 1.1, 12]} />
        <meshStandardMaterial color="#1F2937" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* Nožky grilu */}
      {[-0.4, 0.4].map((x, i) => (
        <mesh key={i} position={[x, 0.45, 0]} rotation={[0, 0, (i === 0 ? 0.15 : -0.15)]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.9, 6]} />
          <meshStandardMaterial color="#374151" metalness={0.8} />
        </mesh>
      ))}
      {/* Komínek na boku */}
      <mesh position={[0.4, 1.35, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.6, 8]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      {/* Částice kouře stoupající z komínku */}
      <group ref={smokePuffs} position={[0.4, 1.65, 0]}>
        {Array.from({ length: 4 }).map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.2, 6, 6]} />
            <meshBasicMaterial color="#E5E7EB" transparent opacity={0.35} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Stojan na jízdní kola s opřenými koly */
function BicycleStand({ position, isSnow = false }: { position: [number, number, number]; isSnow?: boolean }) {
  return (
    <group position={position} rotation={[0, 0.3, 0]}>
      {/* Spodní ocelová konstrukce stojanu */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[3.2, 0.4, 0.7]} />
        <meshStandardMaterial color="#4B5563" metalness={0.7} roughness={0.4} />
      </mesh>
      {isSnow && (
        <mesh position={[0, 0.41, 0]} castShadow>
          <boxGeometry args={[3.25, 0.03, 0.75]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.9} />
        </mesh>
      )}

      {/* 3 Zaparkovaná kola různých barev */}
      <Bicycle position={[-0.8, 0, 0]} color="#EF4444" />
      <Bicycle position={[0.1, 0, 0]} color="#3B82F6" />
      <Bicycle position={[0.9, 0, 0]} color="#10B981" />
    </group>
  );
}

/** 3D model jízdního kola */
function Bicycle({ position, color }: { position: [number, number, number]; color: string }) {
  const wheelR = 0.35;
  const bikeLen = 1.4;

  return (
    <group position={position} rotation={[0, 0, 0.05]}>
      {/* Přední a zadní kolo */}
      <mesh position={[0, wheelR, bikeLen / 2]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[wheelR, 0.025, 6, 16]} />
        <meshStandardMaterial color="#111827" metalness={0.8} />
      </mesh>
      <mesh position={[0, wheelR, -bikeLen / 2]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[wheelR, 0.025, 6, 16]} />
        <meshStandardMaterial color="#111827" metalness={0.8} />
      </mesh>

      {/* Rám kola (trojúhelník) */}
      <mesh position={[0, wheelR + 0.25, 0]} rotation={[0.4, 0, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.9, 6]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, wheelR + 0.25, 0]} rotation={[-0.4, 0, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.9, 6]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Sedlo */}
      <mesh position={[0, wheelR + 0.52, -0.2]} castShadow>
        <boxGeometry args={[0.12, 0.04, 0.22]} />
        <meshStandardMaterial color="#1F2937" />
      </mesh>

      {/* Řídítka */}
      <mesh position={[0, wheelR + 0.6, bikeLen / 2 - 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.45, 6]} />
        <meshStandardMaterial color="#D1D5DB" metalness={0.8} />
      </mesh>
    </group>
  );
}

/** Zahradní traktor / sekačka na trávu u hřiště */
function LawnMower({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, 0.6, 0]}>
      {/* Tělo sekačky */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.45, 1.7]} />
        <meshStandardMaterial color="#15803D" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Sedadlo řidiče */}
      <mesh position={[0, 0.75, -0.25]} castShadow>
        <boxGeometry args={[0.5, 0.35, 0.45]} />
        <meshStandardMaterial color="#1F2937" />
      </mesh>

      {/* Žlutý volant */}
      <mesh position={[0, 0.85, 0.25]} rotation={[0.4, 0, 0]} castShadow>
        <torusGeometry args={[0.15, 0.02, 6, 12]} />
        <meshStandardMaterial color="#FACC15" />
      </mesh>

      {/* 4 Kola */}
      {[[-0.55, 0.6], [0.55, 0.6], [-0.55, -0.6], [0.55, -0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.25, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.25, 0.25, 0.2, 10]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}

      {/* Žací ústrojí dole */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[1.2, 0.15, 0.8]} />
        <meshStandardMaterial color="#374151" metalness={0.6} />
      </mesh>
    </group>
  );
}

/** Vstupní pokladna ("Vstupné 30 Kč") u brány */
function TicketBooth({ position }: { position: [number, number, number] }) {
  const boothW = 2.2, boothH = 2.5, boothD = 1.8;

  const signTex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#1E3A8A";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#FACC15";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 42px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("POKLADNA", canvas.width / 2, 45);

    ctx.fillStyle = "#FACC15";
    ctx.font = "bold 32px Arial, sans-serif";
    ctx.fillText("VSTUPNÉ 30 Kč", canvas.width / 2, 105);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  return (
    <group position={position}>
      {/* Dřevěná / plechová budka */}
      <mesh position={[0, boothH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[boothW, boothH, boothD]} />
        <meshStandardMaterial color="#92400E" roughness={0.9} />
      </mesh>

      {/* Pultová stříška */}
      <mesh position={[0, boothH + 0.1, 0.1]} rotation={[0.1, 0, 0]} castShadow>
        <boxGeometry args={[boothW + 0.4, 0.1, boothD + 0.4]} />
        <meshStandardMaterial color="#475569" roughness={0.7} />
      </mesh>

      {/* Výdejní okénko s pultíkem */}
      <mesh position={[0, boothH * 0.55, boothD / 2 + 0.01]}>
        <planeGeometry args={[1.0, 0.8]} />
        <meshStandardMaterial color="#1E293B" />
      </mesh>
      <mesh position={[0, boothH * 0.35, boothD / 2 + 0.2]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.35]} />
        <meshStandardMaterial color="#D97706" />
      </mesh>

      {/* Cedule s nápisem */}
      {signTex && (
        <mesh position={[0, boothH * 0.85, boothD / 2 + 0.02]} castShadow>
          <planeGeometry args={[1.6, 0.5]} />
          <meshBasicMaterial map={signTex} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Obvodové bílo-zelené trubkové zábradlí podél hřiště */
function PitchPerimeterRailing({ isMobile }: { isMobile: boolean }) {
  const railH = 1.05;
  const padX = HALF_W + 1.6;
  const padZ = HALF_D + 1.6;

  // Zábradlí běží okolo hřiště
  return (
    <group>
      {/* Východní zábradlí (x = +padX) */}
      <RailingLine start={[padX, 0, -padZ]} end={[padX, 0, padZ]} height={railH} postSpacing={isMobile ? 8 : 4} />
      {/* Západní zábradlí (x = -padX, vynecháno u střídaček) */}
      <RailingLine start={[-padX, 0, -padZ]} end={[-padX, 0, -12]} height={railH} postSpacing={isMobile ? 8 : 4} />
      <RailingLine start={[-padX, 0, 12]} end={[-padX, 0, padZ]} height={railH} postSpacing={isMobile ? 8 : 4} />
    </group>
  );
}

function RailingLine({
  start,
  end,
  height,
  postSpacing = 4,
}: {
  start: [number, number, number];
  end: [number, number, number];
  height: number;
  postSpacing: number;
}) {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const postCount = Math.max(2, Math.floor(len / postSpacing));

  return (
    <group position={[(start[0] + end[0]) / 2, 0, (start[2] + end[2]) / 2]} rotation={[0, -angle, 0]}>
      {/* Horní trubka (bílá) */}
      <mesh position={[0, height, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, len, 8]} />
        <meshStandardMaterial color="#F3F4F6" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Sloupky do země (zelené krakorce) */}
      {Array.from({ length: postCount }).map((_, i) => {
        const x = -len / 2 + (len / (postCount - 1)) * i;
        return (
          <mesh key={i} position={[x, height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, height, 6]} />
            <meshStandardMaterial color="#166534" metalness={0.6} roughness={0.4} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Chodníky propojující areál podél obvodu (nikdy nekříží hřiště) */
function Walkways({
  pubPos,
  crPos,
  isSnow = false,
}: {
  pubPos: [number, number];
  crPos: [number, number];
  isSnow?: boolean;
}) {
  const gravelSurface = useMemo(() => generateGravelSurface(1.5, 9), []);

  const pubX = pubPos[0];
  const pubZ = pubPos[1];
  const crX = crPos[0];
  const crZ = crPos[1];

  const eastLength = Math.abs(pubZ - crZ);
  const southLength = Math.abs(pubX - crX);

  return (
    <group position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Východní obvodová cesta (podél postranní čáry k hospůdce) */}
      <mesh position={[pubX, -(crZ + pubZ) / 2, 0]}>
        <planeGeometry args={[2.0, eastLength]} />
        <meshStandardMaterial
          map={gravelSurface.map}
          bumpMap={gravelSurface.bumpMap}
          bumpScale={0.08}
          roughness={0.97}
          color={isSnow ? "#E2E8F0" : "#FFFFFF"}
        />
      </mesh>

      {/* Jižní obvodová cesta (od šaten za brankou na východ) */}
      <mesh position={[(crX + pubX) / 2, -crZ, 0]}>
        <planeGeometry args={[southLength + 4, 2.0]} />
        <meshStandardMaterial
          map={gravelSurface.map}
          bumpMap={gravelSurface.bumpMap}
          bumpScale={0.08}
          roughness={0.97}
          color={isSnow ? "#E2E8F0" : "#FFFFFF"}
        />
      </mesh>
    </group>
  );
}

/** Diváci a štamgasti stojící podél zábradlí s pivem ("u klandru") */
function RailSpectators({ isMobile }: { isMobile: boolean }) {
  const spectatorCount = isMobile ? 8 : 16;
  const padX = HALF_W + 2.0;

  const spectators = useMemo(() => {
    const list: Array<{ x: number; z: number; shirtColor: string; skinColor: string; hasBeer: boolean }> = [];
    const shirts = ["#DC2626", "#2563EB", "#059669", "#D97706", "#4B5563", "#7C3AED", "#1F2937"];
    const skins = ["#E8B48C", "#D19A6A", "#A9713F", "#F0C9A0"];

    for (let i = 0; i < spectatorCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -20 + (i / spectatorCount) * 40;
      const overlapsWestDugout = side < 0
        && (Math.abs(z - 7.5) < 3 || Math.abs(z + 7.5) < 3);
      if (overlapsWestDugout) continue;
      list.push({
        x: side * padX + (Math.sin(i * 3) * 0.3),
        z,
        shirtColor: shirts[i % shirts.length],
        skinColor: skins[i % skins.length],
        hasBeer: i % 3 !== 0,
      });
    }
    return list;
  }, [spectatorCount, padX]);

  return (
    <group>
      {spectators.map((s, idx) => (
        <group key={idx} position={[s.x, 0, s.z]}>
          {/* Nohy */}
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[0.3, 0.9, 0.25]} />
            <meshStandardMaterial color="#1E293B" roughness={0.9} />
          </mesh>
          {/* Trup */}
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[0.42, 0.55, 0.3]} />
            <meshStandardMaterial color={s.shirtColor} roughness={0.7} />
          </mesh>
          {/* Hlava */}
          <mesh position={[0, 1.6, 0]} castShadow>
            <boxGeometry args={[0.26, 0.28, 0.26]} />
            <meshStandardMaterial color={s.skinColor} roughness={0.6} />
          </mesh>
          {/* Půllitr s pivem v ruce opřené o zábradlí */}
          {s.hasBeer && (
            <group position={[s.x > 0 ? -0.25 : 0.25, 1.1, 0.15]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.05, 0.04, 0.14, 8]} />
                <meshStandardMaterial color="#D97706" transparent opacity={0.85} />
              </mesh>
              <mesh position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.052, 0.052, 0.03, 8]} />
                <meshStandardMaterial color="#FFFFFF" />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

/** Reklamní cedule místních sponzorů na zábradlí */
function RailSponsorBanners() {
  const padX = HALF_W + 1.58;
  const banners = useMemo(() => [
    { z: -14, name: "PIVOVAR FERDINAND", bg: "#78350F", fg: "#FDE047" },
    { z: -6,  name: "STAVEBNINY NOVÁK",   bg: "#1E3A8A", fg: "#FFFFFF" },
    { z: 6,   name: "AUTODÍLY SVOBODA",   bg: "#991B1B", fg: "#FFFFFF" },
    { z: 14,  name: "HOSTINEC NA HŘIŠTI", bg: "#14532D", fg: "#FEF08A" },
  ], []);

  return (
    <group>
      {banners.map((b, idx) => (
        <group key={idx} position={[padX, 0.55, b.z]}>
          <mesh rotation={[0, -Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[4.5, 0.65, 0.06]} />
            <meshStandardMaterial color={b.bg} metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[-0.04, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[4.2, 0.5]} />
            <meshBasicMaterial color={b.bg} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Obecní amplion / rozhlas na dřevěném sloupu */
function VillageLoudspeaker({ position }: { position: [number, number, number] }) {
  const poleH = 6.5;
  return (
    <group position={position}>
      {/* Dřevěný sloup */}
      <mesh position={[0, poleH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, poleH, 8]} />
        <meshStandardMaterial color="#5C3A1E" roughness={0.9} />
      </mesh>
      {/* 2 Kovové ampliony (kužely) mířící na hřiště a k hospodě */}
      <group position={[0, poleH - 0.3, 0]}>
        <mesh position={[0.2, 0, 0]} rotation={[0, 0, -Math.PI / 2 + 0.2]} castShadow>
          <coneGeometry args={[0.22, 0.45, 10, 1, true]} />
          <meshStandardMaterial color="#64748B" metalness={0.7} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-0.2, 0, 0]} rotation={[0, 0, Math.PI / 2 - 0.2]} castShadow>
          <coneGeometry args={[0.22, 0.45, 10, 1, true]} />
          <meshStandardMaterial color="#64748B" metalness={0.7} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
