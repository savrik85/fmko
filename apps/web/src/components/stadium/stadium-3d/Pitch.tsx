"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { PITCH, pitchColor, type WeatherType, PITCH_SURFACE_Y } from "./constants";
import { generatePitchSurface, generateSnowPitchSurface, type MowingPattern } from "./grassTexture";
import { generateNetTexture, type NetPattern, type NetStyle } from "./materialTextures";

interface PitchProps {
  condition: number;
  pitchType: string;
  weather?: WeatherType;
  mowingPattern?: MowingPattern;
  netPattern?: NetPattern;
  netStyle?: NetStyle;
  teamColor?: string;
  secondaryColor?: string;
  /** Úroveň vyhřívání trávníku (0–3). Od Lv1 na hrací ploše sníh neleží. */
  pitchHeating?: number;
  /** Úroveň zavlažování (0–3). Drží trávník zelený i na výhni. */
  pitchIrrigation?: number;
  /**
   * Vlhkost půdy 0–100 (50 = normál). Paměť mezi zápasy: v dešti stoupá, v suchu
   * klesá. Řídí kaluže i vyschnutí — bez ní by týden veder skončil, jakmile se zatáhne.
   */
  pitchMoisture?: number;
}

/**
 * Výška hrací plochy a vrstev nad ní.
 *
 * Vše, co na trávníku leží, se musí odvozovat OD TOHO — jinak stačí posunout
 * plochu a čáry zůstanou pod ní. Přesně to se stalo, když se plocha zvedla
 * z 0,010 na 0,050 kvůli prosvítající dlažbě: čáry měly natvrdo 0,05, ocitly
 * se v jedné rovině s trávou a při pohybu kamery se trhaly.
 *
 * Rozestupy jsou malé, ale po zvětšení near roviny kamery (near=1) je hloubková
 * přesnost dost velká i na mobilu.
 */
/** Vyšlapaná místa — hned nad trávou. */
const DAMAGE_Y = PITCH_SURFACE_Y + 0.015;
/** Kaluže — nad vyšlapanými místy, voda v nich stojí. */
const PUDDLE_Y = PITCH_SURFACE_Y + 0.018;
/** Vápno — navrch, čáry jsou vidět i přes vyšlapaná místa. */
const LINE_Y = PITCH_SURFACE_Y + 0.025;
/** Rohový čtvrtkruh — součást vápna. */
const CORNER_ARC_Y = LINE_Y;

const HALF_W = PITCH.width / 2;
const HALF_D = PITCH.depth / 2;

// Paleta hnědo-žlutých odstínů pro vyšlapaná místa
const WEAR_COLORS = ["#8B6F47", "#9B7E55", "#A08560", "#7A5C3A", "#6B5836", "#B89868"];
const SNOW_WEAR_COLORS = ["#B8C9BD", "#A5B8AA", "#8FA294", "#CBD7CE"];

interface DamageSpot {
  nx: number;     // -1..1
  nz: number;
  rx: number;     // 0..1 (relative)
  rz: number;
  threshold: number;
  opacity: number;
  color: string;
  snowColor: string;
  rotation: number;
}

// Generuje pseudo-random procedurální damage spoty (deterministic seed)
function generateDamageSpots(): DamageSpot[] {
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pickColor = () => WEAR_COLORS[Math.floor(rand() * WEAR_COLORS.length)];
  const pickSnowColor = () => SNOW_WEAR_COLORS[Math.floor(rand() * SNOW_WEAR_COLORS.length)];
  const out: DamageSpot[] = [];

  // Hotspoty: méně skvrn + skromnější rozšíření, viditelné jen při výrazném poškození
  const clusters = [
    { cx: 0,    cz: -0.9, range: 0.22, count: 14, baseThr: 70, sizeMin: 0.02,  sizeMax: 0.04 },   // S brankoviště
    { cx: 0,    cz: 0.9,  range: 0.22, count: 14, baseThr: 70, sizeMin: 0.02,  sizeMax: 0.04 },   // N brankoviště
    { cx: 0,    cz: 0,    range: 0.2,  count: 10, baseThr: 50, sizeMin: 0.018, sizeMax: 0.035 },  // střed
    { cx: -0.92, cz: 0,   range: 0.7,  count: 8,  baseThr: 35, sizeMin: 0.015, sizeMax: 0.03 },   // Z sideline
    { cx: 0.92,  cz: 0,   range: 0.7,  count: 8,  baseThr: 35, sizeMin: 0.015, sizeMax: 0.03 },   // V sideline
    { cx: 0,    cz: 0,    range: 0.95, count: 20, baseThr: 18, sizeMin: 0.01,  sizeMax: 0.025 }, // náhodné, jen extreme damage
  ];

  clusters.forEach((cl) => {
    for (let i = 0; i < cl.count; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.pow(rand(), 0.7) * cl.range;
      let nx = cl.cx + Math.cos(angle) * dist;
      let nz = cl.cz + Math.sin(angle) * dist * 1.5;
      nx = Math.max(-0.97, Math.min(0.97, nx));
      nz = Math.max(-0.97, Math.min(0.97, nz));
      const sz = cl.sizeMin + rand() * (cl.sizeMax - cl.sizeMin);
      out.push({
        nx,
        nz,
        rx: sz,
        rz: sz * (0.6 + rand() * 0.7),
        threshold: cl.baseThr - Math.floor(rand() * 15),
        opacity: 0.3 + rand() * 0.3,    // méně neprůhledné
        color: pickColor(),
        snowColor: pickSnowColor(),
        rotation: rand() * Math.PI,
      });
    }
  });
  return out;
}

/** Lineární míchání dvou hex barev — pro přechod zeleně do slámova. */
function mixHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

const DAMAGE_SPOTS = generateDamageSpots();

/**
 * Kaluže na rozmoklém hřišti.
 *
 * Deterministicky rozmístěné (vlastní seed), aby při každém překreslení ležely
 * na stejném místě. Drží se spíš u vápen a na krajích, kde se nejvíc stojí a
 * kde bývá terén nejvíc sešlapaný.
 */
function generatePuddles() {
  let seed = 20260825;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const zones = [
    { cx: 0, cz: -0.78, range: 0.28, count: 5, thr: 62 },   // vápno
    { cx: 0, cz: 0.78, range: 0.28, count: 5, thr: 62 },
    { cx: -0.72, cz: 0, range: 0.3, count: 4, thr: 45 },    // kraje
    { cx: 0.72, cz: 0, range: 0.3, count: 4, thr: 45 },
    { cx: 0, cz: 0, range: 0.45, count: 4, thr: 32 },       // střed až u nejhorších
  ];
  const out: Array<{ nx: number; nz: number; rx: number; rz: number; threshold: number; rotation: number; opacity: number }> = [];
  for (const z of zones) {
    for (let i = 0; i < z.count; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.pow(rand(), 0.6) * z.range;
      const sz = 0.035 + rand() * 0.055;
      out.push({
        nx: Math.max(-0.95, Math.min(0.95, z.cx + Math.cos(a) * d)),
        nz: Math.max(-0.95, Math.min(0.95, z.cz + Math.sin(a) * d * 1.3)),
        rx: sz,
        rz: sz * (0.45 + rand() * 0.5),
        threshold: z.thr - Math.floor(rand() * 10),
        rotation: rand() * Math.PI,
        opacity: 0.35 + rand() * 0.25,
      });
    }
  }
  return out;
}

const PUDDLES = generatePuddles();

export function Pitch({
  condition,
  pitchType,
  weather,
  mowingPattern = "stripes",
  netPattern = "white",
  netStyle = "loose",
  teamColor = "#EF4444",
  secondaryColor = "#FFFFFF",
  pitchHeating = 0,
  pitchIrrigation = 0,
  pitchMoisture = 50,
}: PitchProps) {
  // Vyhřívání roztaví sníh na hrací ploše — okolí, střídačky ani terén ale
  // zasněžené zůstanou, takže je zelený obdélník uprostřed bílého areálu vidět.
  // Umělka sníh drží vždy: topné kabely se pod ni nedávají.
  const heatingWorks = pitchHeating > 0 && pitchType !== "artificial";
  const isSnow = weather === "snow" && !heatingWorks;
  const hasLines = condition >= 20;
  const hasCenter = condition >= 40;
  const hasFull = condition >= 65;
  const hasStripes = condition >= 50;

  // Hřiště je naplocho na zemi (rotation -π/2 kolem X)
  const pitchRotation: [number, number, number] = [-Math.PI / 2, 0, 0];

  // Base barva trávníku - i pro nízkou condition zachovat trochu zeleně
  /**
   * Jak moc je trávník vyprahlý (0–1).
   *
   * Na výhni tráva vysychá do slámova. Zavlažování to drží zelené — Lv3 vyschnutí
   * zastaví úplně, stejně jako vyhřívání zastaví sníh. Umělka nevysychá (nemá co).
   * Špatný trávník se propaluje rychleji, dobře zapěstovaný drží déle.
   */
  const dryness = useMemo(() => {
    if (pitchType === "artificial") return 0;
    // Vyprahlost pod 45 vlhkosti, plná při 0. Špatný trávník se propaluje rychleji.
    const parched = Math.max(0, Math.min(1, (45 - pitchMoisture) / 45));
    if (parched <= 0) return 0;
    const severity = 0.18 + (1 - Math.max(0, Math.min(100, condition)) / 100) * 0.24;
    return parched * severity;
  }, [pitchType, pitchMoisture, condition]);

  const finalGrassColor = useMemo(() => {
    const healthy = pitchType === "artificial"
      ? (condition >= 30 ? "#2E8B1F" : "#5A8245")
      : condition >= 70 ? pitchColor(condition)
      : condition >= 40 ? "#6B8240"
      : condition >= 20 ? "#5C7138"
      : "#566B30";
    // Sláma, do které vyprahlá tráva přechází.
    // Vyschlá TRÁVA, ne písek — olivová se žlutým nádechem.
    return dryness > 0 ? mixHex(healthy, "#9C9A52", dryness) : healthy;
  }, [pitchType, condition, dryness]);

  // Voda stojí jen na rozmoklém přírodním či hybridním trávníku. V dešti se kaluže
  // objeví dřív a jsou výraznější, za sucha vyschnou. Sníh je překryje, umělka odvodní.
  const isRain = weather === "rain";
  const puddleStrength = useMemo(() => {
    // Sníh kaluže překryje, umělka je odvodní.
    if (isSnow || pitchType === "artificial") return 0;
    // Voda stojí podle NASÁKLOSTI půdy, ne podle toho, jestli zrovna prší —
    // rozmáčené hřiště zůstane rozmáčené i den po dešti.
    const soaked = Math.max(0, Math.min(1, (pitchMoisture - 55) / 45));
    // Právě padající déšť hladinu ještě zvýrazní.
    return Math.min(1, soaked + (isRain ? 0.35 : 0));
  }, [isSnow, isRain, pitchMoisture, pitchType]);

  const puddles = useMemo(
    () => (puddleStrength <= 0 ? [] : PUDDLES.filter((p) => condition < p.threshold + puddleStrength * 22)),
    [puddleStrength, condition],
  );

  const grassSurface = useMemo(() => {
    if (isSnow) return generateSnowPitchSurface(hasStripes, mowingPattern);
    return generatePitchSurface(finalGrassColor, pitchType, hasStripes, mowingPattern);
  }, [isSnow, finalGrassColor, pitchType, hasStripes, mowingPattern]);

  // Vidím damage spoty s threshold > condition (čím nižší kondice, tím víc viditelných)
  const visibleSpots = useMemo(
    () => DAMAGE_SPOTS.filter((s) => condition < s.threshold),
    [condition]
  );

  return (
    <group>
      {/* Hlavní hřiště — jemná procedurální tráva bez ostrého pixelového šumu */}
      <mesh rotation={pitchRotation} position={[0, PITCH_SURFACE_Y, 0]} receiveShadow>
        <planeGeometry args={[PITCH.width, PITCH.depth]} />
        <meshStandardMaterial
          map={grassSurface.map}
          bumpMap={grassSurface.bumpMap}
          bumpScale={pitchType === "artificial" ? 0.025 : pitchType === "hybrid" ? 0.045 : 0.06}
          roughness={pitchType === "artificial" ? 0.82 : 0.94}
        />
      </mesh>

      {/* Kaluže — na rozmoklém hřišti stojí voda ve vyšlapaných místech.
          V dešti se objeví dřív a jsou výraznější, v suchu vyschnou. Na sněhu
          nejsou vidět (leží na nich sníh) a na umělce voda nestojí. */}
      {puddles.map((p, i) => (
        <mesh
          key={`puddle-${i}`}
          rotation={[-Math.PI / 2, 0, p.rotation]}
          position={[p.nx * HALF_W, PUDDLE_Y + (i % 3) * 0.001, p.nz * HALF_D]}
          scale={[p.rx * PITCH.width, p.rz * PITCH.depth, 1]}
        >
          <circleGeometry args={[1, 16]} />
          {/* Kaluž odráží oblohu, takže je SVĚTLEJŠÍ než tráva. Tmavá voda splyne
              se stíny a vyšlapanými místy a v dešti není vidět vůbec. */}
          <meshStandardMaterial
            color="#B9CBDD"
            opacity={Math.min(0.92, (0.55 + p.opacity * 0.45) * puddleStrength)}
            transparent
            depthWrite={false}
            roughness={0.05}
            metalness={0.85}
            emissive="#2A3A4A"
            emissiveIntensity={0.35}
          />
        </mesh>
      ))}

      {/* Damage spots — mnoho malých nepravidelných skvrn */}
      {visibleSpots.map((s, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, s.rotation]}
          position={[s.nx * HALF_W, DAMAGE_Y + (i % 3) * 0.001, s.nz * HALF_D]}
          scale={[s.rx * PITCH.width, s.rz * PITCH.depth, 1]}
        >
          <circleGeometry args={[1, 8]} />
          <meshBasicMaterial
            color={isSnow ? s.snowColor : s.color}
            opacity={s.opacity * Math.min(1, Math.max(0, (s.threshold - condition) / 35))}
            transparent
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Čáry hřiště */}
      <PitchLines hasFull={hasFull} hasCenter={hasCenter} opacity={hasLines ? (condition < 35 ? 0.75 : 0.92) : 0} />

      {/* Rohové praporky */}
      <CornerFlags />

      {/* Zápasový fotbalový míč na středu */}
      {hasCenter && <MatchBall />}

      {/* Branky */}
      <Goal
        position={[0, 0, -HALF_D]}
        netStyle={netStyle}
        netPattern={netPattern}
        teamColor={teamColor}
        secondaryColor={secondaryColor}
      />
      <Goal
        position={[0, 0, HALF_D]}
        flip
        netStyle={netStyle}
        netPattern={netPattern}
        teamColor={teamColor}
        secondaryColor={secondaryColor}
      />
    </group>
  );
}

/**
 * Natočení rohového čtvrtkruhu tak, aby mířil do hřiště.
 *
 * Výchozí výseč ringGeometry (0 → π/2) po sklopení do roviny pokrývá světový
 * kvadrant (+X, −Z). Každý roh potřebuje jiný, podle toho, kde leží střed hřiště.
 */
function cornerArcRotation(x: number, z: number): number {
  if (x < 0) return z < 0 ? -Math.PI / 2 : 0;
  return z < 0 ? Math.PI : Math.PI / 2;
}

/** Rohové praporky ve 4 rozích hřiště */
function CornerFlags() {
  const corners: Array<[number, number]> = [
    [-HALF_W, -HALF_D],
    [HALF_W, -HALF_D],
    [-HALF_W, HALF_D],
    [HALF_W, HALF_D],
  ];

  return (
    <group>
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          {/* Žerď praporku (bílá pružná tyč) */}
          <mesh position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 1.5, 6]} />
            <meshStandardMaterial color="#FFFFFF" metalness={0.2} roughness={0.5} />
          </mesh>
          {/* Žluto-červená vlaječka */}
          <mesh position={[0.18, 1.35, 0]} castShadow>
            <planeGeometry args={[0.36, 0.26]} />
            <meshStandardMaterial color="#EF4444" side={THREE.DoubleSide} roughness={0.7} />
          </mesh>
          <mesh position={[0.09, 1.41, 0.001]}>
            <planeGeometry args={[0.18, 0.13]} />
            <meshStandardMaterial color="#FACC15" side={THREE.DoubleSide} roughness={0.7} />
          </mesh>
          {/* Rohový čtvrtkruh — střed leží PŘESNĚ na rohu a výseč míří dovnitř hřiště.
              Dřív byl posunutý o půl metru dovnitř a výseč měl ve všech čtyřech rozích
              stejnou, takže ve třech z nich trčel ven do výběhové zóny. */}
          <mesh position={[0, CORNER_ARC_Y, 0]} rotation={[-Math.PI / 2, 0, cornerArcRotation(x, z)]}>
            <ringGeometry args={[0.9, 1.05, 12, 1, 0, Math.PI / 2]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** 3D fotbalový míč na středovém puntíku */
function MatchBall() {
  const ballRadius = 0.22;
  return (
    <group position={[0, ballRadius, 0]}>
      {/* Tělo míče (bílé) */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[ballRadius, 16, 12]} />
        <meshStandardMaterial color="#F9FAFB" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Černé pětiúhelníky na míči (klasický Telstar design) */}
      {[
        [0, 1, 0],
        [0.85, 0.3, 0.4],
        [-0.85, 0.3, 0.4],
        [0, 0.3, -0.95],
        [0.55, -0.7, 0.45],
        [-0.55, -0.7, 0.45],
      ].map((dir, i) => (
        <mesh
          key={i}
          position={[dir[0] * ballRadius * 0.98, dir[1] * ballRadius * 0.98, dir[2] * ballRadius * 0.98]}
          scale={[0.06, 0.06, 0.06]}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#111827" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function PitchLines({ hasFull, hasCenter, opacity }: { hasFull: boolean; hasCenter: boolean; opacity: number }) {
  const lineY = LINE_Y;
  const lineColor = "#fff";
  const lineWidth = hasFull ? 0.25 : 0.15;

  return (
    <group>
      {/* Obvod */}
      <Line points={[
        [-HALF_W, lineY, -HALF_D],
        [HALF_W,  lineY, -HALF_D],
        [HALF_W,  lineY, HALF_D],
        [-HALF_W, lineY, HALF_D],
        [-HALF_W, lineY, -HALF_D],
      ]} color={lineColor} width={lineWidth} opacity={opacity} />

      {/* Středová čára */}
      <Line points={[[-HALF_W, lineY, 0], [HALF_W, lineY, 0]]} color={lineColor} width={lineWidth} opacity={opacity} />

      {/* Středový kruh */}
      {hasCenter && <Circle radius={6} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />}

      {/* Středový bod */}
      <mesh position={[0, lineY + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 8]} />
        <meshBasicMaterial color={lineColor} transparent opacity={opacity} />
      </mesh>

      {/* Pokutová území - velké */}
      <Rect x={0} z={-HALF_D + 9} w={22} h={18} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />
      <Rect x={0} z={HALF_D - 9}  w={22} h={18} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />

      {/* Brankovista - malá (jen na full) */}
      {hasFull && (
        <>
          <Rect x={0} z={-HALF_D + 3.5} w={14} h={7} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />
          <Rect x={0} z={HALF_D - 3.5}  w={14} h={7} y={lineY} color={lineColor} width={lineWidth} opacity={opacity} />
        </>
      )}
    </group>
  );
}

// Tenký line proužek z meshů (pro 3D čáry, protože line v R3F je 1px wide)
function Line({ points, color, width, opacity }: { points: Array<[number, number, number]>; color: string; width: number; opacity: number }) {
  const segments: Array<{ pos: [number, number, number]; rot: [number, number, number]; len: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1, z1] = points[i];
    const [x2, , z2] = points[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);
    segments.push({
      pos: [(x1 + x2) / 2, y1, (z1 + z2) / 2],
      rot: [-Math.PI / 2, 0, -angle],
      len,
    });
  }
  return (
    <group>
      {segments.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot}>
          <planeGeometry args={[s.len, width]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} side={2} />
        </mesh>
      ))}
    </group>
  );
}

function Rect({ x, z, w, h, y, color, width, opacity }: { x: number; z: number; w: number; h: number; y: number; color: string; width: number; opacity: number }) {
  const halfW = w / 2, halfH = h / 2;
  return (
    <Line
      points={[
        [x - halfW, y, z - halfH],
        [x + halfW, y, z - halfH],
        [x + halfW, y, z + halfH],
        [x - halfW, y, z + halfH],
        [x - halfW, y, z - halfH],
      ]}
      color={color}
      width={width}
      opacity={opacity}
    />
  );
}

function Circle({ radius, y, color, width, opacity }: { radius: number; y: number; color: string; width: number; opacity: number }) {
  const segments = 32;
  const points: Array<[number, number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
  }
  return <Line points={points} color={color} width={width} opacity={opacity} />;
}

/** Vytvoří přesnou geometrii lichoběžníkového boku pro volnou okresní síť */
function createSideNetGeometry(dir: number, topD: number, groundD: number, H: number) {
  const geom = new THREE.BufferGeometry();
  // 4 vrcholy bočního lichoběžníku
  const positions = new Float32Array([
    0, 0, 0,                // V0: pata u sloupku
    0, H, 0,                // V1: horní roh u břevna
    0, H, dir * topD,       // V2: horní zadní konec oblouku
    0, 0, dir * groundD,    // V3: spodní zadní roh na zemi
  ]);

  const uvs = new Float32Array([
    0, 0,
    0, 8,
    topD * 4, 8,
    groundD * 4, 0,
  ]);

  // Oboustranné trojúhelníky
  const indices = [
    0, 1, 2,  0, 2, 3, // přední strana
    0, 2, 1,  0, 3, 2, // zadní strana
  ];

  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function Goal({
  position,
  flip,
  netStyle = "loose",
  netPattern = "white",
  teamColor = "#EF4444",
  secondaryColor = "#FFFFFF",
}: {
  position: [number, number, number];
  flip?: boolean;
  netStyle?: NetStyle;
  netPattern?: NetPattern;
  teamColor?: string;
  secondaryColor?: string;
}) {
  const goalWidth = 7.32;
  const goalHeight = 2.44;
  const postRadius = 0.08;
  const dir = flip ? 1 : -1;
  const isBox = netStyle === "box";

  // Rozměry pro okresní volnou síť (horní oblouk 0.8m, spodní hloubka 2.0m)
  const topD = 0.8;
  const groundD = 2.0;
  const boxDepth = 1.8;

  // Šikmá zadní stěna u volné sítě
  const slopeDepth = groundD - topD; // 1.2m
  const diagLen = Math.hypot(goalHeight, slopeDepth); // ~2.72m
  const diagAngle = Math.atan2(slopeDepth, goalHeight); // ~26.2°
  const slopeMidZ = dir * (topD + slopeDepth / 2); // dir * 1.4m

  // Textury sítě
  const netTexBack = useMemo(
    () => generateNetTexture(netPattern, teamColor, secondaryColor, 14, 8),
    [netPattern, teamColor, secondaryColor]
  );
  const netTexRoof = useMemo(
    () => generateNetTexture(netPattern, teamColor, secondaryColor, 14, 4),
    [netPattern, teamColor, secondaryColor]
  );
  const netTexSide = useMemo(
    () => generateNetTexture(netPattern, teamColor, secondaryColor, 6, 6),
    [netPattern, teamColor, secondaryColor]
  );

  // Boční sítě pro volný styl
  const sideNetGeom = useMemo(
    () => (!isBox ? createSideNetGeometry(dir, topD, groundD, goalHeight) : null),
    [isBox, dir, topD, groundD, goalHeight]
  );

  const braceColor = "#94A3B8";

  return (
    <group position={position}>
      {/* ─── Hlavní bílý rám branky ─── */}
      {/* Levý sloupek */}
      <mesh position={[-goalWidth / 2, goalHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.25} metalness={0.15} />
      </mesh>
      {/* Pravý sloupek */}
      <mesh position={[goalWidth / 2, goalHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.25} metalness={0.15} />
      </mesh>
      {/* Břevno */}
      <mesh position={[0, goalHeight, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, goalWidth, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.25} metalness={0.15} />
      </mesh>

      {/* ─── Ocelová konstrukce podle stylu ─── */}
      {isBox ? (
        // BOX: Moderní krabicová branka (svislé zadní sloupy + horní táhla)
        [-goalWidth / 2 + 0.05, goalWidth / 2 - 0.05].map((x, i) => (
          <group key={i}>
            {/* Zadní svislá tyč */}
            <mesh position={[x, goalHeight / 2, dir * boxDepth]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, goalHeight, 8]} />
              <meshStandardMaterial color={braceColor} metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Horní vodorovná vzpěra od břevna */}
            <mesh position={[x, goalHeight, dir * (boxDepth / 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, boxDepth, 8]} />
              <meshStandardMaterial color={braceColor} metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Spodní boční zemní trubka */}
            <mesh position={[x, 0.04, dir * (boxDepth / 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, boxDepth, 8]} />
              <meshStandardMaterial color={braceColor} metalness={0.7} roughness={0.4} />
            </mesh>
          </group>
        ))
      ) : (
        // LOOSE: Autentická okresní branka (horní oblouky "ucha" + šikmé vzpěry + spodní zemní rám)
        [-goalWidth / 2 + 0.05, goalWidth / 2 - 0.05].map((x, i) => (
          <group key={i}>
            {/* Horní vodorovné "ucho" branky ze břevna dozadu */}
            <mesh position={[x, goalHeight, dir * (topD / 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, topD, 8]} />
              <meshStandardMaterial color={braceColor} metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Šikmá zadní vzpěra z konce ucha dolů k zemi */}
            <mesh
              position={[x, goalHeight / 2, slopeMidZ]}
              rotation={[-dir * diagAngle, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.035, 0.035, diagLen, 8]} />
              <meshStandardMaterial color={braceColor} metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Spodní boční zemní rám */}
            <mesh position={[x, 0.04, dir * (groundD / 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, groundD, 8]} />
              <meshStandardMaterial color={braceColor} metalness={0.7} roughness={0.4} />
            </mesh>
          </group>
        ))
      )}

      {/* Zadní spojovací tyč na zemi */}
      <mesh
        position={[0, 0.04, dir * (isBox ? boxDepth : groundD)]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.035, 0.035, goalWidth - 0.1, 8]} />
        <meshStandardMaterial color={braceColor} metalness={0.7} roughness={0.4} />
      </mesh>

      {/* ─── Síť ─── */}
      {netTexBack && (
        <group>
          {isBox ? (
            <>
              {/* Krabicová: Zadní svislá stěna */}
              <mesh position={[0, goalHeight / 2, dir * boxDepth]}>
                <planeGeometry args={[goalWidth, goalHeight]} />
                <meshBasicMaterial map={netTexBack} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
              </mesh>
              {/* Krabicová: Horní stropní síť */}
              <mesh position={[0, goalHeight, dir * (boxDepth / 2)]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[goalWidth, boxDepth]} />
                <meshBasicMaterial map={netTexRoof ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
              </mesh>
              {/* Krabicová: Levý bok */}
              <mesh position={[-goalWidth / 2, goalHeight / 2, dir * (boxDepth / 2)]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[boxDepth, goalHeight]} />
                <meshBasicMaterial map={netTexSide ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
              </mesh>
              {/* Krabicová: Pravý bok */}
              <mesh position={[goalWidth / 2, goalHeight / 2, dir * (boxDepth / 2)]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[boxDepth, goalHeight]} />
                <meshBasicMaterial map={netTexSide ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
              </mesh>
            </>
          ) : (
            <>
              {/* Volná: Horní vodorovná část mezi břevnem a oblouky */}
              <mesh position={[0, goalHeight, dir * (topD / 2)]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[goalWidth, topD]} />
                <meshBasicMaterial map={netTexRoof ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
              </mesh>
              {/* Volná: Šikmá splývající zadní síť z konce ucha k zemi */}
              <mesh
                position={[0, goalHeight / 2, slopeMidZ]}
                rotation={[-dir * diagAngle, 0, 0]}
              >
                <planeGeometry args={[goalWidth, diagLen]} />
                <meshBasicMaterial map={netTexBack} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
              </mesh>
              {/* Volná: Přesný levý bok (lichoběžník) */}
              {sideNetGeom && (
                <>
                  <mesh position={[-goalWidth / 2, 0, 0]} geometry={sideNetGeom}>
                    <meshBasicMaterial map={netTexSide ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
                  </mesh>
                  <mesh position={[goalWidth / 2, 0, 0]} geometry={sideNetGeom}>
                    <meshBasicMaterial map={netTexSide ?? undefined} transparent depthWrite={false} side={THREE.DoubleSide} opacity={0.88} />
                  </mesh>
                </>
              )}
            </>
          )}
        </group>
      )}
    </group>
  );
}
