"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { PITCH_SURFACE_Y, type ViewpointDef } from "@/components/stadium/stadium-3d/constants";
import { HALF_W, sampleClip, sceneTime, type Clip, type Frame, type Replay, type ReplayKit, type ReplayPlayer, type Scene } from "./scenes";

/** Co má scéna právě hrát: krok 2D záznamu převedený na scénu a čas, kdy začal. */
export interface ReplayStep {
  scene: Scene;
  /** Útočná fáze šance (2D záznam ukazuje „ŠANCE!“), jinak zbytek scény. */
  attack: boolean;
  /** `performance.now()` ve chvíli, kdy krok začal. */
  startedAt: number;
  /** „Rychle“ přehrává scény dvakrát rychleji. */
  rate: number;
  /** Scéna se v tomhle čase od začátku kroku zastaví (pauza; při vývoji snímky obrazovky). */
  hold?: number;
}

const REFEREE_KIT: ReplayKit = { shirt: "#111827", shorts: "#111827", socks: "#111827" };
/** Brankář dostane první barvu, která se neplete s dresy obou týmů ani s druhým brankářem. */
const KEEPER_PALETTE = ["#FACC15", "#22C55E", "#EC4899", "#F97316", "#A855F7", "#E5E7EB"];
const CARD_COLORS = { yellow: "#FACC15", red: "#DC2626" };
/** Postavy jsou o kus větší než skutečnost, ať jsou z televizního pohledu čitelné i v malém okně. */
const FIGURE_SCALE = 1.25;
const BALL_RADIUS = 0.28;
/**
 * Televizní kamera stojí celý zápas na jednom místě nad hlavní (východní) tribunou, kde tribuna není, na lešení
 * na jejím místě. Záběr je široký a stálý; za míčem se kamera jen pomalu otáčí, nepřibližuje ani nepřejíždí.
 */
const GANTRY = { x: HALF_W + 12, y: 12 };
/** O kolik výš nad místem „z tribuny“ kamera visí, ať vidí hřiště z nadhledu. */
const CAMERA_LIFT = 1;
/** Jak daleko od půlky se kamera za míčem natočí (m podél hřiště). */
const CAMERA_PAN = 13;

function keeperShirts(home: ReplayKit, away: ReplayKit): { home: string; away: string } {
  const taken = [home.shirt, away.shirt, REFEREE_KIT.shirt].map((c) => new THREE.Color(c));
  const pick = () => {
    const color = KEEPER_PALETTE.map((c) => new THREE.Color(c)).find((c) => taken.every((t) => Math.hypot(c.r - t.r, c.g - t.g, c.b - t.b) > 0.45));
    if (!color) throw new Error("Pro brankáře nezbyla barva dresu");
    taken.push(color);
    return `#${color.getHexString()}`;
  };
  return { home: pick(), away: pick() };
}

const SKIN = "#E0B48C";
const BOOTS = "#1F2937";

interface PartDef {
  id: string;
  perFigure: 1 | 2;
  geometry: THREE.BufferGeometry;
  /** Kloub (kyčel, rameno), kolem kterého se díl kývá; střed dílu je o `offset` níž. */
  pivot: [number, number, number];
  offset: number;
  swing: "leg" | "arm" | null;
  /** Holá hlava vlasy nemá (null). */
  color: (kit: ReplayKit, shirt: string, player: ReplayPlayer) => string | null;
}

const skin = (_: ReplayKit, __: string, p: ReplayPlayer) => p.skinColor ?? SKIN;
const HIP: [number, number, number] = [0.1, 0.92, 0], SHOULDER: [number, number, number] = [0.29, 1.45, 0];
/** Postava z kvádrů: dres s krátkým rukávem, trenýrky, holá předloktí a stehna, štulpny a kopačky. */
const PARTS: PartDef[] = [
  { id: "shorts", perFigure: 2, geometry: new THREE.BoxGeometry(0.2, 0.26, 0.22), pivot: HIP, offset: -0.11, swing: "leg", color: (kit) => kit.shorts },
  { id: "thigh", perFigure: 2, geometry: new THREE.BoxGeometry(0.15, 0.22, 0.17), pivot: HIP, offset: -0.34, swing: "leg", color: skin },
  { id: "sock", perFigure: 2, geometry: new THREE.BoxGeometry(0.13, 0.36, 0.14), pivot: HIP, offset: -0.62, swing: "leg", color: (kit) => kit.socks },
  { id: "boot", perFigure: 2, geometry: new THREE.BoxGeometry(0.14, 0.12, 0.24).translate(0, 0, 0.04), pivot: HIP, offset: -0.86, swing: "leg", color: () => BOOTS },
  { id: "torso", perFigure: 1, geometry: new THREE.BoxGeometry(0.44, 0.56, 0.25), pivot: [0, 1.2, 0], offset: 0, swing: null, color: (_, shirt) => shirt },
  { id: "sleeve", perFigure: 2, geometry: new THREE.BoxGeometry(0.13, 0.24, 0.14), pivot: SHOULDER, offset: -0.11, swing: "arm", color: (_, shirt) => shirt },
  { id: "forearm", perFigure: 2, geometry: new THREE.BoxGeometry(0.1, 0.34, 0.11), pivot: SHOULDER, offset: -0.4, swing: "arm", color: skin },
  { id: "head", perFigure: 1, geometry: new THREE.SphereGeometry(0.13, 12, 10), pivot: [0, 1.63, 0], offset: 0, swing: null, color: skin },
  { id: "hair", perFigure: 1, geometry: new THREE.BoxGeometry(0.25, 0.09, 0.26), pivot: [0, 1.73, -0.01], offset: 0, swing: null, color: (_, __, p) => p.hairColor ?? null },
];

interface FigureState { x: number; z: number; yaw: number; phase: number; speed: number }

// Pracovní objekty, ať se v každém snímku nealokuje.
const mRoot = new THREE.Matrix4(), mPart = new THREE.Matrix4(), mTmp = new THREE.Matrix4();
const qRoot = new THREE.Quaternion(), qPose = new THREE.Quaternion();
const vPos = new THREE.Vector3(), vScale = new THREE.Vector3(), vLook = new THREE.Vector3();
const eTmp = new THREE.Euler(), cTmp = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Hráči, rozhodčí a míč ve scéně stadionu; kreslí to, co právě hraje `step`, a řídí televizní kameru. */
export function ReplayScene({ replay, kits, snow, step, tv }: {
  replay: Replay;
  kits: { home: ReplayKit; away: ReplayKit };
  /** Na sněhu se hraje s oranžovým míčem. */
  snow: boolean;
  step: { current: ReplayStep };
  tv: ViewpointDef;
}) {
  const count = replay.figures.length;
  const frame = useMemo<Frame>(() => ({ figures: replay.figures.map(() => ({ visible: false, x: 0, y: 0, z: 0, pose: null })), ballX: 0, ballY: 0, ballZ: 0, cuts: 0 }), [replay]);
  const states = useMemo<FigureState[]>(() => replay.figures.map(() => ({ x: 0, z: 0, yaw: 0, phase: 0, speed: 0 })), [replay]);
  const keepers = useMemo(() => keeperShirts(kits.home, kits.away), [kits]);
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
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  /** Co se kreslilo minule: podle toho se pozná střih (hráči pak neběží, stojí rovnou na místě). */
  const last = useRef<{ clip: Clip | null; t: number; cuts: number }>({ clip: null, t: 0, cuts: 0 });
  const look = useRef(new THREE.Vector3());

  const paint = (clip: Clip) => {
    PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      replay.figures.forEach((fig, i) => {
        const kit = fig.team === "referee" ? REFEREE_KIT : kits[fig.team];
        const shirt = fig.team !== "referee" && clip.keepers.has(i) ? keepers[fig.team] : kit.shirt;
        cTmp.set(part.color(kit, shirt, fig.player) ?? "#000000");
        for (let k = 0; k < part.perFigure; k++) mesh.setColorAt(i * part.perFigure + k, cTmp);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  };

  useFrame((_, delta) => {
    const { scene, attack, startedAt, rate, hold = Infinity } = step.current;
    const t = sceneTime(scene, attack, Math.min(hold, ((performance.now() - startedAt) / 1000) * rate));
    sampleClip(scene.clip, t, frame);
    const dt = Math.min(delta, 0.1);
    // Střih: jiný klip, střih uvnitř klipu, nebo skok v čase (krok 2D záznamu skončil dřív než scéna).
    const cut = last.current.clip !== scene.clip || last.current.cuts !== frame.cuts || t < last.current.t || t - last.current.t > 0.5;
    if (last.current.clip !== scene.clip) paint(scene.clip);
    last.current = { clip: scene.clip, t, cuts: frame.cuts };

    frame.figures.forEach((f, i) => {
      const s = states[i];
      if (!f.visible) return;
      const dx = f.x - s.x, dz = f.z - s.z;
      const stride = cut ? 0 : Math.hypot(dx, dz);
      s.x = f.x;
      s.z = f.z;
      s.speed = cut ? 0 : THREE.MathUtils.lerp(s.speed, stride / dt, Math.min(1, dt * 8));
      s.phase += stride * 1.7;
      // Čelem po směru běhu, stojící čelem k míči; padající brankář čelem do pole, ležící napříč obrazem.
      const dive = f.pose === "diveLeft" || f.pose === "diveRight";
      const moving = s.speed > 0.8;
      const faceX = dive ? 0 : moving ? dx : frame.ballX - s.x;
      const faceZ = dive ? -s.z : moving ? dz : frame.ballZ - s.z;
      if (f.pose === "down") s.yaw = 0;
      else if (Math.abs(faceX) + Math.abs(faceZ) > 0.01) {
        const diff = Math.atan2(faceX, faceZ) - s.yaw;
        s.yaw += Math.atan2(Math.sin(diff), Math.cos(diff)) * (cut ? 1 : Math.min(1, dt * 7));
      }
    });

    PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      frame.figures.forEach((f, i) => {
        const fig = replay.figures[i];
        if (!f.visible || (part.id === "hair" && !fig.player.hairColor)) {
          for (let k = 0; k < part.perFigure; k++) mesh.setMatrixAt(i * part.perFigure + k, HIDDEN);
          return;
        }
        const s = states[i];
        const scale = ((fig.player.height ?? 178) / 178) * FIGURE_SCALE;
        let lift = f.y, shift = 0;
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
        }
        mRoot.compose(vPos.set(s.x + Math.sin(s.yaw) * shift, PITCH_SURFACE_Y + lift, s.z + Math.cos(s.yaw) * shift), qRoot, vScale.setScalar(scale));
        const swingAmp = Math.min(0.9, s.speed * 0.13);
        for (let k = 0; k < part.perFigure; k++) {
          const mirror = k === 1 ? -1 : 1;
          let swing = 0;
          if (part.swing === "leg") swing = Math.sin(s.phase) * swingAmp * mirror;
          // Ruce: při oslavě a ve výskoku obě nahoře, zdvižená paže (rozhodčí, plácnutí) jen pravá.
          if (part.swing === "arm") {
            const raised = f.pose === "celebrate" || f.y > 0.05 || (f.pose === "armUp" && k === 0);
            swing = raised ? Math.PI - 0.25 + (f.pose === "celebrate" ? Math.sin(performance.now() / 110) * 0.15 : 0) : -Math.sin(s.phase) * swingAmp * 0.8 * mirror;
          }
          mPart.makeTranslation(part.pivot[0] * mirror, part.pivot[1], part.pivot[2]);
          if (swing !== 0) mPart.multiply(mTmp.makeRotationX(swing));
          if (part.offset !== 0) mPart.multiply(mTmp.makeTranslation(0, part.offset, 0));
          mesh.setMatrixAt(i * part.perFigure + k, mTmp.multiplyMatrices(mRoot, mPart));
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    });

    // Karta ve zdvižené ruce rozhodčího.
    const shown = scene.card && t >= scene.card.at ? scene.card : null;
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
      ring.scale.setScalar(1 + 0.12 * Math.sin(performance.now() / 140));
    });

    const east = tv.position[0] > HALF_W ? { x: tv.position[0], y: tv.position[1] + CAMERA_LIFT } : GANTRY;
    // Záběr na výšku pojme hřiště od vzdálené lajny po bližší. Kamera těsně nad lajnou (zastřešená tribuna)
    // se pod sebe nedívá, jinak by z televizního pohledu byl pohled shora; pruh u bližší lajny pak v záběru není.
    const near = Math.min(Math.atan2(east.y, east.x - HALF_W), THREE.MathUtils.degToRad(50)), far = Math.atan2(east.y, east.x + HALF_W);
    const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(near - far) + 8, 30, 50);
    vLook.set(east.x - east.y / Math.tan((near + far) / 2), 0, THREE.MathUtils.clamp(frame.ballZ * 0.5, -CAMERA_PAN, CAMERA_PAN));
    if (cut) look.current.copy(vLook);
    else look.current.lerp(vLook, 1 - Math.exp(-dt * 1.5));
    camera.position.set(east.x, east.y, 0);
    camera.lookAt(look.current);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Stín jako tmavé kolečko je levný a funguje i na mobilu.
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
        <instancedMesh key={part.id} ref={(m) => { meshes.current[p] = m; }} args={[part.geometry, undefined, count * part.perFigure]} frustumCulled={false}>
          <meshStandardMaterial roughness={0.8} />
        </instancedMesh>
      ))}
      <instancedMesh ref={shadows} args={[shadowGeometry, undefined, count + 1]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
      {[0, 1].map((n) => (
        <mesh key={n} ref={(m) => { rings.current[n] = m; }} rotation-x={-Math.PI / 2} visible={false} renderOrder={2}>
          <ringGeometry args={[0.75, 1.05, 32]} />
          <meshBasicMaterial color="#FDE047" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={card} visible={false}>
        <planeGeometry args={[0.3, 0.42]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ball}>
        <primitive object={ballGeometry} attach="geometry" />
        <meshStandardMaterial vertexColors roughness={0.35} flatShading />
      </mesh>
    </group>
  );
}
