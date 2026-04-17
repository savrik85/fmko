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

    ctx.fillStyle = teamColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxWidth = canvas.width - 80;
    const maxHeight = canvas.height - 60;
    const words = name.split(/\s+/);

    // Zkus seskupit slova do N řádků (1, 2, max 3) a najdi font size který vejde
    const tryLayout = (numLines: number, fontSize: number): { lines: string[]; fits: boolean } => {
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      const lines: string[] = [];
      let current = "";
      // Greedy: napln každý řádek max kolik se vejde
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
      // Vyhovuje pokud lines <= numLines a každý <= maxWidth a celková výška <= maxHeight
      const lineHeight = fontSize * 1.15;
      const totalH = lines.length * lineHeight;
      const fits = lines.length <= numLines && totalH <= maxHeight;
      return { lines, fits };
    };

    // Hledej největší font který se vejde do max 2 řádků
    let chosen: { lines: string[]; fontSize: number } = { lines: [name], fontSize: 30 };
    for (let fs = 110; fs >= 30; fs -= 4) {
      const r1 = tryLayout(1, fs);
      if (r1.fits) { chosen = { lines: r1.lines, fontSize: fs }; break; }
      const r2 = tryLayout(2, fs);
      if (r2.fits) { chosen = { lines: r2.lines, fontSize: fs }; break; }
    }

    ctx.font = `bold ${chosen.fontSize}px Arial, sans-serif`;
    ctx.fillStyle = teamColor;
    const lineHeight = chosen.fontSize * 1.15;
    const startY = canvas.height / 2 - ((chosen.lines.length - 1) * lineHeight) / 2;
    chosen.lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
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
