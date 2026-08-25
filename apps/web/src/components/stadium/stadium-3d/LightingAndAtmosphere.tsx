"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { TimeOfDay, WeatherType } from "./constants";

interface LightingAndAtmosphereProps {
  timeOfDay: TimeOfDay;
  weather?: WeatherType;
  isMobile?: boolean;
}

export function LightingAndAtmosphere({
  timeOfDay,
  weather = "sunny",
  isMobile = false,
}: LightingAndAtmosphereProps) {
  const shadowMapSize = isMobile ? 512 : 1024;
  const { scene } = useThree();

  // Dynamická atmosférická mlha podle denní doby a počasí
  useEffect(() => {
    // U jasného dne a větru nechceme žádnou mlhu u stadionu při oddálení
    if (timeOfDay === "day") {
      if (weather === "sunny" || weather === "wind") {
        scene.fog = null;
        return () => {
          scene.fog = null;
        };
      } else if (weather === "rain") {
        scene.fog = new THREE.Fog("#6B7C91", 130, 360);
      } else if (weather === "snow") {
        scene.fog = new THREE.Fog("#CBD5E1", 120, 340);
      } else if (weather === "cloudy") {
        scene.fog = new THREE.Fog("#94A3B8", 140, 380);
      }
    } else if (timeOfDay === "sunset") {
      if (weather === "rain") {
        scene.fog = new THREE.Fog("#4A3343", 90, 280);
      } else {
        scene.fog = new THREE.Fog("#D97757", 180, 500);
      }
    } else {
      // night
      scene.fog = new THREE.Fog(weather === "rain" ? "#0A101D" : "#0A1324", 160, 420);
    }

    return () => {
      scene.fog = null;
    };
  }, [timeOfDay, weather, scene]);

  return (
    <>
      {/* Obloha podle denní doby a počasí */}
      <DynamicSky timeOfDay={timeOfDay} weather={weather} />

      {/* Noční hvězdy (jen v noci a pokud není hustý déšť/sněžení) */}
      {timeOfDay === "night" && weather !== "rain" && weather !== "snow" && (
        <Stars count={isMobile ? 120 : 250} />
      )}

      {/* Denní / západové mráčky */}
      {timeOfDay !== "night" && weather === "sunny" && (
        <LowPolyClouds count={isMobile ? 4 : 8} timeOfDay={timeOfDay} />
      )}

      {/* Osvětlení scény — Den */}
      {timeOfDay === "day" && (
        <group>
          {weather === "rain" ? (
            <>
              {/* Zatažené deštivé osvětlení — pořád nejtmavší z denních, ale čitelné */}
              <ambientLight intensity={0.6} color="#C2CDD9" />
              <directionalLight
                position={[30, 50, 20]}
                intensity={0.92}
                color="#E6EBF1"
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
              {/* Přisvětlení ze stínové strany, stejný idiom jako u zataženo — bez něj
                  zůstala půlka areálu v dešti černá. */}
              <directionalLight position={[-35, 25, -30]} intensity={0.22} color="#9FB0C2" />
              <hemisphereLight args={["#93A5B8", "#3A5A33", 0.48]} />
            </>
          ) : weather === "snow" ? (
            <>
              {/* Zimní rozptýlené bílo-šedé světlo */}
              <ambientLight intensity={0.55} color="#E2E8F0" />
              <directionalLight
                position={[35, 50, 20]}
                intensity={0.85}
                color="#F8FAFC"
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
              <hemisphereLight args={["#CBD5E1", "#3E5C32", 0.4]} />
            </>
          ) : weather === "cloudy" ? (
            <>
              {/* Pod mrakem — měkké difúzní stíny */}
              <ambientLight intensity={0.55} color="#E2E8F0" />
              <directionalLight
                position={[40, 55, 25]}
                intensity={1.0}
                color="#F1F5F9"
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
              <directionalLight position={[-35, 25, -30]} intensity={0.35} color="#CBD5E1" />
              <hemisphereLight args={["#94A3B8", "#386125", 0.38]} />
            </>
          ) : (
            <>
              {/* Jasno / Slunečno */}
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
              <directionalLight position={[-35, 25, -30]} intensity={0.4} color="#D2E4F8" />
              <hemisphereLight args={["#C8E5F7", "#447526", 0.4]} />
            </>
          )}
        </group>
      )}

      {/* Osvětlení scény — Západ */}
      {timeOfDay === "sunset" && (
        <group>
          <ambientLight intensity={weather === "rain" ? 0.32 : 0.45} color="#FCE5CE" />
          <directionalLight
            position={[50, 22, -35]}
            intensity={weather === "rain" ? 0.9 : 1.6}
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
          <directionalLight position={[-40, 18, 40]} intensity={0.4} color="#9D76A8" />
          <hemisphereLight args={["#F89E68", "#2E4720", 0.4]} />
        </group>
      )}

      {/* Osvětlení scény — Noc */}
      {timeOfDay === "night" && (
        <group>
          <ambientLight intensity={weather === "rain" ? 0.12 : 0.18} color="#152136" />
          <directionalLight
            position={[-30, 45, -20]}
            intensity={weather === "rain" ? 0.18 : 0.30}
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
          <hemisphereLight args={["#1A2C4A", "#0E180B", 0.2]} />
        </group>
      )}
    </>
  );
}

// Globální cache pro textury oblohy (vygeneruje se jen 1x)
const skyTextureCache = new Map<string, THREE.CanvasTexture>();

/** Stylizovaná obloha vykreslená do CanvasTexture */
function DynamicSky({ timeOfDay, weather }: { timeOfDay: TimeOfDay; weather: WeatherType }) {
  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const cacheKey = `${timeOfDay}:${weather}`;
    const cached = skyTextureCache.get(cacheKey);
    if (cached) return cached;

    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const g = ctx.createLinearGradient(0, 0, 0, 128);

    if (timeOfDay === "day") {
      if (weather === "rain") {
        // Zesvětleno (2026-08-25): olověná obloha stahovala celou scénu tak, že v ní
        // ve dne nebylo vidět. Pořád je to nejtemnější denní počasí, ale hraje se pod ní.
        g.addColorStop(0, "#2E3E52"); // Olověný zenit
        g.addColorStop(0.5, "#5A6C82");
        g.addColorStop(1, "#A9B7C6"); // Mlhavý šedý horizont
      } else if (weather === "snow") {
        g.addColorStop(0, "#475569");
        g.addColorStop(0.6, "#94A3B8");
        g.addColorStop(1, "#E2E8F0"); // Mrazivě bílý horizont
      } else if (weather === "cloudy") {
        g.addColorStop(0, "#334155");
        g.addColorStop(0.5, "#64748B");
        g.addColorStop(1, "#CBD5E1");
      } else {
        // sunny / wind
        g.addColorStop(0, "#5597CC"); // Zenit — sytá letní modrá
        g.addColorStop(0.5, "#9DD0ED");
        g.addColorStop(1, "#E6F3FA"); // Horizont — měkká světlá
      }
    } else if (timeOfDay === "sunset") {
      if (weather === "rain") {
        g.addColorStop(0, "#231B2D");
        g.addColorStop(0.5, "#4F2A3D");
        g.addColorStop(1, "#8A4D3E");
      } else {
        g.addColorStop(0, "#31234F"); // Zenit — večerní tmavě indigová
        g.addColorStop(0.35, "#7E3B68"); // Purpurová
        g.addColorStop(0.7, "#D9653B"); // Teplá oranžová
        g.addColorStop(1, "#F7BA63"); // Horizont — zlatavá
      }
    } else {
      // night
      g.addColorStop(0, "#040711"); // Zenit — temný vesmír
      g.addColorStop(0.6, "#0A1324");
      g.addColorStop(1, "#121E38"); // Horizont — hluboká noční modř
    }

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    skyTextureCache.set(cacheKey, tex);
    return tex;
  }, [timeOfDay, weather]);

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
      const radius = 75 + rand() * 45;
      return {
        x: Math.cos(angle) * radius,
        y: 60 + rand() * 16,
        z: Math.sin(angle) * radius,
        scale: 1.5 + rand() * 1.8,
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
