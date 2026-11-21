"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PITCH_SURFACE_Y } from "@/components/stadium/stadium-3d/constants";
import { RUN_SPEED, type ReplayKit, type ReplayPlan, type ReplayPlayer, type Side } from "./timeline";

/** Sdílený čas záznamu: posouvá ho scéna, čte a ovládá ho lišta pod ní. */
export interface ReplayClock {
  t: number;
  speed: number;
  playing: boolean;
  /** Skok v čase (konec zápasu): hráči se postaví rovnou na místo. */
  snap: boolean;
}

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

const DEFAULT_SKIN = "#E0B48C";
/** Postavy jsou o kus větší než skutečnost, ať jsou z televizního pohledu čitelné i na mobilu. */
const FIGURE_SCALE = 1.2;
const BALL_RADIUS = 0.26;
/** Na naplánované dráze dohání hráč cíl rychle, ať sedí s míčem. */
const SCRIPTED_CATCH_UP = 30;

interface PartDef {
  id: string;
  /** Kolik kusů má jedna postava (nohy a ruce dva). */
  perFigure: 1 | 2;
  geometry: THREE.BufferGeometry;
  /** Kloub (kyčel, rameno), kolem kterého se díl kývá; střed dílu je o `offset` níž. */
  pivot: [number, number, number];
  offset: number;
  swing: "leg" | "arm" | null;
  /** Barva dílu podle dresu (u brankáře jeho dres), pleti a vlasů; holá hlava vlasy nemá (null). */
  color: (kit: ReplayKit, shirt: string, player: ReplayPlayer) => string | null;
}

const PARTS: PartDef[] = [
  { id: "thigh", perFigure: 2, geometry: new THREE.BoxGeometry(0.17, 0.42, 0.19), pivot: [0.1, 0.92, 0], offset: -0.21, swing: "leg", color: (kit) => kit.shorts },
  { id: "shin", perFigure: 2, geometry: new THREE.BoxGeometry(0.13, 0.5, 0.14), pivot: [0.1, 0.92, 0], offset: -0.67, swing: "leg", color: (kit) => kit.socks },
  { id: "torso", perFigure: 1, geometry: new THREE.BoxGeometry(0.44, 0.56, 0.25), pivot: [0, 1.2, 0], offset: 0, swing: null, color: (_, shirt) => shirt },
  { id: "arm", perFigure: 2, geometry: new THREE.BoxGeometry(0.11, 0.56, 0.12), pivot: [0.29, 1.45, 0], offset: -0.27, swing: "arm", color: (_, shirt) => shirt },
  { id: "head", perFigure: 1, geometry: new THREE.SphereGeometry(0.13, 12, 10), pivot: [0, 1.63, 0], offset: 0, swing: null, color: (_, __, p) => p.skinColor ?? DEFAULT_SKIN },
  { id: "hair", perFigure: 1, geometry: new THREE.BoxGeometry(0.25, 0.09, 0.26), pivot: [0, 1.73, -0.01], offset: 0, swing: null, color: (_, __, p) => p.hairColor ?? null },
];

interface FigureState {
  x: number;
  z: number;
  yaw: number;
  phase: number;
  speed: number;
  /** Byl vidět v minulém snímku; nově objevený hráč (střídající) se postaví rovnou na místo. */
  shown: boolean;
}

// Pracovní objekty pro skládání matic.
const mRoot = new THREE.Matrix4();
const mPart = new THREE.Matrix4();
const mTmp = new THREE.Matrix4();
const qRoot = new THREE.Quaternion();
const qPose = new THREE.Quaternion();
const vPos = new THREE.Vector3();
const vScale = new THREE.Vector3();
const eTmp = new THREE.Euler();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export function ReplayActors({ plan, clock }: { plan: ReplayPlan; clock: ReplayClock }) {
  const frame = useMemo(() => plan.createFrame(), [plan]);
  const states = useMemo<FigureState[]>(() => plan.figures.map(() => ({ x: 0, z: 0, yaw: 0, phase: 0, speed: 0, shown: false })), [plan]);
  const shadowGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), []);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const shadows = useRef<THREE.InstancedMesh>(null);
  const ball = useRef<THREE.Mesh>(null);
  const count = plan.figures.length;

  // Barvy dresů, pleti a vlasů se nastaví jednou; holá hlava vlasy nemá.
  useLayoutEffect(() => {
    const color = new THREE.Color();
    const keepers = keeperShirts(plan.home.kit, plan.away.kit);
    PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      plan.figures.forEach((fig, i) => {
        const kit = plan[fig.side].kit;
        color.set(part.color(kit, fig.role === "GK" ? keepers[fig.side] : kit.shirt, fig.player) ?? "#000000");
        for (let k = 0; k < part.perFigure; k++) mesh.setColorAt(i * part.perFigure + k, color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [plan]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1) * (clock.playing ? clock.speed : 0);
    if (clock.playing) clock.t = Math.min(plan.duration, clock.t + dt);
    plan.sample(clock.t, frame);
    const snap = frame.snap || clock.snap;
    clock.snap = false;

    frame.figures.forEach((f, i) => {
      const s = states[i];
      const wasShown = s.shown;
      s.shown = f.visible;
      if (!f.visible) return;
      if (snap || !wasShown) {
        s.x = f.x;
        s.z = f.z;
        s.speed = 0;
        return;
      }
      // Hráč se k cíli blíží jen omezenou rychlostí, takže přechody nikdy neskáčou.
      const dx = f.x - s.x;
      const dz = f.z - s.z;
      const d = Math.hypot(dx, dz);
      const maxStep = (f.exact ? SCRIPTED_CATCH_UP : RUN_SPEED) * dt;
      const step = Math.min(d, maxStep);
      if (d > 0.0001) {
        s.x += (dx / d) * step;
        s.z += (dz / d) * step;
      }
      const speed = dt > 0 ? step / dt : 0;
      s.speed = THREE.MathUtils.lerp(s.speed, speed, Math.min(1, dt * 8));
      s.phase += step * 1.7;
      // Čelem po směru běhu, stojící hráč čelem k míči.
      const faceX = s.speed > 0.8 ? dx : frame.ballX - s.x;
      const faceZ = s.speed > 0.8 ? dz : frame.ballZ - s.z;
      if (Math.abs(faceX) + Math.abs(faceZ) > 0.01) {
        const targetYaw = Math.atan2(faceX, faceZ);
        let diff = targetYaw - s.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        s.yaw += diff * Math.min(1, dt * 7);
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
        // Kořen postavy: poloha, natočení a póza (ležící, padající brankář).
        let lift = 0;
        qRoot.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
        if (f.pose === "down") {
          qPose.setFromEuler(eTmp.set(-Math.PI / 2 + 0.1, 0, 0));
          qRoot.multiply(qPose);
          lift = 0.14;
        } else if (f.pose === "diveLeft" || f.pose === "diveRight") {
          // Pád do strany ve světových souřadnicích: lokální osa x míří k cos(yaw) světové x.
          const toward = f.pose === "diveRight" ? 1 : -1;
          const roll = -1.25 * toward * (Math.cos(s.yaw) >= 0 ? 1 : -1);
          qPose.setFromEuler(eTmp.set(0, 0, roll));
          qRoot.multiply(qPose);
          lift = 0.45;
        }
        vPos.set(s.x, PITCH_SURFACE_Y + lift, s.z);
        vScale.set(scale, scale, scale);
        mRoot.compose(vPos, qRoot, vScale);

        const swingAmp = Math.min(0.9, s.speed * 0.13);
        for (let k = 0; k < part.perFigure; k++) {
          const mirror = part.perFigure === 2 && k === 1 ? -1 : 1;
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

    // Stíny: tmavé kolečko pod každým hráčem a pod míčem (levné, funguje i na mobilu).
    const sh = shadows.current;
    if (sh) {
      frame.figures.forEach((f, i) => {
        if (!f.visible) return sh.setMatrixAt(i, HIDDEN);
        const s = states[i];
        sh.setMatrixAt(i, mTmp.makeTranslation(s.x, PITCH_SURFACE_Y + 0.02, s.z));
      });
      const ballShadow = Math.max(0.35, 1 - frame.ballY * 0.15);
      mRoot.makeScale(ballShadow * 0.6, 1, ballShadow * 0.6).setPosition(frame.ballX, PITCH_SURFACE_Y + 0.021, frame.ballZ);
      sh.setMatrixAt(count, mRoot);
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
        <instancedMesh
          key={part.id}
          ref={(m) => { meshes.current[p] = m; }}
          args={[part.geometry, undefined, count * part.perFigure]}
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.8} />
        </instancedMesh>
      ))}
      <instancedMesh ref={shadows} args={[shadowGeometry, undefined, count + 1]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
      <mesh ref={ball}>
        <icosahedronGeometry args={[BALL_RADIUS, 2]} />
        <meshStandardMaterial color="#F9FAFB" roughness={0.35} flatShading />
      </mesh>
    </group>
  );
}
