"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { PITCH, STAND_DIMS, STAND_GAP, type TimeOfDay } from "./constants";

type Side = "north" | "south" | "east" | "west";

/**
 * VIP lóže = prosklená galerie kabin nad horními řadami hlavní tribuny, uprostřed
 * její délky, čelem do hřiště (jako tribuna pro novináře nebo televizní lávka).
 *
 * Dřív stála ZA zadní hranou tribuny ve výšce tribuny: z hřiště ji schovala zadní
 * stěna, ze zvýšené kamery stříška a zezadu byla vidět jen tmavá stěna a sloupy.
 * Proto teď galerie sedí nad tribunou a vyčnívá NAD zadní okraj stříšky.
 *
 * Souřadnice jsou lokální jako ve Stand/StandRoof: skupina stojí ve vzdálenosti
 * `hřiště/2 + STAND_GAP + depth/2`, lokální z = 0 je čelo tribuny u hřiště,
 * z = depth její zadní hrana, +z míří od hřiště dozadu.
 *
 * Kolize (ověřeno pro tribuny L1–L3 a stříšku L0–L3):
 * - Stříška klesá dozadu nahoru, nejvýš je na zadním okraji. Podlaha galerie leží
 *   ROOF_GAP nad horní plochou tohoto okraje, takže je nad stříškou v celé ploše.
 * - Zadní sloupky stříšky stojí v z = depth + přesah/2 (≥ depth + 0,425, poloměr 0,09)
 *   a končí ve výšce roofY + 0,2, tedy pod podlahou galerie. Podpěry galerie stojí
 *   v z = depth + 0,09 … 0,25: za zadní stěnou tribuny (tloušťka 0,15) a před sloupky.
 * - Stožáry světel jsou v rozích (x = ±26, z = ±34), galerie nejdál ±0,375 délky tribuny.
 * - Tabule skóre stojí za východní tribunou (x = 36); galerie končí na x ≈ 34,8.
 *   Aby ji galerie nezakrývala, zvedá se tabule nad její siluetu (vipGallerySightlineY).
 */

/** Počet kabin podle úrovně. L3 je souvislá řada přes většinu tribuny. */
const CABINS = [0, 1, 3, 6] as const;
const CABIN_W = 3.2;
const CABIN_H = 1.9;
const CABIN_D = 2.2;
/** Galerie přesahuje zadní hranu tribuny o tolik, aby podlaha kryla podpěry. */
const BACK_OVERHANG = 0.25;
const FLOOR_T = 0.2;
/** Mezera nad horní plochou zadního okraje stříšky. */
const ROOF_GAP = 0.3;
/** Bez stříšky: podlaha ve výšce, pod kterou se vejdou diváci v posledních řadách. */
const NO_ROOF_CLEARANCE = 2.3;
/** Podpěry za zadní stěnou tribuny (stěna sahá do depth + 0,075). */
const SUPPORT_Z = 0.17;
const SUPPORT_T = 0.16;
/** Sklon a tloušťka stříšky — stejné hodnoty jako StandRoof ve StadiumExtras.tsx. */
const ROOF_TILT = 0.32;
const ROOF_T = 0.14;

/**
 * Na které tribuně lóže stojí. Hlavní je východní podélná tribuna, ta ale
 * existuje až od tribun L2; do té doby lóže sedí na severu za brankou.
 * Kde stojí kotel, tam lóže nepatří, proto se přesune naproti.
 */
export function vipBoxSide(standsLevel: number, ultrasSide: Side): Side {
  const preferred: Side = standsLevel >= 2 ? "east" : "north";
  if (preferred !== ultrasSide) return preferred;
  return preferred === "east" ? "west" : "south";
}

/** Rozměry galerie v lokálních souřadnicích tribuny. */
function galleryLayout(level: number, standsLevel: number, roofLevel: number, standLength: number) {
  const lv = Math.min(Math.max(level, 0), 3);
  const dims = STAND_DIMS[Math.min(Math.max(standsLevel, 0), 3)];

  let floorBottom: number;
  if (roofLevel > 0) {
    // Stejný výpočet jako ActiveStandRoof: nejvyšší bod stříšky je horní hrana zadního okraje.
    const clearance = standsLevel === 1 ? 2.6 : 1.1;
    const overhang = 0.5 + roofLevel * 0.35;
    const roofDepth = dims.depth * 0.7 + overhang;
    const roofY = dims.height + clearance;
    const roofBackTop =
      roofY + Math.sin(ROOF_TILT) * (roofDepth / 2) + Math.cos(ROOF_TILT) * (ROOF_T / 2);
    floorBottom = roofBackTop + ROOF_GAP;
  } else {
    floorBottom = dims.height + NO_ROOF_CLEARANCE;
  }

  const cabins = CABINS[lv];
  // L3: řada přes 75 % délky tribuny, kabiny se roztáhnou; nižší úrovně mají pevnou šířku.
  const cabinW = lv >= 3 ? (standLength * 0.75) / cabins : CABIN_W;
  const rowW = cabinW * cabins;
  const fasciaH = lv >= 3 ? 1.0 : lv === 2 ? 0.85 : 0.75;
  const zBack = dims.depth + BACK_OVERHANG;
  const zCenter = zBack - CABIN_D / 2;
  const floorTop = floorBottom + FLOOR_T;
  // Nejvyšší bod: lem nad sklem, na L3 ještě markýza.
  const topY = floorTop + CABIN_H + fasciaH + (lv >= 3 ? 0.45 : 0);
  return { lv, dims, cabins, cabinW, rowW, fasciaH, zBack, zCenter, floorBottom, floorTop, topY };
}

/**
 * Výška, ve které přímka pohledu ze středu hřiště (oči 1,7 m) přes horní hranu
 * galerie protne rovinu ve vzdálenosti `atDistance` od středu (podélná tribuna).
 * Tabule skóre za východní tribunou musí mít spodek nad touto výškou, jinak ji
 * galerie z hřiště zakryje.
 */
export function vipGallerySightlineY(level: number, standsLevel: number, roofLevel: number, atDistance: number): number {
  if (level <= 0 || standsLevel <= 0) return 0;
  const g = galleryLayout(level, standsLevel, roofLevel, PITCH.depth);
  const eyeY = 1.7;
  const standBase = PITCH.width / 2 + STAND_GAP + g.dims.depth / 2;
  const frontDist = standBase + g.zCenter - CABIN_D / 2;
  return eyeY + ((g.topY - eyeY) * atDistance) / frontDist;
}

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/** Nápis VIP na lemu v barvě akcentu (canvas textura jako ostatní nápisy ve 3D). */
function useVipSignTexture(bg: string): THREE.CanvasTexture | null {
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const fg = isLightHex(bg) ? "#111827" : "#FFFFFF";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 132px Arial, sans-serif";
    ctx.fillText("VIP", canvas.width / 2, canvas.height / 2 + 6);
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = 4;
    return t;
  }, [bg]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

interface VipBoxProps {
  level: number;
  standsLevel: number;
  roofLevel: number;
  ultrasSide: Side;
  accentColor: string;
  teamColor: string;
  timeOfDay: TimeOfDay;
  reducedDetail?: boolean;
}

export function VipBox(props: VipBoxProps) {
  if (props.level <= 0 || props.standsLevel <= 0) return null;
  return <ActiveVipBox {...props} />;
}

function ActiveVipBox({ level, standsLevel, roofLevel, ultrasSide, accentColor, teamColor, timeOfDay, reducedDetail = false }: VipBoxProps) {
  const side = vipBoxSide(standsLevel, ultrasSide);
  const isEW = side === "east" || side === "west";
  const standLength = isEW ? PITCH.depth : PITCH.width;
  const g = galleryLayout(level, standsLevel, roofLevel, standLength);
  const signTex = useVipSignTexture(accentColor);

  // Stejné umístění skupiny jako Stand: lokální +Z míří od hřiště dozadu.
  const distance = (isEW ? PITCH.width : PITCH.depth) / 2 + STAND_GAP + g.dims.depth / 2;
  const position: [number, number, number] =
    side === "north" ? [0, 0, distance]
    : side === "south" ? [0, 0, -distance]
    : side === "east" ? [distance, 0, 0]
    : [-distance, 0, 0];
  const rotationY =
    side === "north" ? 0 : side === "south" ? Math.PI : side === "east" ? Math.PI / 2 : -Math.PI / 2;

  const { lv, cabins, cabinW, rowW, fasciaH, zCenter, floorBottom, floorTop } = g;
  const depth = g.dims.depth;
  // Večer a v noci lóže svítí, přes den je sklo jen tónované.
  const glow = timeOfDay === "day" ? 0.25 : 0.9;
  // Podpěry mimo x sloupků stříšky (0 a ±0,4 délky); galerie končí na ±0,375 délky.
  const edgeX = rowW / 2 - 0.3;
  const supportXs = lv >= 3 && !reducedDetail
    ? [-edgeX, -rowW / 4, rowW / 4, edgeX]
    : [-edgeX, edgeX];
  const supportZ = depth + SUPPORT_Z;
  const signH = fasciaH * 0.8;
  const signW = signH * (512 / 192);
  const fasciaY = floorTop + CABIN_H - 0.05 + fasciaH / 2;
  const frontZ = zCenter - CABIN_D / 2;
  const backZ = zCenter + CABIN_D / 2;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Podpěry za zadní stěnou tribuny, od země pod podlahu galerie */}
      {supportXs.map((x, i) => (
        <mesh key={`sup-${i}`} position={[x, floorBottom / 2, supportZ]} castShadow>
          <boxGeometry args={[SUPPORT_T, floorBottom, SUPPORT_T]} />
          <meshStandardMaterial color="#4B5563" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* Nosník pod zadní hranou podlahy */}
      <mesh position={[0, floorBottom - 0.12, supportZ]} castShadow>
        <boxGeometry args={[rowW, 0.24, SUPPORT_T]} />
        <meshStandardMaterial color="#4B5563" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Podlaha galerie */}
      <mesh position={[0, floorBottom + FLOOR_T / 2, zCenter]} castShadow receiveShadow>
        <boxGeometry args={[rowW + 0.3, FLOOR_T, CABIN_D + 0.1]} />
        <meshStandardMaterial color="#374151" roughness={0.7} />
      </mesh>
      {/* Parapet pod sklem v barvě akcentu */}
      <mesh position={[0, floorTop + 0.1, frontZ - 0.02]}>
        <boxGeometry args={[rowW + 0.3, 0.2, 0.14]} />
        <meshStandardMaterial color={accentColor} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Zadní stěna celé řady */}
      <mesh position={[0, floorTop + CABIN_H / 2, backZ - 0.06]} castShadow>
        <boxGeometry args={[rowW, CABIN_H, 0.12]} />
        <meshStandardMaterial color="#1F2937" roughness={0.6} />
      </mesh>
      {/* Strop řady */}
      <mesh position={[0, floorTop + CABIN_H - 0.06, zCenter]} castShadow>
        <boxGeometry args={[rowW + 0.3, 0.12, CABIN_D + 0.1]} />
        <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Kabiny: sklo do hřiště, příčky mezi kabinami */}
      {Array.from({ length: cabins }).map((_, i) => {
        const x = -rowW / 2 + cabinW * (i + 0.5);
        return (
          <group key={`cab-${i}`} position={[x, floorTop, zCenter]}>
            {/* Čelní sklo. Rovina se otáčí k hřišti (lokální −Z). */}
            <mesh position={[0, CABIN_H / 2 + 0.05, -CABIN_D / 2]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[cabinW - 0.12, CABIN_H - 0.3]} />
              <meshStandardMaterial
                color="#60A5FA"
                emissive="#FDE68A"
                emissiveIntensity={glow}
                metalness={0.85}
                roughness={0.1}
                transparent
                opacity={0.8}
              />
            </mesh>
            {/* Příčka mezi kabinami (ne za poslední) */}
            {i < cabins - 1 && (
              <mesh position={[cabinW / 2, CABIN_H / 2, 0]}>
                <boxGeometry args={[0.08, CABIN_H, CABIN_D]} />
                <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.35} />
              </mesh>
            )}
          </group>
        );
      })}
      {/* Boční rámy řady v barvě akcentu */}
      {[-rowW / 2, rowW / 2].map((x) => (
        <mesh key={`end-${x}`} position={[x, floorTop + CABIN_H / 2, zCenter]} castShadow>
          <boxGeometry args={[0.16, CABIN_H, CABIN_D + 0.1]} />
          <meshStandardMaterial color={accentColor} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* Lem nad sklem (vpředu i vzadu) v barvě akcentu, s nápisem VIP */}
      {[frontZ - 0.08, backZ + 0.08].map((z) => (
        <mesh key={`fascia-${z}`} position={[0, fasciaY, z]} castShadow>
          <boxGeometry args={[rowW + 0.3, fasciaH, 0.16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.15} metalness={0.4} roughness={0.45} />
        </mesh>
      ))}
      {signTex && (
        <mesh position={[0, fasciaY, frontZ - 0.17]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[signW, signH]} />
          <meshBasicMaterial map={signTex} toneMapped={false} />
        </mesh>
      )}
      {signTex && !reducedDetail && (
        <mesh position={[0, fasciaY, backZ + 0.17]}>
          <planeGeometry args={[signW, signH]} />
          <meshBasicMaterial map={signTex} toneMapped={false} />
        </mesh>
      )}

      {/* L3: markýza v klubové barvě přes celou řadu, nad lemem */}
      {lv >= 3 && (
        <mesh position={[0, fasciaY + fasciaH / 2 + 0.2, zCenter - 0.4]} rotation={[-0.12, 0, 0]} castShadow>
          <boxGeometry args={[rowW + 0.6, 0.1, CABIN_D + 1.0]} />
          <meshStandardMaterial color={teamColor} roughness={0.6} metalness={0.1} />
        </mesh>
      )}
    </group>
  );
}
