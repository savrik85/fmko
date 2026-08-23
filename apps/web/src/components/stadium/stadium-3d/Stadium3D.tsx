"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
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

  const bloomIntensity = timeOfDay === "night" ? 0.7 : timeOfDay === "sunset" ? 0.45 : 0.3;

  return (
    <div className="relative w-full h-full select-none">
      {/* 3D Canvas scéna */}
      <Canvas
        shadows={!isMobile}
        camera={{ position: [55, 45, 55], fov: 35 }}
        frameloop="always"
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        gl={{ antialias: !isMobile, alpha: false, powerPreference: "high-performance" }}
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

        {/* Post-processing */}
        {!isMobile && (
          <EffectComposer multisampling={0}>
            <Bloom
              intensity={bloomIntensity}
              luminanceThreshold={0.65}
              luminanceSmoothing={0.4}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.15} darkness={timeOfDay === "night" ? 0.8 : 0.55} />
          </EffectComposer>
        )}
      </Canvas>

      {/* ═══ Interaktivní ovládací lišty na ploše 3D scény ═══ */}
      {showControls && (
        <>
          {/* Tlačítko pro zapnutí / vypnutí ovládacích panelů */}
          <div className={`absolute top-3 ${reserveCloseButtonSpace ? "right-[4.5rem]" : "right-3"} z-20`}>
            <button
              onClick={() => setControlsVisible(!controlsVisible)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition-all shadow-lg backdrop-blur-md border ${
                controlsVisible
                  ? "bg-pitch-500 text-white border-pitch-400/40 shadow-pitch-500/20"
                  : "bg-black/65 hover:bg-black/85 text-white/90 hover:text-white border-white/15"
              }`}
              title={controlsVisible ? "Skrýt ovládací panely" : "Zobrazit nastavení počasí, denní doby a kamer"}
            >
              <span>{controlsVisible ? "✕" : "🎛️"}</span>
              <span>{controlsVisible ? "Zavřít" : "Počasí & Kamery"}</span>
            </button>
          </div>

          {/* Panely se zobrazí pouze pokud je controlsVisible = true */}
          {controlsVisible && (
            <>
              {/* Přepínač denní doby (vlevo nahoře) */}
              <div className="absolute top-3 left-3 z-10 flex items-center bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-lg animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={() => setTimeOfDay("day")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                    timeOfDay === "day"
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                  title="Slunečný den"
                >
                  <span>☀️</span>
                  <span className="hidden sm:inline">Den</span>
                </button>
                <button
                  onClick={() => setTimeOfDay("sunset")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                    timeOfDay === "sunset"
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                  title="Západ slunce / Zlatá hodinka"
                >
                  <span>🌅</span>
                  <span className="hidden sm:inline">Západ</span>
                </button>
                <button
                  onClick={() => setTimeOfDay("night")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                    timeOfDay === "night"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                  title="Noční zápas pod reflektory"
                >
                  <span>🌙</span>
                  <span className="hidden sm:inline">Noc</span>
                </button>
              </div>

              {/* Přepínač počasí (vlevo pod denní dobou) */}
              <div className="absolute top-14 left-3 z-10 flex items-center bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-lg animate-in fade-in zoom-in-95 duration-200">
                {(Object.keys(WEATHER_OPTIONS) as WeatherType[]).map((wKey) => {
                  const opt = WEATHER_OPTIONS[wKey];
                  const active = weather === wKey;
                  return (
                    <button
                      key={wKey}
                      onClick={() => setWeather(wKey)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                        active
                          ? "bg-sky-600 text-white shadow-sm"
                          : "text-white/70 hover:text-white hover:bg-white/10"
                      }`}
                      title={`${opt.label} (${opt.desc})`}
                    >
                      <span>{opt.icon}</span>
                      <span className="hidden sm:inline">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Přepínač filmových pohledů kamery (vpravo pod tlačítkem Ovládání) */}
              <div className={`absolute top-14 ${reserveCloseButtonSpace ? "right-[4.5rem]" : "right-3"} z-10 flex items-center gap-1 bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-lg overflow-x-auto max-w-[calc(100%-20px)] sm:max-w-none animate-in fade-in zoom-in-95 duration-200`}>
                {(Object.keys(VIEWPOINTS) as CameraViewpoint[]).map((key) => {
                  const vp = VIEWPOINTS[key];
                  const active = viewpoint === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setViewpoint(key)}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-heading font-bold transition-all whitespace-nowrap ${
                        active
                          ? "bg-pitch-500 text-white shadow-sm"
                          : "text-white/70 hover:text-white hover:bg-white/10"
                      }`}
                      title={vp.label}
                    >
                      <span>{vp.icon}</span>
                      <span className="hidden md:inline">{vp.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
