"use client";

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { Environment } from "@react-three/drei";
import type { TimeOfDay, WeatherType } from "./constants";

/**
 * Procedurální obloha jako kopule kolem areálu.
 *
 * Původní obloha byla 4×128 px gradient přilepený na obrazovku — nehýbal se s kamerou,
 * takže do ní nešlo umístit slunce ani záři horizontu. Tady je obloha skutečná polokoule
 * s gradientem podle výšky nad horizontem, slunečním kotoučem a měkkou září kolem něj.
 * Stejný shader se používá pro `SkyEnvironment` (odrazy a rozptýlené světlo na materiálech),
 * takže odrazy sedí s tím, co je vidět na obloze.
 *
 * Sluneční kotouč má hodnoty nad 1.0 (HDR) — s bloomem zazáří, bez něj ho tone mapping
 * srazí na bílou.
 */

export interface SkyParams {
  zenith: string;
  mid: string;
  horizon: string;
  /**
   * Barva pod horizontem u viditelné kopule. Z nadhledu (kamera Areál) je za okrajem
   * terénu vidět právě tenhle pás, proto má být oparem v barvě oblohy, ne šedou zemí.
   */
  ground: string;
  /** Barva „odrazu země" v environment mapě — zeleň/sníh, aby materiály zespodu nebyly černé. */
  envGround: string;
  sunDir: [number, number, number];
  sunColor: string;
  /** Široká záře kolem slunce (0 = žádná). */
  glow: number;
  /** Zjasnění horizontu ve směru slunce (opar). */
  haze: number;
  /** Úhlový poloměr kotouče ve stupních; 0 = bez kotouče (pod mrakem). */
  discDeg: number;
  /** Jas kotouče v HDR (>1 = bloom). */
  discIntensity: number;
  /** Síla environment osvětlení materiálů. */
  envIntensity: number;
}

export function getSkyParams(timeOfDay: TimeOfDay, weather: WeatherType): SkyParams {
  if (timeOfDay === "day") {
    if (weather === "rain") {
      return {
        zenith: "#35455A", mid: "#5F708A", horizon: "#A9B7C6", ground: "#98A7B6", envGround: "#2F4A25",
        sunDir: [40, 60, 25], sunColor: "#DCE3EC", glow: 0.08, haze: 0.08, discDeg: 0, discIntensity: 0,
        envIntensity: 0.45,
      };
    }
    if (weather === "snow") {
      return {
        zenith: "#4B5A70", mid: "#93A3B6", horizon: "#E2E8F0", ground: "#D2DAE2", envGround: "#C8D2DC",
        sunDir: [35, 50, 20], sunColor: "#F1F5F9", glow: 0.14, haze: 0.12, discDeg: 0, discIntensity: 0,
        envIntensity: 0.6,
      };
    }
    if (weather === "cloudy") {
      return {
        zenith: "#46546A", mid: "#7C8AA0", horizon: "#C9D2DC", ground: "#B4BFCA", envGround: "#33532A",
        sunDir: [40, 55, 25], sunColor: "#E8EDF3", glow: 0.2, haze: 0.16, discDeg: 0, discIntensity: 0,
        envIntensity: 0.55,
      };
    }
    // sunny / wind
    return {
      zenith: "#2B74BD", mid: "#63ACE3", horizon: "#CFE6F5", ground: "#A6CCE8", envGround: "#3E6B2A",
      sunDir: [40, 60, 25], sunColor: "#FFF3D6", glow: 0.38, haze: 0.28, discDeg: 1.6, discIntensity: 3.0,
      envIntensity: 0.55,
    };
  }

  if (timeOfDay === "sunset") {
    if (weather === "rain") {
      return {
        zenith: "#231B2D", mid: "#4F2A3D", horizon: "#8A4D3E", ground: "#7A5548", envGround: "#2A2E1C",
        sunDir: [50, 10, -35], sunColor: "#E08A5C", glow: 0.22, haze: 0.2, discDeg: 0, discIntensity: 0,
        envIntensity: 0.4,
      };
    }
    return {
      zenith: "#2B2050", mid: "#7A3C6A", horizon: "#F2A65A", ground: "#D9A06A", envGround: "#3B4A22",
      sunDir: [50, 10, -35], sunColor: "#FF9A4A", glow: 0.95, haze: 0.75, discDeg: 2.4, discIntensity: 2.6,
      envIntensity: 0.5,
    };
  }

  // night — měsíc místo slunce
  const overcast = weather === "rain" || weather === "snow";
  return {
    zenith: "#030610", mid: "#0A1324", horizon: overcast ? "#0E1626" : "#15223D", ground: "#0C1526", envGround: "#0A1208",
    sunDir: [-30, 45, -20], sunColor: "#B9C8E6", glow: overcast ? 0.04 : 0.1, haze: 0.05,
    discDeg: overcast ? 0 : 0.9, discIntensity: 1.6,
    envIntensity: 0.35,
  };
}

const VERTEX = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldDir = wp.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAGMENT = /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uGlow;
  uniform float uHaze;
  uniform float uDiscCos;
  uniform float uDiscIntensity;
  varying vec3 vWorldDir;

  void main() {
    vec3 d = normalize(vWorldDir);
    float h = d.y;
    vec3 sky;
    if (h >= 0.0) {
      // Horizont je mírně roztažený, aby světlý pruh nad krajinou byl vidět i z nadhledu.
      float t = pow(clamp(h, 0.0, 1.0), 0.65);
      sky = mix(uHorizon, uMid, smoothstep(0.0, 0.45, t));
      sky = mix(sky, uZenith, smoothstep(0.35, 1.0, t));
    } else {
      sky = mix(uHorizon, uGround, smoothstep(0.0, 0.25, -h));
    }

    float cosA = dot(d, uSunDir);
    float toward = max(cosA, 0.0);
    // Široká záře kolem slunce + opar u horizontu ve směru slunce.
    float glow = pow(toward, 8.0) * uGlow;
    glow += pow(toward, 2.0) * exp(-abs(h) * 6.0) * uHaze;
    sky += uSunColor * glow;

    // Kotouč s měkkým okrajem. uDiscCos > 1 znamená „bez kotouče".
    float disc = smoothstep(uDiscCos, uDiscCos + 0.0012, cosA);
    sky += uSunColor * disc * uDiscIntensity;

    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uGlow: { value: 0 },
      uHaze: { value: 0 },
      uDiscCos: { value: 2 },
      uDiscIntensity: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    dithering: true,
  });
}

function applySkyParams(material: THREE.ShaderMaterial, p: SkyParams, forEnvironment: boolean) {
  const u = material.uniforms;
  (u.uZenith.value as THREE.Color).set(p.zenith);
  (u.uMid.value as THREE.Color).set(p.mid);
  (u.uHorizon.value as THREE.Color).set(p.horizon);
  (u.uGround.value as THREE.Color).set(forEnvironment ? p.envGround : p.ground);
  (u.uSunDir.value as THREE.Vector3).set(...p.sunDir).normalize();
  (u.uSunColor.value as THREE.Color).set(p.sunColor);
  u.uGlow.value = p.glow;
  u.uHaze.value = p.haze;
  u.uDiscCos.value = p.discDeg > 0 ? Math.cos(THREE.MathUtils.degToRad(p.discDeg)) : 2;
  u.uDiscIntensity.value = p.discIntensity;
}

interface SkyDomeProps {
  params: SkyParams;
  /**
   * Poloměr kopule. Musí být větší než hvězdy (130) a mraky, ale poloměr + největší
   * vzdálenost kamery od středu (140) musí zůstat pod `far` kamery (400) — jinak se
   * protější strana kopule ořízne a obloha za areálem je černá.
   */
  radius?: number;
  forEnvironment?: boolean;
}

/** Viditelná kopule oblohy. */
export function SkyDome({ params, radius = 250, forEnvironment = false }: SkyDomeProps) {
  const material = useMemo(() => makeSkyMaterial(), []);

  // useLayoutEffect: drei <Environment> vykresluje cubemapu v layout efektu rodiče,
  // uniformy dítěte musí být hotové dřív — jinak by se odrazy vyrenderovaly ze staré oblohy.
  useLayoutEffect(() => {
    applySkyParams(material, params, forEnvironment);
  }, [material, params, forEnvironment]);

  useLayoutEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}

/**
 * Environment mapa z téže oblohy: dává materiálům rozptýlené světlo z nebe,
 * odlesky slunce na kovu a odraz zeleně zespodu. Bez ní roughness/metalness
 * nemají co odrážet a všechno vypadá plasticky.
 */
export function SkyEnvironment({ params }: { params: SkyParams }) {
  return (
    <Environment frames={1} resolution={64} environmentIntensity={params.envIntensity}>
      <SkyDome params={params} radius={50} forEnvironment />
    </Environment>
  );
}
