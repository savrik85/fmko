"use client";

import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Pitch } from "./Pitch";
import { Stand } from "./Stand";
import { Building } from "./Building";
import { Parking } from "./Parking";
import { Fence } from "./Fence";
import { Surroundings } from "./Surroundings";
import { StadiumSign } from "./StadiumSign";
import { AdBoards } from "./AdBoards";
import { Scoreboard } from "./Scoreboard";
import { TeamFlag } from "./TeamFlag";
import { StandRoof, UltrasSector } from "./StadiumExtras";
import { Floodlights } from "./Floodlights";
import { EntranceGate } from "./EntranceGate";
import { Dugouts } from "./Dugouts";
import { VillageVibe } from "./VillageVibe";
import { LightingAndAtmosphere } from "./LightingAndAtmosphere";
import { WeatherEffects } from "./WeatherEffects";
import { CameraController } from "./CameraController";
import {
  getStadiumLayout,
  VIEWPOINTS,
  WEATHER_OPTIONS,
  type TimeOfDay,
  type CameraViewpoint,
  type WeatherType,
} from "./constants";

export interface Stadium3DCustomization {
  fenceColor?: string | null;
  standColor?: string | null;
  seatColor?: string | null;
  roofColor?: string | null;
  accentColor?: string | null;
  scoreboardLevel?: number;
  flagSize?: number;
  ultrasText?: string | null;
  ultrasBannerColor?: string | null;
  ultrasTextColor?: string | null;
  flagColor?: string | null;
}

export interface LastMatchScore {
  homeScore: number;
  awayScore: number;
  homeName: string;
  awayName: string;
}

interface Stadium3DProps {
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  teamColor: string;
  secondaryColor?: string;
  badgePattern?: string;
  badgeInitials?: string;
  badgeSymbol?: string | null;
  badgePrimary?: string | null;
  badgeSecondary?: string | null;
  stadiumName?: string | null;
  sponsors?: string[];
  customization?: Stadium3DCustomization;
  lastMatch?: LastMatchScore | null;
  initialTimeOfDay?: TimeOfDay;
  initialViewpoint?: CameraViewpoint;
  initialWeather?: WeatherType;
  weather?: WeatherType;
  showControls?: boolean;
  defaultControlsVisible?: boolean;
  reserveCloseButtonSpace?: boolean;
}

export function Stadium3D({
  pitchCondition,
  pitchType,
  facilities,
  teamColor,
  secondaryColor = "#ffffff",
  badgePattern,
  badgeInitials,
  badgeSymbol,
  badgePrimary,
  badgeSecondary,
  stadiumName,
  sponsors,
  customization,
  lastMatch,
  initialTimeOfDay = "day",
  initialViewpoint = "overview",
  initialWeather = "sunny",
  weather: weatherProp,
  showControls = true,
  defaultControlsVisible = false,
  reserveCloseButtonSpace = false,
}: Stadium3DProps) {
  const f = facilities;
  const layout = getStadiumLayout(f.stands ?? 0);
  const cust = customization ?? {};
  const standColor = cust.standColor ?? teamColor;
  const seatColor = cust.seatColor ?? teamColor;
  const accentColor = cust.accentColor ?? "#C9A84C";
  const fenceColor = cust.fenceColor ?? null;
  const roofColor = cust.roofColor ?? null;

  // Stav načtení scény a přechodové toasty
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Stav zobrazení ovládacích prvků (defaultně skryté)
  const [controlsVisible, setControlsVisible] = useState(defaultControlsVisible);

  // Stav denní doby, počasí a kamerového pohledu
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initialTimeOfDay);
  const [weather, setWeather] = useState<WeatherType>(weatherProp ?? initialWeather);
  const [viewpoint, setViewpoint] = useState<CameraViewpoint>(initialViewpoint);

  useEffect(() => {
    if (weatherProp) {
      setWeather(weatherProp);
    }
  }, [weatherProp]);

  // Pomocné funkce pro přepínání s okamžitou odezvou (toast)
  const handleWeatherChange = (wKey: WeatherType) => {
    if (wKey === weather) return;
    setWeather(wKey);
    setStatusToast(`${WEATHER_OPTIONS[wKey].icon} Nastavuji ${WEATHER_OPTIONS[wKey].label.toLowerCase()}...`);
    setTimeout(() => setStatusToast(null), 900);
  };

  const handleTimeOfDayChange = (tKey: TimeOfDay) => {
    if (tKey === timeOfDay) return;
    setTimeOfDay(tKey);
    const labels = { day: "☀️ Slunečný den", sunset: "🌅 Západ slunce", night: "🌙 Noční osvětlení" };
    setStatusToast(`Nastavuji ${labels[tKey]}...`);
    setTimeout(() => setStatusToast(null), 900);
  };

  const handleViewpointChange = (vpKey: CameraViewpoint) => {
    if (vpKey === viewpoint) return;
    setViewpoint(vpKey);
    setStatusToast(`${VIEWPOINTS[vpKey].icon} Kamera: ${VIEWPOINTS[vpKey].label}`);
    setTimeout(() => setStatusToast(null), 900);
  };

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className="relative w-full h-full select-none">
      {/* Decentní úvodní indikátor načítání 3D scény */}
      {!isSceneReady && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#141b26] text-white transition-opacity duration-300 pointer-events-none select-none">
          <div className="relative mb-3 flex items-center justify-center">
            <div className="w-10 h-10 border-3 border-pitch-500/30 border-t-pitch-400 rounded-full animate-spin shadow-lg" />
            <span className="absolute text-sm">🏟️</span>
          </div>
          <div className="font-heading font-extrabold text-sm tracking-wide text-white/90">
            Načítám 3D areál...
          </div>
          <div className="text-[11px] text-white/50 mt-0.5">Připravuji hřiště a atmosféru</div>
        </div>
      )}

      {/* Decentní plovoucí stavový toast při přepínání počasí/kamer */}
      {isSceneReady && statusToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2 bg-black/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white text-xs font-heading font-bold shadow-2xl">
            <span className="w-1.5 h-1.5 rounded-full bg-pitch-400 animate-pulse" />
            <span>{statusToast}</span>
          </div>
        </div>
      )}

      {/* 3D Canvas scéna */}
      <Canvas
        shadows={!isMobile}
        camera={{ position: [55, 45, 55], fov: 35 }}
        frameloop="always"
        dpr={isMobile ? [1, 1.25] : [1, 1.75]}
        onCreated={() => {
          setTimeout(() => setIsSceneReady(true), 120);
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: timeOfDay === "night" ? 1.15 : timeOfDay === "sunset" ? 1.05 : 0.95,
        }}
      >
        {/* Dynamická obloha a osvětlení (den, západ, noc + počasí) */}
        <LightingAndAtmosphere timeOfDay={timeOfDay} weather={weather} isMobile={isMobile} />

        {/* 3D efekty počasí (déšť, sníh, vítr, blesky, mraky) */}
        <WeatherEffects weather={weather} timeOfDay={timeOfDay} isMobile={isMobile} />

        {/* Plynulý kontrolér kamery a filmový oblet */}
        <CameraController viewpoint={viewpoint} isMobile={isMobile} />

        <Suspense fallback={null}>
          {/* Okolí, terénní kopečky a vzdálená vesnička */}
          <Surroundings reduceTrees={isMobile} timeOfDay={timeOfDay} />

          {/* Vesnický život v areálu: zahrádka, pivo, kouřící gril, kola, sekačka, zábradlí */}
          <VillageVibe
            timeOfDay={timeOfDay}
            pubPosition={layout.buildings.refreshments}
            changingRoomsPosition={layout.buildings.changing_rooms}
            isMobile={isMobile}
          />

          {/* Osvětlovací stožáry v rozích hřiště */}
          <Floodlights level={f.lighting ?? 0} standsLevel={f.stands ?? 0} timeOfDay={timeOfDay} isMobile={isMobile} />

          {/* Střídačky u postranní čáry */}
          <Dugouts teamColor={teamColor} secondaryColor={secondaryColor} />

          {/* Obvodový plot */}
          <Fence level={f.fence ?? 0} bounds={layout.fence} colorOverride={fenceColor} />

          {/* Trávník, čáry, praporky, míč, branky */}
          <Pitch condition={pitchCondition} pitchType={pitchType} />

          {/* Tribuny okolo hřiště */}
          <Stand
            side="north"
            level={f.stands ?? 0}
            teamColor={teamColor}
            standColor={standColor}
            seatColor={seatColor}
            accentColor={accentColor}
            reducedDetail={isMobile}
          />
          <Stand
            side="south"
            level={f.stands ?? 0}
            teamColor={teamColor}
            standColor={standColor}
            seatColor={seatColor}
            accentColor={accentColor}
            reducedDetail={isMobile}
          />
          {(f.stands ?? 0) >= 2 && (
            <Stand
              side="east"
              level={f.stands}
              teamColor={teamColor}
              standColor={standColor}
              seatColor={seatColor}
              accentColor={accentColor}
              reducedDetail={isMobile}
            />
          )}
          {(f.stands ?? 0) >= 2 && (
            <Stand
              side="west"
              level={f.stands}
              teamColor={teamColor}
              standColor={standColor}
              seatColor={seatColor}
              accentColor={accentColor}
              reducedDetail={isMobile}
            />
          )}

          {/* Zastřešení tribun */}
          <StandRoof standsLevel={f.stands ?? 0} roofLevel={f.roof ?? 0} roofColor={roofColor} />

          {/* Sektor kotle */}
          <UltrasSector
            level={f.ultras_stand ?? 0}
            primaryColor={teamColor}
            secondaryColor={secondaryColor}
            text={cust.ultrasText}
            bannerColor={cust.ultrasBannerColor}
            textColor={cust.ultrasTextColor}
          />

          {/* Budovy v rozích */}
          <Building
            kind="changing_rooms"
            level={f.changing_rooms ?? 0}
            position={layout.buildings.changing_rooms}
            roofColorOverride={roofColor}
            timeOfDay={timeOfDay}
          />
          <Building
            kind="showers"
            level={f.showers ?? 0}
            position={layout.buildings.showers}
            roofColorOverride={roofColor}
            timeOfDay={timeOfDay}
          />
          <Building
            kind="refreshments"
            level={f.refreshments ?? 0}
            position={layout.buildings.refreshments}
            roofColorOverride={roofColor}
            timeOfDay={timeOfDay}
          />
          <Building
            kind="toilets"
            level={f.toilets ?? 0}
            position={layout.buildings.toilets}
            roofColorOverride={roofColor}
            timeOfDay={timeOfDay}
          />

          {/* Parkoviště */}
          <Parking level={f.parking ?? 0} position={layout.parking} />

          {/* Vstupní brána a pokladny */}
          <EntranceGate
            level={f.entrance_gate ?? 0}
            position={[0, 0, -(layout.fence.depth / 2)]}
            teamColor={teamColor}
            secondaryColor={secondaryColor}
            stadiumName={stadiumName}
          />

          {/* Reklamní bannery podél hřiště */}
          {sponsors && sponsors.length > 0 && (
            <AdBoards sponsors={sponsors} teamColor={teamColor} />
          )}

          {/* Scoreboard za severní brankou */}
          {(cust.scoreboardLevel ?? 0) > 0 && (
            <Scoreboard
              level={cust.scoreboardLevel ?? 0}
              homeScore={lastMatch?.homeScore ?? 0}
              awayScore={lastMatch?.awayScore ?? 0}
              homeName={lastMatch?.homeName ?? "DOMÁCÍ"}
              awayName={lastMatch?.awayName ?? "HOSTÉ"}
            />
          )}

          {/* Vlajka týmu před vchodem */}
          {(cust.flagSize ?? 0) > 0 && (
            <TeamFlag
              size={cust.flagSize ?? 0}
              primaryColor={cust.flagColor || teamColor}
              secondaryColor={secondaryColor ?? "#fff"}
              badgePrimary={badgePrimary || teamColor}
              badgeSecondary={badgeSecondary || secondaryColor || "#fff"}
              pattern={badgePattern ?? "shield"}
              initials={badgeInitials ?? "?"}
              symbol={badgeSymbol}
              position={[12, 0, -(layout.fence.depth / 2 + 3)]}
            />
          )}
        </Suspense>
      </Canvas>

      {/* ═══ Interaktivní ovládací lišty na ploše 3D scény ═══ */}
      {showControls && (
        <>
          {/* Tlačítko v rohu (zobrazí se, když je panel zavřený) */}
          {!controlsVisible && (
            <div className={`absolute top-3 ${reserveCloseButtonSpace ? "right-14" : "right-3"} z-20`}>
              <button
                onClick={() => setControlsVisible(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition-all shadow-lg backdrop-blur-md border bg-black/75 hover:bg-black/90 text-white/90 hover:text-white border-white/15 active:scale-95"
                title="Zobrazit nastavení počasí, denní doby a kamer"
              >
                <span>🎛️</span>
                <span>Počasí & Kamery</span>
              </button>
            </div>
          )}

          {/* Spodní elegantní plovoucí panel nástrojů (Glass Control Dock) */}
          {controlsVisible && (
            <div className="absolute bottom-3 sm:bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100%-32px)] sm:max-w-max mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-1.5 sm:gap-2 bg-black/85 backdrop-blur-xl px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl border border-white/20 shadow-2xl">
                {/* 1. Denní doba */}
                <div className="flex items-center gap-0.5 bg-white/10 p-0.5 rounded-xl shrink-0">
                  <button
                    onClick={() => handleTimeOfDayChange("day")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-heading font-bold transition-all ${
                      timeOfDay === "day"
                        ? "bg-amber-500 text-white shadow-sm"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    title="Slunečný den"
                  >
                    <span>☀️</span>
                    <span className="hidden md:inline">Den</span>
                  </button>
                  <button
                    onClick={() => handleTimeOfDayChange("sunset")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-heading font-bold transition-all ${
                      timeOfDay === "sunset"
                        ? "bg-orange-600 text-white shadow-sm"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    title="Západ slunce"
                  >
                    <span>🌅</span>
                    <span className="hidden md:inline">Západ</span>
                  </button>
                  <button
                    onClick={() => handleTimeOfDayChange("night")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-heading font-bold transition-all ${
                      timeOfDay === "night"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    title="Noc"
                  >
                    <span>🌙</span>
                    <span className="hidden md:inline">Noc</span>
                  </button>
                </div>

                <div className="w-px h-5 bg-white/20 hidden sm:block shrink-0" />

                {/* 2. Počasí */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {(Object.keys(WEATHER_OPTIONS) as WeatherType[]).map((wKey) => {
                    const opt = WEATHER_OPTIONS[wKey];
                    const active = weather === wKey;
                    return (
                      <button
                        key={wKey}
                        onClick={() => handleWeatherChange(wKey)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-heading font-bold transition-all ${
                          active
                            ? "bg-sky-600 text-white shadow-sm"
                            : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                        title={`${opt.label} (${opt.desc})`}
                      >
                        <span>{opt.icon}</span>
                        <span className="hidden lg:inline">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="w-px h-5 bg-white/20 hidden sm:block shrink-0" />

                {/* 3. Kamery */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {(Object.keys(VIEWPOINTS) as CameraViewpoint[]).map((key) => {
                    const vp = VIEWPOINTS[key];
                    const active = viewpoint === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleViewpointChange(key)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-heading font-bold transition-all whitespace-nowrap ${
                          active
                            ? "bg-pitch-500 text-white shadow-sm"
                            : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                        title={vp.label}
                      >
                        <span>{vp.icon}</span>
                        <span className="text-[10px] sm:text-xs">{vp.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="w-px h-5 bg-white/20 shrink-0" />

                {/* 4. Tlačítko zavřít panel */}
                <button
                  onClick={() => setControlsVisible(false)}
                  className="text-white/60 hover:text-white px-2 py-1 rounded-lg hover:bg-white/15 text-xs font-heading font-bold transition-all shrink-0"
                  title="Zavřít panel ovládání"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
