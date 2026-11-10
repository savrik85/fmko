"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TimeOfDay, WeatherType } from "./constants";
import { getSkyParams } from "./SkyDome";
import { generateAsphaltSurface } from "./grassTexture";

/**
 * Krajina za plotem areálu: pole, les, silnice, ves a hřebeny na obzoru.
 *
 * Dřív stál stadion na jednobarevné louce s pěti kostkami místo vesnice. Všechno tady
 * je statické a slité do pár geometrií (pole, les, ves = po jednom draw callu), takže
 * krajina nestojí skoro nic ani na mobilu.
 *
 * Rozvržení: areál je uprostřed (plot nejvýš ±50 × ±55 m). Okresní silnice běží podél
 * osy X na z = MAIN_ROAD_Z, ves leží na ní na severovýchodě, kam míří výchozí kamera
 * a kde zapadá slunce. Kopce jsou až za rovinou kolem silnice.
 */

export const MAIN_ROAD_Z = -88;
export const MAIN_ROAD_WIDTH = 6;
const MAIN_ROAD_HALF_LENGTH = 186;

/** Kopce v krajině: zploštělé koule se středem 2,5 m pod terénem. */
export const HILLS: Array<{ pos: [number, number]; scale: [number, number, number]; tint: string }> = [
  { pos: [-140, -150], scale: [70, 9, 45], tint: "#3F6E26" },
  { pos: [120, -160], scale: [85, 11, 48], tint: "#457A2B" },
  { pos: [-150, 55], scale: [60, 8, 50], tint: "#4A7A2C" },
  { pos: [130, 115], scale: [75, 10, 50], tint: "#3F6E26" },
  { pos: [-10, -165], scale: [85, 9, 45], tint: "#457A2B" },
  { pos: [30, 160], scale: [80, 8, 45], tint: "#4A7A2C" },
  { pos: [-165, -30], scale: [50, 7, 45], tint: "#568A34" },
  { pos: [165, -20], scale: [50, 7.5, 50], tint: "#457A2B" },
];
export const HILL_BASE_Y = -2.5;

/** Výška terénu v bodě (rovina = 0, na kopci výška jeho povrchu). */
export function terrainHeight(x: number, z: number): number {
  let y = 0;
  for (const h of HILLS) {
    const dx = (x - h.pos[0]) / h.scale[0];
    const dz = (z - h.pos[1]) / h.scale[2];
    const inside = 1 - dx * dx - dz * dz;
    if (inside <= 0) continue;
    y = Math.max(y, HILL_BASE_Y + h.scale[1] * Math.sqrt(inside));
  }
  return y;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Geometrie obarvená po vrcholech a posazená na místo: stavební kámen slitých sítí. */
function tinted(geometry: THREE.BufferGeometry, color: string, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.deleteAttribute("uv");
  g.applyMatrix4(matrix);
  g.computeVertexNormals();
  const c = new THREE.Color(color);
  const count = g.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function place(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(sx, sy, sz),
  );
}

function useDisposable<T extends THREE.BufferGeometry | null>(geometry: T): T {
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}

// ─────────────────────────────── Pole ───────────────────────────────

const FIELD_COLORS = ["#C9B560", "#B9A768", "#7C5E40", "#3F7C36", "#6E9F45", "#5B8A30", "#8E7448", "#A4B24A"];
const RAPESEED_COLOR = "#DCC531";
const FIELD_SNOW_COLORS = ["#E9EEF3", "#DFE6EC", "#D3DBE3", "#C4BEB4"];

/** Jemné řádky (brázdy, pokosy), kterými se násobí barva pole. */
function createFurrowTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#D2D2D2";
  ctx.fillRect(0, 0, 64, 22);
  ctx.fillStyle = "#EAEAEA";
  ctx.fillRect(0, 22, 64, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildFieldsGeometry(isSnow: boolean): THREE.BufferGeometry {
  const rand = seededRandom(2611);
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const color = new THREE.Color();
  // Celá šachovnice je pootočená, aby meze neběžely rovnoběžně s hřištěm.
  const gridYaw = 0.21;
  const cos = Math.cos(gridYaw);
  const sin = Math.sin(gridYaw);
  const cellW = 36;
  const cellD = 30;
  const balk = 1.6; // travnatá mez mezi poli

  const addField = (gx: number, gz: number, w: number, d: number) => {
    const cx = gx * cos - gz * sin;
    const cz = gx * sin + gz * cos;
    // Kolem areálu zůstává louka, pole začínají až za ní; ves a kopce pole nemají.
    if (Math.abs(cx) < 60 + w / 2 && Math.abs(cz) < 66 + d / 2) return;
    if (Math.hypot(cx, cz) > 186) return;
    if (cx > 50 && cx < 146 && cz > -128 && cz < -70) return;
    if (terrainHeight(cx, cz) > 1.2) return;

    const roll = rand();
    if (isSnow) color.set(FIELD_SNOW_COLORS[Math.floor(roll * FIELD_SNOW_COLORS.length)]);
    else if (roll > 0.9) color.set(RAPESEED_COLOR);
    else color.set(FIELD_COLORS[Math.floor((roll / 0.9) * FIELD_COLORS.length)]);
    color.offsetHSL(0, 0, (rand() - 0.5) * 0.05);
    const rowsAlongWidth = rand() > 0.5;

    const hw = w / 2 - balk / 2;
    const hd = d / 2 - balk / 2;
    const corners: Array<[number, number]> = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    const order = [0, 2, 1, 0, 3, 2];
    for (const idx of order) {
      const [lx, lz] = corners[idx];
      const wx = cx + lx * cos - lz * sin;
      const wz = cz + lx * sin + lz * cos;
      positions.push(wx, 0.05, wz);
      normals.push(0, 1, 0);
      colors.push(color.r, color.g, color.b);
      // Jeden řádek zhruba po 3 metrech, směr se pole od pole střídá.
      if (rowsAlongWidth) uvs.push(lx / 12, lz / 3);
      else uvs.push(lz / 12, lx / 3);
    }
  };

  for (let ix = -6; ix <= 6; ix++) {
    for (let iz = -7; iz <= 7; iz++) {
      const gx = ix * cellW;
      const gz = iz * cellD;
      const split = rand();
      if (split < 0.22) {
        // Rozdělená parcela: dva užší pruhy vedle sebe.
        addField(gx - cellW / 4, gz, cellW / 2, cellD);
        addField(gx + cellW / 4, gz, cellW / 2, cellD);
      } else if (split < 0.36) {
        addField(gx, gz - cellD / 4, cellW, cellD / 2);
        addField(gx, gz + cellD / 4, cellW, cellD / 2);
      } else {
        addField(gx, gz, cellW, cellD);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

function Fields({ isSnow }: { isSnow: boolean }) {
  const geometry = useDisposable(useMemo(() => buildFieldsGeometry(isSnow), [isSnow]));
  const furrows = useMemo(() => createFurrowTexture(), []);
  return (
    <mesh geometry={geometry} receiveShadow>
      {/* polygonOffset: pole leží 5 cm nad loukou a na mobilním 16bitovém depth bufferu
          by se s ní z dálky prala o pořadí. */}
      <meshStandardMaterial
        vertexColors
        map={furrows}
        roughness={1}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

// ─────────────────────────────── Les ───────────────────────────────

const FOREST_COLORS = ["#2C5A29", "#34682E", "#295024", "#3D7233", "#2F6030"];
const FOREST_SNOW_COLORS = ["#DDE5EC", "#F1F5F9", "#3D6A3A", "#C9D4DD"];

function buildForestGeometry(isSnow: boolean, density: number): THREE.BufferGeometry | null {
  const rand = seededRandom(9137);
  const cone = new THREE.ConeGeometry(1, 1, 6, 1, true);
  cone.translate(0, 0.5, 0);
  const palette = isSnow ? FOREST_SNOW_COLORS : FOREST_COLORS;
  const parts: THREE.BufferGeometry[] = [];

  const addTree = (x: number, z: number) => {
    const height = 6.5 + rand() * 5.5;
    const radius = 1.7 + rand() * 1.1;
    const y = terrainHeight(x, z) - 0.3;
    parts.push(tinted(cone, palette[Math.floor(rand() * palette.length)], place(x, y, z, radius, height, radius, rand() * Math.PI)));
  };

  // Zalesněné kopce: hustě na temeni, k úpatí les řídne a přechází v louku.
  for (const hill of HILLS) {
    const count = Math.round(((hill.scale[0] * hill.scale[2]) / 46) * density);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      const keep = rand();
      if (r > 0.86 || keep < r * 0.55) continue;
      const x = hill.pos[0] + Math.cos(a) * r * hill.scale[0];
      const z = hill.pos[1] + Math.sin(a) * r * hill.scale[2];
      if (Math.hypot(x, z) > 184) continue;
      addTree(x, z);
    }
  }

  // Remízky v rovině mezi poli.
  const groves: Array<[number, number, number, number]> = [
    [-96, 22, 13, 26],
    [78, 52, 11, 20],
    [-58, 104, 14, 28],
    [12, -122, 12, 20],
    [-112, -62, 10, 16],
    [96, -34, 9, 14],
  ];
  for (const [gx, gz, radius, count] of groves) {
    const n = Math.round(count * density);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      addTree(gx + Math.cos(a) * r, gz + Math.sin(a) * r * 0.7);
    }
  }

  const merged = parts.length > 0 ? mergeGeometries(parts, false) : null;
  parts.forEach((p) => p.dispose());
  cone.dispose();
  return merged;
}

function Forest({ isSnow, density }: { isSnow: boolean; density: number }) {
  const geometry = useDisposable(useMemo(() => buildForestGeometry(isSnow, density), [isSnow, density]));
  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={1} flatShading />
    </mesh>
  );
}

// ─────────────────────────────── Silnice ───────────────────────────────

function MainRoad({ isSnow }: { isSnow: boolean }) {
  const length = MAIN_ROAD_HALF_LENGTH * 2;
  const surface = useMemo(() => generateAsphaltSurface(length / 4, MAIN_ROAD_WIDTH / 4), [length]);
  return (
    <group>
      <mesh position={[0, 0.07, MAIN_ROAD_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[length, MAIN_ROAD_WIDTH]} />
        <meshStandardMaterial
          map={surface.map}
          bumpMap={surface.bumpMap}
          bumpScale={0.04}
          color={isSnow ? "#B8C0C8" : "#FFFFFF"}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>
      {/* Krajnice: světlejší pruh štěrku po obou stranách */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[0, 0.065, MAIN_ROAD_Z + side * (MAIN_ROAD_WIDTH / 2 + 0.5)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[length, 1]} />
          <meshStandardMaterial
            color={isSnow ? "#E2E8F0" : "#9A917F"}
            roughness={1}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────────────────────── Ves ───────────────────────────────

const WALL_COLORS = ["#F3EFEA", "#EFE6D2", "#F2E3B8", "#E6D9C2", "#F7F4EE", "#E9CFA6"];
const ROOF_COLORS = ["#A0432C", "#8B3A2A", "#9A4A30", "#7A3A2E", "#5B4B45", "#B0553A"];
const BARN_WALL = "#8A6B4A";
const SNOW_ROOF = "#F4F7FA";

/** Dvě šikmé plochy sedlové střechy: šířka 1 (osa X), výška 1, délka 1 (hřeben podél osy Z). */
function createRoofSlopes(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // prettier-ignore
  g.setAttribute("position", new THREE.Float32BufferAttribute([
    0.5, 0, -0.5,   0, 1, -0.5,   0, 1, 0.5,
    0.5, 0, -0.5,   0, 1, 0.5,    0.5, 0, 0.5,
    -0.5, 0, -0.5,  0, 1, 0.5,    0, 1, -0.5,
    -0.5, 0, -0.5,  -0.5, 0, 0.5, 0, 1, 0.5,
  ], 3));
  return g;
}

/** Dva trojúhelníkové štíty pod sedlovou střechou (ve stejných jednotkách jako střecha). */
function createGables(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // prettier-ignore
  g.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.5, 0, 0.5,   0.5, 0, 0.5,   0, 1, 0.5,
    0.5, 0, -0.5,   -0.5, 0, -0.5, 0, 1, -0.5,
  ], 3));
  return g;
}

interface House {
  x: number;
  z: number;
  /** Šířka štítu. */
  width: number;
  /** Délka podél hřebene. */
  length: number;
  wallHeight: number;
  roofHeight: number;
  yaw: number;
  wall: string;
  roof: string;
  lit: boolean;
  windows: boolean;
}

/** Ves podél okresní silnice, jedna boční ulička a kostel na návsi. */
function layoutVillage(): { houses: House[]; church: { x: number; z: number; yaw: number } } {
  const rand = seededRandom(1789);
  const houses: House[] = [];
  const church = { x: 99, z: MAIN_ROAD_Z - 17, yaw: Math.PI / 2 };

  const addHouse = (x: number, z: number, yaw: number, barn = false) => {
    const width = barn ? 7.5 + rand() * 1.5 : 6 + rand() * 1.8;
    houses.push({
      x,
      z,
      width,
      length: barn ? 13 + rand() * 4 : 8 + rand() * 4,
      wallHeight: barn ? 4 + rand() * 0.8 : 3.1 + rand() * 0.9,
      roofHeight: width * (0.42 + rand() * 0.1),
      yaw,
      wall: barn ? BARN_WALL : WALL_COLORS[Math.floor(rand() * WALL_COLORS.length)],
      roof: ROOF_COLORS[Math.floor(rand() * ROOF_COLORS.length)],
      lit: rand() > 0.35,
      windows: !barn,
    });
  };

  // Domy po obou stranách silnice, hřebenem podél ní.
  for (let i = 0; i < 9; i++) {
    const x = 57 + i * 10.2 + rand() * 2.5;
    for (const side of [-1, 1]) {
      // Na severní straně uprostřed je náves s kostelem.
      if (side === -1 && x > church.x - 13 && x < church.x + 13) continue;
      if (rand() < 0.12) continue;
      const setback = MAIN_ROAD_WIDTH / 2 + 5.5 + rand() * 3;
      addHouse(x, MAIN_ROAD_Z + side * setback, Math.PI / 2 + (rand() - 0.5) * 0.14);
    }
  }
  // Statky se stodolami za humny.
  addHouse(70, MAIN_ROAD_Z + 24, 0.1, true);
  addHouse(112, MAIN_ROAD_Z + 25, -0.08, true);
  addHouse(84, MAIN_ROAD_Z - 27, 0.05, true);
  // Boční ulička na sever, do svahu.
  for (let i = 0; i < 4; i++) {
    const z = MAIN_ROAD_Z - 22 - i * 9.5;
    addHouse(126 + (rand() - 0.5) * 2, z, (rand() - 0.5) * 0.2);
    if (i % 2 === 0) addHouse(141 + (rand() - 0.5) * 2, z - 3, (rand() - 0.5) * 0.2);
  }
  return { houses, church };
}

function buildVillage(isSnow: boolean): {
  body: THREE.BufferGeometry | null;
  litWindows: THREE.BufferGeometry | null;
  darkWindows: THREE.BufferGeometry | null;
} {
  const { houses, church } = layoutVillage();
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const slopes = createRoofSlopes();
  const gables = createGables();
  const pane = new THREE.PlaneGeometry(1, 1);
  const spire = new THREE.ConeGeometry(1, 1, 4, 1);
  spire.rotateY(Math.PI / 4);
  spire.translate(0, 0.5, 0);
  const bulb = new THREE.SphereGeometry(1, 8, 6);

  const body: THREE.BufferGeometry[] = [];
  const lit: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const local = new THREE.Matrix4();

  const addGabledBlock = (
    world: THREE.Matrix4,
    width: number,
    length: number,
    wallHeight: number,
    roofHeight: number,
    wall: string,
    roof: string,
  ) => {
    body.push(tinted(box, wall, local.copy(world).multiply(place(0, 0, 0, width, wallHeight, length))));
    body.push(tinted(gables, wall, local.copy(world).multiply(place(0, wallHeight, 0, width, roofHeight, length))));
    // Střecha přesahuje zdi o okap.
    body.push(tinted(slopes, isSnow ? SNOW_ROOF : roof, local.copy(world).multiply(place(0, wallHeight - 0.05, 0, width + 0.9, roofHeight * 1.06, length + 0.8))));
  };

  for (const h of houses) {
    const world = place(h.x, terrainHeight(h.x, h.z) - 0.1, h.z, 1, 1, 1, h.yaw);
    addGabledBlock(world, h.width, h.length, h.wallHeight, h.roofHeight, h.wall, h.roof);
    if (!h.windows) continue;
    // Okna na obou podélných stěnách.
    const target = h.lit ? lit : dark;
    for (const side of [-1, 1]) {
      for (const along of [-0.28, 0.28]) {
        const m = new THREE.Matrix4()
          .makeRotationY((side * Math.PI) / 2)
          .setPosition(side * (h.width / 2 + 0.04), h.wallHeight * 0.56, along * h.length);
        const g = pane.clone();
        g.scale(1.1, 1.15, 1);
        g.applyMatrix4(local.copy(world).multiply(m));
        target.push(g);
      }
    }
  }

  // Kostel: loď se sedlovou střechou, věž s bání a špicí.
  const churchWall = "#F1E9D8";
  const churchRoof = "#8E3B2C";
  const cy = terrainHeight(church.x, church.z) - 0.1;
  const cw = place(church.x, cy, church.z, 1, 1, 1, church.yaw);
  addGabledBlock(cw, 8, 17, 7, 4.2, churchWall, churchRoof);
  body.push(tinted(box, churchWall, local.copy(cw).multiply(place(0, 0, 10.5, 5, 15, 5))));
  body.push(tinted(bulb, isSnow ? SNOW_ROOF : "#6E3327", local.copy(cw).multiply(place(0, 16.6, 10.5, 2.9, 2.5, 2.9))));
  body.push(tinted(spire, isSnow ? SNOW_ROOF : "#6E3327", local.copy(cw).multiply(place(0, 18.2, 10.5, 1.1, 5.5, 1.1))));
  // Vysoká okna lodi.
  for (const side of [-1, 1]) {
    for (const along of [-5, 0, 5]) {
      const m = new THREE.Matrix4().makeRotationY((side * Math.PI) / 2).setPosition(side * 4.04, 4, along);
      const g = pane.clone();
      g.scale(1.1, 3, 1);
      g.applyMatrix4(local.copy(cw).multiply(m));
      lit.push(g);
    }
  }

  const result = {
    body: mergeGeometries(body, false),
    litWindows: lit.length > 0 ? mergeGeometries(lit, false) : null,
    darkWindows: dark.length > 0 ? mergeGeometries(dark, false) : null,
  };
  [...body, ...lit, ...dark, box, slopes, gables, pane, spire, bulb].forEach((g) => g.dispose());
  return result;
}

function Village({ timeOfDay, isSnow }: { timeOfDay: TimeOfDay; isSnow: boolean }) {
  const village = useMemo(() => buildVillage(isSnow), [isSnow]);
  useEffect(
    () => () => {
      village.body?.dispose();
      village.litWindows?.dispose();
      village.darkWindows?.dispose();
    },
    [village],
  );
  // Za dne jsou okna tmavé sklo, za soumraku se rozsvítí první, v noci září (HDR kvůli bloomu).
  const litColor = useMemo(() => {
    if (timeOfDay === "night") return new THREE.Color("#FFD27A").multiplyScalar(1.7);
    if (timeOfDay === "sunset") return new THREE.Color("#FFC56B").multiplyScalar(1.15);
    return new THREE.Color("#33414F");
  }, [timeOfDay]);
  const laneLength = 44;
  return (
    <group>
      {village.body && (
        <mesh geometry={village.body}>
          <meshStandardMaterial vertexColors roughness={0.92} side={THREE.DoubleSide} />
        </mesh>
      )}
      {village.litWindows && (
        <mesh geometry={village.litWindows}>
          <meshBasicMaterial color={litColor} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {village.darkWindows && (
        <mesh geometry={village.darkWindows}>
          <meshBasicMaterial color={timeOfDay === "night" ? "#0E1622" : "#33414F"} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Boční ulička */}
      <mesh
        position={[133.5, 0.07, MAIN_ROAD_Z - MAIN_ROAD_WIDTH / 2 - laneLength / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[4, laneLength]} />
        <meshStandardMaterial
          color={isSnow ? "#C9D1D9" : "#6F6A62"}
          roughness={1}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>
    </group>
  );
}

// ─────────────────────────────── Hřebeny na obzoru ───────────────────────────────

/** Pás hor kolem celé krajiny: zubatý horní okraj, spodek pod terénem. */
function buildRidgeGeometry(radius: number, minHeight: number, maxHeight: number, seed: number): THREE.BufferGeometry {
  const rand = seededRandom(seed);
  const segments = 120;
  // Součet několika vln s náhodnou fází dá hřeben bez viditelného opakování.
  const waves = Array.from({ length: 5 }, (_, i) => ({
    freq: [2, 3, 5, 9, 14][i],
    amp: [0.34, 0.26, 0.2, 0.12, 0.08][i],
    phase: rand() * Math.PI * 2,
  }));
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    let n = 0;
    for (const w of waves) n += Math.sin(a * w.freq + w.phase) * w.amp;
    const height = minHeight + (maxHeight - minHeight) * THREE.MathUtils.clamp(0.5 + n * 0.75, 0, 1);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, -6, z, x, height, z);
    if (i < segments) {
      const b = i * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  return g;
}

const RIDGES = [
  { radius: 192, min: 9, max: 21, seed: 311, haze: 0.38 },
  { radius: 216, min: 17, max: 36, seed: 733, haze: 0.62 },
  { radius: 240, min: 27, max: 50, seed: 151, haze: 0.74 },
];

/**
 * Tři vrstvy hřebenů, každá dál a víc utopená v oparu barvy obzoru: dává krajině hloubku
 * a zakryje okraj terénu. Barva je spočítaná, ne nasvícená, aby hory držely s oblohou.
 */
function HorizonRidges({ timeOfDay, weather }: { timeOfDay: TimeOfDay; weather: WeatherType }) {
  const geometries = useMemo(() => RIDGES.map((r) => buildRidgeGeometry(r.radius, r.min, r.max, r.seed)), []);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const colors = useMemo(() => {
    const sky = getSkyParams(timeOfDay, weather);
    const horizon = new THREE.Color(sky.horizon);
    const base = new THREE.Color(
      timeOfDay === "night" ? "#0A131C" : timeOfDay === "sunset" ? "#3B2B33" : weather === "snow" ? "#8D9BA6" : weather === "sunny" || weather === "wind" ? "#2D5A3F" : "#3D5448",
    );
    return RIDGES.map((r) => base.clone().lerp(horizon, r.haze));
  }, [timeOfDay, weather]);
  return (
    <group>
      {RIDGES.map((r, i) => (
        <mesh key={r.radius} geometry={geometries[i]} frustumCulled={false}>
          <meshBasicMaterial color={colors[i]} side={THREE.DoubleSide} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────────────────────── Celek ───────────────────────────────

interface LandscapeProps {
  timeOfDay: TimeOfDay;
  weather: WeatherType;
  /** Mobil: řidší les. */
  reduced?: boolean;
}

export function Landscape({ timeOfDay, weather, reduced = false }: LandscapeProps) {
  const isSnow = weather === "snow";
  return (
    <group>
      <Fields isSnow={isSnow} />
      <Forest isSnow={isSnow} density={reduced ? 0.4 : 1} />
      <MainRoad isSnow={isSnow} />
      <Village timeOfDay={timeOfDay} isSnow={isSnow} />
      <HorizonRidges timeOfDay={timeOfDay} weather={weather} />
    </group>
  );
}
