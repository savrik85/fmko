"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { OrbitControls } from "@react-three/drei";
import { VIEWPOINTS, type CameraViewpoint } from "./constants";

interface CameraControllerProps {
  viewpoint: CameraViewpoint;
  isMobile?: boolean;
}

export function CameraController({ viewpoint, isMobile = false }: CameraControllerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  const targetCamPos = useRef(new THREE.Vector3(...VIEWPOINTS[viewpoint].position));
  const targetLookAt = useRef(new THREE.Vector3(...VIEWPOINTS[viewpoint].target));
  const targetFov = useRef(VIEWPOINTS[viewpoint].fov);
  const isTransitioning = useRef(true);
  const orbitAngle = useRef(0);

  // Reakce na změnu viewpoint
  useEffect(() => {
    const vp = VIEWPOINTS[viewpoint];
    if (vp) {
      targetCamPos.current.set(...vp.position);
      targetLookAt.current.set(...vp.target);
      targetFov.current = vp.fov;
      isTransitioning.current = true;
    }
  }, [viewpoint]);

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
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom
      enablePan={false}
      maxPolarAngle={Math.PI / 2.08}
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
      }}
    />
  );
}
