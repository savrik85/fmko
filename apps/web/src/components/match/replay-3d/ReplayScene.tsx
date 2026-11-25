"use client";

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { FENCE_BOUNDS, GOAL_NAME, PITCH_SURFACE_Y } from "@/components/stadium/stadium-3d/constants";
import { crowdMood } from "@/components/stadium/stadium-3d/crowdMood";
import { RealtimeShadowsContext } from "@/components/stadium/stadium-3d/LightingAndAtmosphere";
import { crowdExcitement, emptyFrame, GOAL_TEXT, HALF_L, HALF_W, REPLAY, sampleClip, sceneTime, type Clip, type Figure, type Replay, type ReplayKit, type Scene, type Side } from "./scenes";

/** Záběr: scéna a její část. Nový objekt znamená hrát od začátku, i když jde o tutéž scénu (skok zpět na její začátek). */
interface ReplayPlay {
  scene: Scene;
  /** Útočná fáze šance (záznam ukazuje „ŠANCE“), jinak zbytek scény. */
  attack: boolean;
}

/** Co má scéna právě hrát. Čas záběru si počítá sama ze snímků, takže stojí, kdykoli se scéna nekreslí (pauza). */
export interface ReplayStep {
  play: ReplayPlay;
  /** „Rychle“ přehrává scény dvakrát rychleji. */
  rate: number;
  /** Záběr stojí na svém prvním snímku (po skoku na akci, o přestávce). */
  hold: boolean;
}

/** Co má figura na sobě; vzor dresu mají jen hráči v poli. */
type Outfit = Pick<ReplayKit, "shirt" | "shorts" | "socks">;
const REFEREE_KIT: Outfit = { shirt: "#111827", shorts: "#111827", socks: "#111827" };
/** Trenér má mikinu v barvě dresu svého týmu a tmavé kalhoty. */
const COACH_TROUSERS = "#1F2937";
/**
 * Brankář dostane první barvu, která se neplete s dresy obou týmů, s rozhodčím ani s druhým brankářem.
 * Když se pletou všechny, tu nejvzdálenější.
 */
const KEEPER_PALETTE = ["#FACC15", "#22C55E", "#EC4899", "#F97316", "#A855F7", "#E5E7EB"];
const CARD_COLORS = { yellow: "#FACC15", red: "#DC2626" };
/** Postavy jsou o kus větší než skutečnost, ať jsou z televizního pohledu čitelné i v malém okně. */
const FIGURE_SCALE = 1.25;
const BALL_RADIUS = 0.28;
/**
 * Jediná kamera, jako když zápas v pralese točí jeden člověk z tribuny: stojí celý zápas za postranní čárou
 * ve výšce horních řad a vidí hřiště na hloubku celé, i bližší lajnu. Za míčem se jen pomalu otáčí (nejvýš
 * o `pan` metrů od půlky). Tribuna, ve které kamera stojí, se nekreslí (viz ořez scény níž).
 */
const CAMERA = { x: HALF_W + 26, y: 13, fov: 26, pan: 9 };
/** Kam kamera míří napříč hřištěm: tak, aby bližší postranní čára ležela u spodního okraje záběru. */
const CAMERA_AIM_X = -4.6;
/** Pohled z výšky: celý stadion z ptačí perspektivy, kamera stojí a nic se neořezává. */
const OVERVIEW = { x: HALF_W + 46, y: 56, fov: 40 };
/** Scéna nekreslí nic za bližší postranní čárou: kamera stojí tam, kde má stadion hlavní tribunu. */
const CLIP_PLANES = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF_W + 1.2)];
/** O tolik se smí lišit čas navazujícího záběru téhož klipu, aby se hrálo plynule dál bez střihu. */
const SEAM = 0.25;
/** Výška boků sedícího náhradníka nad zemí (sedačka střídačky je ve výšce 0,5 m). */
const SEAT_HIP_Y = 0.6;
/** Po kolika plynulých snímcích za sebou se scéna považuje za načtenou. */
const SMOOTH_FRAMES = 20;
/** Snímek je plynulý, když netrvá déle (s). */
const SMOOTH_DELTA = 0.1;
/** Jak daleko dopředu v klipu (sekundy) se po střihu měří rychlost a směr postav. */
const LOOKAHEAD = 0.1;

function keeperShirts(home: ReplayKit, away: ReplayKit): { home: string; away: string } {
  const taken = [home.shirt, away.shirt, REFEREE_KIT.shirt].map((c) => new THREE.Color(c));
  const distance = (c: THREE.Color) => Math.min(...taken.map((t) => Math.hypot(c.r - t.r, c.g - t.g, c.b - t.b)));
  const pick = () => {
    const colors = KEEPER_PALETTE.map((c) => new THREE.Color(c));
    const color = colors.find((c) => distance(c) > 0.45) ?? colors.reduce((best, c) => (distance(c) > distance(best) ? c : best));
    taken.push(color);
    return `#${color.getHexString()}`;
  };
  return { home: pick(), away: pick() };
}

const SKIN = "#E0B48C";
type Joint = "hip" | "knee" | "shoulder" | "elbow";

interface PartDef {
  id: string;
  geometry: THREE.BufferGeometry;
  /** Kloub, na kterém díl visí (díl je pak na každé straně těla jeden), nebo místo v těle. */
  on: Joint | [number, number, number];
  /** O kolik je střed dílu pod kloubem. */
  drop: number;
  /** Holá hlava vlasy nemá (null). */
  color: (kit: Outfit, shirt: string, fig: Figure) => string | null;
}

/** Kde jsou klouby v těle (m): kyčel a rameno od středu, koleno a loket pod nimi. */
const BODY = { hip: [0.1, 0.92], knee: 0.44, shoulder: [0.29, 1.45], elbow: 0.26 } as const;
const skin = (_: Outfit, __: string, fig: Figure) => fig.player.skinColor ?? SKIN;
/** Postava z kvádrů s koleny a lokty: dres s krátkým rukávem, holá předloktí, trenýrky, vysoko vytažené štulpny, kopačky. */
const PARTS: PartDef[] = [
  { id: "shorts", geometry: new THREE.BoxGeometry(0.19, 0.46, 0.21), on: "hip", drop: 0.21, color: (kit) => kit.shorts },
  { id: "sock", geometry: new THREE.BoxGeometry(0.13, 0.4, 0.14), on: "knee", drop: 0.18, color: (kit) => kit.socks },
  // Rozhodčí a trenéři mají boty černé, hráči šedé.
  { id: "boot", geometry: new THREE.BoxGeometry(0.14, 0.11, 0.25).translate(0, 0, 0.05), on: "knee", drop: 0.43, color: (_, __, fig) => (fig.team === "referee" || fig.coach ? "#111111" : "#9CA3AF") },
  { id: "torso", geometry: new THREE.BoxGeometry(0.44, 0.56, 0.25), on: [0, 1.2, 0], drop: 0, color: (_, shirt) => shirt },
  { id: "sleeve", geometry: new THREE.BoxGeometry(0.13, 0.27, 0.14), on: "shoulder", drop: 0.12, color: (_, shirt) => shirt },
  // Trenér má dlouhý rukáv (mikina).
  { id: "forearm", geometry: new THREE.BoxGeometry(0.1, 0.3, 0.11), on: "elbow", drop: 0.14, color: (kit, shirt, fig) => (fig.coach ? shirt : skin(kit, shirt, fig)) },
  // Oválná hlava: brada sahá až k ramenům, takže mezi hlavou a trupem není mezera.
  { id: "head", geometry: new THREE.SphereGeometry(0.13, 12, 10).scale(1, 1.25, 1), on: [0, 1.63, 0], drop: 0, color: skin },
  { id: "hair", geometry: new THREE.BoxGeometry(0.25, 0.09, 0.26), on: [0, 1.75, -0.01], drop: 0, color: (_, __, fig) => fig.player.hairColor ?? null },
];
const perFigure = (part: PartDef) => (typeof part.on === "string" ? 2 : 1);

/** Dresy na trupu jsou z jedné textury se třemi poli vedle sebe: domácí, hosté a bílé pole pro jednobarevné dresy. */
const SHIRT_TILES = { home: 0, away: 1, plain: 2 };
const TILE = 64;
/** Vzor dresu z editoru (jersey-preview.tsx) nakreslený na jedno pole textury. */
function drawShirt(ctx: CanvasRenderingContext2D, tile: number, { shirt, secondary, pattern }: ReplayKit) {
  const x = tile * TILE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, 0, TILE, TILE);
  ctx.clip();
  ctx.fillStyle = shirt;
  ctx.fillRect(x, 0, TILE, TILE);
  ctx.fillStyle = secondary;
  const bands = (count: number, width: number, vertical: boolean) => {
    for (let n = 0; n < count; n++) {
      const at = ((n + 0.5) / count) * TILE - width / 2;
      if (vertical) ctx.fillRect(x + at, 0, width, TILE); else ctx.fillRect(x, at, TILE, width);
    }
  };
  switch (pattern) {
    case "stripes": bands(4, TILE / 8, true); break;
    case "pinstripes": bands(8, TILE / 32, true); break;
    case "hoops": bands(4, TILE / 8, false); break;
    case "halves": ctx.fillRect(x + TILE / 2, 0, TILE / 2, TILE); break;
    case "quarters": ctx.fillRect(x + TILE / 2, 0, TILE / 2, TILE / 2); ctx.fillRect(x, TILE / 2, TILE / 2, TILE / 2); break;
    case "chest_band": ctx.fillRect(x, TILE * 0.3, TILE, TILE * 0.2); break;
    case "sash":
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + TILE * 0.35, 0); ctx.lineTo(x + TILE, TILE * 0.65); ctx.lineTo(x + TILE, TILE); ctx.lineTo(x + TILE * 0.65, TILE); ctx.lineTo(x, TILE * 0.35);
      ctx.fill();
      break;
    case "gradient": {
      const fade = ctx.createLinearGradient(0, 0, 0, TILE);
      fade.addColorStop(0, shirt);
      fade.addColorStop(1, secondary);
      ctx.fillStyle = fade;
      ctx.fillRect(x, 0, TILE, TILE);
      break;
    }
  }
  ctx.restore();
}
/** Každá figura bere z textury dresů své pole (atribut `tile`). */
const pickShirtTile = (shader: { vertexShader: string }) => {
  shader.vertexShader = `attribute float tile;\n${shader.vertexShader}`.replace("#include <uv_vertex>", `#include <uv_vertex>\nvMapUv.x = (vMapUv.x + tile) / ${Object.keys(SHIRT_TILES).length}.0;`);
};
const TORSO = PARTS.find((part) => part.id === "torso")!;
/** Barva branky po gólu: zelená nápisu „GÓÓÓL!“ (bg-green-500). */
const GOAL_GREEN = "#22C55E";
/** Obarví branku stadionu (tyče, síť i konstrukci, ať má jakýkoli tvar) na zeleno, nebo jí vrátí původní barvy. */
function tintGoal(goal: THREE.Object3D, on: boolean) {
  goal.traverse((part) => {
    const material = (part as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!material?.color) return;
    material.userData.plain ??= material.color.getHex();
    material.color.set(on ? GOAL_GREEN : material.userData.plain);
  });
}
/**
 * Nápis gólu promítnutý na střed hřiště jako grafika v televizním přenosu: leží na trávníku (hráči po něm běhají)
 * a čte se z tribuny. `width` je podél hřiště, `depth` napříč; z tribuny se hloubka zkrátí asi na čtvrtinu,
 * z paneláku míň, takže odtud jsou písmena vyšší.
 * Objeví se s gólem (`fadeIn` sekund) a zmizí naráz, jakmile míč v brance není (střih na opakovaný záběr nebo další akci).
 */
const GOAL_SIGN = { width: 20, depth: 13.5, opacity: 0.8, fadeIn: 0.35 };
/** Kamera stojí na straně +x a dívá se k −x: vpravo v obraze je −z, nahoře −x. */
const GOAL_SIGN_GEOMETRY = new THREE.PlaneGeometry(GOAL_SIGN.width, GOAL_SIGN.depth)
  .applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)));
/** Bílý nápis přes celou texturu; zelenou mu dá materiál. Písmo je nadpisové písmo hry. */
function goalSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `900 200px ${getComputedStyle(document.body).getPropertyValue("--font-heading")}, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  const metrics = ctx.measureText(GOAL_TEXT);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale((canvas.width - 24) / metrics.width, (canvas.height - 24) / (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent));
  ctx.fillText(GOAL_TEXT, 0, (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** Auto, kterým po zápase odjíždí rozhodčí: jede po cestě za plotem areálu (x) zprava doleva (z), z obrazu ven i při pohledu z paneláku. */
const CAR_ROAD = { x: -(FENCE_BOUNDS.width / 2 + 4), from: -110, to: 110 };

interface FigureState { x: number; z: number; yaw: number; phase: number; speed: number }

// Pracovní objekty, ať se v každém snímku nealokuje.
const mRoot = new THREE.Matrix4(), mTmp = new THREE.Matrix4(), mOut = new THREE.Matrix4();
const joints: Record<Joint, THREE.Matrix4[]> = { hip: [new THREE.Matrix4(), new THREE.Matrix4()], knee: [new THREE.Matrix4(), new THREE.Matrix4()], shoulder: [new THREE.Matrix4(), new THREE.Matrix4()], elbow: [new THREE.Matrix4(), new THREE.Matrix4()] };
const qRoot = new THREE.Quaternion(), qPose = new THREE.Quaternion();
const vPos = new THREE.Vector3(), vScale = new THREE.Vector3(), vLook = new THREE.Vector3();
const eTmp = new THREE.Euler(), cTmp = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Hráči, rozhodčí a míč ve scéně stadionu; kreslí to, co právě hraje `step`, a řídí kameru. */
export function ReplayScene({ replay, kits, snow, overcast, overview, step, root, onReady }: {
  replay: Replay;
  kits: { home: ReplayKit; away: ReplayKit };
  /** Na sněhu se hraje s oranžovým míčem. */
  snow: boolean;
  /** Pod mrakem je slabší i náhradní stín (tmavé kolečko); skutečné stíny zeslabuje světlo stadionu samo. */
  overcast: boolean;
  /** Pohled z výšky na celý stadion místo televizní kamery z tribuny. */
  overview: boolean;
  step: { current: ReplayStep };
  /** Obal záznamu: během opakovaného záběru gólu má atribut `data-replaying` (podle něj se ukáže jeho nápis). */
  root: RefObject<HTMLDivElement | null>;
  /** Zavolá se po prvním vykresleném snímku. */
  onReady: () => void;
}) {
  const count = replay.figures.length;
  /** Hráči a míč vrhají skutečný stín od slunce stadionu; kde ho světla nepočítají (mobil), je pod nimi tmavé kolečko. */
  const realShadows = useContext(RealtimeShadowsContext);
  /** Obraz o kousek dál v klipu: po střihu z něj postavy vezmou rychlost a směr. */
  const ahead = useMemo(() => emptyFrame(count), [count]);
  const frame = useMemo(() => emptyFrame(count), [count]);
  const states = useMemo<FigureState[]>(() => replay.figures.map(() => ({ x: 0, z: 0, yaw: 0, phase: 0, speed: 0 })), [replay]);
  const keepers = useMemo(() => keeperShirts(kits.home, kits.away), [kits]);
  const shirts = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TILE * Object.keys(SHIRT_TILES).length;
    canvas.height = TILE;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, TILE);
    drawShirt(ctx, SHIRT_TILES.home, kits.home);
    drawShirt(ctx, SHIRT_TILES.away, kits.away);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Bez mipmap: zmenšené pole by nabíralo barvu sousedního dresu.
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }, [kits]);
  useEffect(() => () => shirts.dispose(), [shirts]);
  const tiles = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(count), 1), [count]);
  useLayoutEffect(() => { TORSO.geometry.setAttribute("tile", tiles); }, [tiles]);
  const shadowGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), []);
  // Tmavé plošky jsou na míči proto, aby bylo poznat, že se točí.
  const ballGeometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(BALL_RADIUS, 1);
    const colors = new Float32Array(g.attributes.position.count * 3);
    const base = new THREE.Color(snow ? "#F97316" : "#F8F8F8"), patch = new THREE.Color("#1A1A1A");
    for (let v = 0; v < colors.length / 3; v++) (Math.floor(v / 3) % 4 ? base : patch).toArray(colors, v * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [snow]);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const shadows = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const ball = useRef<THREE.Mesh>(null);
  const card = useRef<THREE.Mesh>(null);
  const car = useRef<THREE.Group>(null);
  /** Branka, která je po gólu zelená. */
  const scored = useRef<THREE.Object3D | null>(null);
  const goalSign = useRef<THREE.Mesh>(null);
  const goalSignMap = useMemo(goalSignTexture, []);
  useEffect(() => () => goalSignMap.dispose(), [goalSignMap]);
  /** Jak moc je nápis gólu na hřišti vidět (0–1). */
  const goalSignShown = useRef(0);
  const world = useThree((s) => s.scene);
  useEffect(() => () => { if (scored.current) tintGoal(scored.current, false); }, []);
  useEffect(() => () => { crowdMood.home = crowdMood.away = 0; }, []);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  /** Co se kreslilo minule: podle toho se pozná střih (hráči pak neběží, stojí rovnou na místě). */
  const last = useRef<{ clip: Clip | null; t: number; cuts: number; replaying: boolean }>({ clip: null, t: 0, cuts: 0, replaying: false });
  /** Záběr, který je právě v obraze: kolik z něj uběhlo (`elapsed`) a kde v klipu je (`t`). */
  const playback = useRef<{ play: ReplayPlay | null; elapsed: number; t: number }>({ play: null, elapsed: 0, t: 0 });
  const look = useRef(new THREE.Vector3());
  /** Kolik snímků po sobě se nakreslilo bez zadrhnutí a jestli už scéna ohlásila, že je připravená. */
  const smooth = useRef(0);
  const ready = useRef(false);

  useEffect(() => {
    gl.clippingPlanes = overview ? [] : CLIP_PLANES;
    return () => { gl.clippingPlanes = []; };
  }, [gl, overview]);
  // Zastavená scéna (pauza) se nekreslí; po změně velikosti plátna (celá obrazovka) by zůstala prázdná a po
  // přepnutí pohledu stará.
  const size = useThree((s) => s.size);
  const get = useThree((s) => s.get);
  useEffect(() => {
    const state = get();
    if (state.frameloop === "never") state.advance(state.clock.elapsedTime);
  }, [size, overview, get]);

  const paint = (clip: Clip) => {
    PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      replay.figures.forEach((fig, i) => {
        const kit: Outfit = fig.team === "referee" ? REFEREE_KIT : fig.coach ? { shirt: kits[fig.team].shirt, shorts: COACH_TROUSERS, socks: COACH_TROUSERS } : kits[fig.team];
        const shirt = fig.team !== "referee" && clip.keepers.has(i) ? keepers[fig.team] : kit.shirt;
        // Hráč v poli má dres se vzorem svého týmu: trup bere barvy z textury, rukávy jsou u vzoru „sleeves“ doplňkové.
        const design = fig.team !== "referee" && !fig.coach && !clip.keepers.has(i) ? kits[fig.team] : null;
        if (part === TORSO) tiles.setX(i, design ? SHIRT_TILES[fig.team as Side] : SHIRT_TILES.plain);
        cTmp.set(design && part === TORSO ? "#FFFFFF" : design?.pattern === "sleeves" && part.id === "sleeve" ? design.secondary : part.color(kit, shirt, fig) ?? "#000000");
        for (let k = 0; k < perFigure(part); k++) mesh.setColorAt(i * perFigure(part) + k, cTmp);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    tiles.needsUpdate = true;
  };

  useFrame((_, delta) => {
    // Záznam se rozběhne, až se scéna kreslí plynule: první snímky po načtení trvají i sekundy (překládají se
    // shadery, dotahují modely) a úvod by mezitím proběhl za načítáním.
    if (!ready.current && (ready.current = (smooth.current = delta < SMOOTH_DELTA ? smooth.current + 1 : 0) >= SMOOTH_FRAMES)) onReady();
    const { play, rate, hold } = step.current;
    const dt = Math.min(delta, 0.1);
    const p = playback.current;
    if (p.play !== play) {
      const first = sceneTime(play.scene, play.attack, 0);
      // Navazuje-li nový záběr tam, kde ten starý právě je (rozehrání → útok → výsledek), hraje se plynule dál.
      const seamless = p.play?.scene.clip === play.scene.clip && Math.abs(first - p.t) < SEAM;
      Object.assign(p, { play, elapsed: seamless ? p.t - first : 0 });
    }
    const { scene, attack } = play;
    // Dokud se scéna načítá, stojí na prvním snímku: nápisy řídí stránka a ta se rozběhne až po načtení.
    const held = hold || !ready.current;
    const elapsed = p.elapsed = held ? 0 : p.elapsed + dt * rate;
    // Gól: po chvíli oslavy se zakončení zpomaleně zopakuje.
    const again = !attack && scene.replay ? scene.replay : null;
    // Opakovaný záběr je to poslední, co z gólu je: když skončí, drží jeho poslední snímek, dokud nepřijde další akce
    // (k oslavě se obraz nevrací).
    const replaying = again !== null && elapsed >= REPLAY.after;
    const t = replaying && again ? THREE.MathUtils.lerp(again.from, again.to, Math.min(1, (elapsed - REPLAY.after) / REPLAY.seconds))
      : sceneTime(scene, attack, elapsed);
    p.t = t;
    sampleClip(scene.clip, t, frame);
    // Střih: jiný klip, střih uvnitř klipu, skok zpět, začátek a konec opakovaného záběru, snímek po zaseknutí.
    // Je ostrý, bez prolnutí: starý záběr by jinak dozníval pod nápisem nové akce.
    const cut = last.current.clip !== scene.clip || last.current.cuts !== frame.cuts || last.current.replaying !== replaying || t < last.current.t
      || t - last.current.t > 0.5;
    root.current?.toggleAttribute("data-replaying", replaying);
    if (last.current.clip !== scene.clip) paint(scene.clip);
    last.current = { clip: scene.clip, t, cuts: frame.cuts, replaying };
    const now = performance.now() / 1000;

    // Po střihu se rychlost a směr berou z klipu: kdo ve střihu jde nebo běží, jde hned a čelem po směru. Stejně
    // u stojícího snímku (po skoku na akci, při načítání): vypadá jako zastavené video a po rozběhnutí hráči
    // nezačínají ze stoje.
    const fromClip = cut || held;
    if (fromClip) sampleClip(scene.clip, t + LOOKAHEAD, ahead);
    frame.figures.forEach((f, i) => {
      const s = states[i];
      if (!f.visible) return;
      const from = fromClip ? f : s, to = fromClip ? (ahead.figures[i].visible ? ahead.figures[i] : f) : f;
      const dx = to.x - from.x, dz = to.z - from.z;
      const stride = fromClip ? 0 : Math.hypot(dx, dz);
      s.x = f.x;
      s.z = f.z;
      // Snímek bez uplynulého času (překreslení zastaveného obrazu) rychlost nemění.
      if (fromClip) s.speed = Math.hypot(dx, dz) / LOOKAHEAD;
      else if (dt > 0) s.speed = THREE.MathUtils.lerp(s.speed, stride / dt, Math.min(1, dt * 8));
      s.phase += stride * 1.9;
      // Čelem po směru běhu, stojící čelem k míči; padající brankář čelem do pole, ležící napříč obrazem.
      const dive = f.pose === "diveLeft" || f.pose === "diveRight";
      const moving = s.speed > 0.8;
      // Náhradník na střídačce sedí čelem do hřiště.
      const sit = f.pose === "sit";
      const faceX = dive ? 0 : sit ? 1 : moving ? dx : frame.ballX - s.x;
      const faceZ = dive ? -s.z : sit ? 0 : moving ? dz : frame.ballZ - s.z;
      if (f.pose === "down") s.yaw = 0;
      // Při podání ruky a objetí zůstávají čelem k sobě, jak k sobě došli.
      else if (f.pose !== "shake" && f.pose !== "hug" && Math.abs(faceX) + Math.abs(faceZ) > 0.01) {
        const diff = Math.atan2(faceX, faceZ) - s.yaw;
        s.yaw += Math.atan2(Math.sin(diff), Math.cos(diff)) * (fromClip ? 1 : Math.min(1, dt * 7));
      }
    });

    frame.figures.forEach((f, i) => {
      const fig = replay.figures[i];
      const s = states[i];
      if (f.visible) {
        const scale = ((fig.player.height ?? 178) / 178) * FIGURE_SCALE;
        // Jak moc hráč běží (0 stojí, 1 sprint): podle toho se předklání, zvedá kolena a pracuje rukama.
        const run = Math.min(1, s.speed / 6);
        const slide = f.pose === "slide", sit = f.pose === "sit", hug = f.pose === "hug", rest = f.pose === "rest", upright = f.pose === "sitUp", tackle = f.pose === "tackle";
        // Sed na trávníku: unavený hráč je zakloněný a opřený o ruce za zády, rozhodčí sedí zpříma s rukama na kolenou.
        // Skluz do rány: obránce leží skoro na zádech, opřený o ruce, nohy natažené po zemi před sebe k míči.
        const grounded = rest || upright || tackle, sitLean = tackle ? -1 : rest ? -0.35 : 0.1;
        let lift = f.y + Math.abs(Math.sin(s.phase)) * 0.05 * run, shift = 0;
        qRoot.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
        if (f.pose === "down") {
          // Ležící tělo má střed na místě hráče.
          qRoot.multiply(qPose.setFromEuler(eTmp.set(-Math.PI / 2 + 0.1, 0, 0)));
          lift = 0.14;
          shift = 0.85 * scale;
        } else if (f.pose === "diveLeft" || f.pose === "diveRight") {
          // Pád do strany ve světových souřadnicích: lokální osa x míří k cos(yaw) světové x.
          const roll = -1.25 * (f.pose === "diveRight" ? 1 : -1) * (Math.cos(s.yaw) >= 0 ? 1 : -1);
          qRoot.multiply(qPose.setFromEuler(eTmp.set(0, 0, roll)));
          lift = 0.45;
        } else {
          // Předklon v běhu; při skluzu po kolenou je tělo zakloněné a níž.
          qRoot.multiply(qPose.setFromEuler(eTmp.set(slide ? -0.35 : grounded ? sitLean : hug ? 0.15 : 0.24 * run, 0, 0)));
          if (slide) lift = -0.4 * scale;
          // Sedí na trávníku: boky u země (tělo se naklání kolem chodidel, proto kosinus), kolena zvednutá a chodidla na zemi.
          if (grounded) lift = (0.11 - BODY.hip[1] * Math.cos(sitLean)) * scale;
          // Tělo se zaklání kolem chodidel: při skluzu se posune dopředu, ať boky zůstanou na místě hráče.
          if (tackle) shift = BODY.hip[1] * Math.sin(-sitLean) * scale;
          // Sedí: boky ve výšce sedačky.
          if (sit) lift = SEAT_HIP_Y - BODY.hip[1] * scale;
        }
        mRoot.compose(vPos.set(s.x + Math.sin(s.yaw) * shift, PITCH_SURFACE_Y + lift, s.z + Math.cos(s.yaw) * shift), qRoot, vScale.setScalar(scale));
        // Při skluzu po kolenou je tělo zakloněné: ruce drží stejně jako při oslavě vestoje, vyjdou tak rovně vzhůru.
        const cheering = f.pose === "celebrate" || slide;
        const armsUp = cheering || f.pose === "diveLeft" || f.pose === "diveRight";
        for (let k = 0; k < 2; k++) {
          const side = k === 0 ? 1 : -1;
          const swing = Math.sin(s.phase) * side;
          // Noha: stehno kmitá dopředu a dozadu, koleno se ohýbá, když jde noha vzad (při skluzu jsou kolena ohnutá pořád).
          const thigh = sit ? -1.5 : tackle ? -Math.PI / 2 - sitLean : grounded ? -2.2 - sitLean : slide ? 0.3 : -swing * 0.95 * run;
          const knee = tackle ? 0.1 : grounded ? 1.33 : sit || slide ? 1.5 : run * (0.25 + 0.9 * Math.max(0, Math.cos(s.phase) * side));
          joints.hip[k].makeTranslation(BODY.hip[0] * side, BODY.hip[1], 0).multiply(mTmp.makeRotationX(thigh));
          joints.knee[k].copy(joints.hip[k]).multiply(mTmp.makeTranslation(0, -BODY.knee, 0)).multiply(mTmp.makeRotationX(knee));
          // Ruka: v běhu proti noze s ohnutým loktem; při oslavě zdvižená vzhůru a mírně před tělo (kladný úhel paže míří za záda), při výskoku na hlavičku jen
          // pokrčená před tělem; natažená nahoru je při skoku brankáře a se zdviženou paží (`armUp`, jen levá).
          // První paže (k = 0) je levá: postava se dívá po ose z a osa x jí míří doleva.
          const raised = armsUp || (f.pose === "armUp" && k === 0);
          // Podání ruky: pravá v pase před tělem, potřásá se v lokti (oba ve stejném rytmu, ruce zůstávají u sebe).
          const shaking = f.pose === "shake" && k === 1;
          // Chlapské objetí: pravé ruce si dál drží mezi sebou, levá toho druhého poplácá po zádech.
          const arm = rest || tackle ? 0.75 : upright ? -1 : hug ? (k === 1 ? -0.55 : -1.1) : shaking ? -0.55 : cheering ? -2.75 + Math.sin(now * 9 + i) * 0.15 : raised ? Math.PI - 0.25 : f.y > 0.05 ? 0.9 : swing * 0.8 * run + Math.sin(now * 1.3 + i * 2.1) * 0.05;
          const elbow = rest || tackle ? -0.1 : upright ? -0.3 : hug ? (k === 1 ? -0.9 : -0.5 - Math.max(0, Math.sin(now * 8)) * 0.35) : shaking ? -0.6 + Math.sin(now * 11) * 0.15 : cheering ? -0.35 : raised ? -0.15 : f.y > 0.05 ? -0.9 : -(0.25 + 1.1 * run);
          joints.shoulder[k].makeTranslation(BODY.shoulder[0] * side, BODY.shoulder[1], 0).multiply(mTmp.makeRotationX(arm));
          joints.elbow[k].copy(joints.shoulder[k]).multiply(mTmp.makeTranslation(0, -BODY.elbow, 0)).multiply(mTmp.makeRotationX(elbow));
        }
      }
      PARTS.forEach((part, p) => {
        const mesh = meshes.current[p];
        if (!mesh) return;
        const hidden = !f.visible || (part.id === "hair" && !fig.player.hairColor);
        for (let k = 0; k < perFigure(part); k++) {
          if (hidden) mesh.setMatrixAt(i * perFigure(part) + k, HIDDEN);
          else {
            if (typeof part.on === "string") mOut.copy(joints[part.on][k]).multiply(mTmp.makeTranslation(0, -part.drop, 0));
            else mOut.makeTranslation(part.on[0], part.on[1], part.on[2]);
            mesh.setMatrixAt(i * perFigure(part) + k, mOut.premultiply(mRoot));
          }
        }
      });
    });
    for (const mesh of meshes.current) if (mesh) mesh.instanceMatrix.needsUpdate = true;

    // Karta ve zdvižené ruce rozhodčího; když ruku spustí, kartu schoval.
    const shown = scene.card && t >= scene.card.at && frame.figures[replay.referee].pose === "armUp" ? scene.card : null;
    // Gól: ve scéně, která končí gólem, branka zezelená (barva nápisu „GÓÓÓL!“), jakmile je míč za brankovou čárou.
    const inGoal = scene.goal && Math.abs(frame.ballZ) > HALF_L;
    // Diváci: gól slaví fanoušci střelce a fanoušci soupeře po něm ztichnou; po zahozené šanci se pár lidí na chvíli
    // zvedne. Řídí se časem klipu, takže v opakovaném záběru gólu se zvednou znovu až s míčem v síti.
    const fansOf = replay.figures[scene.focus[0]]?.team;
    const excitement = crowdExcitement(scene, t, inGoal), conceded = scene.goal ? -excitement : 0;
    crowdMood.home = fansOf === "home" ? excitement : fansOf === "away" ? conceded : 0;
    crowdMood.away = fansOf === "away" ? excitement : fansOf === "home" ? conceded : 0;
    const goal = inGoal ? world.getObjectsByProperty("name", GOAL_NAME).find((g) => Math.sign(g.getWorldPosition(vPos).z) === Math.sign(frame.ballZ)) ?? null : null;
    if (goal !== scored.current) {
      if (scored.current) tintGoal(scored.current, false);
      if (goal) tintGoal(goal, true);
      scored.current = goal;
    }
    if (goalSign.current) {
      const shown = goalSignShown.current = THREE.MathUtils.clamp(inGoal ? goalSignShown.current + dt / GOAL_SIGN.fadeIn : 0, 0, 1);
      const eased = THREE.MathUtils.smoothstep(shown, 0, 1);
      goalSign.current.visible = shown > 0;
      (goalSign.current.material as THREE.MeshBasicMaterial).opacity = GOAL_SIGN.opacity * eased;
      // Při objevení nápis lehce doroste.
      goalSign.current.scale.setScalar(0.92 + 0.08 * eased);
    }
    if (car.current) {
      const driving = scene.drive !== undefined && t >= scene.drive.from && t < scene.drive.to;
      car.current.visible = driving;
      if (driving) car.current.position.set(CAR_ROAD.x, 0, THREE.MathUtils.mapLinear(t, scene.drive!.from, scene.drive!.to, CAR_ROAD.from, CAR_ROAD.to));
    }
    if (card.current) {
      const r = states[replay.referee];
      card.current.visible = shown !== null;
      if (shown) {
        (card.current.material as THREE.MeshBasicMaterial).color.set(CARD_COLORS[shown.color]);
        card.current.position.set(r.x + Math.cos(r.yaw) * 0.36, PITCH_SURFACE_Y + 2.75, r.z - Math.sin(r.yaw) * 0.36);
        card.current.quaternion.copy(camera.quaternion);
      }
    }

    // Kroužek pod hráči, o které ve scéně jde.
    rings.current.forEach((ring, n) => {
      const i = scene.focus[n];
      if (!ring) return;
      ring.visible = i !== undefined && frame.figures[i].visible;
      if (!ring.visible) return;
      ring.position.set(states[i].x, PITCH_SURFACE_Y + 0.03, states[i].z);
      ring.scale.setScalar(1 + 0.12 * Math.sin(now * 7));
    });

    vLook.set(CAMERA_AIM_X, 0, THREE.MathUtils.clamp(frame.ballZ * 0.5, -CAMERA.pan, CAMERA.pan));
    if (cut) look.current.copy(vLook);
    else look.current.lerp(vLook, 1 - Math.exp(-dt * 1.5));
    const keys = scene.camera;
    if (keys) {
      // Vlastní kamera scény: mezi sousedními klíči jede, na klíč se střihem skočí.
      const n = keys.findLastIndex((k) => k.t <= t), a = keys[Math.max(n, 0)], b = keys[n + 1];
      const linear = b ? THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
      const s = b?.ease ? THREE.MathUtils.smoothstep(linear, 0, 1) : linear, to = linear > 0 ? b : a;
      camera.position.set(THREE.MathUtils.lerp(a.from.x, to.from.x, s), THREE.MathUtils.lerp(a.from.y, to.from.y, s), THREE.MathUtils.lerp(a.from.z, to.from.z, s));
      camera.lookAt(THREE.MathUtils.lerp(a.at.x, to.at.x, s), THREE.MathUtils.lerp(a.at.y, to.at.y, s), THREE.MathUtils.lerp(a.at.z, to.at.z, s));
    } else if (overview) {
      camera.position.set(OVERVIEW.x, OVERVIEW.y, 0);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(CAMERA.x, CAMERA.y, look.current.z * 0.3);
      camera.lookAt(look.current);
    }
    camera.fov = overview && !keys ? OVERVIEW.fov : CAMERA.fov;
    camera.updateProjectionMatrix();

    // Náhradní stín (tmavé kolečko) tam, kde skutečné stíny nejsou: je levný a funguje i na mobilu.
    const sh = shadows.current;
    if (sh) {
      frame.figures.forEach((f, i) => sh.setMatrixAt(i, f.visible ? mTmp.makeTranslation(states[i].x, PITCH_SURFACE_Y + 0.02, states[i].z) : HIDDEN));
      const ballShadow = Math.max(0.35, 1 - frame.ballY * 0.15);
      sh.setMatrixAt(count, mRoot.makeScale(ballShadow * 0.6, 1, ballShadow * 0.6).setPosition(frame.ballX, PITCH_SURFACE_Y + 0.021, frame.ballZ));
      sh.instanceMatrix.needsUpdate = true;
    }

    const b = ball.current;
    if (b) {
      if (!cut) {
        b.rotation.x += (frame.ballZ - b.position.z) / BALL_RADIUS;
        b.rotation.z -= (frame.ballX - b.position.x) / BALL_RADIUS;
      }
      b.position.set(frame.ballX, PITCH_SURFACE_Y + BALL_RADIUS + frame.ballY, frame.ballZ);
    }
  });

  return (
    <group>
      {PARTS.map((part, p) => (
        <instancedMesh key={part.id} ref={(m) => { meshes.current[p] = m; }} args={[part.geometry, undefined, count * perFigure(part)]} frustumCulled={false} castShadow={realShadows}>
          {part === TORSO ? <meshStandardMaterial roughness={0.8} map={shirts} onBeforeCompile={pickShirtTile} /> : <meshStandardMaterial roughness={0.8} />}
        </instancedMesh>
      ))}
      <group ref={car} visible={false}>
        <mesh position={[0, 0.6, 0]}><boxGeometry args={[1.7, 0.7, 4.2]} /><meshStandardMaterial color="#B91C1C" roughness={0.4} /></mesh>
        <mesh position={[0, 1.25, -0.2]}><boxGeometry args={[1.5, 0.6, 2.2]} /><meshStandardMaterial color="#1F2937" roughness={0.3} /></mesh>
      </group>
      {!realShadows && <instancedMesh ref={shadows} args={[shadowGeometry, undefined, count + 1]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial color="#000000" transparent opacity={overcast ? 0.17 : 0.28} depthWrite={false} />
      </instancedMesh>}
      {[0, 1].map((n) => (
        <mesh key={n} ref={(m) => { rings.current[n] = m; }} rotation-x={-Math.PI / 2} visible={false} renderOrder={2}>
          <ringGeometry args={[0.95, 1.4, 40]} />
          <meshBasicMaterial color="#FDE047" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={goalSign} geometry={GOAL_SIGN_GEOMETRY} position={[0, PITCH_SURFACE_Y + 0.015, 0]} visible={false}>
        <meshBasicMaterial map={goalSignMap} color={GOAL_GREEN} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={card} visible={false}>
        <planeGeometry args={[0.3, 0.42]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ball} castShadow={realShadows}>
        <primitive object={ballGeometry} attach="geometry" />
        <meshStandardMaterial vertexColors roughness={0.35} flatShading />
      </mesh>
    </group>
  );
}
