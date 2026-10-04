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
import { generateCorrugatedTexture } from "./materialTextures";
import { canopyPlan, raisedTierSpec, type SceneSide, type SideLevels } from "./stand-levels";

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
  /** Zastřešení tribun (0–3) a barva plechu; 0 = bez střechy. */
  roofLevel: number;
  roofColor: string;
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

/** Poloměr vnitřního okraje točené tribuny (m): velký, aby byl oblouk mělký. */
const ROUND_RIN = 70;

/** Vzdálenost, o kterou se vnitřní okraj točené tribuny na koncích přiblíží k hřišti. */
export function roundStandSag(hw: number): number {
  return ROUND_RIN - Math.sqrt(ROUND_RIN * ROUND_RIN - hw * hw);
}

function extrudeFlat(shape: THREE.Shape, height: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  return g;
}

const hash = (i: number) => ((Math.imul(i + 1, 2654435761) >>> 0) % 10007) / 10007;

const CROWD_SHIRTS = [
  "#FFFFFF", "#F87171", "#60A5FA", "#34D399", "#FBBF24", "#FB923C", "#38BDF8", "#E2E8F0", "#F43F5E", "#FDE047", "#A78BFA", "#93C5FD",
];
const CROWD_PANTS = ["#3B82F6", "#60A5FA", "#94A3B8", "#CBD5E1", "#D6D3D1", "#475569", "#2563EB"];
const CROWD_SKINS = ["#FFF1F2", "#FFE4E6", "#FED7AA", "#FDE68A", "#E5B887", "#D4A373"];

/**
 * Sedačky a diváci rozmístění po bodech `seats` (poloha a natočení čelem ke středu).
 * Diváci mají stejné proporce a barvy jako na skutečných tribunách: kalhoty, tělo v pestrém oblečení
 * (část v klubových barvách), hlava v odstínech pleti a čepice.
 */
function SeatsAndCrowd({ seats, c }: { seats: Array<{ x: number; y: number; z: number; th: number }>; c: Common }) {
  const seatRef = useRef<THREE.InstancedMesh>(null);
  const pantsRef = useRef<THREE.InstancedMesh>(null);
  const torsoRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const hatRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const zero = new THREE.Vector3(0, 0, 0);
    const col = new THREE.Color();
    const pick = <T,>(list: T[], i: number, salt: number) => list[Math.floor(hash(i * 7 + salt) * list.length) % list.length];
    seats.forEach((s, i) => {
      e.set(0, s.th, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, one);
      seatRef.current?.setMatrixAt(i, m);

      const show = c.mode !== "training_day" && hash(i) < c.attendanceRatio;
      const sc = show ? one : zero;
      const yb = s.y + 0.14;
      const at = (dy: number) => new THREE.Vector3(s.x, yb + dy, s.z);
      m.compose(at(-0.14), q, sc);
      pantsRef.current?.setMatrixAt(i, m);
      m.compose(at(0.23), q, sc);
      torsoRef.current?.setMatrixAt(i, m);
      m.compose(at(0.46 + 0.13), q, sc);
      headRef.current?.setMatrixAt(i, m);
      m.compose(at(0.46 + 0.26 + 0.04), q, show && hash(i * 3 + 5) < 0.7 ? one : zero);
      hatRef.current?.setMatrixAt(i, m);

      const roll = hash(i + 977);
      col.set(roll < 0.28 ? c.teamColor : roll < 0.4 ? c.secondaryColor : pick(CROWD_SHIRTS, i, 1));
      torsoRef.current?.setColorAt(i, col);
      col.set(pick(CROWD_PANTS, i, 2));
      pantsRef.current?.setColorAt(i, col);
      col.set(pick(CROWD_SKINS, i, 3));
      headRef.current?.setColorAt(i, col);
      col.set(pick([c.teamColor, c.secondaryColor, "#FFFFFF", "#EF4444", "#3B82F6", "#F59E0B", "#10B981", "#FDE047"], i, 4));
      hatRef.current?.setColorAt(i, col);
    });
    for (const r of [seatRef, pantsRef, torsoRef, headRef, hatRef]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
    }
  }, [seats, c.mode, c.attendanceRatio, c.teamColor, c.secondaryColor]);
  const n = seats.length;
  return (
    <>
      <instancedMesh ref={seatRef} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[0.55, 0.08, 0.45]} />
        <meshStandardMaterial color={c.seatColor} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={pantsRef} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[0.31, 0.32, 0.34]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={torsoRef} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[0.34, 0.46, 0.25]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[0.19, 0.26, 0.19]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={hatRef} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[0.2, 0.1, 0.22]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </>
  );
}

/**
 * Točená tribuna: oblouk se středem na straně hřiště, stupně stoupají od hřiště. Konce jsou
 * řezané rovinami x = ±hw (stejně jako rovná tribuna za brankou), takže přesně navazují na rohy.
 * Lokálně z = 0 je vnitřní okraj uprostřed, stupně stoupají do +z.
 */
function RoundStand({ rows, depth, height, hw, c }: { rows: number; depth: number; height: number; hw: number; c: Common }) {
  const rowW = depth / rows;
  const rise = height / rows;
  const geoms = useMemo(() => {
    return Array.from({ length: rows }).map((_, i) => {
      const rIn = ROUND_RIN + i * rowW;
      const rOut = rIn + rowW;
      const aIn = Math.asin(Math.min(0.99, hw / rIn));
      const aOut = Math.asin(Math.min(0.99, hw / rOut));
      // Tvar v rovině XY (y = -z po otočení): vnější oblouk, příčka, vnitřní oblouk zpět.
      const shape = new THREE.Shape();
      shape.moveTo(rOut * Math.sin(-aOut), -rOut * Math.cos(aOut));
      shape.absarc(0, 0, rOut, -Math.PI / 2 - aOut, -Math.PI / 2 + aOut, false);
      shape.lineTo(rIn * Math.sin(aIn), -rIn * Math.cos(aIn));
      shape.absarc(0, 0, rIn, -Math.PI / 2 + aIn, -Math.PI / 2 - aIn, true);
      shape.closePath();
      return extrudeFlat(shape, (i + 1) * rise);
    });
  }, [rows, rowW, rise, hw]);
  const seats = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; th: number }> = [];
    for (let i = 0; i < rows; i++) {
      const r = ROUND_RIN + (i + 0.5) * rowW;
      const half = Math.asin(Math.min(0.99, hw / r));
      const n = Math.max(2, Math.floor((2 * hw) / 0.85));
      for (let k = 0; k < n; k++) {
        const th = -half + ((k + 0.5) * 2 * half) / n;
        out.push({ x: r * Math.sin(th), y: (i + 1) * rise + 0.06, z: r * Math.cos(th) - ROUND_RIN, th });
      }
    }
    return out;
  }, [rows, rowW, rise, hw]);
  return (
    <group>
      {/* Střed oblouku je ROUND_RIN před tribunou, na straně hřiště (z = -ROUND_RIN). */}
      <group position={[0, 0, -ROUND_RIN]}>
        {geoms.map((g, i) => (
          <mesh key={i} geometry={g} castShadow receiveShadow>
            <meshStandardMaterial color={c.standColor} roughness={0.92} />
          </mesh>
        ))}
      </group>
      <SeatsAndCrowd seats={seats} c={c} />
    </group>
  );
}

/**
 * Zahnutá rohová tribuna: čtvrtina elipsy se středem v rohu hřiště, jejíž vnitřní okraj vede přesně
 * z předního rohu konce tribuny za brankou (v bodě 0, b) do předního rohu konce tribuny na dlouhé
 * straně (v bodě a, 0). Koncové plochy leží v rovinách tribun, takže navazuje bez mezery a překryvu.
 * Lokální osy: u po jedné, v po druhé straně rohu (do kvadrantu +u, +v).
 */
function CornerBowl({ a, b, rows, depth, height, c }: { a: number; b: number; rows: number; depth: number; height: number; c: Common }) {
  const rowW = depth / rows;
  const rise = height / rows;
  const geoms = useMemo(() => {
    return Array.from({ length: rows }).map((_, i) => {
      const aIn = a + i * rowW;
      const bIn = b + i * rowW;
      const aOut = aIn + rowW;
      const bOut = bIn + rowW;
      // y = -v, protože se po otočení kolem X změní na +z.
      const shape = new THREE.Shape();
      shape.moveTo(aOut, 0);
      shape.absellipse(0, 0, aOut, bOut, 0, -Math.PI / 2, true, 0);
      shape.lineTo(0, -bIn);
      shape.absellipse(0, 0, aIn, bIn, -Math.PI / 2, 0, false, 0);
      shape.closePath();
      return extrudeFlat(shape, (i + 1) * rise);
    });
  }, [a, b, rows, rowW, rise]);
  const seats = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; th: number }> = [];
    for (let i = 0; i < rows; i++) {
      const am = a + (i + 0.5) * rowW;
      const bm = b + (i + 0.5) * rowW;
      const n = Math.max(2, Math.floor(((am + bm) / 2) * (Math.PI / 2) / 0.85));
      for (let k = 0; k < n; k++) {
        const phi = ((k + 0.5) * (Math.PI / 2)) / n;
        // Vnější normála elipsy; sedačka míří opačně, tedy ke středu. th = úhel od +z k +x.
        const nu = Math.cos(phi) / am;
        const nv = Math.sin(phi) / bm;
        out.push({ x: am * Math.cos(phi), y: (i + 1) * rise + 0.06, z: bm * Math.sin(phi), th: Math.atan2(nu, nv) });
      }
    }
    return out;
  }, [a, b, rows, rowW, rise]);
  return (
    <group>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial color={c.standColor} roughness={0.92} />
        </mesh>
      ))}
      <SeatsAndCrowd seats={seats} c={c} />
    </group>
  );
}

/** Šikmá plechová střecha nad zadní částí tribuny, stejná jako `StandRoof` nad rovnou tribunou. */
function RoofSlab({ alongLen, D, H, c }: { alongLen: number; D: number; H: number; c: Common }) {
  const tex = useMemo(() => generateCorrugatedTexture(c.roofColor, 8, 2), [c.roofColor]);
  // Stejné pravidlo výšky a sklonu jako u střechy nad rovnou tribunou (canopyPlan).
  const { tilt, roofY, roofZ, roofDepth, backZ } = canopyPlan(D, H, c.roofLevel);
  const postH = roofY + (backZ - roofZ) * Math.tan(tilt) - 0.1;
  return (
    <group>
      <mesh position={[0, roofY, roofZ]} rotation={[-tilt, 0, 0]} castShadow>
        <boxGeometry args={[alongLen + 0.4, 0.14, roofDepth]} />
        <meshStandardMaterial map={tex.map} bumpMap={tex.bumpMap} bumpScale={0.12} roughness={0.5} metalness={0.35} />
      </mesh>
      {[-alongLen * 0.4, 0, alongLen * 0.4].map((x, i) => (
        <Box key={i} size={[0.18, postH, 0.18]} position={[x, postH / 2, backZ]} color="#4A4D54" metal={0.5} />
      ))}
    </group>
  );
}

/**
 * Plochá střecha nad obloukovou tribunou (mezikruží řezané rovinami x = ±hw). Rozsah od přední hrany
 * tribuny i výška jsou stejné jako u střechy nad rovnou tribunou (canopyPlan), takže na ni i na rohovou
 * střechu navazuje bez mezery a schodu.
 */
function RoundRoof({ depth, height, hw, c }: { depth: number; height: number; hw: number; c: Common }) {
  const tex = useMemo(() => generateCorrugatedTexture(c.roofColor, 8, 2), [c.roofColor]);
  const plan = canopyPlan(depth, height, c.roofLevel);
  const t1 = plan.roofZ - plan.roofDepth / 2;
  const t2 = plan.roofZ + plan.roofDepth / 2;
  const r1 = ROUND_RIN + t1;
  const r2 = ROUND_RIN + t2;
  const geometry = useMemo(() => {
    const aIn = Math.asin(Math.min(0.99, hw / r1));
    const aOut = Math.asin(Math.min(0.99, hw / r2));
    const shape = new THREE.Shape();
    shape.moveTo(r2 * Math.sin(-aOut), -r2 * Math.cos(aOut));
    shape.absarc(0, 0, r2, -Math.PI / 2 - aOut, -Math.PI / 2 + aOut, false);
    shape.lineTo(r1 * Math.sin(aIn), -r1 * Math.cos(aIn));
    shape.absarc(0, 0, r1, -Math.PI / 2 + aIn, -Math.PI / 2 - aIn, true);
    shape.closePath();
    return extrudeFlat(shape, 0.14);
  }, [r1, r2, hw]);
  const roofY = plan.roofY;
  const rp = ROUND_RIN + plan.backZ;
  const half = Math.asin(Math.min(0.99, hw / rp));
  return (
    <group position={[0, 0, -ROUND_RIN]}>
      <mesh geometry={geometry} position={[0, roofY, 0]} castShadow>
        <meshStandardMaterial map={tex.map} bumpMap={tex.bumpMap} bumpScale={0.12} roughness={0.5} metalness={0.35} />
      </mesh>
      {[-0.85, -0.4, 0, 0.4, 0.85].map((f) => (
        <Box key={f} size={[0.18, roofY, 0.18]} position={[rp * Math.sin(half * f), roofY / 2, rp * Math.cos(half * f)]} color="#4A4D54" metal={0.5} />
      ))}
    </group>
  );
}

/**
 * Plochá střecha nad zahnutou rohovou tribunou (mezielipsa). Rozsah od přední hrany tribun i výška
 * jsou stejné jako u střechy nad rovnou tribunou (canopyPlan), a koncové plochy leží v rovinách
 * tribun, takže střecha na střechy sousedních tribun přesně navazuje.
 */
function CornerRoof({ a, b, depth, height, c }: { a: number; b: number; depth: number; height: number; c: Common }) {
  const tex = useMemo(() => generateCorrugatedTexture(c.roofColor, 8, 2), [c.roofColor]);
  const plan = canopyPlan(depth, height, c.roofLevel);
  const t1 = plan.roofZ - plan.roofDepth / 2;
  const t2 = plan.roofZ + plan.roofDepth / 2;
  const geometry = useMemo(() => {
    const aIn = a + t1;
    const bIn = b + t1;
    const aOut = a + t2;
    const bOut = b + t2;
    const shape = new THREE.Shape();
    shape.moveTo(aOut, 0);
    shape.absellipse(0, 0, aOut, bOut, 0, -Math.PI / 2, true, 0);
    shape.lineTo(0, -bIn);
    shape.absellipse(0, 0, aIn, bIn, -Math.PI / 2, 0, false, 0);
    shape.closePath();
    return extrudeFlat(shape, 0.14);
  }, [a, b, t1, t2]);
  const roofY = plan.roofY;
  return (
    <group>
      <mesh geometry={geometry} position={[0, roofY, 0]} castShadow>
        <meshStandardMaterial map={tex.map} bumpMap={tex.bumpMap} bumpScale={0.12} roughness={0.5} metalness={0.35} />
      </mesh>
      {[0.1, 0.5, 0.8, 1.1, 1.47].map((phi) => (
        <Box key={phi} size={[0.18, roofY, 0.18]} position={[(a + plan.backZ) * Math.cos(phi), roofY / 2, (b + plan.backZ) * Math.sin(phi)]} color="#4A4D54" metal={0.5} />
      ))}
    </group>
  );
}

function Block(props: {
  length: number; rows: number; depth: number; height: number; level?: number; c: Common;
  standColor?: string; seatColor?: string; panel?: boolean; walls?: { left: boolean; right: boolean };
}) {
  const { c } = props;
  return (
    <StandBlock
      length={props.length} rows={props.rows} depth={props.depth} height={props.height} level={props.level ?? 2}
      standColor={props.standColor ?? c.standColor} seatColor={props.seatColor ?? c.seatColor}
      teamColor={c.teamColor} secondaryColor={c.secondaryColor} attendanceRatio={c.attendanceRatio}
      mode={c.mode} reducedDetail={c.reducedDetail} isSnow={c.isSnow} panel={props.panel} walls={props.walls}
    />
  );
}

/** Horní patro na sloupech: betonová deska, stupně se sedačkami a diváky nahoře. */
function RaisedTier({ width, spec, c }: { width: number; spec: ReturnType<typeof raisedTierSpec>; c: Common }) {
  const { rows, rowDepth, rise, y0, z0, style, glass } = spec;
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
  switch (kind) {
    case "length": {
      const w = 6 + 3 * l;
      return (
        <>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * (length / 2 + w / 2), 0, 0]}>
              <Block
                length={w} rows={sd.rows} depth={D} height={H} level={style} c={c}
                walls={s < 0 ? { left: true, right: false } : { left: false, right: true }}
              />
              {c.roofLevel > 0 && <RoofSlab alongLen={w} D={D} H={H} c={c} />}
            </group>
          ))}
        </>
      );
    }
    case "second_tier":
    case "double_stand":
    case "stilts": {
      const spec = raisedTierSpec(kind, l, H, D);
      return <RaisedTier width={length * spec.widthFactor} spec={spec} c={c} />;
    }
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
      // Val stojí na místě tribuny za brankou (tribuna na té straně se nekreslí): travnatý svah
      // stejné výšky a hloubky s diváky na stání. Před tribunou ani za ní by někomu bral výhled.
      const bd = dimsOf(Math.max(1, standLevel));
      return (
        <Block
          length={length * 0.92} rows={Math.max(3, bd.rows)} depth={bd.depth} height={bd.height * 0.9}
          level={1} standColor={EARTH} seatColor={EARTH} panel={false} c={c}
        />
      );
    }
    case "round_stand": {
      // Točená tribuna je oblouková podoba tribuny za brankou (rovná tribuna na té straně se
      // nekreslí). Je stejně široká jako rovná, vyšší úroveň přidá řady a hloubku.
      const bd = dimsOf(Math.max(1, standLevel));
      const rows = Math.max(3, bd.rows) + l;
      // Rozměry jako u rovné tribuny (vyšší úroveň přidá jen řady), aby střecha navazovala na rohy.
      const depth = bd.depth;
      const height = bd.height;
      const hw = Math.min(length / 2, 20);
      return (
        <>
          <RoundStand rows={rows} depth={depth} height={height} hw={hw} c={c} />
          {c.roofLevel > 0 && <RoundRoof depth={depth} height={height} hw={hw} c={c} />}
        </>
      );
    }
    case "mobile": {
      // Mobilní tribunka stojí vedle tribuny na jejím konci, ne před ní (neberou si výhled).
      const w = 6 + 3 * l;
      const rows = 1 + l;
      return (
        <group position={[length / 2 + w / 2 + 1, 0, 0]}>
          <Block length={w} rows={rows} depth={rows * 1.1} height={rows * 0.55} level={1} standColor={METAL} panel={false} c={c} />
        </group>
      );
    }
    default:
      return null;
  }
}

/**
 * Rohové přístavby vyplňují mezeru mezi konci dvou sousedních tribun.
 *
 * Mezera je mezi předním rohem konce tribuny za brankou (P_n) a předním rohem konce tribuny
 * na dlouhé straně (P_e). Zahnutá tribuna je čtvrtkruh se středem v rohu hřiště, jehož poloměr
 * sedí na oba body, rohová tribuna je přímý klín mezi nimi, most spojuje obě tribuny nad mezerou.
 */
function CornerKind({ kind, level, sx, sz, sideLevels, rounds, c }: { kind: string; level: number; sx: number; sz: number; sideLevels: SideLevels; rounds: Set<SceneSide>; c: Common }) {
  const l = lv(level);
  const ex = PITCH.width / 2;
  const ez = PITCH.depth / 2;
  const diag = Math.atan2(sx, sz);
  const goalSide: SceneSide = sz > 0 ? "north" : "south";
  const longSide: SceneSide = sx > 0 ? "east" : "west";
  const dn = dimsOf(Math.max(1, sideLevels[goalSide])).depth;
  const de = dimsOf(Math.max(1, sideLevels[longSide])).depth;
  const rN = STAND_GAP + dn / 2;
  const rE = STAND_GAP + de / 2;
  const pn: [number, number] = [sx * ex, sz * (ez + rN)];
  const pe: [number, number] = [sx * (ex + rE), sz * ez];
  const mid: [number, number] = [(pn[0] + pe[0]) / 2, (pn[1] + pe[1]) / 2];
  const gapLen = Math.hypot(pn[0] - pe[0], pn[1] - pe[1]);
  switch (kind) {
    case "corner": {
      const rows = 2 * l;
      return (
        <group position={[mid[0], 0, mid[1]]} rotation={[0, diag, 0]}>
          <Block length={gapLen + 0.4} rows={rows} depth={rows * 1.2} height={rows * 0.55} level={2} c={c} walls={{ left: false, right: false }} />
          {c.roofLevel > 0 && <RoofSlab alongLen={gapLen + 0.4} D={rows * 1.2} H={rows * 0.55} c={c} />}
        </group>
      );
    }
    case "curved_corner": {
      // Čtvrtina elipsy od předního rohu konce tribuny za brankou k přednímu rohu konce tribuny na
      // dlouhé straně. Je stejně vysoká a hluboká jako sousední tribuny, takže na ně přesně navazuje.
      const bdN = dimsOf(Math.max(1, sideLevels[goalSide]));
      const bdE = dimsOf(Math.max(1, sideLevels[longSide]));
      const sag = rounds.has(goalSide) ? roundStandSag(Math.min(ex, 20)) : 0;
      const frontGoal = Math.max(1, STAND_GAP + bdN.depth / 2 - sag);
      const frontLong = STAND_GAP + bdE.depth / 2;
      const ry = sx > 0 ? (sz > 0 ? 0 : Math.PI / 2) : sz < 0 ? Math.PI : -Math.PI / 2;
      const swap = Math.abs(ry) === Math.PI / 2;
      return (
        <group position={[sx * ex, 0, sz * ez]} rotation={[0, ry, 0]}>
          <CornerBowl
            a={swap ? frontGoal : frontLong} b={swap ? frontLong : frontGoal}
            rows={Math.max(3, Math.round((bdN.rows + bdE.rows) / 2))}
            depth={(bdN.depth + bdE.depth) / 2} height={(bdN.height + bdE.height) / 2} c={c}
          />
          {c.roofLevel > 0 && (
            <CornerRoof
              a={swap ? frontGoal : frontLong} b={swap ? frontLong : frontGoal}
              depth={(bdN.depth + bdE.depth) / 2} height={(bdN.height + bdE.height) / 2} c={c}
            />
          )}
        </group>
      );
    }
    case "wing": {
      // Pokračování tribuny za brankou kolem rohu: stejná výška i hloubka jako ona.
      const goalLevel = sideLevels[goalSide];
      const sd = dimsOf(goalLevel >= 1 ? goalLevel : 2);
      const w = 8 + l * 3;
      return (
        <group
          position={[sx * (ex + w / 2), 0, sz * (ez + STAND_GAP + sd.depth / 2)]}
          rotation={[0, sz > 0 ? 0 : Math.PI, 0]}
        >
          <Block
            length={w} rows={sd.rows} depth={sd.depth} height={sd.height} level={lv(goalLevel >= 1 ? goalLevel : 2)} c={c}
            walls={(sz > 0 ? sx : -sx) > 0 ? { left: false, right: true } : { left: true, right: false }}
          />
          {c.roofLevel > 0 && <RoofSlab alongLen={w} D={sd.depth} H={sd.height} c={c} />}
        </group>
      );
    }
    case "bridge": {
      const len = gapLen + 2 + l;
      return (
        <group position={[mid[0], 0, mid[1]]} rotation={[0, diag, 0]}>
          <Posts xs={[-len / 2 + 0.4, len / 2 - 0.4]} zs={[-0.9, 0.9]} height={3} color={CONCRETE} />
          <Box size={[len, 0.4, 2.8]} position={[0, 3.2, 0]} color={CONCRETE} />
          <Box size={[len, 0.9, 0.08]} position={[0, 3.85, 1.35]} color="#BFE3F2" rough={0.15} />
          <Box size={[len, 0.9, 0.08]} position={[0, 3.85, -1.35]} color="#BFE3F2" rough={0.15} />
        </group>
      );
    }
    case "mobile": {
      const rows = 1 + l;
      return (
        <group position={[mid[0], 0, mid[1]]} rotation={[0, diag, 0]}>
          <Block length={gapLen} rows={rows} depth={rows * 1.1} height={rows * 0.55} level={1} standColor={METAL} panel={false} c={c} />
        </group>
      );
    }
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

function One({ item, sideLevels, rounds, c }: { item: ExtensionInstance; sideLevels: SideLevels; rounds: Set<SceneSide>; c: Common }) {
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
    return <CornerKind kind={item.kind} level={item.level} sx={corner[0]} sz={corner[1]} sideLevels={sideLevels} rounds={rounds} c={c} />;
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
  /** Úroveň zastřešení tribun (0–3) a vlastní barva střechy; přístavby se zastřeší stejně jako tribuny. */
  roofLevel?: number;
  roofColor?: string | null;
}

export function StandExtensions({
  extensions, preview, sideLevels, standColor, seatColor, accentColor, teamColor,
  secondaryColor = "#FFFFFF", mode = "match_day", attendanceRatio = 0.6, reducedDetail = false, isSnow = false,
  roofLevel = 0, roofColor = null,
}: StandExtensionsProps) {
  const c: Common = {
    standColor, seatColor, accentColor, teamColor, secondaryColor, mode, attendanceRatio, reducedDetail, isSnow,
    roofLevel, roofColor: roofColor ?? "#9A9DA4",
  };
  // Náhled nahrazuje stávající přístavbu ve stejném místě (vylepšení se ukáže na nové úrovni).
  const shown = extensions.filter((e) => !preview || e.slot !== preview.slot);
  // Strany, kde je místo rovné tribuny točená (rohy na ně musí navázat).
  const rounds = new Set<SceneSide>();
  for (const e of [...shown, ...(preview ? [preview] : [])]) {
    const side = SIDE_SLOT[e.slot];
    if (side && e.kind === "round_stand") rounds.add(side);
  }
  return (
    <group>
      {shown.map((e) => (
        <One key={`${e.slot}-${e.kind}-${e.level}`} item={e} sideLevels={sideLevels} rounds={rounds} c={c} />
      ))}
      {preview && (
        <GhostWrap key={`preview-${preview.slot}-${preview.kind}-${preview.level}`} ghost accent={accentColor}>
          <One item={preview} sideLevels={sideLevels} rounds={rounds} c={c} />
        </GhostWrap>
      )}
    </group>
  );
}
