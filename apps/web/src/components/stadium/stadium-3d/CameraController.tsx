"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { OrbitControls } from "@react-three/drei";
import { VIEWPOINTS, type CameraViewpoint, type ViewpointDef } from "./constants";

const UP = new THREE.Vector3(0, 1, 0);
const SWAY_SPEED = (Math.PI * 2) / 80;
const SWAY_ANGLE = 0.16;

/** Polovina vodorovného úhlu, do kterého se má areál z nadhledu vejít. */
const OVERVIEW_HALF_WIDTH = THREE.MathUtils.degToRad(31);
const OVERVIEW_MAX_FOV = 56;
/** Kamera nesmí dál, než pustí OrbitControls (maxDistance 140), jinak by dojezd nikdy neskončil. */
const OVERVIEW_MAX_DISTANCE = 132;

/**
 * Pohled na areál přizpůsobený poměru stran plátna. Souřadnice v `VIEWPOINTS` sedí na široké
 * plátno na desktopu; na skoro čtvercovém plátně v mobilu a na výšku by boční tribuny
 * utekly ze záběru. Úzké plátno proto dostane širší záběr a kamera případně poodstoupí.
 */
function fitToAspect(vp: ViewpointDef, aspect: number): ViewpointDef {
  if (vp.id !== "overview" || !(aspect > 0)) return vp;
  const needed = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(OVERVIEW_HALF_WIDTH) / aspect));
  if (needed <= vp.fov) return vp;
  const fov = Math.min(needed, OVERVIEW_MAX_FOV);
  const target = new THREE.Vector3(...vp.target);
  const offset = new THREE.Vector3(...vp.position).sub(target);
  const wanted = Math.tan(THREE.MathUtils.degToRad(needed / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const scale = Math.max(1, Math.min(wanted, OVERVIEW_MAX_DISTANCE / offset.length()));
  const position = target.clone().add(offset.multiplyScalar(scale));
  return { ...vp, fov, position: [position.x, position.y, position.z] };
}

interface CameraControllerProps {
  viewpoint: CameraViewpoint;
  isMobile?: boolean;
  /** Pohledy spočítané pro aktuální tribuny (getViewpoints); default statické VIEWPOINTS. */
  viewpoints?: Record<CameraViewpoint, ViewpointDef>;
  /** Režim focení: kamera skočí rovnou na pohled, bez plynulého dojezdu. */
  instant?: boolean;
}

export function CameraController({ viewpoint, isMobile = false, viewpoints = VIEWPOINTS, instant = false }: CameraControllerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  // Zaokrouhlený poměr stran: drobná změna šířky (posuvník, lišta prohlížeče) kameru nerozjede.
  const aspect = useThree((state) => Math.round((state.size.width / Math.max(1, state.size.height)) * 10) / 10);

  const initial = fitToAspect(viewpoints[viewpoint], aspect);
  const targetCamPos = useRef(new THREE.Vector3(...initial.position));
  const targetLookAt = useRef(new THREE.Vector3(...initial.target));
  const targetFov = useRef(initial.fov);
  const isTransitioning = useRef(true);
  const orbitAngle = useRef(0);
  // Pohled na areál se po dojezdu pomalu pohupuje kolem hřiště, dokud na něj hráč nesáhne.
  const swayActive = useRef(false);
  const swayTime = useRef(0);
  const swayOffset = useRef(new THREE.Vector3());

  // Reakce na změnu viewpoint (nebo přepočet pohledů po změně tribun)
  useEffect(() => {
    const raw = viewpoints[viewpoint];
    if (raw) {
      const vp = fitToAspect(raw, aspect);
      targetCamPos.current.set(...vp.position);
      targetLookAt.current.set(...vp.target);
      targetFov.current = vp.fov;
      isTransitioning.current = true;
      swayActive.current = false;
      if (instant) {
        camera.position.set(...vp.position);
        const persCam = camera as THREE.PerspectiveCamera;
        if (persCam.fov) {
          persCam.fov = vp.fov;
          persCam.updateProjectionMatrix();
        }
        const controls = controlsRef.current;
        if (controls) {
          controls.target.set(...vp.target);
          controls.update();
        } else {
          camera.lookAt(...vp.target);
        }
        isTransitioning.current = false;
      }
    }
  }, [viewpoint, viewpoints, instant, camera, aspect]);

  // Plynulý lerp kamery a kinematický oblet
  useFrame((state, delta) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    if (viewpoint === "orbit") {
      // Kinematický filmový oblet s proměnlivou výškou a vzdáleností
      orbitAngle.current += delta * 0.28;
      const angle = orbitAngle.current;

      const radiusX = isMobile ? 74 : 58;
      const radiusZ = isMobile ? 86 : 68;
      const x = Math.sin(angle) * radiusX;
      const z = Math.cos(angle) * radiusZ;
      // Na mobilu je kamera výše a zacílená výše, aby stadion seděl v horní 2/3 obrazovky
      const y = (isMobile ? 36 : 24) + Math.sin(angle * 2) * (isMobile ? 14 : 12);
      const targetY = isMobile ? 4.5 + Math.sin(angle) * 1.5 : 1.5 + Math.sin(angle) * 1.5;

      // Plynulý přesun
      camera.position.lerp(new THREE.Vector3(x, y, z), delta * 2.0);
      controls.target.lerp(new THREE.Vector3(0, targetY, 0), delta * 2.0);

      const persCam = camera as THREE.PerspectiveCamera;
      if (persCam.fov) {
        const baseFov = isMobile ? 48 : 38;
        persCam.fov = THREE.MathUtils.lerp(persCam.fov, baseFov + Math.cos(angle) * 4, delta * 1.5);
        persCam.updateProjectionMatrix();
      }

      controls.update();
      return;
    }

    if (isTransitioning.current) {
      const step = Math.min(1, delta * 3.5); // Rychlost přechodu

      camera.position.lerp(targetCamPos.current, step);
      controls.target.lerp(targetLookAt.current, step);

      const persCam = camera as THREE.PerspectiveCamera;
      if (persCam.fov) {
        persCam.fov = THREE.MathUtils.lerp(persCam.fov, targetFov.current, step);
        persCam.updateProjectionMatrix();
      }

      controls.update();

      // Když jsme dostatečně blízko, ukončíme nucený transition
      if (
        camera.position.distanceTo(targetCamPos.current) < 0.1 &&
        controls.target.distanceTo(targetLookAt.current) < 0.1
      ) {
        isTransitioning.current = false;
        if (viewpoint === "overview" && !instant) {
          swayActive.current = true;
          swayTime.current = 0;
        }
      }
      return;
    }

    if (swayActive.current) {
      // Kyvadlo ±9° kolem osy hřiště, jedna perioda ~80 s. Začíná v nule, takže nenavazuje skokem.
      swayTime.current += delta;
      const yaw = Math.sin(swayTime.current * SWAY_SPEED) * SWAY_ANGLE;
      swayOffset.current.copy(targetCamPos.current).sub(targetLookAt.current).applyAxisAngle(UP, yaw);
      camera.position.copy(targetLookAt.current).add(swayOffset.current);
      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom
      enablePan={false}
      // Nízké pohledy (střídačka, za brankou) jsou jen ~4° nad horizontem;
      // přísnější limit by kameru při dojezdu odstrkoval nahoru a přechod by nikdy neskončil.
      maxPolarAngle={Math.PI / 2.05}
      minDistance={15}
      maxDistance={140}
      touches={
        isMobile
          ? { ONE: -1 as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE }
          : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
      }
      onStart={() => {
        // Pokud user začne táhnout myší, přestaneme vnucovat targetCamPos
        isTransitioning.current = false;
        swayActive.current = false;
      }}
    />
  );
}
