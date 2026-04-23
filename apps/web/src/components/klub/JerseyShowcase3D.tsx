"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
      camera={{ position: [0, 1.5, 6.5], fov: 38 }}
      dpr={isMobile ? [1, 1.5] : [1, 2]}
      gl={{ antialias: !isMobile, alpha: false, powerPreference: "high-performance" }}
    >
      {/* Tmavé showroom pozadí */}
      <color attach="background" args={["#1a1f2a"]} />
      <fog attach="fog" args={["#1a1f2a", 8, 18]} />

      {/* Ambient + spotlights */}
      <ambientLight intensity={0.4} />
      <spotLight
        position={[0, 8, 4]}
        angle={0.6}
        penumbra={0.5}
        intensity={1.8}
        castShadow={!isMobile}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        color="#fff8e8"
      />
      <spotLight position={[-5, 5, 3]} angle={0.5} penumbra={0.6} intensity={0.6} color="#a0c4ff" />
      <spotLight position={[5, 5, 3]} angle={0.5} penumbra={0.6} intensity={0.6} color="#ffb380" />

      {/* Podlahový disk s lehkým reflectionem */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#2b3344" roughness={0.6} metalness={0.2} />
      </mesh>

      {/* OrbitControls — auto-rotate, manual control */}
      <OrbitControls
        enableZoom
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.6}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={4}
        maxDistance={10}
        target={[0, 0.3, 0]}
      />

      <Suspense fallback={null}>
        {/* Home jersey - vlevo */}
        <JerseyMesh
          primary={props.homePrimary}
          secondary={props.homeSecondary}
          pattern={props.homePattern}
          sponsor={props.sponsor}
          position={[-2.4, 0.2, 0]}
        />

        {/* Away jersey - vpravo */}
        <JerseyMesh
          primary={props.awayPrimary}
          secondary={props.awaySecondary}
          pattern={props.awayPattern}
          sponsor={props.sponsor}
          position={[2.4, 0.2, 0]}
        />

        {/* Znak uprostřed - největší focus */}
        <Badge3D
          primary={props.homePrimary}
          secondary={props.homeSecondary}
          pattern={props.badgePattern}
          initials={props.initials}
          position={[0, 0.4, 0]}
          size={2.0}
        />
      </Suspense>

      {!isMobile && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.4} luminanceThreshold={0.6} luminanceSmoothing={0.4} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.7} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
