"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { PITCH, STAND_DIMS } from "./constants";

const STAND_GAP = 1;

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/** Canvas textura s nápisem na choreo plachtu (bez externích fontů). */
function useBannerTexture(text: string | null | undefined, bg: string, fg: string): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (!text || typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const label = text.toUpperCase();
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fs = 130;
    for (; fs >= 40; fs -= 4) {
      ctx.font = `bold ${fs}px Arial, sans-serif`;
      if (ctx.measureText(label).width <= canvas.width - 80) break;
    }
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }, [text, bg, fg]);
}

/**
 * Zastřešení tribun — stříška nad severní/jižní (a od L2 i V/Z) tribunou.
 * Renderuje se jen když je postavené (roofLevel>0) a existují tribuny (standsLevel>0).
 */
export function StandRoof({
  standsLevel,
  roofLevel,
  roofColor,
}: {
  standsLevel: number;
  roofLevel: number;
  roofColor?: string | null;
}) {
  if (roofLevel <= 0 || standsLevel <= 0) return null;
  const dims = STAND_DIMS[Math.min(standsLevel, 3)];
  const color = roofColor ?? "#9A9DA4"; // světlejší plech
  const overhang = 0.5 + roofLevel * 0.35; // přesah nad hřiště roste s levelem

  // Stejné umístění jako Stand: skupina na okraji hřiště, lokální +Z = od hřiště dozadu.
  const nsDistance = PITCH.depth / 2 + STAND_GAP + dims.depth / 2;
  const ewDistance = PITCH.width / 2 + STAND_GAP + dims.depth / 2;

  // Stříška v LOKÁLNÍCH souřadnicích tribuny: kryje zadní 2/3 sedaček,
  // klesá od zadku (výš) k hřišti (níž) — jako reálná krytá tribuna.
  // U nízké tribuny (L1) zvednout stříšku výš, ať na ni neplácne — jako krytá tribuna na sloupech.
  const clearance = standsLevel === 1 ? 2.6 : 1.1;
  const Canopy = ({ alongLen }: { alongLen: number }) => {
    const roofDepth = dims.depth * 0.7 + overhang;
    const roofZ = dims.depth * 0.45;               // těžiště nad zadní částí sedaček
    const roofY = dims.height + clearance;          // jasně nad sedačkami
    const backZ = dims.depth + overhang * 0.5;      // zadní podpěry
    const postH = roofY + 0.2;
    // Přední lem střechy (okap) — přibližná pozice předního okraje nakloněné desky
    const frontY = roofY - Math.sin(0.32) * roofDepth / 2;
    const frontZ = roofZ - Math.cos(0.32) * roofDepth / 2;
    return (
      <group>
        {/* Nakloněná plocha stříšky */}
        <mesh position={[0, roofY, roofZ]} rotation={[-0.32, 0, 0]} castShadow>
          <boxGeometry args={[alongLen + 1, 0.14, roofDepth]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.35} />
        </mesh>
        {/* Přední okapový lem — rámuje střechu, ať nepůsobí jako plovoucí plát */}
        <mesh position={[0, frontY, frontZ]} rotation={[-0.32, 0, 0]} castShadow>
          <boxGeometry args={[alongLen + 1.1, 0.2, 0.14]} />
          <meshStandardMaterial color="#3A3D42" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* Zadní sloupky (3 — krajní + prostřední pro širší rozpon) */}
        {[-alongLen * 0.4, 0, alongLen * 0.4].map((x, i) => (
          <mesh key={i} position={[x, postH / 2, backZ]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, postH, 8]} />
            <meshStandardMaterial color="#4A4D54" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
      </group>
    );
  };

  return (
    <group>
      <group position={[0, 0, nsDistance]} rotation={[0, 0, 0]}><Canopy alongLen={PITCH.width} /></group>
      <group position={[0, 0, -nsDistance]} rotation={[0, Math.PI, 0]}><Canopy alongLen={PITCH.width} /></group>
      {standsLevel >= 2 && <group position={[ewDistance, 0, 0]} rotation={[0, Math.PI / 2, 0]}><Canopy alongLen={PITCH.depth} /></group>}
      {standsLevel >= 2 && <group position={[-ewDistance, 0, 0]} rotation={[0, -Math.PI / 2, 0]}><Canopy alongLen={PITCH.depth} /></group>}
    </group>
  );
}

/**
 * Sektor kotle — řada vlajkových banerů + buben před jižní tribunou (u hřiště).
 * Počet a výška roste s levelem.
 */
export function UltrasSector({
  level,
  primaryColor,
  secondaryColor,
  text,
  bannerColor,
  textColor,
}: {
  level: number;
  primaryColor: string;
  secondaryColor?: string;
  text?: string | null;
  bannerColor?: string | null;
  textColor?: string | null;
}) {
  const sec = secondaryColor ?? "#ffffff";
  const bannerBg = bannerColor ?? primaryColor;
  // Barva nápisu: volitelná; jinak čitelný kontrast k barvě plachty (bílá na tmavé, tmavá na světlé).
  const bannerFg = textColor ?? (isLightHex(bannerBg) ? "#1a1a1a" : "#ffffff");
  const bannerTex = useBannerTexture(text, bannerBg, bannerFg);

  if (level <= 0) return null;
  const lvl = Math.min(level, 3);
  const count = [0, 4, 6, 8][lvl];
  const poleH = 5 + lvl * 0.8;
  // V mezeře mezi brankou (-30) a přední hranou tribuny (-31) — nízký baner nezakryje tribunu za sebou.
  const z = -(PITCH.depth / 2 + 0.85);
  const spread = PITCH.width * 0.85;

  return (
    <group>
      {/* Baner na zábradlí — zvednutý nad reklamy; s nápisem (textura) nebo jednobarevný. Výška ~75 %. */}
      <mesh position={[0, 1.45, z]} castShadow>
        <planeGeometry args={[spread + 2, 1.0]} />
        <meshStandardMaterial
          color={bannerTex ? "#ffffff" : bannerBg}
          map={bannerTex ?? undefined}
          side={2}
          roughness={0.85}
        />
      </mesh>
      {/* Pruh druhé barvy nahoře na baneru (jen bez nápisu) */}
      {!bannerTex && (
        <mesh position={[0, 1.87, z + 0.02]}>
          <planeGeometry args={[spread + 2, 0.18]} />
          <meshStandardMaterial color={sec} side={2} roughness={0.85} />
        </mesh>
      )}

      {/* Žerdě s vlajkami — trčí nad tribunu, nezakrývají ji */}
      {Array.from({ length: count }).map((_, i) => {
        const x = -spread / 2 + (spread / Math.max(count - 1, 1)) * i;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, poleH / 2, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.07, poleH, 6]} />
              <meshStandardMaterial color="#2E2E2E" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh position={[0.5, poleH - 0.6, 0.02]}>
              <planeGeometry args={[1.0, 0.7]} />
              <meshStandardMaterial color={i % 2 === 0 ? sec : primaryColor} side={2} roughness={0.8} />
            </mesh>
          </group>
        );
      })}

      {/* Buben (od L2) — v rohu vedle branky, mimo hřiště, čelem k hřišti */}
      {lvl >= 2 && (
        <group position={[spread * 0.5 + 1.6, 0, z]}>
          <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.75, 0.75, 1.0, 18]} />
            <meshStandardMaterial color={primaryColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.9, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.77, 0.77, 0.04, 18]} />
            <meshStandardMaterial color="#F5F0E8" />
          </mesh>
          <mesh position={[0, 0.9, 0.53]}>
            <boxGeometry args={[1.2, 0.1, 0.02]} />
            <meshStandardMaterial color={primaryColor} />
          </mesh>
          <mesh position={[0, 0.9, 0.53]}>
            <boxGeometry args={[0.1, 1.2, 0.02]} />
            <meshStandardMaterial color={primaryColor} />
          </mesh>
        </group>
      )}
    </group>
  );
}
