"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PITCH, STAND_DIMS, type WeatherType, type StadiumMode } from "./constants";
import { generateCorrugatedTexture } from "./materialTextures";

const STAND_GAP = 2.5;

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/** Canvas textura s nápisem na choreo plachtu (bez externích fontů). */
function useBannerTexture(text: string | null | undefined, bg: string, fg: string): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (!text || typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const label = text.toUpperCase();
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fs = 130;
    for (; fs >= 40; fs -= 4) {
      ctx.font = `bold ${fs}px Arial, sans-serif`;
      if (ctx.measureText(label).width <= canvas.width - 80) break;
    }
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }, [text, bg, fg]);
}

/** Plachta kotle jako látka — jemné billowing v hloubce (dole rozvlněnější). */
function ClothBanner({ width, height, y, z, color, map }: { width: number; height: number; y: number; z: number; color: string; map?: THREE.Texture | null }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime * 1.5;
    const geom = m.geometry as THREE.PlaneGeometry;
    const p = geom.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const yv = p.getY(i);
      const amp = 0.05 + (0.5 - (yv / height + 0.5)) * 0.045; // dole víc
      p.setZ(i, (Math.sin(x * 0.5 + t) + Math.sin(x * 0.22 + t * 0.6)) * amp);
    }
    p.needsUpdate = true;
    geom.computeVertexNormals();
  });
  return (
    <mesh ref={ref} position={[0, y, z]} castShadow>
      <planeGeometry args={[width, height, 40, 4]} />
      <meshStandardMaterial color={color} map={map ?? undefined} side={THREE.DoubleSide} roughness={0.85} />
    </mesh>
  );
}

/** Vlnící se vlaječka na žerdi kotle — per-vertex sinusová vlna (jako hlavní vlajka).
 *  Levý okraj u žerdi (fixed), volný konec vlaje. Fáze posouvá vlnu mezi vlaječkami (organické). */
function WavingPennant({ color, y, phase }: { color: string; y: number; phase: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const W = 1.0, H = 0.7;
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime * 3 + phase;
    const geom = m.geometry as THREE.PlaneGeometry;
    const p = geom.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const d = (x + W / 2) / W;           // 0 u žerdi, 1 na volném konci
      p.setZ(i, Math.sin(t + d * 6) * 0.16 * d);
    }
    p.needsUpdate = true;
    geom.computeVertexNormals();
  });
  return (
    <mesh ref={ref} position={[W / 2, y, 0.02]}>
      <planeGeometry args={[W, H, 10, 3]} />
      <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} />
    </mesh>
  );
}

/**
 * Zastřešení tribun — stříška nad severní/jižní (a od L2 i V/Z) tribunou.
 * Renderuje se jen když je postavené (roofLevel>0) a existují tribuny (standsLevel>0).
 */
interface StandRoofProps {
  standsLevel: number;
  roofLevel: number;
  roofColor?: string | null;
  weather?: WeatherType;
}

export function StandRoof(props: StandRoofProps) {
  if (props.roofLevel <= 0 || props.standsLevel <= 0) return null;
  return <ActiveStandRoof {...props} />;
}

function ActiveStandRoof({
  standsLevel,
  roofLevel,
  roofColor,
  weather,
}: StandRoofProps) {
  const isSnow = weather === "snow";
  const dims = STAND_DIMS[Math.min(standsLevel, 3)];
  const color = roofColor ?? (isSnow ? "#F1F5F9" : "#9A9DA4"); // světlejší plech nebo bílý sníh
  const roofTexture = useMemo(() => generateCorrugatedTexture(color, 8, 2), [color]);
  const overhang = 0.5 + roofLevel * 0.35; // přesah nad hřiště roste s levelem

  // Stejné umístění jako Stand: skupina na okraji hřiště, lokální +Z = od hřiště dozadu.
  const nsDistance = PITCH.depth / 2 + STAND_GAP + dims.depth / 2;
  const ewDistance = PITCH.width / 2 + STAND_GAP + dims.depth / 2;

  // Stříška v LOKÁLNÍCH souřadnicích tribuny: kryje zadní 2/3 sedaček,
  // klesá od zadku (výš) k hřišti (níž) — jako reálná krytá tribuna.
  // U nízké tribuny (L1) zvednout stříšku výš, ať na ni neplácne — jako krytá tribuna na sloupech.
  const clearance = standsLevel === 1 ? 2.6 : 1.1;
  const Canopy = ({ alongLen }: { alongLen: number }) => {
    const roofDepth = dims.depth * 0.7 + overhang;
    const roofZ = dims.depth * 0.45;               // těžiště nad zadní částí sedaček
    const roofY = dims.height + clearance;          // jasně nad sedačkami
    const backZ = dims.depth + overhang * 0.5;      // zadní podpěry
    const postH = roofY + 0.2;
    // Přední lem střechy (okap) — přibližná pozice předního okraje nakloněné desky
    const frontY = roofY - Math.sin(0.32) * roofDepth / 2;
    const frontZ = roofZ - Math.cos(0.32) * roofDepth / 2;
    return (
      <group>
        {/* Nakloněná plocha stříšky */}
        <mesh position={[0, roofY, roofZ]} rotation={[-0.32, 0, 0]} castShadow>
          <boxGeometry args={[alongLen + 1, 0.14, roofDepth]} />
          <meshStandardMaterial
            map={roofTexture.map}
            bumpMap={roofTexture.bumpMap}
            bumpScale={0.12}
            roughness={0.5}
            metalness={0.35}
          />
        </mesh>
        {/* Přední okapový lem — rámuje střechu, ať nepůsobí jako plovoucí plát */}
        <mesh position={[0, frontY, frontZ]} rotation={[-0.32, 0, 0]} castShadow>
          <boxGeometry args={[alongLen + 1.1, 0.2, 0.14]} />
          <meshStandardMaterial color="#3A3D42" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* Zadní sloupky (3 — krajní + prostřední pro širší rozpon) */}
        {[-alongLen * 0.4, 0, alongLen * 0.4].map((x, i) => (
          <mesh key={i} position={[x, postH / 2, backZ]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, postH, 8]} />
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
  text,
  bannerColor,
  textColor,
  mode = "match_day",
}: {
  level: number;
  primaryColor: string;
  secondaryColor?: string;
  text?: string | null;
  bannerColor?: string | null;
  textColor?: string | null;
  mode?: StadiumMode;
}) {
  const isTrainingDay = mode === "training_day";
  const sec = secondaryColor ?? "#ffffff";
  const bannerBg = bannerColor ?? primaryColor;
  // Barva nápisu: volitelná; jinak čitelný kontrast k barvě plachty (bílá na tmavé, tmavá na světlé).
  const bannerFg = textColor ?? (isLightHex(bannerBg) ? "#1a1a1a" : "#ffffff");
  const bannerTex = useBannerTexture(text, bannerBg, bannerFg);

  if (level <= 0) return null;
  const lvl = Math.min(level, 3);
  const count = [0, 4, 6, 8][lvl];
  const poleH = 5 + lvl * 0.8;
  // V mezeře mezi brankou/sítí (končí ~PITCH.depth/2 + 1.5) a čelem tribuny (PITCH.depth/2 + STAND_GAP).
  const z = -(PITCH.depth / 2 + 2.0);
  const spread = PITCH.width * 0.85;

  return (
    <group>
      {/* Baner na zábradlí — jako látka (jemné billowing); s nápisem (textura) nebo jednobarevný. */}
      <ClothBanner width={spread + 2} height={1.0} y={1.45} z={z} color={bannerTex ? "#ffffff" : bannerBg} map={bannerTex} />
      {/* Pruh druhé barvy nahoře na baneru (jen bez nápisu) */}
      {!bannerTex && (
        <mesh position={[0, 1.87, z + 0.02]}>
          <planeGeometry args={[spread + 2, 0.18]} />
          <meshStandardMaterial color={sec} side={2} roughness={0.85} />
        </mesh>
      )}

      {/* Žerdě s vlajkami — jen v zápasový den vlají, v tréninkový den jsou stažené/žerdě */}
      {!isTrainingDay &&
        Array.from({ length: count }).map((_, i) => {
          const x = -spread / 2 + (spread / Math.max(count - 1, 1)) * i;
          return (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, poleH / 2, 0]} castShadow>
                <cylinderGeometry args={[0.07, 0.07, poleH, 6]} />
                <meshStandardMaterial color="#2E2E2E" metalness={0.5} roughness={0.5} />
              </mesh>
              <WavingPennant color={i % 2 === 0 ? sec : primaryColor} y={poleH - 0.6} phase={i * 0.8} />
            </group>
          );
        })}

      {/* Buben (od L2) — jen v zápasový den */}
      {!isTrainingDay && lvl >= 2 && (
        <group position={[spread * 0.5 + 1.6, 0, z]}>
          <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.75, 0.75, 1.0, 18]} />
            <meshStandardMaterial color={primaryColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.9, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.77, 0.77, 0.04, 18]} />
            <meshStandardMaterial color="#F5F0E8" />
          </mesh>
          <mesh position={[0, 0.9, 0.53]}>
            <boxGeometry args={[1.2, 0.1, 0.02]} />
            <meshStandardMaterial color={primaryColor} />
          </mesh>
          <mesh position={[0, 0.9, 0.53]}>
            <boxGeometry args={[0.1, 1.2, 0.02]} />
            <meshStandardMaterial color={primaryColor} />
          </mesh>
        </group>
      )}

      {/* Pyrotechnika & Dýmovnice — jen v zápasový den */}
      {!isTrainingDay && (
        <UltrasPyroShow
          level={lvl}
          primaryColor={primaryColor}
          secondaryColor={sec}
          z={z}
          spread={spread}
        />
      )}

      {/* Spíkr / rozeřvávač kotle se stupínkem a megafonem (od L2) — jen v zápasový den */}
      {!isTrainingDay && lvl >= 2 && (
        <UltrasCapoStand
          position={[-spread * 0.45, 0, z + 0.6]}
          primaryColor={primaryColor}
        />
      )}
    </group>
  );
}

/** Pyrotechnika kotle — plápolající světlice a stoupající kouř v barvách klubu */
/** Pyrotechnika kotle — plápolající světlice a stoupající kouř v barvách klubu */
function UltrasPyroShow({
  level,
  primaryColor,
  secondaryColor,
  z,
  spread,
}: {
  level: number;
  primaryColor: string;
  secondaryColor: string;
  z: number;
  spread: number;
}) {
  const flareCount = level === 1 ? 2 : level === 2 ? 4 : 6;
  const flarePositions = useMemo(() => {
    const arr: Array<{ x: number; color: string; phase: number }> = [];
    for (let i = 0; i < flareCount; i++) {
      const x = -spread * 0.4 + (spread * 0.8 / Math.max(flareCount - 1, 1)) * i;
      const color = i % 2 === 0 ? primaryColor : secondaryColor;
      arr.push({ x, color, phase: i * 1.3 });
    }
    return arr;
  }, [flareCount, spread, primaryColor, secondaryColor]);

  return (
    <group>
      {flarePositions.map((fl, i) => (
        <PyroFlare key={i} position={[fl.x, 1.4, z - 0.3]} color={fl.color} phase={fl.phase} />
      ))}
    </group>
  );
}

/** Jednotlivá světlice s plápolajícím ohněm, jiskrami a hustým stoupajícím kouřem */
function PyroFlare({ position, color, phase }: { position: [number, number, number]; color: string; phase: number }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const smokeGroupRef = useRef<THREE.Group>(null);
  const flameMeshRef = useRef<THREE.Mesh>(null);
  const auraMeshRef = useRef<THREE.Mesh>(null);
  const sparksRef = useRef<THREE.Group>(null);

  // Obláčky kouře s různou fází růstu
  const puffCount = 7;
  const puffs = useMemo(() => {
    return Array.from({ length: puffCount }).map((_, i) => ({
      delay: (i / puffCount) * 2.2,
      driftX: Math.sin(i * 1.9 + phase) * 0.55,
      driftZ: Math.cos(i * 2.3 + phase) * 0.4,
      rotSpeed: (Math.sin(i * 3.1) > 0 ? 1 : -1) * (0.5 + (i % 3) * 0.3),
      size: 0.4 + (i * 0.14),
    }));
  }, [puffCount, phase]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2.5 + phase;

    // Plápolání světla
    if (lightRef.current) {
      lightRef.current.intensity = 2.2 + Math.sin(t * 8.5) * 0.8 + Math.cos(t * 13) * 0.4;
    }

    // Třepotání plamene a záře
    if (flameMeshRef.current) {
      const s = 1.0 + Math.sin(t * 11) * 0.3;
      flameMeshRef.current.scale.set(s, s * 1.5, s);
    }
    if (auraMeshRef.current) {
      const s = 1.2 + Math.sin(t * 7) * 0.35;
      auraMeshRef.current.scale.set(s, s, s);
    }

    // Jiskry vystřelující vzhůru
    if (sparksRef.current) {
      sparksRef.current.children.forEach((child, idx) => {
        const sparkAge = ((clock.elapsedTime * 2.8 + idx * 0.4 + phase) % 1.0);
        child.position.y = sparkAge * 1.6;
        child.position.x = Math.sin(sparkAge * 8 + idx) * 0.25;
        child.position.z = Math.cos(sparkAge * 8 + idx) * 0.2;
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat) {
          mat.opacity = (1 - sparkAge) * 0.9;
        }
      });
    }

    // Animace stoupajícího kouře
    if (smokeGroupRef.current) {
      smokeGroupRef.current.children.forEach((child, idx) => {
        const puff = puffs[idx];
        const age = ((clock.elapsedTime * 0.75 + puff.delay + phase) % 2.2) / 2.2; // 0..1
        child.position.y = age * 2.6;
        child.position.x = puff.driftX * age + Math.sin(t * 0.8 + idx) * 0.25;
        child.position.z = puff.driftZ * age;
        child.rotation.z = clock.elapsedTime * puff.rotSpeed;
        const scale = puff.size * (0.6 + age * 1.9);
        child.scale.set(scale, scale, scale);

        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat) {
          mat.opacity = Math.sin(age * Math.PI) * 0.55;
        }
      });
    }
  });

  return (
    <group position={position}>
      {/* Postava fanouška držícího světlici */}
      <group position={[0, -0.9, 0]}>
        {/* Nohy */}
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.26, 0.8, 0.22]} />
          <meshStandardMaterial color="#1E293B" />
        </mesh>
        {/* Tělo v mikině */}
        <mesh position={[0, 0.95, 0]} castShadow>
          <boxGeometry args={[0.38, 0.45, 0.25]} />
          <meshStandardMaterial color="#18181B" roughness={0.7} />
        </mesh>
        {/* Zvednutá ruka se světlicí */}
        <mesh position={[0.2, 1.25, 0]} rotation={[0, 0, -0.4]} castShadow>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
          <meshStandardMaterial color="#18181B" />
        </mesh>
        {/* Hlava s kšiltovkou */}
        <mesh position={[0, 1.32, 0]} castShadow>
          <boxGeometry args={[0.24, 0.24, 0.24]} />
          <meshStandardMaterial color="#D19A6A" />
        </mesh>
        <mesh position={[0, 1.45, 0.03]} castShadow>
          <boxGeometry args={[0.26, 0.08, 0.3]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>

      {/* Tělo světlice / patrona v ruce */}
      <mesh position={[0.32, 0.5, 0]} rotation={[0, 0, -0.2]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.35, 8]} />
        <meshStandardMaterial color="#2B2D42" roughness={0.4} />
      </mesh>

      {/* Planoucí špička světlice - zářivý střed */}
      <mesh ref={flameMeshRef} position={[0.35, 0.72, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#FFFBEB" />
      </mesh>

      {/* Barevná záře kolem plamene */}
      <mesh ref={auraMeshRef} position={[0.35, 0.72, 0]}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
      </mesh>

      {/* Vystřelující jiskry */}
      <group ref={sparksRef} position={[0.35, 0.75, 0]}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <mesh key={idx}>
            <sphereGeometry args={[0.025, 4, 4]} />
            <meshBasicMaterial color="#FEF08A" transparent opacity={0.9} />
          </mesh>
        ))}
      </group>

      {/* Bodové světlo osvětlující kotel barvou dýmu */}
      <pointLight
        ref={lightRef}
        color={color}
        distance={9.0}
        intensity={2.2}
        decay={1.8}
      />

      {/* Stoupající obláčky kouře v klubové barvě */}
      <group ref={smokeGroupRef} position={[0.35, 0.85, 0]}>
        {puffs.map((_, idx) => (
          <mesh key={idx}>
            <sphereGeometry args={[1, 7, 7]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.45}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Stupínek pro spíkra kotle s megafonem */
function UltrasCapoStand({ position, primaryColor }: { position: [number, number, number]; primaryColor: string }) {
  return (
    <group position={position}>
      {/* Kovový vyvýšený stupínek */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.9, 1.2, 0.8]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Zábradlíčko stupínku */}
      <mesh position={[0, 1.5, -0.35]}>
        <boxGeometry args={[0.9, 0.6, 0.05]} />
        <meshStandardMaterial color="#64748B" metalness={0.8} />
      </mesh>
      {/* Postava spíkra otočená čelem k tribuně (-Z) */}
      <group position={[0, 1.2, 0]} rotation={[0, Math.PI, 0]}>
        {/* Nohy */}
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.26, 0.8, 0.22]} />
          <meshStandardMaterial color="#1E293B" />
        </mesh>
        {/* Tělo v klubovém triku */}
        <mesh position={[0, 1.05, 0]} castShadow>
          <boxGeometry args={[0.38, 0.5, 0.26]} />
          <meshStandardMaterial color={primaryColor} />
        </mesh>
        {/* Hlava */}
        <mesh position={[0, 1.45, 0]} castShadow>
          <boxGeometry args={[0.22, 0.24, 0.22]} />
          <meshStandardMaterial color="#E2A77A" />
        </mesh>
        {/* Megafon u úst */}
        <mesh position={[0, 1.42, 0.22]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <coneGeometry args={[0.1, 0.24, 8, 1, true]} />
          <meshStandardMaterial color="#EF4444" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
