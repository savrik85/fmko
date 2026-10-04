"use client";

/**
 * Přístavby tribun ve 3D: 13 tvarů a jejich průhledný náhled před stavbou.
 *
 * Souřadnice scény: hřiště je 40 (X) × 60 (Z). Sever a jih stojí ZA BRANKAMI, východ a západ
 * jsou na dlouhých stranách. Postranní přístavba sedí v lokálním rámci tribuny (stejném jako
 * `Stand`): lokální +Z míří od hřiště dozadu, z = 0 je přední hrana tribuny, x běží podél strany.
 * Rohové přístavby mají vlastní rámec v rohu hřiště s lokálním +Z po úhlopříčce ven.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { PITCH, STAND_DIMS, STAND_GAP } from "./constants";
import type { SceneSide, SideLevels } from "./stand-levels";

export interface ExtensionInstance {
  slot: string;
  kind: string;
  level: number;
}

interface Palette {
  stand: string;
  seat: string;
  accent: string;
  team: string;
  /** Průhledný náhled před stavbou. */
  ghost: boolean;
}

const WOOD = "#8B6F47";
const CONCRETE = "#9CA3AF";
const METAL = "#7C838C";
const EARTH = "#6B8E4E";
const SOIL = "#6F5B3E";

const SIDE_SLOT: Record<string, SceneSide> = {
  ext_main: "east",
  ext_opposite: "west",
  ext_goal_west: "south",
  ext_goal_east: "north",
};

/** Znaménko osy X a Z rohu: východ je +X, sever je +Z. */
const CORNER_SLOT: Record<string, [number, number]> = {
  corner_main_goal_east: [1, 1],
  corner_main_goal_west: [1, -1],
  corner_opposite_goal_east: [-1, 1],
  corner_opposite_goal_west: [-1, -1],
};

function Mat({ color, p, rough = 0.85, metal = 0 }: { color: string; p: Palette; rough?: number; metal?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={rough}
      metalness={metal}
      transparent={p.ghost}
      opacity={p.ghost ? 0.5 : 1}
      emissive={p.ghost ? p.accent : "#000000"}
      emissiveIntensity={p.ghost ? 0.45 : 0}
      depthWrite={!p.ghost}
    />
  );
}

function Box({ size, position, color, p, rough, metal }: {
  size: [number, number, number]; position: [number, number, number]; color: string; p: Palette; rough?: number; metal?: number;
}) {
  return (
    <mesh position={position} castShadow={!p.ghost} receiveShadow={!p.ghost}>
      <boxGeometry args={size} />
      <Mat color={color} p={p} rough={rough} metal={metal} />
    </mesh>
  );
}

/** Stupňovitý blok od země: řada i má výšku (i + 1) × rise a leží o i × depth dál od přední hrany. */
function Steps({ width, rows, depth, rise, color, p, x = 0, y0 = 0, z0 = 0 }: {
  width: number; rows: number; depth: number; rise: number; color: string; p: Palette; x?: number; y0?: number; z0?: number;
}) {
  return (
    <group position={[x, y0, z0]}>
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} size={[width, (i + 1) * rise, depth]} position={[0, ((i + 1) * rise) / 2, i * depth + depth / 2]} color={color} p={p} />
      ))}
    </group>
  );
}

/** Výseč mezikruží (oblouk tribuny). Oblouk je vycentrovaný na lokální +Z. */
function Sector({ rIn, rOut, angle, height, color, p, y0 = 0 }: {
  rIn: number; rOut: number; angle: number; height: number; color: string; p: Palette; y0?: number;
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, rOut, -angle / 2, angle / 2, false);
    shape.absarc(0, 0, rIn, angle / 2, -angle / 2, true);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 18 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [rIn, rOut, angle, height]);
  return (
    <mesh geometry={geometry} position={[0, y0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow={!p.ghost} receiveShadow={!p.ghost}>
      <Mat color={color} p={p} rough={0.9} />
    </mesh>
  );
}

/** Oblouk ze stupňů: každý další pás je o kousek výš. */
function Bowl({ rIn, rows, angle, rowW, rise, color, p }: {
  rIn: number; rows: number; angle: number; rowW: number; rise: number; color: string; p: Palette;
}) {
  return (
    <group>
      {Array.from({ length: rows }).map((_, i) => (
        <Sector key={i} rIn={rIn + i * rowW} rOut={rIn + (i + 1) * rowW} angle={angle} height={(i + 1) * rise} color={color} p={p} />
      ))}
    </group>
  );
}

function Flag({ color, height, p }: { color: string; height: number; p: Palette }) {
  return (
    <group>
      <Box size={[0.12, height, 0.12]} position={[0, height / 2, 0]} color="#D4D4D8" p={p} metal={0.5} />
      <Box size={[1.8, 1.0, 0.05]} position={[0.95, height - 0.7, 0]} color={color} p={p} />
    </group>
  );
}

function Posts({ xs, zs, height, p, color = METAL }: { xs: number[]; zs: number[]; height: number; p: Palette; color?: string }) {
  return (
    <>
      {xs.flatMap((x) =>
        zs.map((z) => <Box key={`${x}-${z}`} size={[0.35, height, 0.35]} position={[x, height / 2, z]} color={color} p={p} metal={0.4} />),
      )}
    </>
  );
}

const lv = (level: number) => Math.max(1, Math.min(3, level));

/** Postranní přístavby v rámci tribuny (z = 0 přední hrana, x podél strany). */
function SideKind({ kind, level, length, standLevel, p }: { kind: string; level: number; length: number; standLevel: number; p: Palette }) {
  const l = lv(level);
  const D = STAND_DIMS[Math.max(1, Math.min(3, standLevel))].depth;
  const H = STAND_DIMS[Math.max(1, Math.min(3, standLevel))].height;
  switch (kind) {
    case "length": {
      const w = 4 + l * 3;
      const rows = STAND_DIMS[Math.max(1, Math.min(3, standLevel))].rows || 3;
      const rise = H / Math.max(1, rows);
      return (
        <>
          {[-1, 1].map((s) => (
            <Steps key={s} x={s * (length / 2 + w / 2)} width={w} rows={rows} depth={D / rows} rise={rise} color={p.stand} p={p} />
          ))}
        </>
      );
    }
    case "second_tier": {
      const w = length * (0.5 + 0.15 * l);
      const rows = 2 + l;
      return (
        <>
          <Posts xs={[-w / 2 + 0.5, 0, w / 2 - 0.5]} zs={[D * 0.7, D + 1]} height={H + 1.4} p={p} />
          <Steps width={w} rows={rows} depth={1.3} rise={0.5} color={p.seat} p={p} y0={H + 1.4} z0={D * 0.55} />
        </>
      );
    }
    case "double_stand": {
      const rows = 3 + l;
      return (
        <>
          <Posts xs={[-length * 0.45, -length * 0.15, length * 0.15, length * 0.45]} zs={[D * 0.5, D + 1.4]} height={H + 2.2} p={p} />
          <Steps width={length * 0.96} rows={rows} depth={1.4} rise={0.55} color={p.seat} p={p} y0={H + 2.2} z0={D * 0.4} />
          <Box size={[length * 0.96, 0.9, 0.08]} position={[0, H + 2.2 + 0.45, D * 0.4 - 0.1]} color="#BFE3F2" p={p} rough={0.15} />
        </>
      );
    }
    case "stilts": {
      const w = length * (0.5 + 0.1 * l);
      const rows = 2 + l;
      return (
        <>
          <Posts xs={[-w / 2 + 0.6, -w / 6, w / 6, w / 2 - 0.6]} zs={[D + 1, D + 4, D + 6.5]} height={2.6} p={p} color={WOOD} />
          <Steps width={w} rows={rows} depth={1.7} rise={0.55} color={p.stand} p={p} y0={2.6} z0={D + 0.4} />
        </>
      );
    }
    case "tower": {
      const th = H + 6 + 2 * l;
      return (
        <group position={[0, 0, D * 0.8]}>
          <Box size={[3.2, th, 3.2]} position={[0, th / 2, 0]} color={p.stand} p={p} />
          <Box size={[3.8, 0.4, 3.8]} position={[0, th + 0.2, 0]} color={p.accent} p={p} />
          <group position={[0, th + 0.4, 0]}>
            <Flag color={p.team} height={3 + l} p={p} />
          </group>
        </group>
      );
    }
    case "footbridge": {
      const w = length * (0.5 + 0.12 * l);
      return (
        <group position={[0, 0, -1.6]}>
          <Box size={[w, 0.2, 1.5]} position={[0, 0.9, 0]} color={WOOD} p={p} />
          <Posts xs={[-w / 2 + 0.3, -w / 6, w / 6, w / 2 - 0.3]} zs={[-0.6, 0.6]} height={0.9} p={p} color={WOOD} />
          <Box size={[w, 0.08, 0.08]} position={[0, 1.7, 0.7]} color={WOOD} p={p} />
        </group>
      );
    }
    case "terrace": {
      const rows = 2 + l;
      return (
        <>
          <Steps width={length * 0.92} rows={rows} depth={2.2} rise={0.7} color={SOIL} p={p} z0={0} />
          <Box size={[length * 0.92, 0.12, rows * 2.2]} position={[0, rows * 0.7 * 0.6, (rows * 2.2) / 2]} color={EARTH} p={p} />
        </>
      );
    }
    case "round_stand": {
      const rows = 2 + l;
      const rIn = 24 + l * 2;
      return (
        <group position={[0, 0, D - rIn + 1.2]}>
          <Bowl rIn={rIn} rows={rows} angle={1.5} rowW={1.5} rise={0.55} color={p.seat} p={p} />
        </group>
      );
    }
    case "mobile": {
      const w = 6 + l * 3;
      return (
        <group position={[0, 0, D * 0.2]}>
          <Posts xs={[-w / 2, w / 2]} zs={[0.4, 2 + l]} height={0.8 + l * 0.5} p={p} />
          <Steps width={w} rows={1 + l} depth={1.1} rise={0.55} color={METAL} p={p} />
        </group>
      );
    }
    default:
      return null;
  }
}

/** Rohové přístavby v rámci rohu (z = po úhlopříčce ven od rohu hřiště). */
function CornerKind({ kind, level, p }: { kind: string; level: number; p: Palette }) {
  const l = lv(level);
  switch (kind) {
    case "corner": {
      const rows = 1 + l;
      return <Steps width={5 + l * 1.5} rows={rows} depth={1.6} rise={0.6} color={p.stand} p={p} z0={3} />;
    }
    case "curved_corner": {
      return (
        <group position={[0, 0, -1]}>
          <Bowl rIn={9} rows={2 + l} angle={Math.PI / 2} rowW={1.3} rise={0.6} color={p.seat} p={p} />
        </group>
      );
    }
    case "wing": {
      const rows = 2 + l;
      return (
        <group position={[0, 0, 2]}>
          <Steps width={7 + l * 3} rows={rows} depth={1.5} rise={0.7} color={p.stand} p={p} x={2 + l} />
          <Box size={[0.3, rows * 0.7, 3 + l]} position={[-1.6, (rows * 0.7) / 2, (3 + l) / 2]} color={p.accent} p={p} />
        </group>
      );
    }
    case "bridge": {
      const len = 8 + l * 2;
      return (
        <group position={[0, 0, 4]}>
          <Posts xs={[-len / 2, len / 2]} zs={[-1, 1]} height={3} p={p} color={CONCRETE} />
          <Box size={[len, 0.35, 2.6]} position={[0, 3.2, 0]} color={CONCRETE} p={p} />
          <Steps width={len - 1} rows={1 + l} depth={0.9} rise={0.4} color={p.seat} p={p} y0={3.35} z0={-0.9} />
        </group>
      );
    }
    case "mobile": {
      return (
        <group position={[0, 0, 3]}>
          <Posts xs={[-2, 2]} zs={[0.4, 2]} height={0.6 + l * 0.5} p={p} />
          <Steps width={4 + l * 1.5} rows={1 + l} depth={1} rise={0.5} color={METAL} p={p} />
        </group>
      );
    }
    default:
      return null;
  }
}

function sideFrame(side: SceneSide, standLevel: number) {
  const D = STAND_DIMS[Math.max(1, Math.min(3, standLevel))].depth;
  const isEW = side === "east" || side === "west";
  const dist = (isEW ? PITCH.width : PITCH.depth) / 2 + STAND_GAP + D / 2;
  const length = isEW ? PITCH.depth : PITCH.width;
  const position: [number, number, number] =
    side === "north" ? [0, 0, dist] : side === "south" ? [0, 0, -dist] : side === "east" ? [dist, 0, 0] : [-dist, 0, 0];
  const rotY = side === "north" ? 0 : side === "south" ? Math.PI : side === "east" ? Math.PI / 2 : -Math.PI / 2;
  return { position, rotY, length };
}

function One({ item, sideLevels, palette }: { item: ExtensionInstance; sideLevels: SideLevels; palette: Palette }) {
  const side = SIDE_SLOT[item.slot];
  if (side) {
    const standLevel = sideLevels[side];
    const { position, rotY, length } = sideFrame(side, standLevel);
    return (
      <group position={position} rotation={[0, rotY, 0]}>
        <SideKind kind={item.kind} level={item.level} length={length} standLevel={standLevel} p={palette} />
      </group>
    );
  }
  const corner = CORNER_SLOT[item.slot];
  if (corner) {
    const [sx, sz] = corner;
    const position: [number, number, number] = [sx * (PITCH.width / 2 + STAND_GAP + 1), 0, sz * (PITCH.depth / 2 + STAND_GAP + 1)];
    return (
      <group position={position} rotation={[0, Math.atan2(sx, sz), 0]}>
        <CornerKind kind={item.kind} level={item.level} p={palette} />
      </group>
    );
  }
  return null;
}

interface StandExtensionsProps {
  extensions: ExtensionInstance[];
  /** Přístavba, kterou hráč zvažuje: kreslí se průhledně. */
  preview?: ExtensionInstance | null;
  sideLevels: SideLevels;
  standColor: string;
  seatColor: string;
  accentColor: string;
  teamColor: string;
}

export function StandExtensions({ extensions, preview, sideLevels, standColor, seatColor, accentColor, teamColor }: StandExtensionsProps) {
  const solid: Palette = { stand: standColor, seat: seatColor, accent: accentColor, team: teamColor, ghost: false };
  const ghost: Palette = { ...solid, ghost: true };
  // Náhled nahrazuje stávající přístavbu ve stejném místě (vylepšení se ukáže na nové úrovni).
  const shown = extensions.filter((e) => !preview || e.slot !== preview.slot);
  return (
    <group>
      {shown.map((e) => (
        <One key={e.slot} item={e} sideLevels={sideLevels} palette={solid} />
      ))}
      {preview && <One key={`preview-${preview.slot}`} item={preview} sideLevels={sideLevels} palette={ghost} />}
    </group>
  );
}
