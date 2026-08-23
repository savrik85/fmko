"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { TimeOfDay } from "./constants";

interface LightingAndAtmosphereProps {
  timeOfDay: TimeOfDay;
  isMobile?: boolean;
}

export function LightingAndAtmosphere({ timeOfDay, isMobile = false }: LightingAndAtmosphereProps) {
  const shadowMapSize = isMobile ? 1024 : 2048;

  return (
    <>
      {/* Obloha podle denní doby */}
      <DynamicSky timeOfDay={timeOfDay} />

      {/* Noční hvězdy (jen v noci) */}
      {timeOfDay === "night" && <Stars count={isMobile ? 120 : 250} />}

      {/* Denní / západové mráčky */}
      {timeOfDay !== "night" && <LowPolyClouds count={isMobile ? 4 : 8} timeOfDay={timeOfDay} />}

      {/* Osvětlení scény */}
      {timeOfDay === "day" && (
        <group>
          <ambientLight intensity={0.65} color="#F0F6FF" />
          <directionalLight
            position={[40, 60, 25]}
            intensity={1.3}
            color="#FFF8EC"
            castShadow={!isMobile}
            shadow-mapSize-width={shadowMapSize}
            shadow-mapSize-height={shadowMapSize}
            shadow-camera-near={0.5}
            shadow-camera-far={200}
            shadow-camera-left={-65}
            shadow-camera-right={65}
            shadow-camera-top={65}
            shadow-camera-bottom={-65}
            shadow-bias={-0.0003}
          />
          {/* Fill světlo ze severu */}
          <directionalLight position={[-35, 25, -30]} intensity={0.4} color="#D2E4F8" />
          <hemisphereLight args={["#C8E5F7", "#447526", 0.4]} />
        </group>
      )}

      {timeOfDay === "sunset" && (
        <group>
          <ambientLight intensity={0.45} color="#FCE5CE" />
          {/* Nízko položené teplé zlaté slunce */}
          <directionalLight
            position={[50, 22, -35]}
            intensity={1.6}
            color="#FFA756"
            castShadow={!isMobile}
            shadow-mapSize-width={shadowMapSize}
            shadow-mapSize-height={shadowMapSize}
            shadow-camera-near={0.5}
            shadow-camera-far={200}
            shadow-camera-left={-65}
            shadow-camera-right={65}
            shadow-camera-top={65}
            shadow-camera-bottom={-65}
            shadow-bias={-0.0003}
          />
          {/* Fialovo-modré protisvětlo pro večerní hloubku */}
          <directionalLight position={[-40, 18, 40]} intensity={0.5} color="#9D76A8" />
          <hemisphereLight args={["#F89E68", "#2E4720", 0.45]} />
        </group>
      )}

      {timeOfDay === "night" && (
        <group>
          {/* Jemné noční měsíční a atmosférické světlo */}
          <ambientLight intensity={0.18} color="#152136" />
          <directionalLight
            position={[-30, 45, -20]}
            intensity={0.30}
            color="#7E9EC9"
            castShadow={!isMobile}
            shadow-mapSize-width={shadowMapSize / 2}
            shadow-mapSize-height={shadowMapSize / 2}
            shadow-camera-near={0.5}
            shadow-camera-far={200}
            shadow-camera-left={-65}
            shadow-camera-right={65}
            shadow-camera-top={65}
            shadow-camera-bottom={-65}
          />
          <hemisphereLight args={["#1A2C4A", "#0E180B", 0.22]} />
        </group>
      )}
    </>
  );
}

/** Stylizovaná obloha vykreslená do CanvasTexture */
function DynamicSky({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const g = ctx.createLinearGradient(0, 0, 0, 512);

    if (timeOfDay === "day") {
      g.addColorStop(0, "#5597CC"); // Zenit — sytá letní modrá
      g.addColorStop(0.5, "#9DD0ED");
      g.addColorStop(1, "#E6F3FA"); // Horizont — měkká světlá
    } else if (timeOfDay === "sunset") {
      g.addColorStop(0, "#31234F"); // Zenit — večerní tmavě indigová
      g.addColorStop(0.35, "#7E3B68"); // Purpurová
      g.addColorStop(0.7, "#D9653B"); // Teplá oranžová
      g.addColorStop(1, "#F7BA63"); // Horizont — zlatavá
    } else {
      // night
      g.addColorStop(0, "#040711"); // Zenit — temný vesmír
      g.addColorStop(0.6, "#0A1324");
      g.addColorStop(1, "#121E38"); // Horizont — hluboká noční modř
    }

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [timeOfDay]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) return null;
  return <primitive object={texture} attach="background" />;
}

/** Třpytivé hvězdy na noční obloze */
function Stars({ count = 200 }: { count?: number }) {
  const starsRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  const starData = useMemo(() => {
    let seed = 4321;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const arr: Array<{ pos: [number, number, number]; scale: number; speed: number; phase: number }> = [];
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = (rand() * 0.45 + 0.05) * Math.PI; // Jen horní polokoule
      const r = 110 + rand() * 20;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      arr.push({
        pos: [x, y, z],
        scale: 0.35 + rand() * 0.45,
        speed: 1.5 + rand() * 2.5,
        phase: rand() * Math.PI * 2,
      });
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (!starsRef.current) return;
    const t = clock.elapsedTime;
    starData.forEach((s, i) => {
      const pulse = s.scale * (0.7 + Math.sin(t * s.speed + s.phase) * 0.3);
      matrix.makeScale(pulse, pulse, pulse);
      matrix.setPosition(s.pos[0], s.pos[1], s.pos[2]);
      starsRef.current!.setMatrixAt(i, matrix);
    });
    starsRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={starsRef} args={[undefined, undefined, count]}>
      <octahedronGeometry args={[0.5, 0]} />
      <meshBasicMaterial color="#E8F1FF" toneMapped={false} />
    </instancedMesh>
  );
}

/** Plovoucí nízkopolygonální mráčky */
function LowPolyClouds({ count = 6, timeOfDay }: { count?: number; timeOfDay: TimeOfDay }) {
  const groupRef = useRef<THREE.Group>(null);

  const cloudColor = timeOfDay === "sunset" ? "#FFD0A8" : "#FFFFFF";
  const cloudEmissive = timeOfDay === "sunset" ? "#8A4020" : "#1A2E40";

  const clouds = useMemo(() => {
    let seed = 8821;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.5;
      const radius = 60 + rand() * 35;
      return {
        x: Math.cos(angle) * radius,
        y: 40 + rand() * 15,
        z: Math.sin(angle) * radius,
        scale: 1.2 + rand() * 1.5,
        speed: 0.04 + rand() * 0.04,
      };
    });
  }, [count]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.008;
    }
  });

  return (
    <group ref={groupRef}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={[c.scale, c.scale * 0.6, c.scale]}>
          {/* Kumulativní shluk 3 icosahedronů tvořící mrak */}
          <mesh position={[0, 0, 0]}>
            <icosahedronGeometry args={[4, 1]} />
            <meshStandardMaterial color={cloudColor} emissive={cloudEmissive} emissiveIntensity={0.15} roughness={0.9} flatShading />
          </mesh>
          <mesh position={[3.2, -0.4, 0.5]}>
            <icosahedronGeometry args={[3, 1]} />
            <meshStandardMaterial color={cloudColor} emissive={cloudEmissive} emissiveIntensity={0.15} roughness={0.9} flatShading />
          </mesh>
          <mesh position={[-3.2, -0.5, -0.4]}>
            <icosahedronGeometry args={[2.8, 1]} />
            <meshStandardMaterial color={cloudColor} emissive={cloudEmissive} emissiveIntensity={0.15} roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}
