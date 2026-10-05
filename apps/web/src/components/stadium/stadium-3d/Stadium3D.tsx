"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Pitch } from "./Pitch";
import { Stand } from "./Stand";
import { Building } from "./Building";
import { Parking } from "./Parking";
import { Fence } from "./Fence";
import { Surroundings } from "./Surroundings";
import { StadiumSign } from "./StadiumSign";
import { AdBoards } from "./AdBoards";
import { Scoreboard, SCOREBOARD_X } from "./Scoreboard";
import { TeamFlag } from "./TeamFlag";
import { HostujiciSektor, StandRoof, UltrasSector } from "./StadiumExtras";
import { VipBox, vipGallerySightlineY } from "./VipBox";
import { getSideLevels, joinedEnds, replacedSides, roofTiers, vipBoxSideFor } from "./stand-levels";
import { StandExtensions, type ExtensionInstance } from "./StandExtensions";
import { Floodlights } from "./Floodlights";
import { EntranceGate } from "./EntranceGate";
import { Dugouts } from "./Dugouts";
import { SurroundTrack } from "./SurroundTrack";
import { VillageVibe } from "./VillageVibe";
import { LightingAndAtmosphere } from "./LightingAndAtmosphere";
import { WeatherEffects } from "./WeatherEffects";
import { CameraController } from "./CameraController";
import { PostFX } from "./PostFX";
import { PerformanceMonitor } from "@react-three/drei";
import { WindContext, windStrength } from "./wind";
import { BakedShadows } from "./BakedShadows";
import {
  getStadiumLayout,
  getViewpoints,
  STAND_DIMS,
  VIEWPOINTS,
  WEATHER_OPTIONS,
  STADIUM_MODES,
  ATTENDANCE_PRESETS,
  type TimeOfDay,
  type CameraViewpoint,
  type WeatherType,
  type StadiumMode,
  type AttendanceLevel,
} from "./constants";

/**
 * Most z Canvasu ven: vykreslí aktuální snímek a vrátí plátno. Bez `preserveDrawingBuffer`
 * je obraz po zobrazení smazaný, proto se před čtením vykreslí znovu.
 */
function CaptureBridge({ captureRef }: { captureRef: React.MutableRefObject<(() => HTMLCanvasElement) | null> }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    captureRef.current = () => {
      gl.render(scene, camera);
      return gl.domElement;
    };
    return () => {
      captureRef.current = null;
    };
  }, [gl, scene, camera, captureRef]);
  return null;
}

/** Klíč v localStorage pro přepínač vylepšené grafiky (AO, záře, obloha s prostředím). */
const FX_STORAGE_KEY = "stadium-fx-enabled";

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
  mowingPattern?: string | null;
  netPattern?: string | null;
  netStyle?: string | null;
  surroundSurface?: string | null;
}

export interface LastMatchScore {
  homeScore: number;
  awayScore: number;
  homeName: string;
  awayName: string;
}

interface Stadium3DProps {
  /** Postavené přístavby tribun (rohy, patra, křídla…) z odpovědi API. */
  standExtensions?: ExtensionInstance[];
  /** Přístavba, kterou hráč zvažuje: kreslí se průhledně přes stav areálu. */
  extensionPreview?: ExtensionInstance | null;
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  /** Úroveň vyhřívání trávníku (0–3) z vybavení klubu — na sněhu drží plochu zelenou. */
  pitchHeating?: number;
  /** Úroveň zavlažování (0–3) — na výhni drží trávník zelený místo slámového. */
  pitchIrrigation?: number;
  /** Úroveň sekačky (0–3) — koza / ruční / rider / profi válec. */
  mowerLevel?: number;
  /** Zda je objednán úklid sněhu (zobrazí zimní nářadí). */
  snowClearingOrdered?: boolean;
  /** Vlhkost půdy 0–100 (50 = normál) — řídí kaluže i vyschnutí. */
  pitchMoisture?: number;
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
  initialMode?: StadiumMode;
  mode?: StadiumMode;
  onModeChange?: (mode: StadiumMode) => void;
  initialAttendanceRatio?: number;
  attendanceRatio?: number;
  onAttendanceChange?: (ratio: number) => void;
  /**
   * Zaplnění po sektorech, 0–1. Zavřený sektor přijde jako 0 a zůstane prázdný,
   * i když je jinde plno. Bez tohohle měly všechny tribuny stejný počet lidí
   * a trest za výtržnosti nebyl na stadionu vidět.
   */
  sectorFill?: { kotel?: number; hlavni?: number; za_branou?: number };
  /** Kolik hostů přijelo na poslední domácí zápas a v jaké barvě. */
  awayFans?: { pocet: number; barva: string; nazev?: string; kdy?: string } | null;
  /** Kde parta kotle skutečně stojí. Dá se ji přestěhovat, tak ať to je vidět. */
  ultrasSector?: "kotel" | "hlavni" | "za_branou";
  showControls?: boolean;
  defaultControlsVisible?: boolean;
  reserveCloseButtonSpace?: boolean;
  /** Callback vracející statickou fotografii (DataURL WebP) po vykreslení 3D scény */
  onSnapshotReady?: (dataUrl: string) => void;
}

export function Stadium3D({
  standExtensions,
  extensionPreview,
  pitchCondition,
  pitchType,
  facilities,
  pitchHeating = 0,
  pitchIrrigation = 0,
  mowerLevel = 2,
  snowClearingOrdered = false,
  pitchMoisture = 50,
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
  initialMode = "match_day",
  mode: modeProp,
  onModeChange,
  initialAttendanceRatio = 0.50,
  attendanceRatio: attendanceProp,
  onAttendanceChange,
  sectorFill,
  ultrasSector = "kotel",
  awayFans,
  showControls = true,
  defaultControlsVisible = false,
  reserveCloseButtonSpace = false,
  onSnapshotReady,
}: Stadium3DProps) {
  const f = facilities;
  const layout = getStadiumLayout(f.stands ?? 0);

  // Jižní tribuna je za jednou brankou, severní za druhou, východ a západ jsou
  // podélné strany, tedy hlavní tribuna.
  const SEKTOR_STRANY = { kotel: "south", za_branou: "north", hlavni: "east" } as const;
  // VIP galerie na východní tribuně vyčnívá nad stříšku a z hřiště by zakryla tabuli
  // skóre stojící za ní (x = 36) — tabule se proto zvedne nad siluetu galerie.
  // Úrovně tribun po stranách: každá strana má vlastní úroveň, nebo žádnou.
  const sideLevels = getSideLevels(f);
  // Točená tribuna a val jsou tvar tribuny za brankou, ne další tribuna před ní: nahradí ji.
  const replaced = replacedSides(standExtensions ?? [], extensionPreview ?? null);
  // Střecha jde nad rovné tribuny: nahrazené strany (točená, val) ji dostanou přímo od přístavby a
  // strany s patrem mají střechu zvednutou nad ním.
  const roofSideLevels = { ...sideLevels, ...Object.fromEntries([...replaced].map((side) => [side, 0])) } as typeof sideLevels;
  const roofTier = roofTiers(standExtensions ?? [], sideLevels, (lvl) => STAND_DIMS[Math.max(1, Math.min(3, lvl))]);
  const scoreboardMinPanelBottom =
    (f.vip_box ?? 0) > 0 &&
    vipBoxSideFor(sideLevels, SEKTOR_STRANY[ultrasSector], replaced) === "east"
      ? vipGallerySightlineY(f.vip_box ?? 0, sideLevels.east, f.roof ?? 0, SCOREBOARD_X, roofTier.east) + 0.3
      : 0;
  const zaplneniStrany = (strana: "north" | "south" | "east" | "west"): number => {
    if (!sectorFill) return attendanceRatio;
    const sektor = strana === "south" ? "kotel" : strana === "north" ? "za_branou" : "hlavni";
    const v = sectorFill[sektor];
    return typeof v === "number" ? v : attendanceRatio;
  };
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

  // Stav denní doby, počasí, kamerového pohledu, režimu areálu a návštěvnosti
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initialTimeOfDay);
  const [weather, setWeather] = useState<WeatherType>(weatherProp ?? initialWeather);
  const [viewpoint, setViewpoint] = useState<CameraViewpoint>(initialViewpoint);
  const [mode, setMode] = useState<StadiumMode>(modeProp ?? initialMode);
  const [attendanceRatio, setAttendanceRatio] = useState<number>(attendanceProp ?? initialAttendanceRatio);

  useEffect(() => {
    if (weatherProp) {
      setWeather(weatherProp);
    }
  }, [weatherProp]);

  useEffect(() => {
    if (modeProp) {
      setMode(modeProp);
    }
  }, [modeProp]);

  useEffect(() => {
    if (attendanceProp !== undefined) {
      setAttendanceRatio(attendanceProp);
    }
  }, [attendanceProp]);

  const handleModeChange = (mKey: StadiumMode) => {
    if (mKey === mode) return;
    setMode(mKey);
    onModeChange?.(mKey);
    setStatusToast(`${STADIUM_MODES[mKey].icon} Nastavuji ${STADIUM_MODES[mKey].label.toLowerCase()}...`);
    setTimeout(() => setStatusToast(null), 900);
  };

  const handleAttendanceChange = (ratio: number) => {
    setAttendanceRatio(ratio);
    onAttendanceChange?.(ratio);
    const pct = Math.round(ratio * 100);
    setStatusToast(`👥 Návštěvnost: ${pct}% kapacity`);
    setTimeout(() => setStatusToast(null), 900);
  };

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

  // Vylepšená grafika (post-processing + obloha s prostředím) — jen desktop, přepínač v liště.
  // Výchozí zapnuto; volba se pamatuje, aby šlo srovnat před/po i přes reload.
  const [fxEnabled, setFxEnabled] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(FX_STORAGE_KEY) === "0") setFxEnabled(false);
    } catch (e) {
      console.warn("stadium fx: čtení localStorage selhalo:", e);
    }
  }, []);
  const handleFxToggle = () => {
    const next = !fxEnabled;
    setFxEnabled(next);
    try {
      window.localStorage.setItem(FX_STORAGE_KEY, next ? "1" : "0");
    } catch (e) {
      console.warn("stadium fx: zápis do localStorage selhal:", e);
    }
    setStatusToast(next ? "✨ Vylepšená grafika zapnuta" : "✨ Vylepšená grafika vypnuta");
    setTimeout(() => setStatusToast(null), 900);
  };
  const fxActive = fxEnabled && !isMobile;

  // ── Úspora baterie ──
  // Plátno mimo obrazovku (odscrollované) se nekreslí; dřív se animovalo dál, i když
  // ho nikdo neviděl. Když FPS klesá, sníží se rozlišení, když se zlepší, zase vrátí.
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const maxDpr = isMobile ? 1.25 : 1.75;
  const [dpr, setDpr] = useState(maxDpr);
  useEffect(() => setDpr(maxDpr), [maxDpr]);

  // ── Fotka stadionu ke sdílení ──
  const captureRef = useRef<(() => HTMLCanvasElement) | null>(null);
  const handlePhoto = async () => {
    const capture = captureRef.current;
    if (!capture) return;
    try {
      const src = capture();
      const out = document.createElement("canvas");
      out.width = src.width;
      out.height = src.height;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("2D kontext není k dispozici");
      ctx.drawImage(src, 0, 0);
      // Decentní popisek dole: název stadionu a hry.
      const pad = Math.round(out.height * 0.03);
      const size = Math.max(14, Math.round(out.height * 0.035));
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      const label = `${stadiumName || "Náš stadion"} · Prales`;
      const w = ctx.measureText(label).width + pad * 1.4;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(pad, out.height - pad - size * 1.7, w, size * 1.7);
      ctx.fillStyle = "#FFFFFF";
      ctx.textBaseline = "middle";
      ctx.fillText(label, pad * 1.7, out.height - pad - size * 0.85);

      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
      if (!blob) throw new Error("obrázek se nepodařilo vytvořit");
      const file = new File([blob], "stadion.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (isMobile && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: stadiumName || "Stadion" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "stadion.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setStatusToast("📸 Fotka stadionu je hotová");
    } catch (e) {
      // Zavřený sdílecí dialog není chyba.
      if ((e as Error)?.name === "AbortError") return;
      console.error("Fotka stadionu selhala:", e);
      setStatusToast("📸 Fotku se nepodařilo uložit");
    }
    setTimeout(() => setStatusToast(null), 1400);
  };

  // Automatické vyfocení statického snímku z 3D modelu (např. pro klubový web)
  useEffect(() => {
    if (!isSceneReady || !onSnapshotReady) return;
    const timer = setTimeout(() => {
      const capture = captureRef.current;
      if (!capture) return;
      try {
        const src = capture();
        const out = document.createElement("canvas");
        out.width = src.width;
        out.height = src.height;
        const ctx = out.getContext("2d");
        if (ctx) {
          ctx.drawImage(src, 0, 0);
          const pad = Math.round(out.height * 0.03);
          const size = Math.max(14, Math.round(out.height * 0.035));
          ctx.font = `700 ${size}px system-ui, sans-serif`;
          const label = `${stadiumName || "Náš stadion"} · Prales`;
          const w = ctx.measureText(label).width + pad * 1.4;
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(pad, out.height - pad - size * 1.7, w, size * 1.7);
          ctx.fillStyle = "#FFFFFF";
          ctx.textBaseline = "middle";
          ctx.fillText(label, pad * 1.7, out.height - pad - size * 0.85);
          onSnapshotReady(out.toDataURL("image/webp", 0.92));
        } else {
          onSnapshotReady(src.toDataURL("image/webp", 0.92));
        }
      } catch (e) {
        console.warn("Auto snapshot failed:", e);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [isSceneReady, onSnapshotReady, viewpoint, stadiumName]);

  // Pohledy kamery podle úrovně tribun a střechy (statické souřadnice končily ve střeše tribuny)
  // Kamera „Hlavní tribuna" stojí na východní straně, takže se řídí její úrovní (max stran by ji dalo do prázdna).
  const viewpoints = useMemo(() => {
    const lv = getSideLevels(f);
    const camLevel = lv.east >= 1 ? lv.east : Math.min(1, Math.max(lv.north, lv.south));
    return getViewpoints(camLevel, f.roof ?? 0);
  }, [f.stand_main, f.stand_opposite, f.stand_goal_west, f.stand_goal_east, f.stands, f.roof]);

  return (
    <div ref={rootRef} className="relative w-full h-full select-none">
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
        // Stínové mapy musí být zapnuté i na mobilu kvůli jednorázovému výpočtu stínů
        // (BakedShadows). Světla na mobilu stín v reálném čase nevrhají, takže to nic nestojí.
        shadows
        // near/far určují hloubkovou přesnost. Výchozí 0.1/2000 je poměr 20 000 —
        // na mobilním 16bitovém depth bufferu se pak plochy pár tisícin od sebe
        // (trávník vs. okolní dlažba) perou o pořadí a prosvítají skrz sebe.
        // Kamera je díky minDistance=15 vždy dost daleko, takže near=1 nic neořízne.
        camera={{ position: [55, 45, 55], fov: 35, near: 1, far: 400 }}
        frameloop={inView ? "always" : "never"}
        dpr={[1, dpr]}
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
        <WindContext.Provider value={windStrength(weather)}>
        <CaptureBridge captureRef={captureRef} />
        <PerformanceMonitor
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(maxDpr)}
        />
        {/* Dynamická obloha a osvětlení (den, západ, noc + počasí) */}
        <LightingAndAtmosphere timeOfDay={timeOfDay} weather={weather} isMobile={isMobile} enhanced={fxActive} />

        {/* Mobil: stíny spočítané jednou (v reálném čase jsou vypnuté kvůli výkonu) */}
        {isMobile && isSceneReady && <BakedShadows timeOfDay={timeOfDay} weather={weather} />}

        {/* 3D efekty počasí (déšť, sníh, vítr, blesky, mraky) */}
        <WeatherEffects weather={weather} timeOfDay={timeOfDay} isMobile={isMobile} />

        {/* Plynulý kontrolér kamery a filmový oblet */}
        <CameraController viewpoint={viewpoint} isMobile={isMobile} viewpoints={viewpoints} />

        {/* Post-processing: ambient occlusion, záře světel, vinětace, tone mapping (jen desktop) */}
        {fxActive && isSceneReady && <PostFX timeOfDay={timeOfDay} />}

        <Suspense fallback={null}>
          {/* Okolí, terénní kopečky a vzdálená vesnička */}
          <Surroundings reduceTrees={isMobile} timeOfDay={timeOfDay} weather={weather} />

          {/* Vesnický život v areálu: zahrádka, pivo, kouřící gril, kola, údržba trávníku, zábradlí */}
          <VillageVibe
            timeOfDay={timeOfDay}
            pubPosition={layout.buildings.refreshments}
            changingRoomsPosition={layout.buildings.changing_rooms}
            isMobile={isMobile}
            weather={weather}
            mode={mode}
            attendanceRatio={attendanceRatio}
            pitchHeating={pitchHeating}
            pitchIrrigation={pitchIrrigation}
            mowerLevel={mowerLevel}
            pitchMoisture={pitchMoisture}
            snowClearingOrdered={snowClearingOrdered}
          />

          {/* Osvětlovací stožáry v rozích hřiště */}
          <Floodlights level={f.lighting ?? 0} standsLevel={f.stands ?? 0} cornerStands={(standExtensions ?? []).some((e) => e.slot.startsWith("corner_")) || (extensionPreview?.slot.startsWith("corner_") ?? false)} timeOfDay={timeOfDay} weather={weather} isMobile={isMobile} />

          {/* Střídačky u postranní čáry */}
          <Dugouts teamColor={teamColor} secondaryColor={secondaryColor} weather={weather} />

          {/* Obvodový plot */}
          <Fence level={f.fence ?? 0} bounds={layout.fence} colorOverride={fenceColor} />

          {/* Výběhová zóna kolem hřiště */}
          <SurroundTrack
            surroundSurface={(cust.surroundSurface as any) ?? "grass"}
            teamColor={teamColor}
            secondaryColor={secondaryColor}
            standsLevel={f.stands ?? 0}
            weather={weather}
            isMobile={isMobile}
          />

          {/* Trávník, čáry, praporky, míč, branky */}
          <Pitch
            condition={pitchCondition}
            pitchType={pitchType}
            weather={weather}
            mowingPattern={(cust.mowingPattern as any) ?? "stripes"}
            netPattern={(cust.netPattern as any) ?? "white"}
            netStyle={(cust.netStyle as any) ?? "loose"}
            teamColor={teamColor}
            secondaryColor={secondaryColor}
            pitchHeating={pitchHeating}
            pitchIrrigation={pitchIrrigation}
            pitchMoisture={pitchMoisture}
            snowCleared={snowClearingOrdered}
            grassBlades={!isMobile}
            timeOfDay={timeOfDay}
          />

          {/* Tribuny okolo hřiště (v tréninkový den prázdné bez diváků) */}
          <Stand
            side="north"
            level={replaced.has("north") ? 0 : sideLevels.north}
            joinedEnds={joinedEnds("north", standExtensions ?? [])}
            teamColor={teamColor}
            secondaryColor={secondaryColor}
            standColor={standColor}
            seatColor={seatColor}
            accentColor={accentColor}
            reducedDetail={isMobile}
            mode={mode}
            ultrasSide={SEKTOR_STRANY[ultrasSector]}
            cageLevel={f.cage ?? 0}
            isSnow={weather === "snow"}
            attendanceRatio={zaplneniStrany("north")}
          />
          <Stand
            side="south"
            level={replaced.has("south") ? 0 : sideLevels.south}
            joinedEnds={joinedEnds("south", standExtensions ?? [])}
            teamColor={teamColor}
            secondaryColor={secondaryColor}
            standColor={standColor}
            seatColor={seatColor}
            accentColor={accentColor}
            reducedDetail={isMobile}
            mode={mode}
            ultrasSide={SEKTOR_STRANY[ultrasSector]}
            cageLevel={f.cage ?? 0}
            isSnow={weather === "snow"}
            attendanceRatio={zaplneniStrany("south")}
          />
          {sideLevels.east >= 1 && !replaced.has("east") && (
            <Stand
              side="east"
              level={sideLevels.east}
              joinedEnds={joinedEnds("east", standExtensions ?? [])}
              teamColor={teamColor}
              secondaryColor={secondaryColor}
              standColor={standColor}
              seatColor={seatColor}
              accentColor={accentColor}
              reducedDetail={isMobile}
              mode={mode}
              ultrasSide={SEKTOR_STRANY[ultrasSector]}
              cageLevel={f.cage ?? 0}
              isSnow={weather === "snow"}
              attendanceRatio={zaplneniStrany("east")}
            />
          )}
          {sideLevels.west >= 1 && !replaced.has("west") && (
            <Stand
              side="west"
              level={sideLevels.west}
              joinedEnds={joinedEnds("west", standExtensions ?? [])}
              teamColor={teamColor}
              secondaryColor={secondaryColor}
              standColor={standColor}
              seatColor={seatColor}
              accentColor={accentColor}
              reducedDetail={isMobile}
              mode={mode}
              ultrasSide={SEKTOR_STRANY[ultrasSector]}
              cageLevel={f.cage ?? 0}
              isSnow={weather === "snow"}
              attendanceRatio={zaplneniStrany("west")}
            />
          )}

          {/* Přístavby tribun a průhledný náhled té, kterou hráč zvažuje */}
          <StandExtensions
            extensions={standExtensions ?? []}
            preview={extensionPreview ?? null}
            sideLevels={sideLevels}
            standColor={standColor}
            seatColor={seatColor}
            accentColor={accentColor}
            teamColor={teamColor}
            secondaryColor={secondaryColor}
            mode={mode}
            attendanceRatio={attendanceRatio}
            reducedDetail={isMobile}
            isSnow={weather === "snow"}
            roofLevel={f.roof ?? 0}
            roofColor={roofColor}
          />

          {/* Zastřešení tribun */}
          <StandRoof sideLevels={roofSideLevels} sideTier={roofTier} roofLevel={f.roof ?? 0} roofColor={roofColor} weather={weather} />

          {/* VIP lóže: prosklená galerie nad hlavní tribunou (bez tribuny se nekreslí) */}
          <VipBox
            level={f.vip_box ?? 0}
            sideLevels={sideLevels}
            replaced={replaced}
            roofTier={roofTier}
            roofLevel={f.roof ?? 0}
            ultrasSide={SEKTOR_STRANY[ultrasSector]}
            accentColor={accentColor}
            teamColor={teamColor}
            timeOfDay={timeOfDay}
            reducedDetail={isMobile}
            isSnow={weather === "snow"}
          />

          {/* Sektor kotle (v tréninkový den bez pyrotechniky, spíkra a bubnu) */}
          <UltrasSector
            level={f.ultras_stand ?? 0}
            primaryColor={teamColor}
            secondaryColor={secondaryColor}
            text={cust.ultrasText}
            bannerColor={cust.ultrasBannerColor}
            textColor={cust.ultrasTextColor}
            mode={mode}
            sector={ultrasSector}
          />

          {/* Sektor hostů — kolik jich přijelo na poslední domácí zápas */}
          <HostujiciSektor
            pocet={awayFans?.pocet ?? 0}
            barva={awayFans?.barva ?? "#B91C1C"}
            strana={ultrasSector}
            mode={mode}
          />

          {/* Budovy v rozích */}
          <Building
            kind="changing_rooms"
            level={f.changing_rooms ?? 0}
            position={layout.buildings.changing_rooms}
            roofColorOverride={roofColor}
            timeOfDay={timeOfDay}
            weather={weather}
          />
          <Building
            kind="showers"
            level={f.showers ?? 0}
            position={layout.buildings.showers}
            roofColorOverride={roofColor}
            timeOfDay={timeOfDay}
            weather={weather}
          />
          <Building
            kind="refreshments"
            level={f.refreshments ?? 0}
            position={layout.buildings.refreshments}
            roofColorOverride={roofColor}
            timeOfDay={timeOfDay}
            weather={weather}
          />
          <Building
            kind="toilets"
            level={f.toilets ?? 0}
            position={layout.buildings.toilets}
            roofColorOverride={roofColor}
            timeOfDay={timeOfDay}
            weather={weather}
          />

          {/* Parkoviště */}
          <Parking level={f.parking ?? 0} position={layout.parking} weather={weather} mode={mode} />

          {/* Vstupní brána a pokladny */}
          <EntranceGate
            level={f.entrance_gate ?? 0}
            position={[0, 0, -(layout.fence.depth / 2)]}
            teamColor={teamColor}
            secondaryColor={secondaryColor}
            stadiumName={stadiumName}
            weather={weather}
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
              minPanelBottom={scoreboardMinPanelBottom}
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
        </WindContext.Provider>
      </Canvas>

      {/* ═══ Interaktivní ovládací lišty na ploše 3D scény ═══ */}
      {showControls && (
        <>
          {/* Tlačítko v rohu (zobrazí se, když je panel zavřený) */}
          {!controlsVisible && (
            <div className={`absolute top-3 ${reserveCloseButtonSpace ? "right-14" : "right-3"} z-20 flex items-center gap-1.5`}>
              {/* Rychlý indikátor režimu */}
              <button
                onClick={() => handleModeChange(mode === "match_day" ? "training_day" : "match_day")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-heading font-bold transition-all shadow-lg backdrop-blur-md border bg-black/75 hover:bg-black/90 text-white/90 hover:text-white border-white/15 active:scale-95"
                title="Kliknutím přepneš mezi Zápasovým a Tréninkovým dnem"
              >
                <span>{STADIUM_MODES[mode].icon}</span>
                <span className="hidden sm:inline">{STADIUM_MODES[mode].label}</span>
              </button>

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
            <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[96%] overflow-x-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-1 sm:gap-1.5 bg-black/90 backdrop-blur-xl px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-2xl border border-white/20 shadow-2xl w-max">
                {/* 0. Režim areálu: Zápas vs Trénink */}
                <div className="flex items-center gap-0.5 bg-white/10 p-0.5 rounded-xl shrink-0">
                  {(Object.keys(STADIUM_MODES) as StadiumMode[]).map((mKey) => {
                    const opt = STADIUM_MODES[mKey];
                    const active = mode === mKey;
                    return (
                      <button
                        key={mKey}
                        onClick={() => handleModeChange(mKey)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-heading font-bold transition-all ${
                          active
                            ? mKey === "match_day"
                              ? "bg-emerald-600 text-white shadow-sm"
                              : "bg-amber-600 text-white shadow-sm"
                            : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                        title={`${opt.label} (${opt.desc})`}
                      >
                        <span>{opt.icon}</span>
                        <span className="text-[11px] sm:text-xs">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="w-px h-4 bg-white/20 shrink-0" />

                {/* 1. Denní doba */}
                <div className="flex items-center gap-0.5 bg-white/10 p-0.5 rounded-xl shrink-0">
                  <button
                    onClick={() => handleTimeOfDayChange("day")}
                    className={`p-1.5 rounded-lg text-xs transition-all ${
                      timeOfDay === "day"
                        ? "bg-amber-500 text-white shadow-sm"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    title="Den (Slunečno)"
                  >
                    ☀️
                  </button>
                  <button
                    onClick={() => handleTimeOfDayChange("sunset")}
                    className={`p-1.5 rounded-lg text-xs transition-all ${
                      timeOfDay === "sunset"
                        ? "bg-orange-600 text-white shadow-sm"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    title="Západ slunce"
                  >
                    🌅
                  </button>
                  <button
                    onClick={() => handleTimeOfDayChange("night")}
                    className={`p-1.5 rounded-lg text-xs transition-all ${
                      timeOfDay === "night"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    title="Noc (Umělé osvětlení)"
                  >
                    🌙
                  </button>
                </div>

                <div className="w-px h-4 bg-white/20 shrink-0" />

                {/* 2. Počasí */}
                <div className="flex items-center gap-0.5 bg-white/10 p-0.5 rounded-xl shrink-0">
                  {(Object.keys(WEATHER_OPTIONS) as WeatherType[]).map((wKey) => {
                    const opt = WEATHER_OPTIONS[wKey];
                    const active = weather === wKey;
                    return (
                      <button
                        key={wKey}
                        onClick={() => handleWeatherChange(wKey)}
                        className={`p-1.5 rounded-lg text-xs transition-all ${
                          active
                            ? "bg-sky-600 text-white shadow-sm"
                            : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                        title={`${opt.label} ${opt.desc}`}
                      >
                        {opt.icon}
                      </button>
                    );
                  })}
                </div>

                <div className="w-px h-4 bg-white/20 shrink-0" />

                {/* 3. Kamery */}
                <div className="flex items-center gap-0.5 bg-white/10 p-0.5 rounded-xl shrink-0">
                  {(Object.keys(VIEWPOINTS) as CameraViewpoint[]).map((key) => {
                    const vp = VIEWPOINTS[key];
                    const active = viewpoint === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleViewpointChange(key)}
                        className={`p-1.5 rounded-lg text-xs transition-all ${
                          active
                            ? "bg-pitch-500 text-white shadow-sm"
                            : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                        title={`Kamera: ${vp.label}`}
                      >
                        {vp.icon}
                      </button>
                    );
                  })}
                </div>

                <div className="w-px h-4 bg-white/20 shrink-0" />
                <button
                  onClick={handlePhoto}
                  className="p-1.5 rounded-lg text-xs transition-all shrink-0 text-white/70 hover:text-white hover:bg-white/10"
                  title="Vyfotit stadion (uložit nebo sdílet obrázek)"
                >
                  📸
                </button>

                {/* 4. Vylepšená grafika (jen desktop) */}
                {!isMobile && (
                  <>
                    <div className="w-px h-4 bg-white/20 shrink-0" />
                    <button
                      onClick={handleFxToggle}
                      className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
                        fxEnabled
                          ? "bg-violet-600 text-white shadow-sm"
                          : "text-white/70 hover:text-white hover:bg-white/10"
                      }`}
                      title={
                        fxEnabled
                          ? "Vylepšená grafika: zapnuto (stíny v rozích, záře světel, odrazy oblohy)"
                          : "Vylepšená grafika: vypnuto"
                      }
                    >
                      ✨
                    </button>
                  </>
                )}

                <div className="w-px h-4 bg-white/20 shrink-0" />

                {/* 5. Tlačítko zavřít panel */}
                <button
                  onClick={() => setControlsVisible(false)}
                  className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/15 text-xs font-heading font-bold transition-all shrink-0"
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
