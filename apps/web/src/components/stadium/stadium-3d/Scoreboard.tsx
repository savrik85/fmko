"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { PITCH } from "./constants";

interface ScoreboardProps {
  level: number;            // 1-3
  homeScore?: number;
  awayScore?: number;
  homeName?: string;
  awayName?: string;
}

/**
 * Tabule výsledku za severní brankou (z = +HALF_D + 4)
 * L1: dřevěná ručně otáčená — žluté tabulky s černými číslicemi
 * L2: monochromatický LED — orange digitální písmo na černém
 * L3: full-color LED — barevný panel s týmovými barvami
 */
export function Scoreboard({ level, homeScore = 0, awayScore = 0, homeName = "DOMÁCÍ", awayName = "HOSTÉ" }: ScoreboardProps) {
  if (level <= 0) return null;
  if (level === 1) return <WoodenScoreboard homeScore={homeScore} awayScore={awayScore} />;
  if (level === 2) return <LedMonoScoreboard homeScore={homeScore} awayScore={awayScore} homeName={homeName} awayName={awayName} />;
  return <FullLedScoreboard homeScore={homeScore} awayScore={awayScore} homeName={homeName} awayName={awayName} />;
}

// Pozice u poloviny hřiště, na východní straně, na vysokých sloupech
// (přesahuje východní tribunu a je viditelný z default kamery [55,45,55])
const SCOREBOARD_X = 36;     // za východní tribunou (max stand back ~33), uvnitř fence (halfW≥40)
const SCOREBOARD_Z = 0;      // střed hřiště
const SCOREBOARD_ROT_Y = -Math.PI / 2;   // čelem k pitche (k -X)

// L1: dřevěná tabule na vysokých sloupech (přečnívá tribunu)
function WoodenScoreboard({ homeScore, awayScore }: { homeScore: number; awayScore: number }) {
  const texture = useMemo(() => makeWoodenTexture(homeScore, awayScore), [homeScore, awayScore]);
  const poleH = 8;
  return (
    <group position={[SCOREBOARD_X, 0, SCOREBOARD_Z]} rotation={[0, SCOREBOARD_ROT_Y, 0]}>
      {/* 2 dřevěné sloupky */}
      <mesh position={[-1.4, poleH / 2, 0]} castShadow>
        <boxGeometry args={[0.22, poleH, 0.22]} />
        <meshStandardMaterial color="#5C3A1E" />
      </mesh>
      <mesh position={[1.4, poleH / 2, 0]} castShadow>
        <boxGeometry args={[0.22, poleH, 0.22]} />
        <meshStandardMaterial color="#5C3A1E" />
      </mesh>
      {/* Hlavní tabule nahoře */}
      <mesh position={[0, poleH + 0.7, 0]} castShadow>
        <boxGeometry args={[3.2, 1.4, 0.15]} />
        <meshStandardMaterial color="#8B6F47" roughness={0.95} />
      </mesh>
      <mesh position={[0, poleH + 0.7, 0.08]}>
        <planeGeometry args={[3, 1.2]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// L2: LED monochromatický - oranžové číslice na černém
function LedMonoScoreboard({ homeScore, awayScore, homeName, awayName }: { homeScore: number; awayScore: number; homeName: string; awayName: string }) {
  const texture = useMemo(() => makeLedTexture(homeScore, awayScore, homeName, awayName, "#F5A623"), [homeScore, awayScore, homeName, awayName]);
  const poleH = 9;
  return (
    <group position={[SCOREBOARD_X, 0, SCOREBOARD_Z]} rotation={[0, SCOREBOARD_ROT_Y, 0]}>
      <mesh position={[-2.8, poleH / 2, 0]} castShadow>
        <boxGeometry args={[0.25, poleH, 0.25]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[2.8, poleH / 2, 0]} castShadow>
        <boxGeometry args={[0.25, poleH, 0.25]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[0, poleH + 1, 0]} castShadow>
        <boxGeometry args={[6, 2, 0.25]} />
        <meshStandardMaterial color="#1A1A1A" />
      </mesh>
      <mesh position={[0, poleH + 1, 0.13]}>
        <planeGeometry args={[5.7, 1.7]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// L3: full-color LED scoreboard
function FullLedScoreboard({ homeScore, awayScore, homeName, awayName }: { homeScore: number; awayScore: number; homeName: string; awayName: string }) {
  const texture = useMemo(() => makeFullLedTexture(homeScore, awayScore, homeName, awayName), [homeScore, awayScore, homeName, awayName]);
  const poleH = 10;
  return (
    <group position={[SCOREBOARD_X, 0, SCOREBOARD_Z]} rotation={[0, SCOREBOARD_ROT_Y, 0]}>
      <mesh position={[-3.6, poleH / 2, 0]} castShadow>
        <boxGeometry args={[0.3, poleH, 0.3]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[3.6, poleH / 2, 0]} castShadow>
        <boxGeometry args={[0.3, poleH, 0.3]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      {/* LED panel */}
      <mesh position={[0, poleH + 1.3, 0]} castShadow>
        <boxGeometry args={[7.6, 2.6, 0.3]} />
        <meshStandardMaterial color="#1A1A1A" />
      </mesh>
      <mesh position={[0, poleH + 1.3, 0.16]}>
        <planeGeometry args={[7.4, 2.4]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ─── Canvas textury ──────────────────────────────────────────

function makeWoodenTexture(home: number, away: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 200;
  const ctx = c.getContext("2d")!;
  // dřevěné pozadí
  ctx.fillStyle = "#A0826D";
  ctx.fillRect(0, 0, c.width, c.height);
  // vyrýsuj 2 prkna
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(c.width / 2, 0); ctx.lineTo(c.width / 2, c.height); ctx.stroke();
  // čísla
  ctx.fillStyle = "#1A1A1A";
  ctx.font = "bold 130px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(home), c.width / 4, c.height / 2);
  ctx.fillText(String(away), c.width * 3 / 4, c.height / 2);
  // dvojtečka
  ctx.fillStyle = "#5C3A1E";
  ctx.fillText(":", c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeLedTexture(home: number, away: number, homeName: string, awayName: string, ledColor: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 320;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0A0A0A";
  ctx.fillRect(0, 0, c.width, c.height);
  // jména týmů
  ctx.fillStyle = ledColor;
  ctx.font = "bold 60px Courier, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(truncate(homeName, 12), c.width / 4, 60);
  ctx.fillText(truncate(awayName, 12), c.width * 3 / 4, 60);
  // skore
  ctx.font = "bold 180px Courier, monospace";
  ctx.fillText(String(home), c.width / 4, 200);
  ctx.fillText(String(away), c.width * 3 / 4, 200);
  ctx.fillText(":", c.width / 2, 200);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeFullLedTexture(home: number, away: number, homeName: string, awayName: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 320;
  const ctx = c.getContext("2d")!;
  // gradient pozadí
  const grad = ctx.createLinearGradient(0, 0, c.width, 0);
  grad.addColorStop(0, "#1D3557");
  grad.addColorStop(0.5, "#0A0A0A");
  grad.addColorStop(1, "#A03A4C");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  // jména týmů barevně
  ctx.font = "bold 60px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#9BC4E2";
  ctx.fillText(truncate(homeName, 14), c.width / 4, 60);
  ctx.fillStyle = "#F4A261";
  ctx.fillText(truncate(awayName, 14), c.width * 3 / 4, 60);
  // skore - bílé
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 180px Arial, sans-serif";
  ctx.fillText(String(home), c.width / 4, 200);
  ctx.fillText(String(away), c.width * 3 / 4, 200);
  ctx.fillStyle = "#F4A261";
  ctx.fillText(":", c.width / 2, 200);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
