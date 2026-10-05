"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ClubWebsiteData } from "@okresni-masina/shared";
import { clientOnly } from "@/components/client-only";
import { Spinner } from "@/components/ui";
import type { CameraViewpoint } from "@/components/stadium/stadium-3d/constants";

const Stadium3D = clientOnly(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  <div className="h-full flex items-center justify-center text-white/60 text-sm bg-[#141b26]">
    <Spinner />
  </div>,
);

const VIEWPOINT_OPTIONS: Array<{
  id: CameraViewpoint;
  label: string;
  icon: string;
  title: string;
}> = [
  { id: "overview", label: "Panorama", icon: "🦅", title: "Celkový panoramatický pohled na areál" },
  { id: "main_stand", label: "Z tribuny", icon: "🏟️", title: "Pohled z hlavní tribuny na hrací plochu" },
  { id: "behind_goal", label: "Za bránou", icon: "🥅", title: "Pohled za brankou u sektoru fanoušků" },
  { id: "dugout", label: "Střídačka", icon: "💺", title: "Pohled ze střídačky trenéra" },
];

interface StadiumPhotoCardProps {
  team: ClubWebsiteData["team"];
  cardBg: string;
  formatPitchType: (type: string | null | undefined) => string;
}

export function StadiumPhotoCard({
  team,
  cardBg,
  formatPitchType,
}: StadiumPhotoCardProps) {
  const [selectedViewpoint, setSelectedViewpoint] = useState<CameraViewpoint>("overview");
  const [is3D, setIs3D] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const stadiumFacilities = useMemo(() => {
    return team.stadium.facilities ?? {
      changing_rooms: 1,
      showers: 1,
      refreshments: 1,
      lighting: 0,
      stands: 1,
      stand_main: 1,
      parking: 1,
      fence: 1,
      entrance_gate: 1,
    };
  }, [team.stadium.facilities]);

  const stadiumCustomization = useMemo(() => {
    return team.stadium.customization ?? {
      fenceColor: null,
      standColor: null,
      seatColor: null,
      roofColor: null,
      accentColor: null,
      scoreboardLevel: 0,
      flagSize: 0,
      ultrasText: null,
      mowingPattern: "stripes",
      netPattern: "white",
      netStyle: "loose",
      surroundSurface: "grass",
    };
  }, [team.stadium.customization]);

  const cacheKey = useMemo(() => {
    const facilitiesHash = JSON.stringify(stadiumFacilities);
    const pitchHash = `${team.stadium.pitchType}_${team.stadium.pitchCondition}`;
    return `prales_stadium_snap_${team.id}_${selectedViewpoint}_${pitchHash}_${facilitiesHash.length}`;
  }, [team.id, selectedViewpoint, team.stadium.pitchType, team.stadium.pitchCondition, stadiumFacilities]);

  // Načtení snapshotu z cache při změně úhlu pohledu
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached && cached.startsWith("data:image/")) {
        setSnapshotUrl(cached);
        setIsCapturing(false);
        return;
      }
    } catch {
      // Ignorovat localStorage výjimky (např. v privátním režimu)
    }

    // Není v cache -> spustit generování snapshotu z 3D
    setSnapshotUrl(null);
    setIsCapturing(true);
  }, [cacheKey]);

  const handleSnapshotReady = useCallback((dataUrl: string) => {
    setSnapshotUrl(dataUrl);
    setIsCapturing(false);
    try {
      localStorage.setItem(cacheKey, dataUrl);
    } catch {
      // Storage plný / privátní okno
    }
  }, [cacheKey]);

  const handleDownload = useCallback(() => {
    if (!snapshotUrl) return;
    const a = document.createElement("a");
    a.href = snapshotUrl;
    const cleanName = (team.stadium.name || team.name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-");
    a.download = `${cleanName}-${selectedViewpoint}.webp`;
    a.click();
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2000);
  }, [snapshotUrl, team.stadium.name, team.name, selectedViewpoint]);

  return (
    <div className={`${cardBg} overflow-hidden mb-8 border-2 border-white/10 group shadow-2xl relative rounded-2xl`}>
      {/* ═══ INTERAKTIVNÍ 3D REŽIM ═══ */}
      {is3D ? (
        <div className="relative aspect-[21/9] sm:aspect-[2.5/1] min-h-[360px] sm:min-h-[460px] w-full bg-slate-950 overflow-hidden">
          <Stadium3D
            pitchCondition={team.stadium.pitchCondition ?? 75}
            pitchType={team.stadium.pitchType ?? "natural"}
            facilities={stadiumFacilities}
            standExtensions={team.stadium.standExtensions}
            teamColor={team.primaryColor}
            secondaryColor={team.secondaryColor}
            stadiumName={team.stadium.name || team.name}
            sponsors={team.stadium.sponsors}
            customization={stadiumCustomization}
            initialViewpoint={selectedViewpoint}
            showControls={true}
          />
          <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIs3D(false)}
              className="px-4 py-2 rounded-xl bg-black/80 hover:bg-black text-white text-xs font-heading font-extrabold border border-white/20 shadow-xl backdrop-blur transition cursor-pointer flex items-center gap-1.5"
            >
              <span>✕</span>
              <span>Zpět na statickou fotku</span>
            </button>
          </div>
        </div>
      ) : (
        /* ═══ STATICKÁ FOTOGRAFIE Z 3D MODELU ═══ */
        <div className="relative aspect-[21/9] sm:aspect-[2.5/1] min-h-[260px] sm:min-h-[380px] w-full bg-slate-950 overflow-hidden">
          {snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={`Oficiální fotografie stadionu ${team.stadium.name || team.name}`}
              className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
              loading="eager"
            />
          ) : (
            /* Načítací stav při prvním vykreslení 3D snímku */
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-stone-900 text-white p-6 text-center">
              <div className="relative mb-3 flex items-center justify-center">
                <div className="w-12 h-12 border-3 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin shadow-lg" />
                <span className="absolute text-lg">🏟️</span>
              </div>
              <div className="font-heading font-black text-base sm:text-lg text-white">
                Vykresluji fotografii stadionu z 3D modelu...
              </div>
              <div className="text-xs text-slate-400 mt-1 max-w-md">
                Generuji snímek hřiště {team.name} ({formatPitchType(team.stadium.pitchType)}) se skutečnými tribunami a barvami klubu.
              </div>
            </div>
          )}

          {/* Skrytý background renderer pro vytvoření snapshotu, pokud ještě není */}
          {isCapturing && (
            <div className="absolute inset-0 opacity-0 pointer-events-none overflow-hidden" aria-hidden="true">
              <Stadium3D
                pitchCondition={team.stadium.pitchCondition ?? 75}
                pitchType={team.stadium.pitchType ?? "natural"}
                facilities={stadiumFacilities}
                standExtensions={team.stadium.standExtensions}
                teamColor={team.primaryColor}
                secondaryColor={team.secondaryColor}
                stadiumName={team.stadium.name || team.name}
                sponsors={team.stadium.sponsors}
                customization={stadiumCustomization}
                initialViewpoint={selectedViewpoint}
                showControls={false}
                onSnapshotReady={handleSnapshotReady}
              />
            </div>
          )}

          {/* Horní ovládací a informační lišta */}
          <div className="absolute top-3 inset-x-3 sm:top-5 sm:inset-x-6 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            {/* Odznáčky typu trávníku a původu */}
            <div className="flex items-center gap-1.5 flex-wrap pointer-events-auto">
              <span className="px-3 py-1 rounded-full bg-emerald-600/95 backdrop-blur text-white font-heading font-black text-[11px] sm:text-xs uppercase tracking-wider shadow border border-emerald-400/30 flex items-center gap-1">
                <span>📸</span>
                <span>Fotografie z 3D modelu</span>
              </span>
              <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur text-white text-[11px] font-heading font-bold border border-white/20 shadow">
                {formatPitchType(team.stadium.pitchType)}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur text-white text-[11px] font-heading font-bold border border-white/20 shadow hidden sm:inline">
                Kapacita: {team.stadium.capacity ? team.stadium.capacity.toLocaleString("cs") : "400"} diváků
              </span>
            </div>

            {/* Tlačítka pro přepnutí pohledu & 3D */}
            <div className="flex items-center gap-1.5 pointer-events-auto bg-black/75 backdrop-blur-md p-1 rounded-2xl border border-white/20 shadow-2xl">
              {/* Volba úhlu záběru */}
              <div className="flex items-center gap-1">
                {VIEWPOINT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedViewpoint(opt.id)}
                    title={opt.title}
                    className={`px-2.5 py-1 rounded-xl text-xs font-heading font-bold transition flex items-center gap-1 cursor-pointer ${
                      selectedViewpoint === opt.id
                        ? "bg-emerald-600 text-white shadow"
                        : "text-slate-300 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span className="hidden md:inline">{opt.label}</span>
                  </button>
                ))}
              </div>

              <div className="w-px h-4 bg-white/20 mx-0.5" />

              {/* Tlačítko stažení fotky */}
              <button
                type="button"
                onClick={handleDownload}
                disabled={!snapshotUrl}
                title="Stáhnout fotografii stadionu"
                className="px-2.5 py-1 rounded-xl text-xs font-heading font-bold text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
              >
                <span>{downloadSuccess ? "✅" : "💾"}</span>
                <span className="hidden lg:inline">{downloadSuccess ? "Uloženo" : "Stáhnout"}</span>
              </button>

              {/* Tlačítko přepnutí do interaktivního 3D */}
              <button
                type="button"
                onClick={() => setIs3D(true)}
                title="Spustit interaktivní 3D prohlídku a oblet areálu"
                className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-heading font-black shadow transition cursor-pointer flex items-center gap-1"
              >
                <span>🎮</span>
                <span className="hidden sm:inline">3D Oblet</span>
              </button>
            </div>
          </div>

          {/* Spodní informační banner o stadionu */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex flex-col justify-end p-5 sm:p-8 pointer-events-none">
            <h3 className="font-heading font-[900] text-2xl sm:text-4xl text-white drop-shadow-md">
              {team.stadium.name || "Místní fotbalové hřiště"}
            </h3>
            <p className="text-xs sm:text-sm text-slate-200 mt-1 max-w-2xl drop-shadow line-clamp-2 sm:line-clamp-none">
              Domácí hrací plocha klubu {team.name} v malebném prostředí obce {team.village.name}. {formatPitchType(team.stadium.pitchType)} odpovídající přesným parametrům areálu ze hry.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
