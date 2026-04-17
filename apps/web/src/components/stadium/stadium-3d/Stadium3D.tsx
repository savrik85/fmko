"use client";

import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Pitch } from "./Pitch";
import { Stand } from "./Stand";
import { Building } from "./Building";
import { Parking } from "./Parking";
import { Fence } from "./Fence";
import { Surroundings } from "./Surroundings";
import { StadiumSign } from "./StadiumSign";
import { AdBoards } from "./AdBoards";
import { Scoreboard } from "./Scoreboard";
import { TeamFlag } from "./TeamFlag";
import { getStadiumLayout, SKY_SUN_POSITION } from "./constants";

export interface Stadium3DCustomization {
  fenceColor?: string | null;
  standColor?: string | null;
  seatColor?: string | null;
  roofColor?: string | null;
  accentColor?: string | null;
  scoreboardLevel?: number;
  flagSize?: number;
}

export interface LastMatchScore {
  homeScore: number;
  awayScore: number;
  homeName: string;
  awayName: string;
}

interface Stadium3DProps {
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  teamColor: string;
  secondaryColor?: string;
  badgePattern?: string;
  badgeInitials?: string;
  stadiumName?: string | null;
  sponsors?: string[];
  customization?: Stadium3DCustomization;
  lastMatch?: LastMatchScore | null;
}

export function Stadium3D({
  pitchCondition,
  pitchType,
  facilities,
  teamColor,
  secondaryColor,
  badgePattern,
  badgeInitials,
  stadiumName,
  sponsors,
  customization,
  lastMatch,
}: Stadium3DProps) {
  const f = facilities;
  const layout = getStadiumLayout(f.stands ?? 0);
  const cust = customization ?? {};
  const standColor = cust.standColor ?? teamColor;
  const seatColor = cust.seatColor ?? teamColor;
  const accentColor = cust.accentColor ?? "#C9A84C";
  const fenceColor = cust.fenceColor ?? null;       // Fence komponenta má per-level defaulty
  const roofColor = cust.roofColor ?? null;          // null = per-budovu default barva

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

        <Fence level={f.fence ?? 0} bounds={layout.fence} colorOverride={fenceColor} />

        <Pitch condition={pitchCondition} pitchType={pitchType} />

        {/* 4 tribuny okolo hřiště - všechny na stejném levelu (jeden parametr stands) */}
        <Stand side="north" level={f.stands ?? 0} teamColor={teamColor} standColor={standColor} seatColor={seatColor} accentColor={accentColor} reducedDetail={isMobile} />
        <Stand side="south" level={f.stands ?? 0} teamColor={teamColor} standColor={standColor} seatColor={seatColor} accentColor={accentColor} reducedDetail={isMobile} />
        {/* East/West tribuny renderujeme jen na L2+ aby vytvořily progresivní pocit růstu */}
        {(f.stands ?? 0) >= 2 && <Stand side="east" level={f.stands} teamColor={teamColor} standColor={standColor} seatColor={seatColor} accentColor={accentColor} reducedDetail={isMobile} />}
        {(f.stands ?? 0) >= 2 && <Stand side="west" level={f.stands} teamColor={teamColor} standColor={standColor} seatColor={seatColor} accentColor={accentColor} reducedDetail={isMobile} />}

        {/* Budovy v rozích */}
        <Building kind="changing_rooms" level={f.changing_rooms ?? 0} position={layout.buildings.changing_rooms} roofColorOverride={roofColor} />
        <Building kind="showers" level={f.showers ?? 0} position={layout.buildings.showers} roofColorOverride={roofColor} />
        <Building kind="refreshments" level={f.refreshments ?? 0} position={layout.buildings.refreshments} roofColorOverride={roofColor} />

        {/* Parkoviště */}
        <Parking level={f.parking ?? 0} position={layout.parking} />

        {/* Cedule s názvem stadionu — těsně před jižním plotem zvenku */}
        {stadiumName && (
          <StadiumSign
            name={stadiumName}
            position={[0, 0, -(layout.fence.depth / 2 + 1.5)]}
            teamColor={teamColor}
          />
        )}

        {/* Reklamní bannery podél hřiště — jen aktivní smluvy, opakují se */}
        {sponsors && sponsors.length > 0 && (
          <AdBoards sponsors={sponsors} teamColor={teamColor} />
        )}

        {/* Scoreboard za severní brankou */}
        {(cust.scoreboardLevel ?? 0) > 0 && (
          <Scoreboard
            level={cust.scoreboardLevel ?? 0}
            homeScore={lastMatch?.homeScore ?? 0}
            awayScore={lastMatch?.awayScore ?? 0}
            homeName={lastMatch?.homeName ?? "DOMÁCÍ"}
            awayName={lastMatch?.awayName ?? "HOSTÉ"}
          />
        )}

        {/* Vlajka týmu před vchodem */}
        {(cust.flagSize ?? 0) > 0 && (
          <TeamFlag
            size={cust.flagSize ?? 0}
            primaryColor={teamColor}
            secondaryColor={secondaryColor ?? "#fff"}
            pattern={badgePattern ?? "shield"}
            initials={badgeInitials ?? "?"}
            position={[12, 0, -(layout.fence.depth / 2 + 3)]}
          />
        )}
      </Suspense>

      {/* Post-processing: jen na desktopu (mobile = perf hit) */}
      {!isMobile && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.35} luminanceThreshold={0.7} luminanceSmoothing={0.4} mipmapBlur />
          <Vignette eskil={false} offset={0.15} darkness={0.6} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
