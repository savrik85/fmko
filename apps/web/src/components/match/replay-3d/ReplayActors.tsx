"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { PITCH_SURFACE_Y } from "@/components/stadium/stadium-3d/constants";
import { HALF_L, type ReplayKit, type ReplayPlan, type ReplayPlayer, type Side } from "./timeline";

/** Sdílený čas záznamu: posouvá ho scéna, čte a ovládá ho lišta pod ní. */
export interface ReplayClock { t: number; speed: number; playing: boolean }

/** Brankář dostane první barvu, která se neplete s dresy obou týmů ani s druhým brankářem. */
const KEEPER_PALETTE = ["#FACC15", "#22C55E", "#EC4899", "#111827", "#F97316", "#A855F7", "#E5E7EB"];

function keeperShirts(homeKit: ReplayKit, awayKit: ReplayKit): Record<Side, string> {
  const taken = [homeKit.shirt, awayKit.shirt].map((c) => new THREE.Color(c));
  const pick = () => {
    const color = KEEPER_PALETTE.map((c) => new THREE.Color(c)).find((c) =>
      taken.every((t) => Math.hypot(c.r - t.r, c.g - t.g, c.b - t.b) > 0.45)) ?? new THREE.Color(KEEPER_PALETTE[0]);
    taken.push(color);
    return `#${color.getHexString()}`;
  };
  return { home: pick(), away: pick() };
}

/** Postavy jsou o kus větší než skutečnost, ať jsou z televizního pohledu čitelné i na mobilu. */
const FIGURE_SCALE = 1.2;
const BALL_RADIUS = 0.26;
const HIGHLIGHT_SECONDS = 4;
/** Televizní kamera jede za míčem (u zranění, karty a střídání za hráčem z titulku): na šířku z hlavní tribuny, na výšku zpoza branky. */
const CAMERA = {
  wide: { offset: new THREE.Vector3(19, 28, 0), fov: 42, follow: 0.55 },
  tall: { offset: new THREE.Vector3(0, 34, 31), fov: 54, follow: 0.35 },
};

interface PartDef {
  id: string;
  perFigure: 1 | 2;
  geometry: THREE.BufferGeometry;
  /** Kloub (kyčel, rameno), kolem kterého se díl kývá; střed dílu je o `offset` níž. */
  pivot: [number, number, number];
  offset: number;
  swing: "leg" | "arm" | null;
  /** `shirt` je u brankáře jeho dres; holá hlava vlasy nemá (null). */
  color: (kit: ReplayKit, shirt: string, player: ReplayPlayer) => string | null;
}

const PARTS: PartDef[] = [
  { id: "thigh", perFigure: 2, geometry: new THREE.BoxGeometry(0.17, 0.42, 0.19), pivot: [0.1, 0.92, 0], offset: -0.21, swing: "leg", color: (kit) => kit.shorts },
  { id: "shin", perFigure: 2, geometry: new THREE.BoxGeometry(0.13, 0.5, 0.14), pivot: [0.1, 0.92, 0], offset: -0.67, swing: "leg", color: (kit) => kit.socks },
  { id: "torso", perFigure: 1, geometry: new THREE.BoxGeometry(0.44, 0.56, 0.25), pivot: [0, 1.2, 0], offset: 0, swing: null, color: (_, shirt) => shirt },
  { id: "arm", perFigure: 2, geometry: new THREE.BoxGeometry(0.11, 0.56, 0.12), pivot: [0.29, 1.45, 0], offset: -0.27, swing: "arm", color: (_, shirt) => shirt },
  { id: "head", perFigure: 1, geometry: new THREE.SphereGeometry(0.13, 12, 10), pivot: [0, 1.63, 0], offset: 0, swing: null, color: (_, __, p) => p.skinColor ?? "#E0B48C" },
  { id: "hair", perFigure: 1, geometry: new THREE.BoxGeometry(0.25, 0.09, 0.26), pivot: [0, 1.73, -0.01], offset: 0, swing: null, color: (_, __, p) => p.hairColor ?? null },
];

interface FigureState { x: number; z: number; yaw: number; phase: number; speed: number; keeper: boolean }

// Pracovní objekty, ať se v každém snímku nealokuje.
const mRoot = new THREE.Matrix4(), mPart = new THREE.Matrix4(), mTmp = new THREE.Matrix4();
const qRoot = new THREE.Quaternion(), qPose = new THREE.Quaternion();
const vPos = new THREE.Vector3(), vScale = new THREE.Vector3(), vTmp = new THREE.Vector3();
const eTmp = new THREE.Euler(), cTmp = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export function ReplayActors({ plan, clock }: { plan: ReplayPlan; clock: ReplayClock }) {
  const frame = useMemo(() => plan.createFrame(), [plan]);
  const states = useMemo<FigureState[]>(() => plan.figures.map(() => ({ x: 0, z: 0, yaw: 0, phase: 0, speed: 0, keeper: false })), [plan]);
  const keepers = useMemo(() => keeperShirts(plan.home.kit, plan.away.kit), [plan]);
  const shadowGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), []);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const shadows = useRef<THREE.InstancedMesh>(null);
  const ball = useRef<THREE.Mesh>(null);
  const count = plan.figures.length;
  // Míč s tmavými ploškami je vidět i na sněhu a z dálky se točí.
  const ballGeometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(BALL_RADIUS, 1);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let f = 0; f < colors.length / 9; f++) colors.fill(f % 4 ? 0.97 : 0.1, f * 9, f * 9 + 9);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const tall = size.width / Math.max(1, size.height) < 0.8;
  const look = useRef<THREE.Vector3 | null>(null);
  // Zvýraznění hráčů z titulku (zraněný, střelec, střídající…): kroužek pod nohama a jmenovka nad hlavou.
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const tags = useRef<HTMLDivElement[]>([]);
  const container = useThree((s) => s.gl.domElement.parentElement);
  useEffect(() => {
    if (!container) return;
    tags.current = [0, 1].map(() => {
      const tag = document.createElement("div");
      tag.className = "absolute left-0 top-0 z-20 pointer-events-none px-2 py-0.5 rounded-md bg-black/80 text-white text-[11px] sm:text-xs font-heading font-bold whitespace-nowrap border border-yellow-300/80";
      tag.style.display = "none";
      container.appendChild(tag);
      return tag;
    });
    return () => tags.current.forEach((tag) => tag.remove());
  }, [container]);

  // Brankář (i náhradní v průběhu zápasu) má vlastní dres.
  const paint = (i: number, keeper: boolean) => {
    const fig = plan.figures[i];
    const kit = plan[fig.side].kit;
    states[i].keeper = keeper;
    PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      cTmp.set(part.color(kit, keeper ? keepers[fig.side] : kit.shirt, fig.player) ?? "#000000");
      for (let k = 0; k < part.perFigure; k++) mesh.setColorAt(i * part.perFigure + k, cTmp);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  };
  useLayoutEffect(() => {
    plan.sample(0, frame);
    frame.figures.forEach((f, i) => paint(i, f.keeper));
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1) * (clock.playing ? clock.speed : 0);
    if (clock.playing) clock.t = Math.min(plan.duration, clock.t + dt);
    plan.sample(clock.t, frame);
    // Hráči stojí přesně tam, kde je simulace; z posunu se počítá jen krok nohou a natočení.
    frame.figures.forEach((f, i) => {
      const s = states[i];
      if (!f.visible) return;
      if (f.keeper !== s.keeper) paint(i, f.keeper);
      const dx = f.x - s.x;
      const dz = f.z - s.z;
      // Skok v čase (konec, znovu od začátku) není běh.
      const step = Math.hypot(dx, dz) < 3 ? Math.hypot(dx, dz) : 0;
      s.x = f.x;
      s.z = f.z;
      if (dt > 0) s.speed = THREE.MathUtils.lerp(s.speed, step / dt, Math.min(1, dt * 8));
      s.phase += step * 1.7;
      // Čelem po směru běhu, stojící čelem k míči; padající brankář čelem do pole (padá podél brány), ležící se neotáčí.
      const dive = f.pose === "diveLeft" || f.pose === "diveRight";
      const toBall = s.speed <= 0.8;
      const faceX = dive ? 0 : toBall ? frame.ballX - s.x : dx;
      const faceZ = dive ? -s.z : toBall ? frame.ballZ - s.z : dz;
      if (f.pose !== "down" && Math.abs(faceX) + Math.abs(faceZ) > 0.01) {
        const diff = Math.atan2(faceX, faceZ) - s.yaw;
        s.yaw += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, dt * 7);
      }
    });

    PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      frame.figures.forEach((f, i) => {
        const fig = plan.figures[i];
        if (!f.visible || (part.id === "hair" && !fig.player.hairColor)) {
          for (let k = 0; k < part.perFigure; k++) mesh.setMatrixAt(i * part.perFigure + k, HIDDEN);
          return;
        }
        const s = states[i];
        const scale = ((fig.player.height ?? 178) / 178) * FIGURE_SCALE;
        let lift = 0;
        let shift = 0;
        qRoot.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
        if (f.pose === "down") {
          // Ležící tělo má střed na místě hráče (simulace s ním tak počítá rozestupy).
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
          if (part.swing === "arm") swing = f.pose === "celebrate" ? Math.PI - 0.25 + Math.sin(s.phase * 3) * 0.15 : -Math.sin(s.phase) * swingAmp * 0.8 * mirror;
          mPart.makeTranslation(part.pivot[0] * mirror, part.pivot[1], part.pivot[2]);
          if (swing !== 0) mPart.multiply(mTmp.makeRotationX(swing));
          if (part.offset !== 0) mPart.multiply(mTmp.makeTranslation(0, part.offset, 0));
          mesh.setMatrixAt(i * part.perFigure + k, mTmp.multiplyMatrices(mRoot, mPart));
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    });

    const caption = plan.captionAt(clock.t);
    const focus = caption && clock.t - caption.t < HIGHLIGHT_SECONDS ? caption.figures.filter((i) => frame.figures[i].visible) : [];
    rings.current.forEach((ring, n) => {
      const i = focus[n];
      if (!ring) return;
      ring.visible = i !== undefined;
      if (i === undefined) return;
      ring.position.set(states[i].x, PITCH_SURFACE_Y + 0.03, states[i].z);
      ring.scale.setScalar(1 + 0.12 * Math.sin(clock.t * 7));
    });

    // Kamera plynule za míčem, po skoku v čase hned na místě; u zranění, karty a střídání jen na hráče, jinak mezi míč a hráče z titulku.
    const cam = tall ? CAMERA.tall : CAMERA.wide;
    // Kamera míří doprostřed mezi míč a hráče z titulku (ne přímo za hráčem, jinak by se zdálo, že stojí).
    const fx = (frame.ballX + focus.reduce((sum, i) => sum + states[i].x, 0)) / (focus.length + 1);
    const fz = (frame.ballZ + focus.reduce((sum, i) => sum + states[i].z, 0)) / (focus.length + 1);
    const wanted = vTmp.set(fx * (focus.length ? 0.9 : cam.follow), 0, THREE.MathUtils.clamp(fz, -HALF_L + (tall ? 16 : 15), HALF_L - (tall ? 11 : 15)));
    if (!look.current || look.current.distanceTo(wanted) > 30) look.current = wanted.clone();
    else look.current.lerp(wanted, 1 - Math.exp(-Math.min(delta, 0.1) * 2.2));
    camera.position.copy(look.current).add(cam.offset);
    camera.lookAt(look.current);
    if (camera.fov !== cam.fov) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    // Jmenovky nad hlavou hráčů z titulku (až po pohybu kamery, ať sedí).
    camera.updateMatrixWorld();
    tags.current.forEach((tag, n) => {
      const i = focus[n];
      const name = i === undefined ? "" : (caption?.banner === "sub" ? ["↑ ", "↓ "][n] : "") + plan.figures[i].player.name;
      if (tag.textContent !== name) tag.textContent = name;
      tag.style.display = i === undefined ? "none" : "block";
      if (i === undefined) return;
      vTmp.set(states[i].x, PITCH_SURFACE_Y + 2.7, states[i].z).project(camera);
      // Hráč mimo záběr jmenovku nemá; u kraje se posune dovnitř, ať zůstane nad titulkem a ovládáním.
      if (Math.abs(vTmp.x) > 1 || Math.abs(vTmp.y) > 1) tag.style.display = "none";
      const x = THREE.MathUtils.clamp(((vTmp.x + 1) / 2) * size.width, 70, size.width - 70);
      const y = THREE.MathUtils.clamp(((1 - vTmp.y) / 2) * size.height, 150, size.height - 140);
      tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });

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
      const moved = Math.hypot(frame.ballX - b.position.x, frame.ballZ - b.position.z);
      if (moved > 0.0001 && moved < 5) {
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
          <ringGeometry args={[0.7, 0.95, 32]} />
          <meshBasicMaterial color="#FDE047" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={ball}>
        <primitive object={ballGeometry} attach="geometry" />
        <meshStandardMaterial vertexColors roughness={0.35} flatShading />
      </mesh>
    </group>
  );
}
