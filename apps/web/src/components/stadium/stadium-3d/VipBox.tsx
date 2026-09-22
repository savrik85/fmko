"use client";
import { PITCH, STAND_DIMS, type TimeOfDay } from "./constants";

/** Stejná mezera mezi hřištěm a tribunou jako v Stand.tsx a StadiumExtras.tsx. */
const STAND_GAP = 2.5;
/** Odstup lóže od zad tribuny, ať se nepotká se zadními sloupky střechy. */
const BACK_OFFSET = 1.2;

type Side = "north" | "south" | "east" | "west";

/** Počet kabin podle úrovně. L3 je souvislá řada přes většinu tribuny. */
const CABINS = [0, 1, 3, 6] as const;
const CABIN_W = 3.2;
const CABIN_H = 1.9;
const CABIN_D = 2.2;

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

interface VipBoxProps {
  level: number;
  standsLevel: number;
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

function ActiveVipBox({ level, standsLevel, ultrasSide, accentColor, teamColor, timeOfDay, reducedDetail = false }: VipBoxProps) {
  const lv = Math.min(level, 3);
  const dims = STAND_DIMS[Math.min(standsLevel, 3)];
  const side = vipBoxSide(standsLevel, ultrasSide);
  const isEW = side === "east" || side === "west";
  const standLength = isEW ? PITCH.depth : PITCH.width;
  // Stejné umístění skupiny jako Stand: lokální +Z míří od hřiště dozadu.
  const distance = (isEW ? PITCH.width : PITCH.depth) / 2 + STAND_GAP + dims.depth / 2;
  const position: [number, number, number] =
    side === "north" ? [0, 0, distance]
    : side === "south" ? [0, 0, -distance]
    : side === "east" ? [distance, 0, 0]
    : [-distance, 0, 0];
  const rotationY =
    side === "north" ? 0 : side === "south" ? Math.PI : side === "east" ? Math.PI / 2 : -Math.PI / 2;

  const cabins = CABINS[lv];
  // L3: řada přes 80 % délky tribuny, kabiny se roztáhnou; nižší úrovně mají pevnou šířku.
  const cabinW = lv >= 3 ? (standLength * 0.8) / cabins : CABIN_W;
  const rowW = cabinW * cabins;
  const baseY = dims.height;
  const z = dims.depth + BACK_OFFSET + CABIN_D / 2;
  // Večer a v noci lóže svítí, přes den je sklo jen tónované.
  const glow = timeOfDay === "day" ? 0.25 : 0.9;
  const postXs = lv >= 3 && !reducedDetail
    ? [-rowW / 2 + 0.2, -rowW / 4, 0, rowW / 4, rowW / 2 - 0.2]
    : [-rowW / 2 + 0.2, rowW / 2 - 0.2];

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Sloupy pod lóží */}
      {postXs.map((x, i) => (
        <mesh key={`post-${i}`} position={[x, baseY / 2, z]} castShadow>
          <boxGeometry args={[0.25, baseY, 0.25]} />
          <meshStandardMaterial color="#4B5563" metalness={0.4} roughness={0.6} />
        </mesh>
      ))}

      {/* Lávka ze zad tribuny do lóže */}
      <mesh position={[0, baseY - 0.06, dims.depth + BACK_OFFSET / 2]} receiveShadow>
        <boxGeometry args={[Math.min(rowW, 3), 0.12, BACK_OFFSET]} />
        <meshStandardMaterial color="#6B7280" roughness={0.8} />
      </mesh>

      {/* Podlaha a zadní stěna celé řady */}
      <mesh position={[0, baseY + 0.08, z]} castShadow receiveShadow>
        <boxGeometry args={[rowW + 0.3, 0.16, CABIN_D + 0.2]} />
        <meshStandardMaterial color="#374151" roughness={0.7} />
      </mesh>
      <mesh position={[0, baseY + CABIN_H / 2, z + CABIN_D / 2]} castShadow>
        <boxGeometry args={[rowW + 0.3, CABIN_H, 0.15]} />
        <meshStandardMaterial color="#1F2937" roughness={0.6} />
      </mesh>

      {/* Kabiny: tmavý rám, sklo do hřiště, příčky mezi kabinami */}
      {Array.from({ length: cabins }).map((_, i) => {
        const x = -rowW / 2 + cabinW * (i + 0.5);
        return (
          <group key={`cab-${i}`} position={[x, baseY + 0.16, z]}>
            {/* Strop kabiny */}
            <mesh position={[0, CABIN_H - 0.06, 0]} castShadow>
              <boxGeometry args={[cabinW, 0.12, CABIN_D]} />
              <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.35} />
            </mesh>
            {/* Čelní sklo. Rovina se otáčí k hřišti (lokální −Z). */}
            <mesh position={[0, CABIN_H / 2, -CABIN_D / 2]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[cabinW - 0.12, CABIN_H - 0.2]} />
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
            {/* Boční příčka (sloupek rámu) */}
            <mesh position={[cabinW / 2 - 0.04, CABIN_H / 2, 0]}>
              <boxGeometry args={[0.08, CABIN_H, CABIN_D]} />
              <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
        );
      })}
      {/* Levý krajní sloupek rámu (pravý kreslí poslední kabina) */}
      <mesh position={[-rowW / 2 + 0.04, baseY + 0.16 + CABIN_H / 2, z]}>
        <boxGeometry args={[0.08, CABIN_H, CABIN_D]} />
        <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Klubový lem nad sklem */}
      <mesh position={[0, baseY + 0.16 + CABIN_H + 0.06, z - CABIN_D / 2]} castShadow>
        <boxGeometry args={[rowW + 0.3, 0.14, 0.14]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.3} metalness={0.6} roughness={0.35} />
      </mesh>

      {/* L3: markýza v klubové barvě přes celou řadu */}
      {lv >= 3 && (
        <mesh position={[0, baseY + 0.16 + CABIN_H + 0.35, z - 0.5]} rotation={[-0.22, 0, 0]} castShadow>
          <boxGeometry args={[rowW + 0.8, 0.1, CABIN_D + 1.4]} />
          <meshStandardMaterial color={teamColor} roughness={0.6} metalness={0.1} />
        </mesh>
      )}
    </group>
  );
}
