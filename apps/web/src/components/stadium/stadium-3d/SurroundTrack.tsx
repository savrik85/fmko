"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { PITCH, type WeatherType, APRON_MARGIN, APRON_Y, PITCH_GRASS_MARGIN } from "./constants";
import { getSurroundSurfaceSet, generatePaverSurface, type SurroundSurfaceType } from "./grassTexture";

interface SurroundTrackProps {
  surroundSurface?: SurroundSurfaceType;
  teamColor?: string;
  secondaryColor?: string;
  standsLevel?: number;
  weather?: WeatherType;
  isMobile?: boolean;
}

const HALF_W = PITCH.width / 2; // 20
const HALF_D = PITCH.depth / 2; // 30

// Přesný 2.4m široký výběhový technický lem kolem lajn hřiště

const APRON_W = PITCH.width + APRON_MARGIN * 2;
const APRON_D = PITCH.depth + APRON_MARGIN * 2;
const HALF_APRON_W = APRON_W / 2;
const HALF_APRON_D = APRON_D / 2;

export function SurroundTrack({
  surroundSurface = "grass",
  teamColor = "#1E40AF",
  secondaryColor = "#FFFFFF",
  standsLevel = 0,
  weather,
  isMobile = false,
}: SurroundTrackProps) {
  const isSnow = weather === "snow";
  const isClay = surroundSurface === "cinders";
  const isPaved = surroundSurface === "paving";
  const isAstro = surroundSurface === "astro";
  const isClubCarpet = surroundSurface === "tartan";

  const surfaceSet = useMemo(
    () => getSurroundSurfaceSet(surroundSurface, isSnow, 8, 12, teamColor),
    [surroundSurface, isSnow, teamColor]
  );

  const paverSet = useMemo(
    () => generatePaverSurface(6, 6),
    []
  );

  /**
   * Rám výběhové zóny — vnější obdélník s dírou přesně pod hrací plochou.
   * UV se přemapují z metrů na 0–1, aby dlaždice měly stejné měřítko jako dřív.
   */
  const apronGeometry = useMemo(() => {
    const outer = new THREE.Shape();
    outer.moveTo(-HALF_APRON_W, -HALF_APRON_D);
    outer.lineTo(HALF_APRON_W, -HALF_APRON_D);
    outer.lineTo(HALF_APRON_W, HALF_APRON_D);
    outer.lineTo(-HALF_APRON_W, HALF_APRON_D);
    outer.closePath();

    // Díra je větší než hřiště o pruh trávy — povrch začíná až za ním.
    const hw = PITCH.width / 2 + PITCH_GRASS_MARGIN;
    const hd = PITCH.depth / 2 + PITCH_GRASS_MARGIN;
    const hole = new THREE.Path();
    hole.moveTo(-hw, -hd);
    hole.lineTo(-hw, hd);
    hole.lineTo(hw, hd);
    hole.lineTo(hw, -hd);
    hole.closePath();
    outer.holes.push(hole);

    const g = new THREE.ShapeGeometry(outer);
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + HALF_APRON_W) / APRON_W;
      uv[i * 2 + 1] = (pos.getY(i) + HALF_APRON_D) / APRON_D;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }, []);

  const curbColor = isSnow ? "#CBD5E1" : isClubCarpet ? "#F1F5F9" : "#71717A";

  // Pokud je výchozí tráva, nekreslíme nic (hřiště je v přirozeném terénu).
  //
  // POZOR: tenhle return musí zůstat POD všemi hooky. Když stál mezi nimi, volaly se
  // při trávě dva hooky a při dlaždicích tři — a React na změnu počtu hooků mezi
  // rendery spadne (#310). Projevilo se to až ve chvíli, kdy šlo povrch přepínat
  // zdarma tam a zpět: stránka stadionu spadla na bílou obrazovku.
  if (surroundSurface === "grass") {
    return null;
  }

  return (
    <group position={[0, 0, 0]}>
      {/* ─── Hlavní výběhová zóna kolem lajn hřiště ───
          Je to RÁM s dírou pod hrací plochou, ne celá deska.
          Původně šla deska i pod hřiště, takže dvě plochy pár tisícin od sebe
          soupeřily v hloubkovém testu a povrch prosvítal trávníkem. Ladit to
          rozestupem nešlo: větší mezera dělala viditelný schod, menší vracela
          prosvítání. S dírou se plochy nepřekrývají vůbec a problém nemůže
          vzniknout — zóna proto může ležet skoro v rovině s trávníkem. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, APRON_Y, 0]} receiveShadow>
        <primitive object={apronGeometry} attach="geometry" />
        <meshStandardMaterial
          map={surfaceSet.map}
          bumpMap={surfaceSet.bumpMap}
          bumpScale={isSnow ? 0.03 : isPaved ? 0.06 : isClay ? 0.07 : 0.04}
          roughness={isClubCarpet || isAstro ? 0.85 : 0.94}
        />
      </mesh>

      {/* ─── 1. ANTUKOVÝ / PÍSKOVÝ PÁS: Obrubník po obvodu ─── */}
      {isClay && (
        <ApronCurbs
          hw={HALF_APRON_W}
          hd={HALF_APRON_D}
          color={curbColor}
          thickness={0.12}
          height={0.03}
        />
      )}

      {/* ─── 2. ZÁMKOVÁ DLAŽBA: Chodníky a cesty v areálu k budovám ─── */}
      {isPaved && (
        <>
          <ApronCurbs
            hw={HALF_APRON_W}
            hd={HALF_APRON_D}
            color={curbColor}
            thickness={0.12}
            height={0.03}
          />
          {/* Dlážděné chodníky od vstupní brány k šatnám a hospodě */}
          <PavedPathways paverSet={paverSet} isSnow={isSnow} />
        </>
      )}

      {/* ─── 3. UMĚLÝ TRÁVNÍK: Bílé lemování technické zóny ─── */}
      {isAstro && (
        <ApronBoundaryLine
          hw={HALF_APRON_W - 0.06}
          hd={HALF_APRON_D - 0.06}
          color="#FFFFFF"
          isSnow={isSnow}
        />
      )}

      {/* ─── 4. KLUBOVÝ VIP KOBEREC: Klubové lemování & proužek střídaček ─── */}
      {isClubCarpet && (
        <>
          <ApronBoundaryLine
            hw={HALF_APRON_W - 0.06}
            hd={HALF_APRON_D - 0.06}
            color="#FFFFFF"
            isSnow={isSnow}
          />
          {/* Akcentní proužek pod střídačkami */}
          <mesh
            position={[-HALF_W - 1.2, 0.007, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[1.8, 14]} />
            <meshBasicMaterial color={secondaryColor || "#FFFFFF"} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Obrubníky po obvodu výběhové zóny */
function ApronCurbs({
  hw,
  hd,
  color,
  thickness,
  height,
}: {
  hw: number;
  hd: number;
  color: string;
  thickness: number;
  height: number;
}) {
  return (
    <group>
      {/* Západní a východní obrubník */}
      {[-hw, hw].map((x, i) => (
        <mesh key={`ew-${i}`} position={[x, height / 2, 0]} receiveShadow>
          <boxGeometry args={[thickness, height, hd * 2]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
      {/* Severní a jižní obrubník */}
      {[-hd, hd].map((z, i) => (
        <mesh key={`ns-${i}`} position={[0, height / 2, z]} receiveShadow>
          <boxGeometry args={[hw * 2, height, thickness]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Bílá / barevná lemovací linka technické zóny */
function ApronBoundaryLine({
  hw,
  hd,
  color,
  isSnow,
}: {
  hw: number;
  hd: number;
  color: string;
  isSnow: boolean;
}) {
  const lineW = 0.1;
  const lineY = 0.007;

  return (
    <group>
      {/* Západní a východní linka */}
      {[-hw, hw].map((x, i) => (
        <mesh key={`ew-${i}`} position={[x, lineY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[lineW, hd * 2]} />
          <meshBasicMaterial color={color} transparent opacity={isSnow ? 0.4 : 0.85} depthWrite={false} />
        </mesh>
      ))}
      {/* Severní a jižní linka */}
      {[-hd, hd].map((z, i) => (
        <mesh key={`ns-${i}`} position={[0, lineY, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[hw * 2, lineW]} />
          <meshBasicMaterial color={color} transparent opacity={isSnow ? 0.4 : 0.85} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Dlážděné chodníky k šatnám a hospodě při vybrané zámkové dlažbě */
function PavedPathways({ paverSet, isSnow }: { paverSet: any; isSnow: boolean }) {
  return (
    <group>
      {/* Chodník od vchodu k šatnám (severozápad) */}
      <mesh position={[-20, APRON_Y, -42]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 2.2]} />
        <meshStandardMaterial map={paverSet.map} bumpMap={paverSet.bumpMap} bumpScale={0.05} roughness={0.92} />
      </mesh>

      {/* Chodník k hospodě (jihovýchod) */}
      <mesh position={[20, APRON_Y, 42]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 2.2]} />
        <meshStandardMaterial map={paverSet.map} bumpMap={paverSet.bumpMap} bumpScale={0.05} roughness={0.92} />
      </mesh>
    </group>
  );
}
