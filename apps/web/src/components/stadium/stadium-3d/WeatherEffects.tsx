"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
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
          <RainParticles count={isMobile ? 3000 : 7000} />
          <RainGroundSplashes count={isMobile ? 150 : 400} />
          <LightningFlash />
        </>
      )}

      {/* ❄️ Sněžení */}
      {weather === "snow" && (
        <SnowParticles count={isMobile ? 4500 : 12000} />
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

/**
 * 🌧️ Déšť jako protažené průsvitné pruhy, které počítá grafická karta.
 *
 * Dřív to byly 1px čáry rozházené po celém areálu (125 × 140 × 55 m): na hustém displeji
 * skoro zmizely a u kamery skoro nepršelo. Teď kapky padají v kvádru, který jede
 * s kamerou, takže je hustě tam, kam se hráč dívá, a pruh má šířku v metrech.
 * Pohyb je čistě ve shaderu (čas + modulo), procesor každý snímek nic nepřepočítává.
 */
const RAIN_BOX = { x: 44, y: 26, z: 44 };

function RainParticles({ count }: { count: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const geometry = useMemo(() => {
    // Jeden čtyřúhelník na kapku; rohy se v shaderu natáhnou podél směru pádu.
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3),
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const offsets = new Float32Array(count * 3);
    const params = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      offsets[i * 3] = Math.random() * RAIN_BOX.x;
      offsets[i * 3 + 1] = Math.random() * RAIN_BOX.y;
      offsets[i * 3 + 2] = Math.random() * RAIN_BOX.z;
      params[i * 2] = 17 + Math.random() * 7; // rychlost pádu m/s
      params[i * 2 + 1] = 0.4 + Math.random() * 0.4; // délka pruhu m
    }
    quad.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
    quad.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 2));
    quad.instanceCount = count;
    // Kapky se skládají kolem kamery, statická bounding sphere by je ořezala.
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return quad;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uBox: { value: new THREE.Vector3(RAIN_BOX.x, RAIN_BOX.y, RAIN_BOX.z) },
          uWind: { value: new THREE.Vector2(0.22, 0.1) },
          uColor: { value: new THREE.Color("#D6DEE8") },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aOffset;
          attribute vec2 aParams;
          uniform float uTime;
          uniform vec3 uCenter;
          uniform vec3 uBox;
          uniform vec2 uWind;
          varying float vAlong;
          varying float vFade;
          void main() {
            vec3 fall = normalize(vec3(uWind.x, -1.0, uWind.y));
            // Poloha v kvádru kolem kamery; modulo drží kapky v kvádru i při pohybu kamery.
            vec3 local = aOffset + fall * aParams.x * uTime;
            vec3 origin = uCenter - uBox * 0.5;
            vec3 p = origin + mod(local - origin, uBox);
            // Pod trávníkem neprší.
            p.y = max(p.y, 0.05);
            vec3 toCam = normalize(cameraPosition - p);
            // Pořadí v součinu určuje, kam míří líc čtyřúhelníku. Obráceně (fall × toCam)
            // byla každá kapka ke kameře zády a materiál s FrontSide ji zahodil.
            vec3 side = normalize(cross(toCam, fall));
            float len = aParams.y;
            float d = length(cameraPosition - p);
            // Šířka roste se vzdáleností, ať má pruh na obrazovce pořád zhruba 1 px.
            float width = max(0.008, d * 0.0016);
            vec3 world = p + side * position.x * width - fall * position.y * len;
            vAlong = position.y;
            // Blízko se nezobrazí (přes objektiv), daleko se rozplynou.
            vFade = smoothstep(0.8, 2.5, d) * (1.0 - smoothstep(16.0, 26.0, d));
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying float vAlong;
          varying float vFade;
          void main() {
            // Čelo kapky výraznější, ocas do ztracena.
            float a = (1.0 - vAlong) * 0.38 * vFade;
            if (a < 0.01) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    material.uniforms.uTime.value += Math.min(delta, 0.05);
    // Kvádr jede s kamerou, ale spodek nikdy nejde pod zem.
    const c = camera.position;
    material.uniforms.uCenter.value.set(c.x, Math.max(RAIN_BOX.y * 0.5 - 1, c.y), c.z);
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
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
      time: Math.random(),
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

      const curScale = (s.time) * 0.3;
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

/**
 * ❄️ Sněžení: měkké kulaté vločky kolem kamery, počítané ve shaderu.
 *
 * Dřív to byly ostré bílé osmistěny po celém areálu, ze kterých u kamery zbylo pár
 * teček. Teď je to billboard s rozmazaným okrajem v kvádru, který jede s kamerou;
 * vločky padají pomalu a pohupují se, každá jinak.
 */
const SNOW_BOX = { x: 40, y: 24, z: 40 };

function SnowParticles({ count }: { count: number }) {
  const { camera } = useThree();

  const geometry = useMemo(() => {
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const offsets = new Float32Array(count * 3);
    const params = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      offsets[i * 3] = Math.random() * SNOW_BOX.x;
      offsets[i * 3 + 1] = Math.random() * SNOW_BOX.y;
      offsets[i * 3 + 2] = Math.random() * SNOW_BOX.z;
      params[i * 4] = 0.9 + Math.random() * 1.1; // rychlost pádu m/s
      params[i * 4 + 1] = 0.06 + Math.random() * 0.09; // velikost vločky m
      params[i * 4 + 2] = Math.random() * Math.PI * 2; // fáze pohupování
      params[i * 4 + 3] = 0.6 + Math.random() * 0.9; // rychlost pohupování
    }
    quad.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
    quad.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
    quad.instanceCount = count;
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return quad;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uBox: { value: new THREE.Vector3(SNOW_BOX.x, SNOW_BOX.y, SNOW_BOX.z) },
          uDrift: { value: new THREE.Vector2(0.35, 0.15) },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aOffset;
          attribute vec4 aParams;
          uniform float uTime;
          uniform vec3 uCenter;
          uniform vec3 uBox;
          uniform vec2 uDrift;
          varying vec2 vUv;
          varying float vFade;
          void main() {
            float t = uTime;
            vec3 local = aOffset + vec3(uDrift.x * t, -aParams.x * t, uDrift.y * t);
            // Pohupování ze strany na stranu, každá vločka ve vlastním rytmu.
            local.x += sin(t * aParams.w + aParams.z) * 0.6;
            local.z += cos(t * aParams.w * 0.8 + aParams.z) * 0.45;
            vec3 origin = uCenter - uBox * 0.5;
            vec3 p = origin + mod(local - origin, uBox);
            p.y = max(p.y, 0.05);
            // Billboard: čtverec se rozloží až v prostoru kamery, vždy čelem k ní.
            vec4 view = viewMatrix * vec4(p, 1.0);
            float d = -view.z;
            // Na dálku drží vločka aspoň pár pixelů, jinak by zmizela.
            float size = max(aParams.y, d * 0.0025);
            view.xy += position.xy * size;
            vUv = position.xy + 0.5;
            vFade = smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(14.0, 22.0, d));
            gl_Position = projectionMatrix * view;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          varying float vFade;
          void main() {
            float r = length(vUv - 0.5) * 2.0;
            float a = (1.0 - smoothstep(0.35, 1.0, r)) * 0.85 * vFade;
            if (a < 0.01) discard;
            gl_FragColor = vec4(vec3(1.0), a);
          }
        `,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    material.uniforms.uTime.value += Math.min(delta, 0.05);
    const c = camera.position;
    material.uniforms.uCenter.value.set(c.x, Math.max(SNOW_BOX.y * 0.5 - 1, c.y), c.z);
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
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

/**
 * ⚡ Náhodné záblesky blesků při dešti.
 *
 * Světla jsou ve scéně pořád a blesk jen zvedne jejich intenzitu. Dřív se při každém
 * záblesku přidávala nová světla a odebírala, a to překompiluje všechny materiály:
 * obraz se při každém blesku zasekl.
 */
function LightningFlash() {
  const ambRef = useRef<THREE.AmbientLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const nextFlashTime = useRef(4 + Math.random() * 6);
  const flashAge = useRef(-1);

  useFrame((_, delta) => {
    nextFlashTime.current -= delta;
    if (nextFlashTime.current <= 0) {
      flashAge.current = 0;
      nextFlashTime.current = 6 + Math.random() * 10;
    }
    let k = 0;
    if (flashAge.current >= 0) {
      const a = flashAge.current;
      // Dvojitý blesk: 0–80 ms, pauza, 140–240 ms.
      k = a < 0.08 ? 1 : a < 0.14 ? 0 : a < 0.24 ? 0.8 : 0;
      flashAge.current = a < 0.3 ? a + delta : -1;
    }
    if (ambRef.current) ambRef.current.intensity = 1.8 * k;
    if (dirRef.current) dirRef.current.intensity = 3.2 * k;
  });

  return (
    <group>
      <ambientLight ref={ambRef} intensity={0} color="#E0F2FE" />
      <directionalLight ref={dirRef} position={[10, 50, 10]} intensity={0} color="#F0F9FF" />
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
    // Denní dešťová vrstva byla tak tmavá, že dělala nad areálem strop; v noci
    // ať zůstane olověná, tam je tma po právu.
    if (weather === "rain") return timeOfDay === "night" ? "#1E293B" : "#6B7C91";
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
