"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { WeatherType, TimeOfDay } from "./constants";

interface WeatherEffectsProps {
  weather?: WeatherType;
  timeOfDay?: TimeOfDay;
  isMobile?: boolean;
}

export function WeatherEffects({
  weather = "sunny",
  timeOfDay = "day",
  isMobile = false,
}: WeatherEffectsProps) {
  if (weather === "sunny") {
    return null;
  }

  return (
    <group>
      {/* 🌧️ Déšť + bouřka */}
      {weather === "rain" && (
        <>
          <RainParticles count={isMobile ? 700 : 1800} />
          <RainGroundSplashes count={isMobile ? 40 : 100} />
          <LightningFlash />
        </>
      )}

      {/* ❄️ Sněžení */}
      {weather === "snow" && (
        <SnowParticles count={isMobile ? 800 : 2200} />
      )}

      {/* 💨 Větrné poryvy a zvířené částice */}
      {weather === "wind" && (
        <WindStreaks count={isMobile ? 25 : 60} />
      )}

      {/* ☁️ Nízké zatažené mraky pro deštivé a zamračené počasí */}
      {(weather === "cloudy" || weather === "rain" || weather === "snow") && (
        <OvercastCloudLayer count={isMobile ? 6 : 14} weather={weather} timeOfDay={timeOfDay} />
      )}
    </group>
  );
}

/** 🌧️ Částice deště s reálným náklonem a rychlým pádem */
function RainParticles({ count }: { count: number }) {
  const lineCount = count;
  const positions = useMemo(() => {
    const pos = new Float32Array(lineCount * 6); // 2 body na čáru (x,y,z - start, x,y,z - end)
    for (let i = 0; i < lineCount; i++) {
      const idx = i * 6;
      const x = (Math.random() - 0.5) * 110;
      const y = Math.random() * 48;
      const z = (Math.random() - 0.5) * 125;
      const len = 0.7 + Math.random() * 0.5;
      const slantX = 0.16;
      const slantZ = 0.09;

      pos[idx] = x;
      pos[idx + 1] = y;
      pos[idx + 2] = z;
      pos[idx + 3] = x + slantX;
      pos[idx + 4] = y - len;
      pos[idx + 5] = z + slantZ;
    }
    return pos;
  }, [lineCount]);

  const geoRef = useRef<THREE.BufferGeometry>(null);

  useFrame((_, delta) => {
    if (!geoRef.current) return;
    const posAttr = geoRef.current.attributes.position;
    const arr = posAttr.array as Float32Array;
    const speed = 48 * delta;
    const slantX = 6.5 * delta;
    const slantZ = 3.5 * delta;

    for (let i = 0; i < lineCount; i++) {
      const idx = i * 6;
      arr[idx + 1] -= speed;
      arr[idx + 4] -= speed;
      arr[idx] += slantX;
      arr[idx + 3] += slantX;
      arr[idx + 2] += slantZ;
      arr[idx + 5] += slantZ;

      // Respawn nahoře vysoko v oblacích
      if (arr[idx + 4] < 0) {
        const x = (Math.random() - 0.5) * 110;
        const y = 46 + Math.random() * 6;
        const z = (Math.random() - 0.5) * 125;
        const len = 0.7 + Math.random() * 0.5;

        arr[idx] = x;
        arr[idx + 1] = y;
        arr[idx + 2] = z;
        arr[idx + 3] = x + 0.16;
        arr[idx + 4] = y - len;
        arr[idx + 5] = z + 0.09;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <lineSegments>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#CBD5E1"
        transparent
        opacity={0.45}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** 💦 Dopadové kapky a stříkance na hřišti */
function RainGroundSplashes({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const splashData = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 55,
      z: (Math.random() - 0.5) * 75,
      scale: Math.random(),
      speed: 2.5 + Math.random() * 3.5,
      time: Math.random() * Math.PI * 2,
    }));
  }, [count]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;

    for (let i = 0; i < count; i++) {
      const s = splashData[i];
      s.time += delta * s.speed;
      if (s.time > 1) {
        s.time = 0;
        s.x = (Math.random() - 0.5) * 55;
        s.z = (Math.random() - 0.5) * 75;
      }

      const curScale = (s.time) * 0.45;
      dummy.position.set(s.x, 0.04, s.z);
      dummy.rotation.x = -Math.PI / 2;
      dummy.scale.set(curScale, curScale, curScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <ringGeometry args={[0.08, 0.18, 8]} />
      <meshBasicMaterial color="#E2E8F0" transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/** ❄️ Vznášející se a vířící sněhové vločky */
function SnowParticles({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const flakes = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 110,
      y: Math.random() * 48,
      z: (Math.random() - 0.5) * 125,
      fallSpeed: 1.8 + Math.random() * 2.2,
      swaySpeed: 1.2 + Math.random() * 1.8,
      swayAmp: 0.35 + Math.random() * 0.5,
      rotSpeed: (Math.random() - 0.5) * 2.5,
      scale: 0.5 + Math.random() * 0.7,
      seed: Math.random() * 100,
    }));
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const t = state.clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const f = flakes[i];
      f.y -= f.fallSpeed * delta;
      const curX = f.x + Math.sin(t * f.swaySpeed + f.seed) * f.swayAmp;
      const curZ = f.z + Math.cos(t * f.swaySpeed * 0.8 + f.seed) * f.swayAmp;

      if (f.y < 0.1) {
        f.y = 46 + Math.random() * 6;
        f.x = (Math.random() - 0.5) * 110;
        f.z = (Math.random() - 0.5) * 125;
      }

      dummy.position.set(curX, f.y, curZ);
      dummy.rotation.set(t * f.rotSpeed, t * f.rotSpeed * 0.5, 0);
      dummy.scale.set(f.scale, f.scale, f.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <octahedronGeometry args={[0.07, 0]} />
      <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} />
    </instancedMesh>
  );
}

/** 💨 Zvířené linie větru a poletující tráva */
function WindStreaks({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const streaks = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: -45 - Math.random() * 30,
      y: 0.8 + Math.random() * 8,
      z: (Math.random() - 0.5) * 65,
      speed: 28 + Math.random() * 22,
      scaleX: 1.5 + Math.random() * 3.0,
      scaleY: 0.03 + Math.random() * 0.03,
      isLeaf: Math.random() > 0.6,
    }));
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const t = state.clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const s = streaks[i];
      s.x += s.speed * delta;
      const curY = s.y + Math.sin(t * 4 + i) * 0.3;

      if (s.x > 45) {
        s.x = -45 - Math.random() * 15;
        s.y = 0.8 + Math.random() * 8;
        s.z = (Math.random() - 0.5) * 65;
      }

      dummy.position.set(s.x, curY, s.z);
      dummy.rotation.set(0, 0, Math.sin(t * 3 + i) * 0.1);
      dummy.scale.set(s.scaleX, s.scaleY, 0.08);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#E2E8F0" transparent opacity={0.35} depthWrite={false} />
    </instancedMesh>
  );
}

/** ⚡ Náhodné záblesky blesků při dešti */
function LightningFlash() {
  const [flash, setFlash] = useState(false);
  const nextFlashTime = useRef(4 + Math.random() * 6);

  useFrame((_, delta) => {
    nextFlashTime.current -= delta;
    if (nextFlashTime.current <= 0) {
      setFlash(true);
      // Dvojitý blesk
      setTimeout(() => setFlash(false), 80);
      setTimeout(() => setFlash(true), 140);
      setTimeout(() => setFlash(false), 240);
      nextFlashTime.current = 6 + Math.random() * 10;
    }
  });

  if (!flash) return null;

  return (
    <group>
      <ambientLight intensity={1.8} color="#E0F2FE" />
      <directionalLight position={[10, 50, 10]} intensity={3.2} color="#F0F9FF" />
    </group>
  );
}

/** ☁️ Kupovitá vrstva zatažené oblohy */
function OvercastCloudLayer({
  count,
  weather,
  timeOfDay,
}: {
  count: number;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const cloudColor = useMemo(() => {
    if (weather === "rain") return timeOfDay === "night" ? "#1E293B" : "#475569";
    if (weather === "snow") return "#94A3B8";
    return timeOfDay === "sunset" ? "#9A7B7B" : "#CBD5E1";
  }, [weather, timeOfDay]);

  const clouds = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      x: ((i / count) - 0.5) * 160 + (Math.random() - 0.5) * 25,
      y: 64 + Math.random() * 12,
      z: ((i % 3) - 1) * 60 + (Math.random() - 0.5) * 30,
      speed: 0.7 + Math.random() * 1.0,
      scaleX: 24 + Math.random() * 20,
      scaleY: 6 + Math.random() * 4,
      scaleZ: 22 + Math.random() * 18,
    }));
  }, [count]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;

    for (let i = 0; i < count; i++) {
      const c = clouds[i];
      c.x += c.speed * delta;
      if (c.x > 110) c.x = -110;

      dummy.position.set(c.x, c.y, c.z);
      dummy.scale.set(c.scaleX, c.scaleY, c.scaleZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={cloudColor}
        roughness={0.95}
        metalness={0.0}
        transparent
        opacity={weather === "rain" ? 0.85 : 0.7}
      />
    </instancedMesh>
  );
}
