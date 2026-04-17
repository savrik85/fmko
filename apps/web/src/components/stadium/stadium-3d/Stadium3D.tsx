"use client";

import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import { Pitch } from "./Pitch";
import { Stand } from "./Stand";
import { Building } from "./Building";
import { Parking } from "./Parking";
import { Fence } from "./Fence";
import { Surroundings } from "./Surroundings";
import { StadiumSign } from "./StadiumSign";
import { getStadiumLayout, SKY_SUN_POSITION } from "./constants";

interface Stadium3DProps {
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  teamColor: string;
  stadiumName?: string | null;
}

export function Stadium3D({ pitchCondition, pitchType, facilities, teamColor, stadiumName }: Stadium3DProps) {
  const f = facilities;
  const layout = getStadiumLayout(f.stands ?? 0);

  // Mobile detection (matchMedia → re-render při změně viewport)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const shadowMapSize = isMobile ? 1024 : 2048;

  return (
    <Canvas
      shadows={!isMobile}
      camera={{ position: [55, 45, 55], fov: 35 }}
      frameloop="demand"
      dpr={isMobile ? [1, 1.5] : [1, 2]}
      gl={{ antialias: !isMobile, alpha: false, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#B8DCEC"]} />
      <Sky sunPosition={SKY_SUN_POSITION} turbidity={6} rayleigh={2} mieCoefficient={0.005} mieDirectionalG={0.8} />

      {/* Lighting */}
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[40, 60, 25]}
        intensity={1.2}
        castShadow={!isMobile}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <hemisphereLight args={["#B8DCEC", "#4A7A2C", 0.3]} />

      <OrbitControls
        enableZoom
        enablePan={false}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={25}
        maxDistance={120}
        target={[0, 0, 0]}
        // Na mobilu: jen dva prsty rotují/zoomují (single finger = scroll page)
        touches={isMobile ? { ONE: -1 as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />

      <Suspense fallback={null}>
        <Surroundings reduceTrees={isMobile} />

        <Fence level={f.fence ?? 0} bounds={layout.fence} />

        <Pitch condition={pitchCondition} pitchType={pitchType} />

        {/* 4 tribuny okolo hřiště - všechny na stejném levelu (jeden parametr stands) */}
        <Stand side="north" level={f.stands ?? 0} teamColor={teamColor} reducedDetail={isMobile} />
        <Stand side="south" level={f.stands ?? 0} teamColor={teamColor} reducedDetail={isMobile} />
        {/* East/West tribuny renderujeme jen na L2+ aby vytvořily progresivní pocit růstu */}
        {(f.stands ?? 0) >= 2 && <Stand side="east" level={f.stands} teamColor={teamColor} reducedDetail={isMobile} />}
        {(f.stands ?? 0) >= 2 && <Stand side="west" level={f.stands} teamColor={teamColor} reducedDetail={isMobile} />}

        {/* Budovy v rozích */}
        <Building kind="changing_rooms" level={f.changing_rooms ?? 0} position={layout.buildings.changing_rooms} />
        <Building kind="showers" level={f.showers ?? 0} position={layout.buildings.showers} />
        <Building kind="refreshments" level={f.refreshments ?? 0} position={layout.buildings.refreshments} />

        {/* Parkoviště */}
        <Parking level={f.parking ?? 0} position={layout.parking} />

        {/* Cedule s názvem stadionu před hlavním vchodem (jih, mimo plot) */}
        {stadiumName && (
          <StadiumSign
            name={stadiumName}
            position={[0, 0, -(layout.fence.depth / 2 + 4)]}
            teamColor={teamColor}
          />
        )}
      </Suspense>
    </Canvas>
  );
}
