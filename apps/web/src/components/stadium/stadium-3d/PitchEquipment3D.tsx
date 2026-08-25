"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PITCH, type WeatherType, type StadiumMode } from "./constants";

/**
 * Zvětšení techniky. Proti tribunám a stožárům byla v původní velikosti
 * z výchozího úhlu kamery sotva znatelná — pár pixelů.
 * Aplikuje se na kořenové skupiny jednotlivých kusů, takže mění velikost
 * geometrie, ne rozmístění.
 */
const EQUIP_SCALE = 1.75;

/**
 * Odstup od střídaček na západní postranní čáře.
 *
 * Střídačky stojí na x = -22,2 a z = ±7,5, mezi nimi je technická zóna. Nic
 * z údržbové techniky tam nesmí stát — čte se to jako překážka před střídačkou.
 * Platí pro VŠECHNY kusy u západní čáry, ne jen pro trysky.
 */
const DUGOUT_CLEARANCE = 18;

export interface PitchEquipment3DProps {
  changingRoomsPosition: [number, number];
  pitchHeating?: number;
  pitchIrrigation?: number;
  mowerLevel?: number;
  pitchMoisture?: number;
  isSnow?: boolean;
  weather?: WeatherType;
  mode?: StadiumMode;
  snowClearingOrdered?: boolean;
  isMobile?: boolean;
}

/**
 * Souhrnná 3D vizualizace veškeré techniky a vybavení pro údržbu trávníku:
 * 1. Zavlažování (konev -> hadice s navijákem -> sektorové postřikovače -> výsuvné trysky + meteo čidlo)
 * 2. Vyhřívání (nic -> paleta s termoplachtou a slámou -> elektro-rozvaděč -> výměníková stanice)
 * 3. Sekačky a lajnování (koza u kůlu -> ruční sekačka -> zahradní traktůrek -> profi sekačka + válec + lajnovačka)
 * 4. Úklid sněhu (hrabla na sníh, lopaty a bedna na posyp u kabin v zimním režimu)
 *
 * Bezpečně rozmístěno v hospodářském koutu u šaten a na postranních čarách bez kolizí se stávajícími prvky.
 */
export function PitchEquipment3D({
  changingRoomsPosition,
  pitchHeating = 0,
  pitchIrrigation = 0,
  mowerLevel = 2,
  pitchMoisture = 50,
  isSnow = false,
  weather,
  mode = "match_day",
  snowClearingOrdered = false,
  isMobile = false,
}: PitchEquipment3DProps) {
  const isTrainingDay = mode === "training_day";
  const isHotOrDry = weather === "sunny" || pitchMoisture < 40 || isTrainingDay;

  /**
   * Hospodářský kout NEleží na budově šaten, ale kus před ní směrem k hřišti.
   * Na původní pozici byla technika uvnitř půdorysu budovy, takže ji budova
   * z výchozího úhlu kamery celou zakrývala. Posun drží techniku venku z vápna
   * (X pod -22,4 je mimo výběhovou zónu) a zároveň mimo půdorys šaten.
   */
  const yardPos: [number, number] = [changingRoomsPosition[0] + 3, changingRoomsPosition[1] + 6];

  return (
    <group>
      {/* ── 1. Zavlažovací technika ── */}
      <PitchIrrigationEquipment
        crPos={yardPos}
        level={pitchIrrigation}
        isHotOrDry={isHotOrDry}
        isSnow={isSnow}
        isMobile={isMobile}
      />

      {/* ── 2. Vyhřívání trávníku ── */}
      <PitchHeatingEquipment
        crPos={yardPos}
        level={pitchHeating}
        isSnow={isSnow}
        isMobile={isMobile}
      />

      {/* ── 3. Sekačky, lajnovačka a pasoucí se koza ── */}
      <LawnMowerAndMaintenance
        crPos={yardPos}
        level={mowerLevel}
        isSnow={isSnow}
        isTrainingDay={isTrainingDay}
        isMobile={isMobile}
      />

      {/* ── 4. Úklid sněhu a zimní rekvizity ── */}
      {(isSnow || snowClearingOrdered) && (
        <SnowClearingEquipment crPos={yardPos} />
      )}
    </group>
  );
}

/* =========================================================================
   1. ZAVLAŽOVÁNÍ TRÁVNÍKU (pitch_irrigation Lv 0–3)
   ========================================================================= */

function PitchIrrigationEquipment({
  crPos,
  level,
  isHotOrDry,
  isSnow,
  isMobile,
}: {
  crPos: [number, number];
  level: number;
  isHotOrDry: boolean;
  isSnow: boolean;
  isMobile: boolean;
}) {
  const [crX, crZ] = crPos;

  if (level <= 0) {
    // Lv 0: Stará plechová konev u hospodářského rohu
    return <WateringCan position={[crX - 1.8, 0, crZ + 2.6]} />;
  }

  if (level === 1) {
    // Lv 1: Hadicový naviják na zdi šatny + hadice k postranní čáře
    return (
      <group>
        <GardenHoseReel position={[crX - 2.8, 0, crZ + 0.3]} />
        <GardenHoseRun crPos={crPos} />
      </group>
    );
  }

  if (level === 2) {
    // Lv 2: Sektorové postřikovače na trojnožkách na postranních čarách
    return (
      <group>
        <GardenHoseReel position={[crX - 2.8, 0, crZ + 0.3]} />
        {/* Západní čára: posunuto mimo technickou zónu. Na z = 0 stál stojan
            půl druhého metru před střídačkami (x = -22,2, z = ±7,5). */}
        <TripodSprinkler
          position={[-20.6, 0, -18]}
          spraying={isHotOrDry && !isSnow && !isMobile}
        />
        {/* Tryska i vodní vějíř míří v modelu vždy na +X. Bez otočení o 180°
            by postřikovač u pravé postranní čáry kropil mimo hřiště. */}
        <TripodSprinkler
          position={[20.6, 0, 0]}
          rotation={[0, Math.PI, 0]}
          spraying={isHotOrDry && !isSnow && !isMobile}
        />
      </group>
    );
  }

  // Lv 3: Výsuvné trysky v trávníku + meteostanice s čidlem vlhkosti
  return (
    <group>
      <PopUpSprinklerOutlets />
      {/* Za střídačkami, ne mezi nimi — na z = -6,5 stálo metr od domácí lavičky. */}
      <SoilMoistureSensorStation position={[-20.6, 0, -(DUGOUT_CLEARANCE + 4)]} />
    </group>
  );
}

/** Plechová zinková konev (Lv 0) */
function WateringCan({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.4, 0]}>
      {/* Tělo konve */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.16, 0.44, 10]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Kropící hubice */}
      <mesh position={[0.18, 0.28, 0]} rotation={[0, 0, -0.65]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.38, 8]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Kropítko (růžice) */}
      <mesh position={[0.32, 0.44, 0]} rotation={[0, 0, -0.65]} castShadow>
        <cylinderGeometry args={[0.07, 0.03, 0.06, 10]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Horní držadlo / ucho */}
      <mesh position={[-0.04, 0.46, 0]} rotation={[0, 0, 0.1]} castShadow>
        <torusGeometry args={[0.16, 0.015, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#64748B" metalness={0.6} />
      </mesh>
    </group>
  );
}

/** Zahradní hadicový buben / naviják (Lv 1, 2) */
function GardenHoseReel({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.8, 0]}>
      {/* Ocelový stojan */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.45, 0.8, 0.45]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Buben s namotanou žlutou hadicí */}
      <mesh position={[0, 0.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.35, 16]} />
        <meshStandardMaterial color="#EAB308" roughness={0.6} />
      </mesh>
      {/* Boční kotouče bubnu */}
      <mesh position={[-0.18, 0.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.02, 16]} />
        <meshStandardMaterial color="#059669" roughness={0.4} />
      </mesh>
      <mesh position={[0.18, 0.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.02, 16]} />
        <meshStandardMaterial color="#059669" roughness={0.4} />
      </mesh>
      {/* Klika na navíjení */}
      <mesh position={[0.22, 0.55, 0]} rotation={[0, 0, 0.4]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.16, 6]} />
        <meshStandardMaterial color="#1E293B" metalness={0.8} />
      </mesh>
    </group>
  );
}

/** Rozvinutá hadice vedoucí od bubnu k postranní čáře (Lv 1) */
function GardenHoseRun({ crPos }: { crPos: [number, number] }) {
  const [crX, crZ] = crPos;
  return (
    <group position={[0, 0.06, 0]}>
      {/* Hadice v trávě */}
      <mesh position={[crX - 1.2, 0, crZ + 1.6]} rotation={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 3.2, 6]} />
        <meshStandardMaterial color="#EAB308" roughness={0.5} />
      </mesh>
      {/* Mosazná postřikovací pistole odložená na zemi u klandru */}
      <mesh position={[-20.7, 0.05, -(DUGOUT_CLEARANCE + 1)]} rotation={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.015, 0.28, 8]} />
        <meshStandardMaterial color="#D97706" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** Sektorový pulzní postřikovač na trojnožce (Lv 2) */
function TripodSprinkler({
  position,
  rotation,
  spraying = false,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  spraying?: boolean;
}) {
  const sprayRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!sprayRef.current || !spraying) return;
    const t = clock.elapsedTime * 2.5;
    sprayRef.current.rotation.y = Math.sin(t) * 0.9;
  });

  return (
    <group scale={EQUIP_SCALE} position={position} rotation={rotation}>
      {/* 3 Nohy trojnožky */}
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * 0.22, 0.35, Math.sin(angle) * 0.22]}
          rotation={[0.35 * Math.sin(angle), 0, -0.35 * Math.cos(angle)]}
          castShadow
        >
          <cylinderGeometry args={[0.015, 0.015, 0.75, 6]} />
          <meshStandardMaterial color="#475569" metalness={0.7} />
        </mesh>
      ))}

      {/* Středové tělo postřikovače */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.18, 8]} />
        <meshStandardMaterial color="#B45309" metalness={0.85} roughness={0.3} />
      </mesh>

      {/* Výkyvná mosazná tryska */}
      <mesh position={[0.05, 0.8, 0]} rotation={[0, 0, -0.4]} castShadow>
        <cylinderGeometry args={[0.02, 0.015, 0.12, 8]} />
        <meshStandardMaterial color="#D97706" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Animovaný vodní aerosol / vějíř kapek při kropení */}
      {spraying && (
        <group ref={sprayRef} position={[0.08, 0.82, 0]}>
          {Array.from({ length: 8 }).map((_, i) => {
            const dist = 1.2 + i * 0.55;
            const dropY = 0.3 - (i * i) * 0.012;
            const dropSize = 0.05 + i * 0.025;
            return (
              <mesh key={i} position={[dist, dropY, (Math.sin(i * 1.5) * dist) * 0.12]}>
                <sphereGeometry args={[dropSize, 6, 6]} />
                <meshBasicMaterial
                  color="#BAE6FD"
                  transparent
                  opacity={0.45 - i * 0.04}
                  depthWrite={false}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}

/** Zapuštěné trysky automatického zavlažování v trávníku (Lv 3) */
function PopUpSprinklerOutlets() {
  const HALF_W = PITCH.width / 2;
  const HALF_D = PITCH.depth / 2;

  /**
   * Pozice trysek po obvodu hrací plochy, v těsné blízkosti lajn.
   *
   * Západní strana (x záporné) vynechává střed: na `z = 0` stála tryska přímo
   * v technické zóně mezi střídačkami (ty jsou na x = -22,2 a z = ±7,5) a četlo
   * se to jako tryska před střídačkou. Krajní pozice jsou proto odsunuté na
   * z = ±18, mimo obě střídačky i prostor mezi nimi.
   *
   * Východní strana střídačky nemá, takže si střed nechává a pokrytí zůstává celé.
   */
  const nozzlePositions: Array<[number, number]> = [
    // západ — kolem střídaček
    [-HALF_W - 0.4, -HALF_D + 4],
    [-HALF_W - 0.4, -DUGOUT_CLEARANCE],
    [-HALF_W - 0.4, DUGOUT_CLEARANCE],
    [-HALF_W - 0.4, HALF_D - 4],
    // východ — bez překážek
    [HALF_W + 0.4, -HALF_D + 4],
    [HALF_W + 0.4, 0],
    [HALF_W + 0.4, HALF_D - 4],
    // za brankami
    [0, -HALF_D - 0.4],
    [0, HALF_D + 0.4],
  ];

  return (
    <group>
      {nozzlePositions.map(([x, z], i) => (
        <group key={i} position={[x, 0.052, z]}>
          {/* Zelená kruhová krytka splývající s trávníkem */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.12, 12]} />
            <meshStandardMaterial color="#166534" roughness={0.8} />
          </mesh>
          {/* Mosazný střed trysky */}
          <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.04, 8]} />
            <meshStandardMaterial color="#CA8A04" metalness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Meteostanička s digitálním čidlem půdní vlhkosti (Lv 3) */
function SoilMoistureSensorStation({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.3, 0]}>
      {/* Nerezový stojan */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 1.2, 8]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Patka v zemi */}
      <mesh position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 10]} />
        <meshStandardMaterial color="#475569" metalness={0.7} />
      </mesh>
      {/* Solární minipanel nahoře */}
      <mesh position={[0, 1.22, 0]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[0.22, 0.02, 0.28]} />
        <meshStandardMaterial color="#0F172A" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* Digitální řídicí jednotka (skříňka s displejem) */}
      <mesh position={[0, 0.85, 0.06]} castShadow>
        <boxGeometry args={[0.18, 0.26, 0.12]} />
        <meshStandardMaterial color="#334155" roughness={0.4} />
      </mesh>
      {/* Zelený LED / displej */}
      <mesh position={[0, 0.88, 0.122]}>
        <planeGeometry args={[0.1, 0.07]} />
        <meshBasicMaterial color="#22C55E" />
      </mesh>
      {/* Půdní sonda (tyčka zapíchnutá do trávníku) */}
      <mesh position={[0.22, 0.15, 0.1]} rotation={[0, 0, 0.1]}>
        <cylinderGeometry args={[0.012, 0.012, 0.3, 6]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.9} />
      </mesh>
    </group>
  );
}

/* =========================================================================
   2. VYHŘÍVÁNÍ TRÁVNÍKU (pitch_heating Lv 0–3)
   ========================================================================= */

function PitchHeatingEquipment({
  crPos,
  level,
  isSnow,
}: {
  crPos: [number, number];
  level: number;
  isSnow: boolean;
  isMobile: boolean;
}) {
  const [crX, crZ] = crPos;

  if (level <= 0) return null;

  if (level === 1) {
    // Lv 1: Dřevěná paleta se složenou termoplachtou a balíky slámy
    return (
      <group scale={EQUIP_SCALE} position={[crX - 4.2, 0, crZ - 1.8]}>
        <ThermalTarpOnPallet isSnow={isSnow} />
        <StrawBales position={[1.4, 0, 0.2]} isSnow={isSnow} />
      </group>
    );
  }

  if (level === 2) {
    // Lv 2: Pilířový elektro-rozvaděč s bleskem + chráničky do země
    return <HeatingDistributionBox position={[crX - 3.8, 0, crZ - 1.6]} />;
  }

  // Lv 3: Moderní venkovní výměníková stanice / kogenerační modul
  return <IndustrialHeatingPlant position={[crX - 4.5, 0, crZ - 1.8]} isSnow={isSnow} />;
}

/** Složená termoplachta na dřevěné europaletě (Lv 1) */
function ThermalTarpOnPallet({ isSnow }: { isSnow?: boolean }) {
  return (
    <group rotation={[0, 0.2, 0]}>
      {/* Dřevěná europaleta */}
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.14, 0.9]} />
        <meshStandardMaterial color="#A16207" roughness={0.9} />
      </mesh>
      {/* Složená geotextilní bílo-stříbrná plachta */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 0.42, 0.78]} />
        <meshStandardMaterial color="#E2E8F0" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* Černé stahovací popruhy */}
      {[-0.35, 0.35].map((x, i) => (
        <mesh key={i} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.04, 0.44, 0.8]} />
          <meshStandardMaterial color="#0F172A" />
        </mesh>
      ))}
      {isSnow && (
        <mesh position={[0, 0.58, 0]}>
          <boxGeometry args={[1.18, 0.05, 0.8]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

/** Žluté hranaté balíky slámy (Lv 1) */
function StrawBales({ position, isSnow }: { position: [number, number, number]; isSnow?: boolean }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, -0.35, 0]}>
      {/* Spodní dva balíky */}
      <mesh position={[0, 0.22, -0.32]} castShadow receiveShadow>
        <boxGeometry args={[0.85, 0.44, 0.55]} />
        <meshStandardMaterial color="#CA8A04" roughness={0.95} />
      </mesh>
      <mesh position={[0.05, 0.22, 0.3]} castShadow receiveShadow>
        <boxGeometry args={[0.85, 0.44, 0.55]} />
        <meshStandardMaterial color="#D97706" roughness={0.95} />
      </mesh>
      {/* Horní balík napříč */}
      <mesh position={[0, 0.64, 0]} rotation={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.85, 0.42, 0.55]} />
        <meshStandardMaterial color="#EAB308" roughness={0.95} />
      </mesh>
      {/* Sníh na horním balíku */}
      {isSnow && (
        <mesh position={[0, 0.86, 0]} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.88, 0.04, 0.58]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

/** Venkovní pilířový elektro-rozvaděč s bleskem (Lv 2) */
function HeatingDistributionBox({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.5, 0]}>
      {/* Betonový sokl v zemi */}
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.3, 0.55]} />
        <meshStandardMaterial color="#64748B" roughness={0.9} />
      </mesh>
      {/* Tělo šedé pilířové skříně */}
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 1.1, 0.45]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Stříška se spádem */}
      <mesh position={[0, 1.43, 0]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.84, 0.06, 0.52]} />
        <meshStandardMaterial color="#64748B" metalness={0.5} />
      </mesh>
      {/* Žlutý výstražný štítek s bleskem */}
      <mesh position={[0, 0.95, 0.23]}>
        <planeGeometry args={[0.18, 0.18]} />
        <meshStandardMaterial color="#FACC15" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.95, 0.232]}>
        <planeGeometry args={[0.08, 0.12]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      {/* Flexibilní chráničky kabelů vedoucí do země k hřišti */}
      {[-0.22, 0.22].map((x, i) => (
        <mesh key={i} position={[x, 0.15, 0.32]} rotation={[0.8, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.4, 8]} />
          <meshStandardMaterial color="#EAB308" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Průmyslová kompaktní výměníková stanice (Lv 3) */
function IndustrialHeatingPlant({
  position,
  isSnow,
}: {
  position: [number, number, number];
  isSnow?: boolean;
}) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.4, 0]}>
      {/* Masivní betonový základ */}
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.3, 1.4]} />
        <meshStandardMaterial color="#475569" roughness={0.9} />
      </mesh>
      {/* Nerezová průmyslová skříň */}
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.3, 1.1]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Žebrování ventilátoru / sání na boku */}
      <mesh position={[0.76, 1.0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshStandardMaterial color="#1E293B" metalness={0.7} />
      </mesh>
      {/* Nerezový kouřovod / komínek */}
      <mesh position={[-0.45, 1.9, -0.25]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.8, 12]} />
        <meshStandardMaterial color="#E2E8F0" metalness={0.95} roughness={0.15} />
      </mesh>
      {/* Manometry na čelní stěně */}
      {[-0.3, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 1.2, 0.56]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.02, 12]} />
          <meshStandardMaterial color="#F8FAFC" metalness={0.6} />
        </mesh>
      ))}
      {/* Izolované potrubí do země */}
      <mesh position={[0, 0.35, 0.65]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.35, 10]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.8} />
      </mesh>
      {isSnow && (
        <mesh position={[0, 1.62, 0]}>
          <boxGeometry args={[1.54, 0.04, 1.14]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

/* =========================================================================
   3. SEKAČKY, LAJNOVÁNÍ A KOZA (mower Lv 0–3)
   ========================================================================= */

function LawnMowerAndMaintenance({
  crPos,
  level,
  isMobile,
}: {
  crPos: [number, number];
  level: number;
  isSnow: boolean;
  isTrainingDay: boolean;
  isMobile: boolean;
}) {
  const [crX, crZ] = crPos;

  if (level <= 0) {
    // Lv 0: "Trávu spase sousedovic koza" — koza uvázaná u kůlu v rohu za klandrem
    return <VillageGoat position={[crX - 6.5, 0, crZ + 3.8]} isMobile={isMobile} />;
  }

  if (level === 1) {
    // Lv 1: "Ojetá sekačka po Pepovi" — červená benzínová ruční sekačka
    return <PushLawnMower position={[crX - 3.2, 0, crZ + 1.2]} />;
  }

  if (level === 2) {
    // Lv 2: "Zahradní traktůrek" — zelený rider
    return <RideOnTractor position={[crX - 3.5, 0, crZ + 1.2]} />;
  }

  // Lv 3: "Profi sekačka, válec a značkovač lajn"
  return (
    <group>
      <ProCylinderMower position={[crX - 3.8, 0, crZ + 1.4]} />
      <HeavyLawnRoller position={[crX - 5.4, 0, crZ + 0.4]} />
      <LineMarkerCart position={[crX - 2.2, 0, crZ + 1.8]} />
    </group>
  );
}

/** Vesnická koza pasoucí se u dřevěného kůlu (Lv 0) */
function VillageGoat({
  position,
  isMobile,
}: {
  position: [number, number, number];
  isMobile?: boolean;
}) {
  const headRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!headRef.current || isMobile) return;
    const t = clock.elapsedTime * 1.8;
    headRef.current.rotation.x = 0.2 + Math.sin(t) * 0.12;
  });

  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 1.1, 0]}>
      {/* Dřevěný kůlek zatlučený v zemi */}
      <mesh position={[-0.9, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.5, 8]} />
        <meshStandardMaterial color="#78350F" roughness={0.9} />
      </mesh>
      {/* Kovový řetízek ke koze */}
      <mesh position={[-0.45, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.9, 6]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.8} />
      </mesh>

      {/* Tělo kozy (bílo-hnědé fleky) */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.85, 0.45, 0.42]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.9} />
      </mesh>
      {/* Hnědý flek na těle */}
      <mesh position={[0.1, 0.56, 0.215]}>
        <planeGeometry args={[0.35, 0.28]} />
        <meshStandardMaterial color="#92400E" roughness={0.9} />
      </mesh>

      {/* 4 Nohy */}
      {[[-0.28, -0.14], [0.28, -0.14], [-0.28, 0.14], [0.28, 0.14]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} castShadow>
          <cylinderGeometry args={[0.035, 0.028, 0.45, 6]} />
          <meshStandardMaterial color="#F1F5F9" roughness={0.85} />
        </mesh>
      ))}

      {/* Krk a hlava (animované žvýkání trávy) */}
      <group ref={headRef} position={[0.45, 0.65, 0]}>
        {/* Krk */}
        <mesh position={[0.08, 0.12, 0]} rotation={[0, 0, -0.5]} castShadow>
          <cylinderGeometry args={[0.09, 0.12, 0.32, 6]} />
          <meshStandardMaterial color="#F8FAFC" />
        </mesh>
        {/* Hlava */}
        <mesh position={[0.2, 0.22, 0]} castShadow>
          <boxGeometry args={[0.28, 0.2, 0.18]} />
          <meshStandardMaterial color="#F8FAFC" />
        </mesh>
        {/* Rohy */}
        {[-0.06, 0.06].map((z, i) => (
          <mesh key={i} position={[0.16, 0.35, z]} rotation={[-0.4 * Math.sign(z), 0, -0.5]} castShadow>
            <cylinderGeometry args={[0.015, 0.025, 0.22, 6]} />
            <meshStandardMaterial color="#78350F" roughness={0.8} />
          </mesh>
        ))}
        {/* Zvonící rolnička na krku */}
        <mesh position={[0.1, 0.02, 0]} castShadow>
          <sphereGeometry args={[0.035, 6, 6]} />
          <meshStandardMaterial color="#CA8A04" metalness={0.9} />
        </mesh>
      </group>

      {/* Krátký zvednutý ocásek */}
      <mesh position={[-0.44, 0.72, 0]} rotation={[0, 0, 0.6]} castShadow>
        <cylinderGeometry args={[0.025, 0.015, 0.16, 6]} />
        <meshStandardMaterial color="#F8FAFC" />
      </mesh>
    </group>
  );
}

/** Klasická ruční benzínová sekačka po Pepovi (Lv 1) */
function PushLawnMower({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.5, 0]}>
      {/* Červené šasi sekačky */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.16, 0.75]} />
        <meshStandardMaterial color="#DC2626" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Černý motor nahoře */}
      <mesh position={[0, 0.36, 0.05]} castShadow>
        <cylinderGeometry args={[0.14, 0.15, 0.22, 10]} />
        <meshStandardMaterial color="#1E293B" metalness={0.8} />
      </mesh>
      {/* Černý sběrný koš vzadu */}
      <mesh position={[0, 0.25, -0.42]} castShadow>
        <boxGeometry args={[0.48, 0.26, 0.38]} />
        <meshStandardMaterial color="#111827" roughness={0.9} />
      </mesh>
      {/* 4 Černá kolečka */}
      {[[-0.3, 0.25], [0.3, 0.25], [-0.3, -0.25], [0.3, -0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.1, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.06, 10]} />
          <meshStandardMaterial color="#18181B" roughness={0.9} />
        </mesh>
      ))}
      {/* Ocelové madlo / rukojeť */}
      <mesh position={[0, 0.65, -0.55]} rotation={[-0.6, 0, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.9, 6]} />
        <meshStandardMaterial color="#D1D5DB" metalness={0.9} />
      </mesh>
    </group>
  );
}

/** Zelený zahradní traktůrek / rider (Lv 2) */
function RideOnTractor({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.6, 0]}>
      {/* Tělo traktůrku */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.45, 1.7]} />
        <meshStandardMaterial color="#15803D" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Sedadlo řidiče */}
      <mesh position={[0, 0.75, -0.25]} castShadow>
        <boxGeometry args={[0.5, 0.35, 0.45]} />
        <meshStandardMaterial color="#1F2937" />
      </mesh>
      {/* Žlutý volant */}
      <mesh position={[0, 0.85, 0.25]} rotation={[0.4, 0, 0]} castShadow>
        <torusGeometry args={[0.15, 0.02, 6, 12]} />
        <meshStandardMaterial color="#FACC15" />
      </mesh>
      {/* 4 Kola */}
      {[[-0.55, 0.6], [0.55, 0.6], [-0.55, -0.6], [0.55, -0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.25, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.25, 0.25, 0.2, 10]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      {/* Žací ústrojí dole */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[1.2, 0.15, 0.8]} />
        <meshStandardMaterial color="#374151" metalness={0.6} />
      </mesh>
    </group>
  );
}

/** Profesionální vřetenová sekačka (Lv 3) */
function ProCylinderMower({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.4, 0]}>
      {/* Hlavní masivní červeno-černé tělo */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.35, 1.1]} />
        <meshStandardMaterial color="#B91C1C" roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Široký přední vřetenový válec */}
      <mesh position={[0, 0.18, 0.52]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 1.05, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Zadní hnací válec */}
      <mesh position={[0, 0.16, -0.45]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.9, 14]} />
        <meshStandardMaterial color="#0F172A" roughness={0.8} />
      </mesh>
      {/* Řídicí madlo s páčkami */}
      <mesh position={[0, 0.82, -0.62]} rotation={[-0.55, 0, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 1.0, 8]} />
        <meshStandardMaterial color="#1E293B" metalness={0.8} />
      </mesh>
    </group>
  );
}

/** Těžký zelený trávníkový válec s ojí (Lv 3) */
function HeavyLawnRoller({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, -0.2, 0]}>
      {/* Ocelový válec */}
      <mesh position={[0, 0.32, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.32, 1.1, 16]} />
        <meshStandardMaterial color="#15803D" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Ocelový rám s ojí opřenou o zem */}
      <mesh position={[0, 0.32, 0.6]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[0.95, 0.04, 1.2]} />
        <meshStandardMaterial color="#1E293B" metalness={0.7} />
      </mesh>
      {/* Příčné držadlo oje */}
      <mesh position={[0, 0.65, 1.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.75, 8]} />
        <meshStandardMaterial color="#D1D5DB" metalness={0.8} />
      </mesh>
    </group>
  );
}

/** Dvoukolový vápenný vozík na lajnování čar s křídou (Lv 3) */
function LineMarkerCart({ position }: { position: [number, number, number] }) {
  return (
    <group scale={EQUIP_SCALE} position={position} rotation={[0, 0.85, 0]}>
      {/* Bílá násypka na křídu/vápno */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[0.42, 0.36, 0.42]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.6} />
      </mesh>
      {/* Dvě tenká boční kola */}
      {[-0.24, 0.24].map((x, i) => (
        <mesh key={i} position={[x, 0.16, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.03, 12]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}
      {/* Výpustný váleček na křídu dole */}
      <mesh position={[0, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.12, 10]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.9} />
      </mesh>
      {/* Dlouhá vodicí rukojeť */}
      <mesh position={[0, 0.72, -0.4]} rotation={[-0.7, 0, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.95, 6]} />
        <meshStandardMaterial color="#D1D5DB" metalness={0.8} />
      </mesh>
    </group>
  );
}

/* =========================================================================
   4. ÚKLID SNĚHU A ZIMNÍ PROVOZ
   ========================================================================= */

function SnowClearingEquipment({ crPos }: { crPos: [number, number] }) {
  const [crX, crZ] = crPos;
  return (
    <group scale={EQUIP_SCALE} position={[crX - 2.0, 0, crZ - 1.2]}>
      {/* Oranžová bedna na zimní posyp (sůl a štěrk) */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.6, 0.65]} />
        <meshStandardMaterial color="#EA580C" roughness={0.5} />
      </mesh>
      {/* Černé šikmé víko bedny */}
      <mesh position={[0, 0.63, 0]} rotation={[0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.94, 0.06, 0.68]} />
        <meshStandardMaterial color="#1E293B" roughness={0.7} />
      </mesh>
      {/* 2 Hrabla na sníh opřená o zeď */}
      {[-0.2, 0.2].map((x, i) => (
        <group key={i} position={[x + 0.6, 0, 0.15]} rotation={[0.2, 0.15 * (i - 0.5), -0.1]}>
          {/* Dřevěná násada */}
          <mesh position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.018, 0.018, 1.5, 6]} />
            <meshStandardMaterial color="#A16207" roughness={0.9} />
          </mesh>
          {/* Hliníková/plastová široká lžíce hrabla */}
          <mesh position={[0, 0.18, 0]} castShadow>
            <boxGeometry args={[0.55, 0.35, 0.02]} />
            <meshStandardMaterial color="#CBD5E1" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
