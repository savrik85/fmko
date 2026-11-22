"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { PITCH_SURFACE_Y } from "@/components/stadium/stadium-3d/constants";
import { HALF_W, sampleClip, sceneTime, type Clip, type Figure, type Frame, type Replay, type ReplayKit, type Scene } from "./scenes";

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
 * Hlavní kamera jako při televizním přenosu: stojí celý zápas za postranní čárou ve výšce horních řad tribuny
 * a vidí hřiště na hloubku celé, i bližší lajnu. Za míčem se jen pomalu otáčí (nejvýš o `pan` metrů od půlky).
 * Tribuna, ve které kamera stojí, se nekreslí (viz ořez scény níž).
 */
const CAMERA = { x: HALF_W + 26, y: 13, fov: 26, pan: 9 };
/** Kam kamera míří napříč hřištěm: tak, aby bližší postranní čára ležela u spodního okraje záběru. */
const CAMERA_AIM_X = -4.6;
/**
 * Opakovaný záběr gólu přijde až po oslavě, jako v televizi: zpomalené zakončení z nízké kamery u protější
 * lajny, občas z kamery rozhodčího. Skončí s krokem gólu ve 2D záznamu (6 s), pak jde další akce.
 */
const REPLAY = { after: 3.4, seconds: 2.6 };
/** Kamera rozhodčího u zranění: kdy ve scéně začne a skončí (s). */
const REF_LIVE = { from: 1.4, to: 3.8 };
/** Hlavní kamera nekreslí nic za bližší postranní čárou (stojí tam, kde má stadion hlavní tribunu); ostatní kamery kreslí vše. */
const MAIN_CLIP = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF_W + 1.2)];
const NO_CLIP: THREE.Plane[] = [];
const CAM_TEXT = { main: "", replay: "↺ OPAKOVANÝ ZÁBĚR", ref: "● REF CAM", refReplay: "● REF CAM · ↺ OPAKOVANÝ ZÁBĚR" };

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
type Joint = "hip" | "knee" | "shoulder" | "elbow";

interface PartDef {
  id: string;
  geometry: THREE.BufferGeometry;
  /** Kloub, na kterém díl visí (díl je pak na každé straně těla jeden), nebo místo v těle. */
  on: Joint | [number, number, number];
  /** O kolik je střed dílu pod kloubem. */
  drop: number;
  /** Holá hlava vlasy nemá (null). */
  color: (kit: ReplayKit, shirt: string, fig: Figure) => string | null;
}

/** Kde jsou klouby v těle (m): kyčel a rameno od středu, koleno a loket pod nimi. */
const BODY = { hip: [0.1, 0.92], knee: 0.44, shoulder: [0.29, 1.45], elbow: 0.26 } as const;
const skin = (_: ReplayKit, __: string, fig: Figure) => fig.player.skinColor ?? SKIN;
/** Postava z kvádrů s koleny a lokty: dres s krátkým rukávem, holá předloktí, trenýrky, vysoko vytažené štulpny, kopačky. */
const PARTS: PartDef[] = [
  { id: "shorts", geometry: new THREE.BoxGeometry(0.19, 0.46, 0.21), on: "hip", drop: 0.21, color: (kit) => kit.shorts },
  { id: "sock", geometry: new THREE.BoxGeometry(0.13, 0.4, 0.14), on: "knee", drop: 0.18, color: (kit) => kit.socks },
  // Rozhodčí má kopačky černé, hráči šedé.
  { id: "boot", geometry: new THREE.BoxGeometry(0.14, 0.11, 0.25).translate(0, 0, 0.05), on: "knee", drop: 0.43, color: (_, __, fig) => (fig.team === "referee" ? "#111111" : "#9CA3AF") },
  { id: "torso", geometry: new THREE.BoxGeometry(0.44, 0.56, 0.25), on: [0, 1.2, 0], drop: 0, color: (_, shirt) => shirt },
  { id: "sleeve", geometry: new THREE.BoxGeometry(0.13, 0.27, 0.14), on: "shoulder", drop: 0.12, color: (_, shirt) => shirt },
  { id: "forearm", geometry: new THREE.BoxGeometry(0.1, 0.3, 0.11), on: "elbow", drop: 0.14, color: skin },
  { id: "head", geometry: new THREE.SphereGeometry(0.13, 12, 10), on: [0, 1.63, 0], drop: 0, color: skin },
  { id: "hair", geometry: new THREE.BoxGeometry(0.25, 0.09, 0.26), on: [0, 1.73, -0.01], drop: 0, color: (_, __, fig) => fig.player.hairColor ?? null },
];
const perFigure = (part: PartDef) => (typeof part.on === "string" ? 2 : 1);

interface FigureState { x: number; z: number; yaw: number; phase: number; speed: number }

// Pracovní objekty, ať se v každém snímku nealokuje.
const mRoot = new THREE.Matrix4(), mTmp = new THREE.Matrix4(), mOut = new THREE.Matrix4();
const joints: Record<Joint, THREE.Matrix4[]> = { hip: [new THREE.Matrix4(), new THREE.Matrix4()], knee: [new THREE.Matrix4(), new THREE.Matrix4()], shoulder: [new THREE.Matrix4(), new THREE.Matrix4()], elbow: [new THREE.Matrix4(), new THREE.Matrix4()] };
const qRoot = new THREE.Quaternion(), qPose = new THREE.Quaternion();
const vPos = new THREE.Vector3(), vScale = new THREE.Vector3(), vLook = new THREE.Vector3();
const eTmp = new THREE.Euler(), cTmp = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Hráči, rozhodčí a míč ve scéně stadionu; kreslí to, co právě hraje `step`, a řídí kameru. */
export function ReplayScene({ replay, kits, snow, step, camBadge }: {
  replay: Replay;
  kits: { home: ReplayKit; away: ReplayKit };
  /** Na sněhu se hraje s oranžovým míčem. */
  snow: boolean;
  step: { current: ReplayStep };
  /** Rámeček s nápisem kamery (opakovaný záběr, REF CAM); scéna ho ukazuje, jen když nekreslí hlavní kamera. */
  camBadge: RefObject<HTMLDivElement | null>;
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
  const gl = useThree((s) => s.gl);
  /** Co se kreslilo minule: podle toho se pozná střih (hráči pak neběží, stojí rovnou na místě). */
  const last = useRef<{ clip: Clip | null; t: number; cuts: number; view: string }>({ clip: null, t: 0, cuts: 0, view: "main" });
  const look = useRef(new THREE.Vector3());

  useEffect(() => () => { gl.clippingPlanes = NO_CLIP; }, [gl]);

  const paint = (clip: Clip) => {
    PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      replay.figures.forEach((fig, i) => {
        const kit = fig.team === "referee" ? REFEREE_KIT : kits[fig.team];
        const shirt = fig.team !== "referee" && clip.keepers.has(i) ? keepers[fig.team] : kit.shirt;
        cTmp.set(part.color(kit, shirt, fig) ?? "#000000");
        for (let k = 0; k < perFigure(part); k++) mesh.setColorAt(i * perFigure(part) + k, cTmp);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  };

  useFrame((_, delta) => {
    const { scene, attack, startedAt, rate, hold = Infinity } = step.current;
    const elapsed = Math.min(hold, ((performance.now() - startedAt) / 1000) * rate);
    // Gól: po chvíli oslavy se zpomaleně zopakuje zakončení z jiné kamery, pak oslava pokračuje.
    const again = !attack && scene.replay ? scene.replay : null;
    const replaying = again !== null && elapsed >= REPLAY.after && elapsed < REPLAY.after + REPLAY.seconds;
    const t = replaying && again ? THREE.MathUtils.lerp(again.from, again.to, (elapsed - REPLAY.after) / REPLAY.seconds)
      : sceneTime(scene, attack, again && elapsed >= REPLAY.after ? elapsed - REPLAY.seconds : elapsed);
    sampleClip(scene.clip, t, frame);
    // Kamera rozhodčího: u některých gólů místo opakovaného záběru z lajny, u některých zranění živě uprostřed scény.
    const refLive = !attack && scene.refCam && !again && elapsed > REF_LIVE.from && elapsed < REF_LIVE.to;
    const view = replaying ? (scene.refCam ? "refReplay" : "replay") : refLive ? "ref" : "main";
    const fromReferee = view === "ref" || view === "refReplay";
    const badge = camBadge.current;
    if (badge && badge.dataset.cam !== view) {
      badge.dataset.cam = view;
      badge.style.display = view === "main" ? "none" : "";
      badge.firstElementChild!.textContent = CAM_TEXT[view];
    }
    const dt = Math.min(delta, 0.1);
    // Střih: jiný klip, střih uvnitř klipu, skok v čase, přepnutí kamery.
    const cut = last.current.clip !== scene.clip || last.current.cuts !== frame.cuts || last.current.view !== view || t < last.current.t || t - last.current.t > 0.5;
    if (last.current.clip !== scene.clip) paint(scene.clip);
    last.current = { clip: scene.clip, t, cuts: frame.cuts, view };
    const now = performance.now() / 1000;

    frame.figures.forEach((f, i) => {
      const s = states[i];
      if (!f.visible) return;
      const dx = f.x - s.x, dz = f.z - s.z;
      const stride = cut ? 0 : Math.hypot(dx, dz);
      s.x = f.x;
      s.z = f.z;
      s.speed = cut ? 0 : THREE.MathUtils.lerp(s.speed, stride / dt, Math.min(1, dt * 8));
      s.phase += stride * 1.9;
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

    frame.figures.forEach((f, i) => {
      const fig = replay.figures[i];
      const s = states[i];
      // Z vlastní kamery rozhodčí sám vidět není.
      const visible = f.visible && !(fromReferee && i === replay.referee);
      if (visible) {
        const scale = ((fig.player.height ?? 178) / 178) * FIGURE_SCALE;
        // Jak moc hráč běží (0 stojí, 1 sprint): podle toho se předklání, zvedá kolena a pracuje rukama.
        const run = Math.min(1, s.speed / 6);
        const slide = f.pose === "slide";
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
          qRoot.multiply(qPose.setFromEuler(eTmp.set(slide ? -0.35 : 0.24 * run, 0, 0)));
          if (slide) lift = -0.4 * scale;
        }
        mRoot.compose(vPos.set(s.x + Math.sin(s.yaw) * shift, PITCH_SURFACE_Y + lift, s.z + Math.cos(s.yaw) * shift), qRoot, vScale.setScalar(scale));
        const armsUp = f.pose === "celebrate" || slide || f.y > 0.05 || f.pose === "diveLeft" || f.pose === "diveRight";
        for (let k = 0; k < 2; k++) {
          const side = k === 0 ? 1 : -1;
          const swing = Math.sin(s.phase) * side;
          // Noha: stehno kmitá dopředu a dozadu, koleno se ohýbá, když jde noha vzad (při skluzu jsou kolena ohnutá pořád).
          const thigh = slide ? 0.3 : -swing * 0.95 * run;
          const knee = slide ? 1.5 : run * (0.25 + 0.9 * Math.max(0, Math.cos(s.phase) * side));
          joints.hip[k].makeTranslation(BODY.hip[0] * side, BODY.hip[1], 0).multiply(mTmp.makeRotationX(thigh));
          joints.knee[k].copy(joints.hip[k]).multiply(mTmp.makeTranslation(0, -BODY.knee, 0)).multiply(mTmp.makeRotationX(knee));
          // Ruka: v běhu proti noze s ohnutým loktem; nahoře při oslavě, výskoku a skoku brankáře, rozhodčí zvedá jen pravou.
          const raised = armsUp || (f.pose === "armUp" && k === 0);
          const arm = raised ? Math.PI - 0.25 + (f.pose === "celebrate" ? Math.sin(now * 9 + i) * 0.15 : 0) : swing * 0.8 * run + Math.sin(now * 1.3 + i * 2.1) * 0.05;
          const elbow = raised ? -0.15 : -(0.25 + 1.1 * run);
          joints.shoulder[k].makeTranslation(BODY.shoulder[0] * side, BODY.shoulder[1], 0).multiply(mTmp.makeRotationX(arm));
          joints.elbow[k].copy(joints.shoulder[k]).multiply(mTmp.makeTranslation(0, -BODY.elbow, 0)).multiply(mTmp.makeRotationX(elbow));
        }
      }
      PARTS.forEach((part, p) => {
        const mesh = meshes.current[p];
        if (!mesh) return;
        const hidden = !visible || (part.id === "hair" && !fig.player.hairColor);
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
      ring.scale.setScalar(1 + 0.12 * Math.sin(now * 7));
    });

    gl.clippingPlanes = view === "main" ? MAIN_CLIP : NO_CLIP;
    if (fromReferee) {
      // Kamera na hrudi rozhodčího: širokoúhlá, míří na míč (u zranění na hráče) a při běhu se pohupuje.
      const r = states[replay.referee], about = again ? undefined : scene.focus[0];
      camera.position.set(r.x, PITCH_SURFACE_Y + 1.9 + Math.sin(now * 9) * 0.03 * Math.min(1, r.speed), r.z);
      camera.lookAt(about === undefined ? vLook.set(frame.ballX, 0.8, frame.ballZ) : vLook.set(states[about].x, 0.4, states[about].z));
      camera.fov = 62;
    } else if (view === "replay" && again) {
      // Opakovaný záběr: nízká kamera u protější lajny, šikmo na bránu.
      const toField = -Math.sign(again.goalZ);
      camera.position.set(-(HALF_W - 1), 2.6, again.goalZ + toField * 12);
      camera.lookAt(vLook.set(1.5, 1, again.goalZ + toField * 2));
      camera.fov = 38;
    } else {
      vLook.set(CAMERA_AIM_X, 0, THREE.MathUtils.clamp(frame.ballZ * 0.5, -CAMERA.pan, CAMERA.pan));
      if (cut) look.current.copy(vLook);
      else look.current.lerp(vLook, 1 - Math.exp(-dt * 1.5));
      camera.position.set(CAMERA.x, CAMERA.y, look.current.z * 0.3);
      camera.lookAt(look.current);
      camera.fov = CAMERA.fov;
    }
    camera.updateProjectionMatrix();

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
        <instancedMesh key={part.id} ref={(m) => { meshes.current[p] = m; }} args={[part.geometry, undefined, count * perFigure(part)]} frustumCulled={false}>
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
