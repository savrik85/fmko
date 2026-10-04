"use client";

/**
 * Přístavby tribun ve 3D: 13 tvarů a jejich průhledný náhled před stavbou.
 *
 * Kusy se stavějí ze stejných součástí jako skutečné tribuny (`StandBlock`: stupně s texturou,
 * sedačky, diváci), aby vypadaly jako jejich pokračování, ne jako cizí těleso.
 *
 * Souřadnice scény: hřiště je 40 (X) × 60 (Z). Sever a jih stojí ZA BRANKAMI, východ a západ
 * jsou na dlouhých stranách. Postranní přístavba sedí v lokálním rámci tribuny (stejném jako
 * `Stand`): lokální +Z míří od hřiště dozadu, z = 0 je přední hrana tribuny, x běží podél strany,
 * zadní hrana tribuny je v z = hloubka (STAND_DIMS). Rohy mají vlastní umístění ve světě.
 */
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { PITCH, STAND_DIMS, STAND_GAP, type StadiumMode } from "./constants";
import { StandBlock } from "./Stand";
import type { SceneSide, SideLevels } from "./stand-levels";

export interface ExtensionInstance {
  slot: string;
  kind: string;
  level: number;
}

interface Common {
  standColor: string;
  seatColor: string;
  accentColor: string;
  teamColor: string;
  secondaryColor: string;
  mode: StadiumMode;
  attendanceRatio: number;
  reducedDetail: boolean;
  isSnow: boolean;
}

const CONCRETE = "#9CA3AF";
const METAL = "#7C838C";
const WOOD = "#8B6F47";
const EARTH = "#6B8E4E";

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

const lv = (level: number) => Math.max(1, Math.min(3, level));
const dimsOf = (level: number) => STAND_DIMS[lv(level)];

function Box({ size, position, color, rough = 0.85, metal = 0 }: {
  size: [number, number, number]; position: [number, number, number]; color: string; rough?: number; metal?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} />
    </mesh>
  );
}

function Posts({ xs, zs, height, color = METAL }: { xs: number[]; zs: number[]; height: number; color?: string }) {
  return (
    <>
      {xs.flatMap((x) =>
        zs.map((z) => <Box key={`${x}-${z}`} size={[0.4, height, 0.4]} position={[x, height / 2, z]} color={color} metal={0.3} />),
      )}
    </>
  );
}

function Flag({ color, height }: { color: string; height: number }) {
  return (
    <group>
      <Box size={[0.14, height, 0.14]} position={[0, height / 2, 0]} color="#D4D4D8" metal={0.5} />
      <Box size={[2.0, 1.1, 0.06]} position={[1.05, height - 0.75, 0]} color={color} />
    </group>
  );
}

/** Výseč mezikruží vycentrovaná na lokální +Z, střed oblouku je v počátku. */
function Sector({ rIn, rOut, angle, height, color }: { rIn: number; rOut: number; angle: number; height: number; color: string }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, rOut, -angle / 2, angle / 2, false);
    shape.absarc(0, 0, rIn, angle / 2, -angle / 2, true);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 20 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [rIn, rOut, angle, height]);
  return (
    <mesh geometry={geometry} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  );
}

const hash = (i: number) => ((Math.imul(i + 1, 2654435761) >>> 0) % 10007) / 10007;

/**
 * Oblouková tribuna: betonové stupně po kruzích, sedačky a diváci rozmístění po oblouku
 * čelem ke středu. Střed oblouku je v počátku, oblouk se rozbíhá kolem lokálního +Z.
 */
function ArcStand({ rIn, rows, angle, rowW = 1.5, rise = 0.55, c }: {
  rIn: number; rows: number; angle: number; rowW?: number; rise?: number; c: Common;
}) {
  const seatRef = useRef<THREE.InstancedMesh>(null);
  const crowdRef = useRef<THREE.InstancedMesh>(null);
  const seats = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; th: number }> = [];
    for (let i = 0; i < rows; i++) {
      const r = rIn + (i + 0.5) * rowW;
      const n = Math.max(2, Math.floor((r * angle) / 0.85));
      for (let k = 0; k < n; k++) {
        const th = -angle / 2 + ((k + 0.5) * angle) / n;
        out.push({ x: r * Math.sin(th), y: (i + 1) * rise + 0.06, z: r * Math.cos(th), th });
      }
    }
    return out;
  }, [rIn, rows, angle, rowW, rise]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const zero = new THREE.Vector3(0, 0, 0);
    const col = new THREE.Color();
    seats.forEach((s, i) => {
      e.set(0, s.th, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, one);
      seatRef.current?.setMatrixAt(i, m);
      const show = c.mode !== "training_day" && hash(i) < c.attendanceRatio;
      m.compose(new THREE.Vector3(s.x, s.y + 0.45, s.z), q, show ? one : zero);
      crowdRef.current?.setMatrixAt(i, m);
      col.set(hash(i + 977) < 0.6 ? c.teamColor : c.secondaryColor);
      crowdRef.current?.setColorAt(i, col);
    });
    if (seatRef.current) seatRef.current.instanceMatrix.needsUpdate = true;
    if (crowdRef.current) {
      crowdRef.current.instanceMatrix.needsUpdate = true;
      if (crowdRef.current.instanceColor) crowdRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, c.mode, c.attendanceRatio, c.teamColor, c.secondaryColor]);

  return (
    <group>
      {Array.from({ length: rows }).map((_, i) => (
        <Sector key={i} rIn={rIn + i * rowW} rOut={rIn + (i + 1) * rowW} angle={angle} height={(i + 1) * rise} color={c.standColor} />
      ))}
      <instancedMesh ref={seatRef} args={[undefined, undefined, seats.length]} castShadow>
        <boxGeometry args={[0.55, 0.08, 0.45]} />
        <meshStandardMaterial color={c.seatColor} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={crowdRef} args={[undefined, undefined, seats.length]} castShadow>
        <boxGeometry args={[0.36, 0.7, 0.3]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

function Block(props: {
  length: number; rows: number; depth: number; height: number; level?: number; c: Common;
  standColor?: string; seatColor?: string; panel?: boolean;
}) {
  const { c } = props;
  return (
    <StandBlock
      length={props.length} rows={props.rows} depth={props.depth} height={props.height} level={props.level ?? 2}
      standColor={props.standColor ?? c.standColor} seatColor={props.seatColor ?? c.seatColor}
      teamColor={c.teamColor} secondaryColor={c.secondaryColor} attendanceRatio={c.attendanceRatio}
      mode={c.mode} reducedDetail={c.reducedDetail} isSnow={c.isSnow} panel={props.panel}
    />
  );
}

/** Horní patro na sloupech: betonová deska, stupně se sedačkami a diváky nahoře. */
function RaisedTier({ width, rows, rowDepth, rise, y0, z0, style, c, glass = false }: {
  width: number; rows: number; rowDepth: number; rise: number; y0: number; z0: number; style: number; c: Common; glass?: boolean;
}) {
  const depth = rows * rowDepth;
  const xs = [-width / 2 + 0.7, -width / 6, width / 6, width / 2 - 0.7];
  return (
    <group>
      <Posts xs={xs} zs={[z0 + 0.8, z0 + depth - 0.8]} height={y0 - 0.2} color={CONCRETE} />
      <Box size={[width, 0.4, depth + 0.4]} position={[0, y0 - 0.2, z0 + depth / 2]} color={CONCRETE} />
      <group position={[0, y0, z0]}>
        <Block length={width} rows={rows} depth={depth} height={rows * rise} level={style} c={c} />
      </group>
      {glass && <Box size={[width, 1.0, 0.07]} position={[0, y0 + 0.5, z0 - 0.15]} color="#BFE3F2" rough={0.15} />}
    </group>
  );
}

/** Postranní přístavby v rámci tribuny (z = 0 přední hrana, zadní hrana tribuny v z = D). */
function SideKind({ kind, level, length, standLevel, c }: { kind: string; level: number; length: number; standLevel: number; c: Common }) {
  const l = lv(level);
  const sd = dimsOf(standLevel);
  const D = sd.depth;
  const H = sd.height;
  const style = lv(standLevel);
  // Volné místo před tribunou (k plotu u hřiště), kam se vejdou nízké přístavby čelem k hřišti.
  const avail = Math.max(2, STAND_GAP + D / 2 - 1.2);
  switch (kind) {
    case "length": {
      const w = 6 + 3 * l;
      return (
        <>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * (length / 2 + w / 2), 0, 0]}>
              <Block length={w} rows={sd.rows} depth={D} height={H} level={style} c={c} />
            </group>
          ))}
        </>
      );
    }
    case "second_tier":
      return <RaisedTier width={length * (0.5 + 0.15 * l)} rows={3 + l} rowDepth={1.2} rise={0.45} y0={H + 1.8} z0={D * 0.45} style={3} c={c} />;
    case "double_stand":
      return <RaisedTier width={length * 0.94} rows={4 + l} rowDepth={1.2} rise={0.5} y0={H + 2.6} z0={D * 0.3} style={3} c={c} glass />;
    case "stilts":
      return <RaisedTier width={length * (0.5 + 0.1 * l)} rows={2 + l} rowDepth={1.5} rise={0.5} y0={3.4} z0={D + 0.3} style={2} c={c} />;
    case "tower": {
      const th = H + 7 + 2 * l;
      return (
        <group position={[0, 0, D * 0.85]}>
          <Box size={[3.4, th, 3.4]} position={[0, th / 2, 0]} color={CONCRETE} />
          <Box size={[4.0, 0.5, 4.0]} position={[0, th + 0.25, 0]} color={c.accentColor} />
          <group position={[0, th + 0.5, 0]}>
            <Flag color={c.teamColor} height={3.5 + l} />
          </group>
        </group>
      );
    }
    case "footbridge": {
      const w = length * (0.5 + 0.12 * l);
      return (
        <group position={[0, 0, -1.8]}>
          <Box size={[w, 0.18, 1.6]} position={[0, 0.8, 0]} color={WOOD} />
          <Posts xs={[-w / 2 + 0.3, -w / 6, w / 6, w / 2 - 0.3]} zs={[-0.6, 0.6]} height={0.8} color={WOOD} />
          <Box size={[w, 0.08, 0.08]} position={[0, 1.7, 0.75]} color={WOOD} />
          <Box size={[w, 0.08, 0.08]} position={[0, 1.2, 0.75]} color={WOOD} />
        </group>
      );
    }
    case "terrace": {
      // Travnatý val s diváky PŘED tribunou, mezi ní a hřištěm: stoupá k tribuně a je nižší než ona.
      const rows = 2 + l;
      const rowDepth = Math.min(1.7, avail / rows);
      const depth = rows * rowDepth;
      return (
        <group position={[0, 0, -depth - 0.5]}>
          <Block length={length * 0.9} rows={rows} depth={depth} height={rows * 0.5} level={1} standColor={EARTH} seatColor={EARTH} panel={false} c={c} />
        </group>
      );
    }
    case "round_stand": {
      // Oblouk PŘED tribunou, čelem k hřišti. Vnější okraj se téměř dotýká přední hrany tribuny,
      // střed oblouku leží na straně hřiště a oblouk je tak mělký, že nezasáhne do hřiště.
      const rows = 2 + l;
      const rowW = Math.min(1.0, avail / rows);
      const rOut = 70;
      const hw = Math.min(length * 0.36, 14);
      const angle = 2 * Math.asin(Math.min(0.95, hw / rOut));
      return (
        <group position={[0, 0, -0.6 - rOut]}>
          <ArcStand rIn={rOut - rows * rowW} rows={rows} angle={angle} rowW={rowW} rise={0.5} c={c} />
        </group>
      );
    }
    case "mobile": {
      const w = 6 + 3 * l;
      const rows = 1 + l;
      const rowDepth = Math.min(1.1, avail / rows);
      return (
        <group position={[0, 0, -rows * rowDepth - 0.5]}>
          <Block length={w} rows={rows} depth={rows * rowDepth} height={rows * 0.55} level={1} standColor={METAL} panel={false} c={c} />
        </group>
      );
    }
    default:
      return null;
  }
}

/** Rohové přístavby: umístění ve světě podle rohu (sx, sz), lokální +Z míří po úhlopříčce ven. */
function CornerKind({ kind, level, sx, sz, sideLevels, c }: { kind: string; level: number; sx: number; sz: number; sideLevels: SideLevels; c: Common }) {
  const l = lv(level);
  const ex = PITCH.width / 2;
  const ez = PITCH.depth / 2;
  const diag = Math.atan2(sx, sz);
  const goalSide: SceneSide = sz > 0 ? "north" : "south";
  const goalLevel = sideLevels[goalSide];
  switch (kind) {
    case "corner":
      return (
        <group position={[sx * (ex + STAND_GAP + 1.5), 0, sz * (ez + STAND_GAP + 1.5)]} rotation={[0, diag, 0]}>
          <Block length={6 + 2 * l} rows={2 + l} depth={(2 + l) * 1.6} height={(2 + l) * 0.6} level={2} c={c} />
        </group>
      );
    case "curved_corner": {
      const rows = 2 + l;
      return (
        <group position={[sx * (ex + 1), 0, sz * (ez + 1)]} rotation={[0, diag, 0]}>
          <ArcStand rIn={6} rows={rows} angle={Math.PI / 2} rowW={1.3} rise={0.6} c={c} />
        </group>
      );
    }
    case "wing": {
      // Pokračování tribuny za brankou kolem rohu: stejná výška i hloubka jako sousední tribuna.
      const sd = dimsOf(goalLevel >= 1 ? goalLevel : 2);
      const w = 8 + l * 3;
      return (
        <group
          position={[sx * (ex + w / 2 + 0.3), 0, sz * (ez + STAND_GAP + sd.depth / 2)]}
          rotation={[0, sz > 0 ? 0 : Math.PI, 0]}
        >
          <Block length={w} rows={sd.rows} depth={sd.depth} height={sd.height} level={lv(goalLevel >= 1 ? goalLevel : 2)} c={c} />
        </group>
      );
    }
    case "bridge": {
      const len = 8 + l * 2;
      return (
        <group position={[sx * (ex + 5), 0, sz * (ez + 5)]} rotation={[0, diag, 0]}>
          <Posts xs={[-len / 2 + 0.4, len / 2 - 0.4]} zs={[-0.9, 0.9]} height={3} color={CONCRETE} />
          <Box size={[len, 0.4, 2.8]} position={[0, 3.2, 0]} color={CONCRETE} />
          <Box size={[len, 0.9, 0.08]} position={[0, 3.85, 1.35]} color="#BFE3F2" rough={0.15} />
          <Box size={[len, 0.9, 0.08]} position={[0, 3.85, -1.35]} color="#BFE3F2" rough={0.15} />
        </group>
      );
    }
    case "mobile":
      return (
        <group position={[sx * (ex + STAND_GAP + 2), 0, sz * (ez + STAND_GAP + 2)]} rotation={[0, diag, 0]}>
          <Block length={4 + l * 1.5} rows={1 + l} depth={(1 + l) * 1.1} height={(1 + l) * 0.55} level={1} standColor={METAL} panel={false} c={c} />
        </group>
      );
    default:
      return null;
  }
}

function sideFrame(side: SceneSide, standLevel: number) {
  const D = dimsOf(standLevel).depth;
  const isEW = side === "east" || side === "west";
  const dist = (isEW ? PITCH.width : PITCH.depth) / 2 + STAND_GAP + D / 2;
  const length = isEW ? PITCH.depth : PITCH.width;
  const position: [number, number, number] =
    side === "north" ? [0, 0, dist] : side === "south" ? [0, 0, -dist] : side === "east" ? [dist, 0, 0] : [-dist, 0, 0];
  const rotY = side === "north" ? 0 : side === "south" ? Math.PI : side === "east" ? Math.PI / 2 : -Math.PI / 2;
  return { position, rotY, length };
}

/** Zprůhlední všechny materiály uvnitř (náhled před stavbou) a obarví je akcentem. */
function GhostWrap({ ghost, accent, children }: { ghost: boolean; accent: string; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!ghost || !ref.current) return;
    ref.current.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mt of mats) {
        const m = mt as THREE.MeshStandardMaterial;
        m.transparent = true;
        m.opacity = 0.5;
        m.depthWrite = false;
        if (m.emissive) {
          m.emissive = new THREE.Color(accent);
          m.emissiveIntensity = 0.45;
        }
        m.needsUpdate = true;
      }
    });
  });
  return <group ref={ref}>{children}</group>;
}

function One({ item, sideLevels, c }: { item: ExtensionInstance; sideLevels: SideLevels; c: Common }) {
  const side = SIDE_SLOT[item.slot];
  if (side) {
    const standLevel = sideLevels[side];
    const { position, rotY, length } = sideFrame(side, standLevel);
    return (
      <group position={position} rotation={[0, rotY, 0]}>
        <SideKind kind={item.kind} level={item.level} length={length} standLevel={standLevel} c={c} />
      </group>
    );
  }
  const corner = CORNER_SLOT[item.slot];
  if (corner) {
    return <CornerKind kind={item.kind} level={item.level} sx={corner[0]} sz={corner[1]} sideLevels={sideLevels} c={c} />;
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
  secondaryColor?: string;
  mode?: StadiumMode;
  attendanceRatio?: number;
  reducedDetail?: boolean;
  isSnow?: boolean;
}

export function StandExtensions({
  extensions, preview, sideLevels, standColor, seatColor, accentColor, teamColor,
  secondaryColor = "#FFFFFF", mode = "match_day", attendanceRatio = 0.6, reducedDetail = false, isSnow = false,
}: StandExtensionsProps) {
  const c: Common = { standColor, seatColor, accentColor, teamColor, secondaryColor, mode, attendanceRatio, reducedDetail, isSnow };
  // Náhled nahrazuje stávající přístavbu ve stejném místě (vylepšení se ukáže na nové úrovni).
  const shown = extensions.filter((e) => !preview || e.slot !== preview.slot);
  return (
    <group>
      {shown.map((e) => (
        <One key={`${e.slot}-${e.kind}-${e.level}`} item={e} sideLevels={sideLevels} c={c} />
      ))}
      {preview && (
        <GhostWrap key={`preview-${preview.slot}-${preview.kind}-${preview.level}`} ghost accent={accentColor}>
          <One item={preview} sideLevels={sideLevels} c={c} />
        </GhostWrap>
      )}
    </group>
  );
}
