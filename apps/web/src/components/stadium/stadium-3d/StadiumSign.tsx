"use client";

import { useMemo } from "react";
import * as THREE from "three";

interface StadiumSignProps {
  name: string;
  position: [number, number, number];
  teamColor: string;
}

/**
 * Reklamní cedule s názvem stadionu — velký billboard na 2 sloupcích.
 * Text je vyrenderovaný do canvas texture (bez external font dependencies).
 */
export function StadiumSign({ name, position, teamColor }: StadiumSignProps) {
  const postH = 3.5;
  const plateW = 12;
  const plateH = 2.4;
  const plateThickness = 0.2;

  // Canvas texture s textem
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    // Pozadí v týmové barvě
    ctx.fillStyle = teamColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Bílý pruh uprostřed pro lepší kontrast
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);
    // Text v týmové barvě
    ctx.fillStyle = teamColor;
    ctx.font = "bold 110px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Zalomení dlouhých názvů
    const words = name.split(" ");
    const lines: string[] = [];
    let current = "";
    const maxWidth = canvas.width - 80;
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    if (lines.length > 2) {
      // Příliš dlouhé → zmenšit font a sjednotit na 2 řádky
      ctx.font = "bold 80px Arial, sans-serif";
    }
    const lineHeight = lines.length > 1 ? canvas.height * 0.4 : 0;
    lines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * lineHeight);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [name, teamColor]);

  return (
    <group position={position}>
      {/* Levý sloupek */}
      <mesh position={[-plateW / 2 + 0.4, postH / 2, 0]} castShadow>
        <boxGeometry args={[0.3, postH, 0.3]} />
        <meshStandardMaterial color="#525252" />
      </mesh>
      {/* Pravý sloupek */}
      <mesh position={[plateW / 2 - 0.4, postH / 2, 0]} castShadow>
        <boxGeometry args={[0.3, postH, 0.3]} />
        <meshStandardMaterial color="#525252" />
      </mesh>
      {/* Plotna - rámeček v týmové barvě */}
      <mesh position={[0, postH + plateH / 2, 0]} castShadow>
        <boxGeometry args={[plateW, plateH, plateThickness]} />
        <meshStandardMaterial color={teamColor} roughness={0.7} />
      </mesh>
      {/* Front text */}
      <mesh position={[0, postH + plateH / 2, plateThickness / 2 + 0.01]}>
        <planeGeometry args={[plateW * 0.95, plateH * 0.9]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* Back text */}
      <mesh position={[0, postH + plateH / 2, -plateThickness / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[plateW * 0.95, plateH * 0.9]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
