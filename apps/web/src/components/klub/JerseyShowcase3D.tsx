"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { JerseyMesh } from "./JerseyMesh";
import { Badge3D, type BadgePattern } from "./Badge3D";
import type { JerseyPattern } from "@/lib/jersey-pattern-canvas";

interface JerseyShowcase3DProps {
  homePrimary: string;
  homeSecondary: string;
  homePattern: JerseyPattern;
  awayPrimary: string;
  awaySecondary: string;
  awayPattern: JerseyPattern;
  badgePattern: BadgePattern;
  initials: string;
  sponsor: string | null;
}

export function JerseyShowcase3D(props: JerseyShowcase3DProps) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <Canvas
      shadows={!isMobile}
      camera={{ position: [0, 0.5, 7], fov: 42 }}
      dpr={isMobile ? [1, 1.5] : [1, 2]}
      gl={{ antialias: !isMobile, alpha: false, powerPreference: "high-performance" }}
    >
      {/* Světlé showroom pozadí s mírným vignette pocitem */}
      <color attach="background" args={["#2a3240"]} />

      {/* Silné ambient aby dresy byly čitelné */}
      <ambientLight intensity={0.9} />

      {/* Hlavní spotlight z vrchu vpředu */}
      <spotLight
        position={[0, 6, 6]}
        angle={0.8}
        penumbra={0.5}
        intensity={2.5}
        castShadow={!isMobile}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        color="#fff8e8"
      />
      {/* Barevné nasvícení po stranách — cool vibe */}
      <pointLight position={[-6, 2, 4]} intensity={1.2} color="#88b8ff" distance={15} />
      <pointLight position={[6, 2, 4]} intensity={1.2} color="#ffb080" distance={15} />
      {/* Zadní rim light */}
      <directionalLight position={[0, 3, -4]} intensity={0.6} color="#ffffff" />

      <Environment preset="studio" background={false} />

      {/* Podlaha — tmavý disk s mírným reflectionem */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial color="#1a2030" roughness={0.55} metalness={0.25} />
      </mesh>

      <OrbitControls
        enableZoom
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.8}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={4}
        maxDistance={12}
        target={[0, 0, 0]}
      />

      <Suspense fallback={null}>
        {/* Home jersey — vlevo */}
        <JerseyMesh
          primary={props.homePrimary}
          secondary={props.homeSecondary}
          pattern={props.homePattern}
          sponsor={props.sponsor}
          position={[-2.6, 0.2, 0]}
        />

        {/* Away jersey — vpravo */}
        <JerseyMesh
          primary={props.awayPrimary}
          secondary={props.awaySecondary}
          pattern={props.awayPattern}
          sponsor={props.sponsor}
          position={[2.6, 0.2, 0]}
        />

        {/* Znak — uprostřed vpředu */}
        <Badge3D
          primary={props.homePrimary}
          secondary={props.homeSecondary}
          pattern={props.badgePattern}
          initials={props.initials}
          position={[0, 0.3, 1.2]}
          size={2.2}
        />
      </Suspense>

      {!isMobile && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.3} luminanceThreshold={0.7} luminanceSmoothing={0.4} mipmapBlur />
          <Vignette eskil={false} offset={0.25} darkness={0.5} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
