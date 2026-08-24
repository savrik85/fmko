"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { generateBrickTexture, generateWoodTexture, generateRoofTileTexture, generateConcreteTexture } from "./materialTextures";
import { type WeatherType } from "./constants";

interface EntranceGateProps {
  level: number;
  position: [number, number, number];
  teamColor: string;
  secondaryColor?: string;
  stadiumName?: string | null;
  weather?: WeatherType;
}

function useSignTexture(name: string | null | undefined, bg: string, fg: string): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (!name || typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Vnitřní kontrastní rámeček
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fs = 96;
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    while (fs > 32 && ctx.measureText(name.toUpperCase()).width > canvas.width - 80) {
      fs -= 4;
      ctx.font = `bold ${fs}px Arial, sans-serif`;
    }
    ctx.fillText(name.toUpperCase(), canvas.width / 2, canvas.height / 2 + 3);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }, [name, bg, fg]);
}

export function EntranceGate({
  level,
  position,
  teamColor,
  secondaryColor = "#ffffff",
  stadiumName = "STADION",
}: EntranceGateProps) {
  const lvl = Math.max(0, Math.min(3, Math.floor(level)));

  if (lvl === 0) {
    return <Level0Gate position={position} stadiumName={stadiumName} />;
  }
  if (lvl === 1) {
    return <Level1Gate position={position} teamColor={teamColor} stadiumName={stadiumName} />;
  }
  if (lvl === 2) {
    return <Level2Gate position={position} teamColor={teamColor} secondaryColor={secondaryColor} stadiumName={stadiumName} />;
  }
  return (
    <Level3Gate
      position={position}
      teamColor={teamColor}
      secondaryColor={secondaryColor}
      stadiumName={stadiumName}
    />
  );
}

/** L0: Vesnická dřevěná závora, stolek s výběrčím a napojená ráhna na plot */
function Level0Gate({
  position,
  stadiumName,
}: {
  position: [number, number, number];
  stadiumName?: string | null;
}) {
  const woodTex = useMemo(() => generateWoodTexture("#6B4423", 2, 1), []);
  const signTex = useSignTexture(stadiumName || "STADION", "#FEF08A", "#1E293B");

  return (
    <group position={position}>
      {/* Levé spojovací dřevěné zábradlí (od plotu x = -4.0 k závoře x = -2.4) */}
      <group position={[-3.2, 0, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1.6, 0.12, 0.06]} />
          <meshStandardMaterial map={woodTex?.map} bumpMap={woodTex?.bumpMap} color="#8B5A2B" />
        </mesh>
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[1.6, 0.12, 0.06]} />
          <meshStandardMaterial map={woodTex?.map} bumpMap={woodTex?.bumpMap} color="#8B5A2B" />
        </mesh>
        <mesh position={[-0.8, 0.6, 0]} castShadow>
          <boxGeometry args={[0.16, 1.2, 0.16]} />
          <meshStandardMaterial map={woodTex?.map} bumpMap={woodTex?.bumpMap} color="#8B5A2B" />
        </mesh>
      </group>

      {/* Sloupek závory */}
      <mesh position={[-2.4, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.16, 1.2, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Červeno-bílá závora */}
      <group position={[-2.4, 1.05, 0]} rotation={[0, 0, 0.1]}>
        <mesh position={[2.1, 0, 0]} castShadow>
          <boxGeometry args={[4.2, 0.12, 0.08]} />
          <meshStandardMaterial color="#DC2626" roughness={0.5} />
        </mesh>
        {/* Bílé pruhy na závoře */}
        {[-0.8, 0.2, 1.2, 2.2, 3.2].map((x, i) => (
          <mesh key={i} position={[x, 0, 0.002]}>
            <boxGeometry args={[0.3, 0.13, 0.082]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
        ))}
        {/* Protizávaží vzadu */}
        <mesh position={[-0.4, 0, 0]} castShadow>
          <boxGeometry args={[0.6, 0.28, 0.22]} />
          <meshStandardMaterial color="#1E293B" />
        </mesh>
      </group>

      {/* Dřevěný skládací stolek na vstupné */}
      <group position={[2.0, 0, 0.5]}>
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.9, 0.8, 0.6]} />
          <meshStandardMaterial
            map={woodTex?.map ?? undefined}
            bumpMap={woodTex?.bumpMap ?? undefined}
            color="#8B5A2B"
          />
        </mesh>
        {/* Plechová pokladnička na mince */}
        <mesh position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[0.24, 0.1, 0.18]} />
          <meshStandardMaterial color="#1E3A8A" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Cedule Vstupné 30 Kč */}
        <mesh position={[0, 0.95, -0.2]} rotation={[-0.2, 0, 0]}>
          <planeGeometry args={[0.35, 0.2]} />
          <meshBasicMaterial color="#FEF08A" />
        </mesh>
        {/* Výběrčí vstupného v reflexní vestě */}
        <group position={[0, 0, 0.45]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[0.28, 0.9, 0.24]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[0.4, 0.55, 0.28]} />
            <meshStandardMaterial color="#EAB308" />
          </mesh>
          <mesh position={[0, 1.6, 0]} castShadow>
            <boxGeometry args={[0.24, 0.26, 0.24]} />
            <meshStandardMaterial color="#E8B48C" />
          </mesh>
          {/* Čepice */}
          <mesh position={[0, 1.76, 0]}>
            <boxGeometry args={[0.26, 0.08, 0.32]} />
            <meshStandardMaterial color="#1E293B" />
          </mesh>
        </group>
      </group>

      {/* Pravé spojovací zábradlí (od stolku x = +2.5 k plotu x = +4.0) */}
      <group position={[3.25, 0, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1.5, 0.12, 0.06]} />
          <meshStandardMaterial map={woodTex?.map} bumpMap={woodTex?.bumpMap} color="#8B5A2B" />
        </mesh>
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[1.5, 0.12, 0.06]} />
          <meshStandardMaterial map={woodTex?.map} bumpMap={woodTex?.bumpMap} color="#8B5A2B" />
        </mesh>
        <mesh position={[0.75, 0.6, 0]} castShadow>
          <boxGeometry args={[0.16, 1.2, 0.16]} />
          <meshStandardMaterial map={woodTex?.map} bumpMap={woodTex?.bumpMap} color="#8B5A2B" />
        </mesh>
      </group>

      {/* Dřevěná uvítací cedule se jménem stadionu vpravo vedle plotu */}
      {stadiumName && (
        <group position={[5.8, 0, 0]}>
          {/* 2 Dřevěné nosné kůly umístěné ZA cedulí */}
          {[-1.3, 1.3].map((x, i) => (
            <mesh key={i} position={[x, 1.2, 0.12]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 2.4, 8]} />
              <meshStandardMaterial color="#5C3A1E" roughness={0.9} />
            </mesh>
          ))}
          {/* Dřevěná rámová deska cedule */}
          <mesh position={[0, 2.0, 0]} castShadow>
            <boxGeometry args={[3.2, 0.85, 0.08]} />
            <meshStandardMaterial color="#78350F" roughness={0.8} />
          </mesh>
          {/* Čelní textová plocha otočená k příchodu bez jakýchkoliv překážek */}
          {signTex && (
            <mesh position={[0, 2.0, -0.045]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[3.05, 0.72]} />
              <meshBasicMaterial map={signTex} />
            </mesh>
          )}
          {/* Zadní textová plocha */}
          {signTex && (
            <mesh position={[0, 2.0, 0.045]}>
              <planeGeometry args={[3.05, 0.72]} />
              <meshBasicMaterial map={signTex} />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}

/** L1: Dřevěná zastřešená pokladna, kovaná brána a napojené boční křídlo (utěsněno od x = -4.0 do +4.0) */
function Level1Gate({
  position,
  teamColor,
  stadiumName,
}: {
  position: [number, number, number];
  teamColor: string;
  stadiumName?: string | null;
}) {
  const woodTex = useMemo(() => generateWoodTexture("#78350F", 2, 2), []);
  const signTex = useSignTexture(stadiumName || "STADION", teamColor, "#FFFFFF");

  return (
    <group position={position}>
      {/* Dřevěná pokladna vlevo: přesně vyplňuje prostor od x = -4.0 do x = -1.8 */}
      <group position={[-2.9, 0, 0]}>
        <mesh position={[0, 1.3, 0]} castShadow>
          <boxGeometry args={[2.2, 2.6, 2.0]} />
          <meshStandardMaterial
            map={woodTex?.map ?? undefined}
            bumpMap={woodTex?.bumpMap ?? undefined}
            bumpScale={0.06}
            color="#92400E"
          />
        </mesh>
        {/* Šikmá stříška */}
        <mesh position={[0, 2.7, 0]} rotation={[0.2, 0, 0]} castShadow>
          <boxGeometry args={[2.5, 0.14, 2.3]} />
          <meshStandardMaterial color="#451A03" roughness={0.6} />
        </mesh>
        {/* Výdejní okénko (čelní strana) */}
        <mesh position={[0, 1.3, -1.02]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.85, 0.75]} />
          <meshStandardMaterial color="#0284C7" roughness={0.1} metalness={0.9} />
        </mesh>
        {/* Nápis POKLADNA */}
        <mesh position={[0, 2.1, -1.02]} rotation={[0, Math.PI, 0]}>
          <boxGeometry args={[1.3, 0.3, 0.04]} />
          <meshStandardMaterial color="#FEF08A" />
        </mesh>
      </group>

      {/* 2 Hlavní kované bránové sloupky na rozteči x = -1.8 a x = +1.8 */}
      {[-1.8, 1.8].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 1.8, 0]} castShadow>
            <boxGeometry args={[0.35, 3.6, 0.35]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 3.7, 0]} castShadow>
            <sphereGeometry args={[0.2, 10, 10]} />
            <meshStandardMaterial color="#F59E0B" metalness={0.8} />
          </mesh>
        </group>
      ))}

      {/* Dřevěný klenutý oblouk nad bránou s názvem stadionu */}
      {stadiumName && (
        <group position={[0, 3.5, 0]}>
          <mesh castShadow>
            <boxGeometry args={[3.8, 0.75, 0.12]} />
            <meshStandardMaterial color="#78350F" roughness={0.7} />
          </mesh>
          {signTex && (
            <mesh position={[0, 0, -0.07]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[3.6, 0.65]} />
              <meshBasicMaterial map={signTex} />
            </mesh>
          )}
          {signTex && (
            <mesh position={[0, 0, 0.07]}>
              <planeGeometry args={[3.6, 0.65]} />
              <meshBasicMaterial map={signTex} />
            </mesh>
          )}
        </group>
      )}

      {/* Kovaná křídla brány (otevřená) */}
      <mesh position={[-0.9, 1.2, 0]} castShadow>
        <boxGeometry args={[1.4, 2.0, 0.06]} />
        <meshStandardMaterial color="#1E293B" metalness={0.7} />
      </mesh>
      <mesh position={[0.9, 1.2, 0]} castShadow>
        <boxGeometry args={[1.4, 2.0, 0.06]} />
        <meshStandardMaterial color="#1E293B" metalness={0.7} />
      </mesh>

      {/* Pravé kované křídlo / výplňový plot (od x = +1.8 k plotu x = +4.0 — žádná díra!) */}
      <group position={[2.9, 0, 0]}>
        {/* Horní a spodní kované madlo */}
        <mesh position={[0, 1.8, 0]} castShadow>
          <boxGeometry args={[2.2, 0.08, 0.06]} />
          <meshStandardMaterial color="#334155" metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[2.2, 0.08, 0.06]} />
          <meshStandardMaterial color="#334155" metalness={0.7} />
        </mesh>
        {/* Svislé kované tyče */}
        {[-0.8, -0.4, 0, 0.4, 0.8].map((x, i) => (
          <mesh key={i} position={[x, 1.0, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 1.7, 6]} />
            <meshStandardMaterial color="#1E293B" metalness={0.8} />
          </mesh>
        ))}
        {/* Koncový sloupek u plotu x = +4.0 */}
        <mesh position={[1.1, 1.0, 0]} castShadow>
          <boxGeometry args={[0.22, 2.0, 0.22]} />
          <meshStandardMaterial color="#334155" metalness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/** L2: Zděný vstupní objekt se 2 nerezovými turnikety (utěsněno od x = -4.0 do +4.0) */
function Level2Gate({
  position,
  teamColor,
  secondaryColor,
  stadiumName,
}: {
  position: [number, number, number];
  teamColor: string;
  secondaryColor: string;
  stadiumName?: string | null;
}) {
  const brickTex = useMemo(() => generateBrickTexture("#991B1B", "#D1D5DB", 3, 2), []);
  const tileTex = useMemo(() => generateRoofTileTexture("#7C2D12", 3, 3), []);
  const signTex = useSignTexture(stadiumName || "STADION", teamColor, secondaryColor);

  return (
    <group position={position}>
      {/* Zděná pokladní budova vlevo: vyplňuje od x = -4.0 do x = -1.6 */}
      <group position={[-2.8, 0, 0]}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <boxGeometry args={[2.4, 3.2, 2.6]} />
          <meshStandardMaterial
            map={brickTex?.map ?? undefined}
            bumpMap={brickTex?.bumpMap ?? undefined}
            bumpScale={0.06}
            color="#B91C1C"
          />
        </mesh>
        {/* Sedlová střecha */}
        <mesh position={[0, 3.5, 0]} rotation={[0.4, 0, 0]} castShadow>
          <boxGeometry args={[2.7, 0.16, 3.0]} />
          <meshStandardMaterial
            map={tileTex?.map ?? undefined}
            bumpMap={tileTex?.bumpMap ?? undefined}
            bumpScale={0.07}
            color="#7C2D12"
          />
        </mesh>
        {/* Prodejní okénko čelem k příchodu */}
        <group position={[0, 1.4, -1.32]}>
          <mesh rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.9, 0.8]} />
            <meshStandardMaterial color="#38BDF8" roughness={0.1} />
          </mesh>
          <mesh position={[0, 0.55, 0]} rotation={[0, Math.PI, 0]}>
            <boxGeometry args={[1.0, 0.2, 0.04]} />
            <meshStandardMaterial color="#FEF08A" />
          </mesh>
        </group>
      </group>

      {/* Zastřešený turniketový koridor: od x = -1.6 do x = +2.4 */}
      <group position={[0.4, 0, 0]}>
        {/* Zastřešení turniketů */}
        <mesh position={[0, 3.0, 0]} castShadow>
          <boxGeometry args={[4.0, 0.16, 2.4]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Podpěrné ocelové sloupy */}
        {[-1.8, 1.8].flatMap((x) =>
          [-1.0, 1.0].map((z, j) => (
            <mesh key={`${x}-${j}`} position={[x, 1.5, z]} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 3.0, 8]} />
              <meshStandardMaterial color="#64748B" metalness={0.8} />
            </mesh>
          )),
        )}

        {/* Tabule s názvem stadionu nad turnikety čelem k příchodu */}
        {stadiumName && (
          <group position={[0, 3.55, -0.95]}>
            <mesh castShadow>
              <boxGeometry args={[3.8, 0.85, 0.08]} />
              <meshStandardMaterial color="#1E293B" metalness={0.7} />
            </mesh>
            {signTex && (
              <mesh position={[0, 0, -0.045]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[3.6, 0.75]} />
                <meshBasicMaterial map={signTex} />
              </mesh>
            )}
            {signTex && (
              <mesh position={[0, 0, 0.045]}>
                <planeGeometry args={[3.6, 0.75]} />
                <meshBasicMaterial map={signTex} />
              </mesh>
            )}
          </group>
        )}

        {/* 2 Otočné turnikety */}
        {[-0.8, 0.8].map((x, i) => (
          <group key={i} position={[x, 0, 0]}>
            {/* Tělo turniketu */}
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[0.3, 1.1, 0.7]} />
              <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.2} />
            </mesh>
            {/* Otočná ramena */}
            <mesh position={[0.2, 0.85, 0]} rotation={[0, 0, Math.PI / 4]}>
              <cylinderGeometry args={[0.025, 0.025, 0.6, 8]} />
              <meshStandardMaterial color="#CBD5E1" metalness={0.95} />
            </mesh>
            <mesh position={[0.2, 0.85, 0]} rotation={[0, Math.PI / 2, Math.PI / 4]}>
              <cylinderGeometry args={[0.025, 0.025, 0.6, 8]} />
              <meshStandardMaterial color="#CBD5E1" metalness={0.95} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Pravý spojovací zděný pilíř a kované pole (od x = +2.4 k plotu x = +4.0) */}
      <group position={[3.2, 0, 0]}>
        <mesh position={[0, 1.0, 0]} castShadow>
          <boxGeometry args={[1.6, 2.0, 0.12]} />
          <meshStandardMaterial color="#334155" metalness={0.7} />
        </mesh>
        <mesh position={[0.8, 1.1, 0]} castShadow>
          <boxGeometry args={[0.4, 2.2, 0.4]} />
          <meshStandardMaterial
            map={brickTex?.map ?? undefined}
            bumpMap={brickTex?.bumpMap ?? undefined}
            color="#B91C1C"
          />
        </mesh>
      </group>

      {/* 2 Stožáry s klubovými vlajkami po stranách vstupu */}
      {[-4.6, 4.6].map((x, i) => (
        <group key={i} position={[x, 0, -0.5]}>
          <mesh position={[0, 2.5, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 5.0, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
          </mesh>
          <mesh position={[0.45, 4.4, 0]}>
            <planeGeometry args={[0.9, 0.6]} />
            <meshBasicMaterial color={i % 2 === 0 ? teamColor : secondaryColor} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** L3: Monumentální moderní stadionový portál s rotačními turnikety a velkým znakem */
function Level3Gate({
  position,
  teamColor,
  secondaryColor,
  stadiumName,
}: {
  position: [number, number, number];
  teamColor: string;
  secondaryColor: string;
  stadiumName?: string | null;
}) {
  const concreteTex = useMemo(() => generateConcreteTexture("#E2E8F0", 2, 4), []);
  const signTex = useSignTexture(stadiumName || "STADION", teamColor, "#FFFFFF");

  return (
    <group position={position}>
      {/* 2 Monumentální nosné pilíře portálu z pohledového světlého betonu (spojují plot na x = ±4.0) */}
      {[-4.2, 4.2].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 2.6, 0]} castShadow>
            <boxGeometry args={[1.6, 5.2, 1.4]} />
            <meshStandardMaterial
              map={concreteTex?.map ?? undefined}
              bumpMap={concreteTex?.bumpMap ?? undefined}
              bumpScale={0.04}
              color="#E2E8F0"
              roughness={0.6}
            />
          </mesh>
          {/* Svislé designové LED lišty v barvě týmu na pilířích */}
          <mesh position={[0, 2.6, -0.72]}>
            <boxGeometry args={[0.22, 4.6, 0.05]} />
            <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={1.0} toneMapped={false} />
          </mesh>
          <mesh position={[0, 2.6, 0.72]}>
            <boxGeometry args={[0.22, 4.6, 0.05]} />
            <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={1.0} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Mohutné překlenovací těleso portálu (mostovka z bílého/stříbrného hliníku) */}
      <mesh position={[0, 4.8, 0]} castShadow>
        <boxGeometry args={[10.0, 1.2, 1.6]} />
        <meshStandardMaterial color="#F1F5F9" metalness={0.4} roughness={0.3} />
      </mesh>
      {/* Barevná dekorační linka na mostovce */}
      <mesh position={[0, 4.25, 0]}>
        <boxGeometry args={[10.02, 0.12, 1.62]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.5} />
      </mesh>

      {/* Uvítací světelný LED panel s názvem stadionu (Čelní strana k příchodu) */}
      <group position={[0, 4.8, -0.82]}>
        <mesh>
          <boxGeometry args={[8.4, 0.8, 0.06]} />
          <meshStandardMaterial color="#0F172A" />
        </mesh>
        {signTex && (
          <mesh position={[0, 0, -0.04]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[8.2, 0.7]} />
            <meshBasicMaterial map={signTex} />
          </mesh>
        )}
      </group>

      {/* Uvítací světelný LED panel i ze zadní strany směrem ze hřiště */}
      <group position={[0, 4.8, 0.82]}>
        <mesh>
          <boxGeometry args={[8.4, 0.8, 0.06]} />
          <meshStandardMaterial color="#0F172A" />
        </mesh>
        {signTex && (
          <mesh position={[0, 0, 0.04]}>
            <planeGeometry args={[8.2, 0.7]} />
            <meshBasicMaterial map={signTex} />
          </mesh>
        )}
      </group>

      {/* Masivní ocelový podstavec pod znak (propojuje mostovku a znak, žádná levitace!) */}
      <group position={[0, 5.4, 0]}>
        {/* Základna podstavce sedící na mostovce */}
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[2.4, 0.3, 0.8]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* 2 Šikmé ocelové vzpěry držící znak */}
        {[-0.7, 0.7].map((x, i) => (
          <mesh key={i} position={[x, 0.6, 0]} rotation={[0, 0, i === 0 ? 0.3 : -0.3]} castShadow>
            <boxGeometry args={[0.15, 0.9, 0.15]} />
            <meshStandardMaterial color="#475569" metalness={0.9} />
          </mesh>
        ))}
      </group>

      {/* Velký klubový 3D kruhový emblém pevně uchycený v rámu */}
      <group position={[0, 6.2, 0]}>
        {/* Rám znaku */}
        <mesh castShadow>
          <cylinderGeometry args={[0.85, 0.85, 0.16, 24]} />
          <meshStandardMaterial color="#334155" metalness={0.8} />
        </mesh>
        {/* Čelní výplň znaku v týmové barvě */}
        <mesh position={[0, 0, -0.09]} rotation={[0, Math.PI, 0]}>
          <cylinderGeometry args={[0.72, 0.72, 0.05, 24]} />
          <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.4} />
        </mesh>
        {/* Sekundární motiv */}
        <mesh position={[0, 0, -0.12]} rotation={[0, Math.PI, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.04]} />
          <meshStandardMaterial color={secondaryColor} />
        </mesh>
        {/* Zadní výplň znaku */}
        <mesh position={[0, 0, 0.09]}>
          <cylinderGeometry args={[0.72, 0.72, 0.05, 24]} />
          <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.12]}>
          <boxGeometry args={[0.3, 0.3, 0.04]} />
          <meshStandardMaterial color={secondaryColor} />
        </mesh>
      </group>

      {/* 4 Moderní elektronické turnikety pod portálem */}
      {[-2.5, -0.85, 0.85, 2.5].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          {/* Těleso turniketu v nerezové oceli */}
          <mesh position={[0, 0.65, 0]} castShadow>
            <boxGeometry args={[0.45, 1.3, 0.9]} />
            <meshStandardMaterial color="#E2E8F0" metalness={0.9} roughness={0.2} />
          </mesh>
          {/* Zelená LED kontrolka vstupu na čele */}
          <mesh position={[0, 1.2, -0.46]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={2.0} toneMapped={false} />
          </mesh>
          {/* Zelená LED kontrolka vstupu i vzadu */}
          <mesh position={[0, 1.2, 0.46]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={2.0} toneMapped={false} />
          </mesh>
          {/* Rotační turniketový kříž */}
          <mesh position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 4]}>
            <cylinderGeometry args={[0.03, 0.03, 0.75, 8]} />
            <meshStandardMaterial color="#94A3B8" metalness={0.95} />
          </mesh>
        </group>
      ))}

      {/* Moderní prosklená VIP pokladna na boku */}
      <group position={[-6.2, 0, 0]}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <boxGeometry args={[2.2, 3.2, 2.2]} />
          <meshStandardMaterial color="#E2E8F0" roughness={0.3} metalness={0.6} />
        </mesh>
        {/* Prosklená stěna čelem k příchodu */}
        <mesh position={[0, 1.4, -1.12]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.6, 1.4]} />
          <meshStandardMaterial color="#38BDF8" roughness={0.05} metalness={0.9} transparent opacity={0.85} />
        </mesh>
        {/* Lemování střechy pokladny v klubové barvě */}
        <mesh position={[0, 3.25, 0]}>
          <boxGeometry args={[2.3, 0.15, 2.3]} />
          <meshStandardMaterial color={teamColor} />
        </mesh>
      </group>
    </group>
  );
}
