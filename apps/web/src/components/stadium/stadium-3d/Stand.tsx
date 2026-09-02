"use client";

import { useMemo, useRef, useEffect, useLayoutEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PITCH, STAND_DIMS, type StadiumMode } from "./constants";
import {
  generateWoodTexture,
  generateConcreteTexture,
} from "./materialTextures";

type Side = "north" | "south" | "east" | "west";

interface StandProps {
  side: Side;
  level: number;
  teamColor: string;
  secondaryColor?: string;
  standColor?: string;
  seatColor?: string;
  accentColor?: string;
  reducedDetail?: boolean;
  mode?: StadiumMode;
  attendanceRatio?: number;
}

const STAND_GAP = 2.5;

/**
 * Mexická vlna obíhá areál proti směru hodinových ručiček: sever → východ → jih → západ.
 * Lokální +X každé tribuny míří právě tím směrem, takže vlna běží vždy od -délka/2 k +délka/2.
 * Slot říká, ve které čtvrtině oběhu je tribuna na řadě; chybějící tribuny (L1 má jen
 * sever a jih) nechají vlnu na dvě sekundy „přeskočit".
 */
const WAVE_SLOT: Record<Side, number> = { north: 0, east: 1, south: 2, west: 3 };
/** Perioda mezi vlnami (s). */
const WAVE_PERIOD = 28;
/** Doba jednoho oběhu přes všechny čtyři tribuny (s). */
const WAVE_LAP = 9;
/** Šířka čela vlny (m) a výška zdvihu. */
const WAVE_WIDTH = 4.5;
const WAVE_LIFT = 0.42;

export function Stand({
  side,
  level,
  teamColor,
  secondaryColor = "#FFFFFF",
  standColor,
  seatColor,
  accentColor,
  reducedDetail = false,
  mode = "match_day",
  attendanceRatio = 0.75,
}: StandProps) {
  if (level <= 0) return null;
  return (
    <ActiveStand
      side={side}
      level={level}
      teamColor={teamColor}
      secondaryColor={secondaryColor}
      standColor={standColor}
      seatColor={seatColor}
      accentColor={accentColor}
      reducedDetail={reducedDetail}
      mode={mode}
      attendanceRatio={attendanceRatio}
    />
  );
}

function ActiveStand({
  side,
  level,
  teamColor,
  secondaryColor = "#FFFFFF",
  standColor,
  seatColor,
  accentColor,
  reducedDetail = false,
  mode = "match_day",
  attendanceRatio = 0.75,
}: StandProps) {
  const dims = STAND_DIMS[Math.min(level, 3)];
  const finalSeatColor = seatColor ?? teamColor;
  const finalAccent = accentColor ?? "#C9A84C";
  const finalPanelColor = standColor ?? teamColor;

  const isEW = side === "east" || side === "west";
  const length = isEW ? PITCH.depth : PITCH.width;
  const seatColMult = reducedDetail ? 0.7 : 1.2;

  const distance = (isEW ? PITCH.width : PITCH.depth) / 2 + STAND_GAP + dims.depth / 2;
  let position: [number, number, number];
  let rotationY: number;

  switch (side) {
    case "north": position = [0, 0, distance]; rotationY = 0; break;
    case "south": position = [0, 0, -distance]; rotationY = Math.PI; break;
    case "east":  position = [distance, 0, 0]; rotationY = Math.PI / 2; break;
    case "west":  position = [-distance, 0, 0]; rotationY = -Math.PI / 2; break;
  }

  const seatRows = dims.rows;
  const seatColumns = Math.floor(length * seatColMult);
  const seatSize = 0.7;
  const seatDepth = dims.depth / Math.max(seatRows, 1);
  const seatRise = dims.height / Math.max(seatRows, 1);

  // Procedurální textury podle úrovně tribuny
  const woodTexture = useMemo(() => generateWoodTexture(standColor ?? "#8B6F47", 4, 2), [standColor]);
  const seatWoodTexture = useMemo(() => generateWoodTexture(finalSeatColor, 6, 1), [finalSeatColor]);
  const concreteTexture = useMemo(() => generateConcreteTexture(standColor ?? "#9CA3AF", 5, 3), [standColor]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 1. Stupňovitá základna s realistickou texturou */}
      <StepBase
        level={level}
        length={length}
        rows={seatRows}
        seatDepth={seatDepth}
        seatRise={seatRise}
        woodTexture={woodTexture}
        concreteTexture={concreteTexture}
      />

      {/* 2. Sedačky (lavičky pro L1/L2, tvarované pro L3) */}
      <Seats
        level={level}
        rows={seatRows}
        columns={seatColumns}
        seatSize={seatSize}
        seatDepth={seatDepth}
        seatRise={seatRise}
        length={length}
        teamColor={finalSeatColor}
        woodTexture={seatWoodTexture}
      />

      {/* 3. Diváci na tribuně (jen v zápasový den, škálovaní dle návštěvnosti) */}
      {mode !== "training_day" && (
        <Spectators
          rows={seatRows}
          columns={seatColumns}
          seatSize={seatSize}
          seatDepth={seatDepth}
          seatRise={seatRise}
          length={length}
          attendanceRatio={attendanceRatio}
          teamColor={teamColor}
          secondaryColor={secondaryColor}
          isUltrasSector={side === "south"}
          waveSlot={WAVE_SLOT[side]}
          reducedDetail={reducedDetail}
        />
      )}

      {/* 4. VIP skybox a novinářská lávka (L3). Střecha je samostatné zařízení. */}
      {level >= 3 && (
        <VIPBox
          length={length}
          height={dims.height}
          depth={dims.depth}
          accentColor={finalAccent}
          teamColor={teamColor}
        />
      )}

      {/* 5. Tunel pro nástup hráčů v přízemí (L3 uprostřed) */}
      {level >= 3 && (
        <PlayerTunnel depth={dims.depth} height={dims.height} seatDepth={seatDepth} />
      )}

      {/* 6. Čelní týmový panel / zábradlí */}
      {level >= 2 && (
        <group position={[0, 0.45, -0.05]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[length, 0.85, 0.12]} />
            <meshStandardMaterial color={finalPanelColor} roughness={0.5} metalness={0.2} />
          </mesh>
          {/* Ochranná horní trubka */}
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[length + 0.1, 0.06, 0.15]} />
            <meshStandardMaterial color="#E5E7EB" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Stupňovitá konstrukce tribuny */
function StepBase({
  level,
  length,
  rows,
  seatDepth,
  seatRise,
  woodTexture,
  concreteTexture,
}: {
  level: number;
  length: number;
  rows: number;
  seatDepth: number;
  seatRise: number;
  woodTexture: any;
  concreteTexture: any;
}) {
  if (rows === 0) return null;
  const isWood = level <= 2;
  const tex = isWood ? woodTexture : concreteTexture;

  return (
    <group>
      {Array.from({ length: rows }).map((_, r) => {
        const y = (r + 0.5) * seatRise;
        const z = (r + 0.5) * seatDepth;
        return (
          <group key={r} position={[0, y, z]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[length, seatRise, seatDepth]} />
              <meshStandardMaterial
                map={tex.map}
                bumpMap={tex.bumpMap}
                bumpScale={isWood ? 0.08 : 0.05}
                roughness={isWood ? 0.85 : 0.95}
              />
            </mesh>

            {/* Žlutý bezpečnostní pruh na hraně schodu (L2 a L3) */}
            {level >= 2 && (
              <mesh position={[0, seatRise / 2 + 0.005, -seatDepth / 2 + 0.05]}>
                <planeGeometry args={[length, 0.08]} />
                <meshStandardMaterial color="#FACC15" roughness={0.5} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Zadní a boční stěny tribuny pro ucelený vzhled */}
      {level >= 2 && (
        <>
          {/* Zadní plášť */}
          <mesh
            position={[0, (rows * seatRise) / 2, rows * seatDepth]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[length, rows * seatRise, 0.15]} />
            <meshStandardMaterial
              map={tex.map}
              bumpMap={tex.bumpMap}
              bumpScale={0.06}
              roughness={0.9}
            />
          </mesh>
          {/* Boční štíty */}
          {[-length / 2, length / 2].map((bx, i) => (
            <mesh
              key={i}
              position={[bx, (rows * seatRise) / 2, (rows * seatDepth) / 2]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.2, rows * seatRise, rows * seatDepth]} />
              <meshStandardMaterial
                map={tex.map}
                bumpMap={tex.bumpMap}
                bumpScale={0.06}
                roughness={0.9}
              />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

/** Jednotlivé sedačky (dřevěné latě pro L1/L2, plastová sklápěcí sedadla pro L3) */
function Seats({
  level,
  rows,
  columns,
  seatSize,
  seatDepth,
  seatRise,
  length,
  teamColor,
  woodTexture,
}: {
  level: number;
  rows: number;
  columns: number;
  seatSize: number;
  seatDepth: number;
  seatRise: number;
  length: number;
  teamColor: string;
  woodTexture: any;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);
  const total = rows * columns;
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    if (!ref.current || total === 0) return;
    const stepX = length / columns;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const z = r * seatDepth + seatDepth * 0.55;
      const y = r * seatRise + seatRise + (level >= 3 ? 0.12 : 0.06);
      for (let c = 0; c < columns; c++) {
        // Vynecháme středový průchod u L3 pro tunel
        if (level >= 3 && r < 3 && Math.abs(c - columns / 2) < 3) {
          matrix.makeScale(0, 0, 0);
          ref.current.setMatrixAt(i, matrix);
          if (backRef.current) backRef.current.setMatrixAt(i, matrix);
        } else {
          const x = -length / 2 + stepX * c + stepX / 2;
          matrix.makeTranslation(x, y, z);
          ref.current.setMatrixAt(i, matrix);

          if (backRef.current && level >= 3) {
            const backMatrix = new THREE.Matrix4().makeTranslation(x, y + 0.22, z + seatSize * 0.25);
            backRef.current.setMatrixAt(i, backMatrix);
          }
        }
        i++;
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (backRef.current) backRef.current.instanceMatrix.needsUpdate = true;
  }, [level, rows, columns, seatDepth, seatRise, length, matrix, total, seatSize]);

  if (total === 0) return null;

  if (level <= 2) {
    // Dřevěné lavičkové latě
    return (
      <instancedMesh ref={ref} args={[undefined, undefined, total]} castShadow>
        <boxGeometry args={[seatSize * 0.9, 0.08, seatSize * 0.55]} />
        <meshStandardMaterial
          map={woodTexture.map}
          bumpMap={woodTexture.bumpMap}
          bumpScale={0.06}
          roughness={0.8}
        />
      </instancedMesh>
    );
  }

  // Moderní plastová sklápěcí sedadla s opěradlem
  return (
    <group>
      {/* Sedák */}
      <instancedMesh ref={ref} args={[undefined, undefined, total]} castShadow>
        <boxGeometry args={[seatSize * 0.78, 0.08, seatSize * 0.55]} />
        <meshStandardMaterial color={teamColor} roughness={0.35} metalness={0.15} />
      </instancedMesh>
      {/* Opěradlo */}
      <instancedMesh ref={backRef} args={[undefined, undefined, total]} castShadow>
        <boxGeometry args={[seatSize * 0.78, 0.35, 0.08]} />
        <meshStandardMaterial color={teamColor} roughness={0.35} metalness={0.15} />
      </instancedMesh>
    </group>
  );
}

/** Detailní a rozmanití diváci na tribuně se shlukováním podle procenta návštěvnosti */
function Spectators({
  rows,
  columns,
  seatSize,
  seatDepth,
  seatRise,
  length,
  attendanceRatio = 0.75,
  teamColor,
  secondaryColor = "#FFFFFF",
  isUltrasSector = false,
  waveSlot = 0,
  reducedDetail = false,
}: {
  rows: number;
  columns: number;
  seatSize: number;
  seatDepth: number;
  seatRise: number;
  length: number;
  attendanceRatio: number;
  teamColor: string;
  secondaryColor?: string;
  isUltrasSector?: boolean;
  /** Pořadí tribuny v oběhu mexické vlny (0–3). */
  waveSlot?: number;
  reducedDetail?: boolean;
}) {
  const torsoRef = useRef<THREE.InstancedMesh>(null);
  const pantsRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const hatRef = useRef<THREE.InstancedMesh>(null);
  const beerRef = useRef<THREE.InstancedMesh>(null);
  const scarfRef = useRef<THREE.InstancedMesh>(null);

  const colors = useMemo(
    () => [
      teamColor,
      teamColor,
      secondaryColor,
      "#FFFFFF", // bílá mikina / dres
      "#F87171", // jasně červená bunda
      "#60A5FA", // jasně modrá větrovka
      "#34D399", // svěží zelená mikina
      "#FBBF24", // zlatavě žlutá bunda
      "#FB923C", // světle oranžová větrovka
      "#38BDF8", // azurová bunda
      "#E2E8F0", // světle šedá mikina
      "#F43F5E", // červeno-růžová mikina
      "#FDE047", // jasně žlutý dres
      "#A78BFA", // levandulová mikina
      "#93C5FD", // světle modrá mikina
    ],
    [teamColor, secondaryColor]
  );

  const pantsColors = useMemo(
    () => [
      "#3B82F6", // modré džíny
      "#60A5FA", // světlý denim
      "#94A3B8", // světle šedé kalhoty
      "#CBD5E1", // velmi světle šedé tepláky
      "#D6D3D1", // béžové plátěné kalhoty
      "#475569", // středně šedomodré kalhoty
      "#2563EB", // sytý denim
    ],
    []
  );

  const skins = useMemo(
    () => [
      "#FFF1F2", // světlá narůžovělá
      "#FFE4E6", // světlá přirozená
      "#FED7AA", // světle broskvová
      "#FDE68A", // teplá béžová
      "#E5B887", // přirozená pleť
      "#D4A373", // mírně opálená
    ],
    []
  );

  const hatColors = useMemo(
    () => [teamColor, secondaryColor, "#FFFFFF", "#EF4444", "#3B82F6", "#F59E0B", "#10B981", "#FDE047"],
    [teamColor, secondaryColor]
  );

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // Generování realistických skupinek (shluků fanoušků) podle návštěvnosti
  const filled = useMemo(() => {
    const out: Array<{
      r: number;
      c: number;
      col: string;
      pantsCol: string;
      skin: string;
      hatType: number; // 0: žádná/vlasy, 1: kšiltovka, 2: kulich
      hatCol: string;
      hasBeer: boolean;
      hasScarf: boolean;
      leanAngle: number;
      /** Fáze, amplituda a rychlost pohupování; v kotli navíc, zda fanoušek skáče. */
      phase: number;
      bobAmp: number;
      bobSpeed: number;
      jumper: boolean;
    }> = [];

    let seed = 98765;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const isSoldOut = attendanceRatio >= 0.92;
    const occupiedGrid: boolean[][] = Array.from({ length: rows }, () => Array(columns).fill(false));

    if (isSoldOut) {
      // 100% Vyprodáno — zaplnit prakticky všechna místa (96–100%)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          if (rand() < 0.98) {
            occupiedGrid[r][c] = true;
          }
        }
      }
    } else {
      // Procento návštěvnosti (25%, 50%, 75%)
      const targetFillRatio = Math.min(0.9, Math.max(0.05, attendanceRatio));

      // 1. Shluky kamarádů vedle sebe
      const clusterCount = Math.floor((rows * columns * targetFillRatio) / 2.2);
      for (let i = 0; i < clusterCount; i++) {
        const r = Math.floor(rand() * rows);
        const cStart = Math.floor(rand() * (columns - 1));
        const groupSize = 2 + Math.floor(rand() * 4); // 2 až 5 lidí
        for (let g = 0; g < groupSize; g++) {
          const c = cStart + g;
          if (c < columns && rand() < 0.95) {
            occupiedGrid[r][c] = true;
          }
        }
      }

      // 2. Doplnění jednotlivců pro dosažení přesného procenta
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          if (!occupiedGrid[r][c] && rand() < targetFillRatio * 0.85) {
            occupiedGrid[r][c] = true;
          }
        }
      }
    }

    // 3. Sestavení detailních vlastností pro každého sedícího fanouška
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (occupiedGrid[r][c]) {
          const hatRand = rand();
          const hatType = hatRand < 0.40 ? 1 : hatRand < 0.70 ? 2 : 0;

          // Barva oblečení: V sektoru kotle (ultras) nosí 85%+ fanoušků klubové barvy!
          let fanCol: string;
          if (isUltrasSector) {
            const clubRoll = rand();
            if (clubRoll < 0.62) {
              fanCol = teamColor; // hlavní klubová barva (dres/mikina)
            } else if (clubRoll < 0.86) {
              fanCol = secondaryColor; // sekundární klubová barva
            } else if (clubRoll < 0.94) {
              fanCol = "#FFFFFF"; // bílá klubová mikina
            } else {
              fanCol = colors[Math.floor(rand() * colors.length)];
            }
          } else {
            // Na běžných tribunách nosí cca 40% fanoušků klubové barvy a zbytek civilní pestré oblečení
            const roll = rand();
            if (roll < 0.28) {
              fanCol = teamColor;
            } else if (roll < 0.40) {
              fanCol = secondaryColor;
            } else {
              fanCol = colors[Math.floor(rand() * colors.length)];
            }
          }

          // Barva čepice / kšiltovky: v kotli téměř výhradně v klubových barvách
          const hatCol = isUltrasSector
            ? rand() < 0.65 ? teamColor : secondaryColor
            : hatColors[Math.floor(rand() * hatColors.length)];

          // Šála: v kotli 75% fanoušků drží / má klubovou šálu, na ostatních tribunách 25%
          const hasScarf = isUltrasSector ? rand() < 0.75 : rand() < 0.25;

          // Pivo: v kotli 45% fanoušků s pivem
          const hasBeer = isUltrasSector ? rand() < 0.45 : rand() < 0.30;

          out.push({
            r,
            c,
            col: fanCol,
            pantsCol: pantsColors[Math.floor(rand() * pantsColors.length)],
            skin: skins[(r * 5 + c) % skins.length],
            hatType,
            hatCol,
            hasBeer,
            hasScarf,
            leanAngle: (rand() - 0.5) * (isUltrasSector ? 0.22 : 0.15),
            phase: rand() * Math.PI * 2,
            bobAmp: 0.01 + rand() * 0.03,
            bobSpeed: 0.7 + rand() * 0.9,
            jumper: isUltrasSector ? rand() < 0.7 : false,
          });
        }
      }
    }
    return out;
  }, [rows, columns, attendanceRatio, colors, pantsColors, skins, hatColors, isUltrasSector, teamColor, secondaryColor]);

  const TORSO_H = 0.46;
  const HEAD_H = 0.26;

  /**
   * Zápis matic všech částí diváků pro daný čas.
   *
   * Dav dřív stál jako sochy — matice se zapsaly jednou. Teď se přepisují každý snímek
   * (na mobilu ne): každý divák se lehce pohupuje a natáčí, kotel skáče v rytmu chorálu
   * a jednou za WAVE_PERIOD oběhne areál mexická vlna, při níž fanoušci vstávají a zvedají šály.
   * Barvy se zapisují jen v layout efektu — nemění se.
   */
  const writeFrame = (t: number, animate: boolean, withColors: boolean) => {
    if (!torsoRef.current || !headRef.current || !pantsRef.current || filled.length === 0) return;
    const stepX = length / columns;

    // Čelo mexické vlny v lokálním X této tribuny (NaN = vlna tu teď neběží).
    let waveHeadX = Number.NaN;
    if (animate) {
      const lap = (t % WAVE_PERIOD) / WAVE_LAP; // 0..1 během oběhu, pak pauza
      const local = lap * 4 - waveSlot;
      if (local >= -0.15 && local <= 1.15) {
        waveHeadX = -length / 2 + local * length;
      }
    }
    const jumpBeat = animate ? Math.max(0, Math.sin(t * 5.4)) : 0;

    let beerIdx = 0;
    let scarfIdx = 0;
    let hatIdx = 0;

    filled.forEach((f, i) => {
      const x = -length / 2 + stepX * f.c + stepX / 2;
      const z = f.r * seatDepth + seatDepth * 0.52;
      let yb = f.r * seatRise + seatRise + 0.42;
      let yaw = f.leanAngle;
      let armsUp = 0;

      if (animate) {
        // Pohupování a natáčení za hrou
        yb += Math.sin(t * f.bobSpeed + f.phase) * f.bobAmp;
        yaw += Math.sin(t * 0.6 + f.phase) * 0.07;
        // Kotel skáče společně v rytmu
        if (f.jumper) yb += jumpBeat * 0.2;
        // Mexická vlna: zvednutí s hladkým profilem cos²
        if (!Number.isNaN(waveHeadX)) {
          const u = (x - waveHeadX) / WAVE_WIDTH;
          if (u > -1 && u < 1) {
            const bump = Math.cos((u * Math.PI) / 2) ** 2;
            yb += bump * WAVE_LIFT;
            armsUp = bump;
          }
        }
      }

      // 1. Nohy / kalhoty (sedící vpřed)
      matrix.makeTranslation(x, yb - 0.14, z - 0.08);
      pantsRef.current!.setMatrixAt(i, matrix);
      if (withColors) {
        color.set(f.pantsCol);
        pantsRef.current!.setColorAt(i, color);
      }

      // 2. Torzo v bundě / dresu
      matrix.makeRotationY(yaw);
      matrix.setPosition(x, yb + TORSO_H / 2, z);
      torsoRef.current!.setMatrixAt(i, matrix);
      if (withColors) {
        color.set(f.col);
        torsoRef.current!.setColorAt(i, color);
      }

      // 3. Hlava
      matrix.makeRotationY(yaw);
      matrix.setPosition(x, yb + TORSO_H + HEAD_H / 2, z);
      headRef.current!.setMatrixAt(i, matrix);
      if (withColors) {
        color.set(f.skin);
        headRef.current!.setColorAt(i, color);
      }

      // 4. Pokrývka hlavy (čepice / kšiltovka / kulich)
      if (hatRef.current && f.hatType > 0) {
        matrix.makeRotationY(yaw);
        matrix.setPosition(x, yb + TORSO_H + HEAD_H + 0.04, z + (f.hatType === 1 ? -0.04 : 0));
        hatRef.current.setMatrixAt(hatIdx, matrix);
        if (withColors) {
          color.set(f.hatCol);
          hatRef.current.setColorAt(hatIdx, color);
        }
        hatIdx++;
      }

      // 5. Kelímek s pivem v ruce
      if (beerRef.current && f.hasBeer) {
        matrix.makeTranslation(x + 0.22, yb + 0.28, z - 0.18);
        beerRef.current.setMatrixAt(beerIdx, matrix);
        beerIdx++;
      }

      // 6. Klubová šála — při vlně nad hlavou
      if (scarfRef.current && f.hasScarf) {
        matrix.makeRotationY(yaw);
        matrix.setPosition(x, yb + TORSO_H * 0.95 + armsUp * 0.45, z - 0.04 - armsUp * 0.05);
        scarfRef.current.setMatrixAt(scarfIdx, matrix);
        if (withColors) {
          color.set(teamColor);
          scarfRef.current.setColorAt(scarfIdx, color);
        }
        scarfIdx++;
      }
    });

    torsoRef.current.count = filled.length;
    torsoRef.current.instanceMatrix.needsUpdate = true;
    pantsRef.current.count = filled.length;
    pantsRef.current.instanceMatrix.needsUpdate = true;
    headRef.current.count = filled.length;
    headRef.current.instanceMatrix.needsUpdate = true;
    if (hatRef.current) {
      hatRef.current.count = hatIdx;
      hatRef.current.instanceMatrix.needsUpdate = true;
    }
    if (beerRef.current) {
      beerRef.current.count = beerIdx;
      beerRef.current.instanceMatrix.needsUpdate = true;
    }
    if (scarfRef.current) {
      scarfRef.current.count = scarfIdx;
      scarfRef.current.instanceMatrix.needsUpdate = true;
    }

    if (withColors) {
      [torsoRef, pantsRef, headRef, hatRef, scarfRef].forEach((r) => {
        if (!r.current) return;
        if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
        // Materiál se musí překompilovat, aby shader věděl o instančních barvách
        (r.current.material as THREE.Material).needsUpdate = true;
      });
    }
  };

  // Výchozí rozestavení a barvy — jednou při změně obsazení
  useLayoutEffect(() => {
    writeFrame(0, false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled, length, columns, seatDepth, seatRise, matrix, color, teamColor]);

  // Animace davu (na mobilu se šetří — dav zůstává statický)
  useFrame(({ clock }) => {
    if (reducedDetail) return;
    writeFrame(clock.elapsedTime, true, false);
  });

  if (filled.length === 0) return null;

  return (
    <group>
      {/* Nohy sedících diváků */}
      <instancedMesh ref={pantsRef} args={[undefined, undefined, filled.length]} castShadow>
        <boxGeometry args={[seatSize * 0.44, 0.32, seatSize * 0.48]} />
        <meshStandardMaterial roughness={0.25} metalness={0.05} emissive="#262626" emissiveIntensity={0.2} />
      </instancedMesh>

      {/* Trup / bundy / dresy */}
      <instancedMesh ref={torsoRef} args={[undefined, undefined, filled.length]} castShadow>
        <boxGeometry args={[seatSize * 0.48, TORSO_H, seatSize * 0.36]} />
        <meshStandardMaterial roughness={0.25} metalness={0.05} emissive="#262626" emissiveIntensity={0.2} />
      </instancedMesh>

      {/* Hlavy s rozličnými světlými tóny pleti */}
      <instancedMesh ref={headRef} args={[undefined, undefined, filled.length]} castShadow>
        <boxGeometry args={[seatSize * 0.27, HEAD_H, seatSize * 0.27]} />
        <meshStandardMaterial roughness={0.25} metalness={0.05} emissive="#332222" emissiveIntensity={0.25} />
      </instancedMesh>

      {/* Čepice a kulichy */}
      <instancedMesh ref={hatRef} args={[undefined, undefined, filled.length]} castShadow>
        <boxGeometry args={[seatSize * 0.29, 0.1, seatSize * 0.31]} />
        <meshStandardMaterial roughness={0.25} metalness={0.05} emissive="#262626" emissiveIntensity={0.2} />
      </instancedMesh>

      {/* Pivo v kelímku */}
      <instancedMesh ref={beerRef} args={[undefined, undefined, filled.length]} castShadow>
        <cylinderGeometry args={[0.045, 0.035, 0.13, 6]} />
        <meshStandardMaterial color="#FBBF24" roughness={0.2} transparent opacity={0.92} />
      </instancedMesh>

      {/* Klubové šály */}
      <instancedMesh ref={scarfRef} args={[undefined, undefined, filled.length]} castShadow>
        <boxGeometry args={[seatSize * 0.38, 0.08, 0.12]} />
        <meshStandardMaterial roughness={0.25} metalness={0.05} emissive="#262626" emissiveIntensity={0.2} />
      </instancedMesh>
    </group>
  );
}

/** Prosklené VIP skyboxy pro L3 tribunu */
function VIPBox({
  length,
  height,
  depth,
  accentColor,
  teamColor,
}: {
  length: number;
  height: number;
  depth: number;
  accentColor: string;
  teamColor: string;
}) {
  const boxW = length * 0.45;
  const boxH = 1.4;
  const boxD = depth * 0.45;
  const boxY = height * 0.72;
  const boxZ = depth * 0.75;

  return (
    <group position={[0, boxY, boxZ]}>
      {/* Rám VIP boxu */}
      <mesh position={[0, boxH / 2, 0]} castShadow>
        <boxGeometry args={[boxW, boxH, boxD]} />
        <meshStandardMaterial color="#111827" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Čelní panoramatické tónované sklo */}
      <mesh position={[0, boxH / 2, -boxD / 2 - 0.01]}>
        <planeGeometry args={[boxW * 0.92, boxH * 0.75]} />
        <meshStandardMaterial
          color="#60A5FA"
          emissive="#93C5FD"
          emissiveIntensity={0.35}
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Zlatý / klubový VIP lem */}
      <mesh position={[0, boxH + 0.05, -boxD / 2]} castShadow>
        <boxGeometry args={[boxW + 0.2, 0.1, 0.1]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.3} metalness={0.6} />
      </mesh>

      {/* Nápis VIP LOUNGE */}
      <mesh position={[0, boxH * 0.88, -boxD / 2 - 0.02]}>
        <planeGeometry args={[boxW * 0.35, 0.2]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Vstupní tunel pro nástup hráčů */
function PlayerTunnel({
  depth,
  height,
  seatDepth,
}: {
  depth: number;
  height: number;
  seatDepth: number;
}) {
  const tunnelW = 3.6;
  const tunnelH = 1.6;
  const tunnelD = seatDepth * 4;

  return (
    <group position={[0, tunnelH / 2, tunnelD / 2 - 0.1]}>
      {/* Stěny tunelu */}
      <mesh position={[-tunnelW / 2, 0, 0]} castShadow>
        <boxGeometry args={[0.2, tunnelH, tunnelD]} />
        <meshStandardMaterial color="#1F2937" metalness={0.7} />
      </mesh>
      <mesh position={[tunnelW / 2, 0, 0]} castShadow>
        <boxGeometry args={[0.2, tunnelH, tunnelD]} />
        <meshStandardMaterial color="#1F2937" metalness={0.7} />
      </mesh>
      {/* Stříška tunelu */}
      <mesh position={[0, tunnelH / 2, 0]} castShadow>
        <boxGeometry args={[tunnelW, 0.15, tunnelD]} />
        <meshStandardMaterial color="#111827" metalness={0.8} />
      </mesh>
      {/* Červený koberec v tunelu */}
      <mesh position={[0, -tunnelH / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[tunnelW * 0.6, tunnelD]} />
        <meshStandardMaterial color="#991B1B" roughness={0.9} />
      </mesh>
    </group>
  );
}
