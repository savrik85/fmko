"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { PITCH, PITCH_SURFACE_Y, type TimeOfDay } from "./constants";
import { useWind } from "./wind";

/**
 * Stébla trávy u nízkých kamer (Střídačka, Za brankou).
 *
 * Hustá stébla přes celé hřiště by byla na výkon moc drahá, proto rostou jen ve čtverci
 * kolem kamery. Jsou ukotvená ke hřišti (modulo jako u deště), takže při pohybu kamery
 * neujíždějí, a do dálky se zmenšují do ztracena. Vlní se podle síly větru. Za hranicí
 * hrací plochy se nekreslí.
 */
const PATCH = 24; // strana čtverce se stébly (m)
const FADE_START = 7;
const FADE_END = 11.5;

export function GrassBlades({
  color,
  timeOfDay,
  artificial,
  count = 60000,
}: {
  color: string;
  timeOfDay: TimeOfDay;
  artificial: boolean;
  count?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const wind = useWind();

  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    // Jedno stéblo = úzký trojúhelník (x = šířka, y = výška 0..1).
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0], 3));
    const offsets = new Float32Array(count * 2);
    const params = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      offsets[i * 2] = Math.random() * PATCH;
      offsets[i * 2 + 1] = Math.random() * PATCH;
      params[i * 4] = 0.55 + Math.random() * 0.9; // relativní výška
      params[i * 4 + 1] = Math.random() * Math.PI * 2; // natočení
      params[i * 4 + 2] = Math.random(); // odstín
      params[i * 4 + 3] = Math.random() * Math.PI * 2; // fáze vlnění
    }
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 2));
    g.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector2() },
          uColor: { value: new THREE.Color(color) },
          uLight: { value: 1 },
          uWind: { value: 0.2 },
          uHeight: { value: 0.1 },
          uHalf: { value: new THREE.Vector2(PITCH.width / 2, PITCH.depth / 2) },
        },
        vertexShader: /* glsl */ `
          attribute vec2 aOffset;
          attribute vec4 aParams;
          uniform float uTime;
          uniform vec2 uCenter;
          uniform float uWind;
          uniform float uHeight;
          uniform vec2 uHalf;
          varying float vTip;
          varying float vShade;
          void main() {
            vec2 origin = uCenter - vec2(${(PATCH / 2).toFixed(1)});
            vec2 xz = origin + mod(aOffset - origin, vec2(${PATCH.toFixed(1)}));
            float d = length(cameraPosition.xz - xz);
            float fade = 1.0 - smoothstep(${FADE_START.toFixed(1)}, ${FADE_END.toFixed(1)}, d);
            // Mimo hrací plochu stéblo „zmizí“ (nulová výška).
            float inside = step(abs(xz.x), uHalf.x - 0.05) * step(abs(xz.y), uHalf.y - 0.05);
            float h = uHeight * aParams.x * fade * inside;
            float c = cos(aParams.y), s = sin(aParams.y);
            vec3 local = vec3(position.x * 0.012 * (1.0 - position.y), position.y * h, 0.0);
            local = vec3(local.x * c, local.y, local.x * s);
            // Vítr ohýbá špičku ve směru +X, poryvy běží přes hřiště.
            float gust = sin(uTime * (1.2 + uWind * 2.5) + xz.x * 0.35 + xz.y * 0.2 + aParams.w);
            local.x += position.y * h * (0.25 * uWind + 0.12 * gust * (0.3 + uWind));
            vec3 world = vec3(xz.x, ${PITCH_SURFACE_Y.toFixed(3)} + 0.002, xz.y) + local;
            vTip = position.y;
            vShade = aParams.z;
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uLight;
          varying float vTip;
          varying float vShade;
          void main() {
            // U země tmavší, ke špičce světlejší; každé stéblo trochu jinak.
            vec3 col = uColor * (1.0 + 0.6 * vTip) * (0.9 + 0.3 * vShade) * uLight;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    material.uniforms.uColor.value.set(color);
  }, [color, material]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Jen u nízkých kamer: z výšky jsou stébla menší než pixel a stojí výkon zbytečně.
    mesh.visible = camera.position.y < 7;
    if (!mesh.visible) return;
    const u = material.uniforms;
    u.uTime.value += Math.min(delta, 0.05);
    u.uCenter.value.set(camera.position.x, camera.position.z);
    u.uWind.value = wind;
    u.uHeight.value = artificial ? 0.06 : 0.13;
    u.uLight.value = timeOfDay === "night" ? 0.45 : timeOfDay === "sunset" ? 0.75 : 1;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}
