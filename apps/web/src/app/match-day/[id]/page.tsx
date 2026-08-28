"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { WEATHER_OPTIONS, type WeatherType } from "@/components/stadium/stadium-3d/constants";

const Stadium3D = dynamic(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  { ssr: false },
);

function ini(n: string) {
  return n
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface MatchInfo {
  id: string;
  round: number | null;
  home_name: string;
  away_name: string;
  home_color: string;
  away_color: string;
  home_secondary: string;
  away_secondary: string;
  home_badge: string;
  away_badge: string;
  home_score: number;
  away_score: number;
  home_team_id: string;
  away_team_id: string;
  isHome: boolean;
  weather: WeatherType;
  stadium_name: string | null;
  pitch_condition: number;
  pitch_type: string;
  isCup: boolean;
  roundName: string | null;
}

interface StadiumFacilities {
  facilities: Record<string, number>;
  customization?: Record<string, unknown>;
}

export default function MatchDayPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const matchId = params.id as string;
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [stadiumData, setStadiumData] = useState<StadiumFacilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipping, setSkipping] = useState(false);
  const [uiMode, setUiMode] = useState<"full" | "minimal" | "hidden">("full");

  useEffect(() => {
    // Pohár má vlastní tabulky i endpoint. Zkoušíme ligu první, protože těch zápasů je
    // řádově víc; teprve když ID nesedí, sáhneme do poháru.
    apiFetch<Record<string, unknown>>(`/api/matches/${matchId}`)
      .catch(() => apiFetch<Record<string, unknown>>(`/api/cup-matches/${matchId}`))
      .then(async (r) => {
        const homeTeamId = r.home_team_id as string;
        const rawWeather = (r.weather as string) || "sunny";
        const validWeather: WeatherType = ["sunny", "cloudy", "rain", "wind", "snow"].includes(rawWeather)
          ? (rawWeather as WeatherType)
          : "sunny";

        setMatch({
          id: r.id as string,
          round: r.round as number | null,
          home_name: (r.home_name as string) ?? "Domácí",
          away_name: (r.away_name as string) ?? "Hosté",
          home_color: (r.home_color as string) ?? "#2D5F2D",
          away_color: (r.away_color as string) ?? "#D94032",
          home_secondary: (r.home_secondary as string) ?? "#FFF",
          away_secondary: (r.away_secondary as string) ?? "#FFF",
          home_badge: (r.home_badge as string) ?? "shield",
          away_badge: (r.away_badge as string) ?? "shield",
          home_score: r.home_score as number,
          away_score: r.away_score as number,
          home_team_id: homeTeamId,
          away_team_id: r.away_team_id as string,
          isHome: homeTeamId === teamId,
          weather: validWeather,
          stadium_name: (r.stadium_name as string) ?? null,
          pitch_condition: (r.pitch_condition as number) ?? 85,
          pitch_type: (r.pitch_type as string) ?? "natural",
          isCup: r.isCup === true,
          roundName: (r.roundName as string) ?? null,
        });

        // Načteme zázemí stadionu domácího týmu pro 3D scénu
        if (homeTeamId) {
          try {
            const stRes = await apiFetch<{ facilities: Record<string, number>; customization?: Record<string, unknown> }>(
              `/api/teams/${homeTeamId}/stadium`,
            );
            if (stRes?.facilities) {
              setStadiumData(stRes);
            }
          } catch (err) {
            console.warn("Failed to load stadium details for 3D flyover:", err);
          }
        }

        setLoading(false);
      })
      .catch((e) => {
        console.error("load match-day failed:", e);
        apiFetch(`/api/matches/${matchId}/mark-seen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
        }).catch((err) => console.error("mark-seen on error fallback:", err));
        setLoading(false);
        router.push("/dashboard");
      });
  }, [matchId, teamId, router]);

  const skipMatch = async () => {
    setSkipping(true);
    const tid = teamId ?? (match?.isHome ? match.home_team_id : match?.away_team_id);
    await apiFetch(`/api/matches/${matchId}/mark-seen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: tid }),
    }).catch((e) => console.error("mark-seen on skip:", e));
    window.location.href = `/dashboard/match/${matchId}`;
  };

  const startMatch = async () => {
    const tid = teamId ?? (match?.isHome ? match.home_team_id : match?.away_team_id);
    await apiFetch(`/api/matches/${matchId}/mark-seen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: tid }),
    }).catch((e) => console.error("mark-seen on replay:", e));
    window.location.href = `/dashboard/match/${matchId}/replay`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-paper">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!match) return null;

  const hc = match.home_color;
  const ac = match.away_color;
  const weatherCfg = WEATHER_OPTIONS[match.weather] || WEATHER_OPTIONS.sunny;

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-black select-none">
      {/* 3D Stadion s filmovým obletem a aktuálním počasím na celou obrazovku */}
      <div
        className="absolute inset-0 w-full h-full z-0 pointer-events-auto"
        onClick={() => {
          // Na mobilu klepnutí do scény přepíná mezi plným zobrazením, miniaturou a skrytím
          if (typeof window !== "undefined" && window.innerWidth < 640) {
            setUiMode((prev) => (prev === "full" ? "minimal" : prev === "minimal" ? "hidden" : "full"));
          }
        }}
      >
        <Stadium3D
          pitchCondition={match.pitch_condition}
          pitchType={match.pitch_type}
          facilities={stadiumData?.facilities ?? { stands: 1, fence: 1, entrance_gate: 1 }}
          teamColor={hc}
          secondaryColor={match.home_secondary}
          badgePattern={match.home_badge}
          badgeInitials={ini(match.home_name)}
          stadiumName={match.stadium_name ?? `Stadion ${match.home_name}`}
          initialViewpoint="orbit"
          initialWeather={match.weather}
          showControls={false}
        />
      </div>

      {/* Horní ovládací a informační lišta */}
      <div className="absolute top-3 inset-x-3 sm:top-5 sm:inset-x-6 z-30 pointer-events-none flex items-center justify-between gap-2">
        {/* Odznáček kola / studia */}
        <div className="bg-black/75 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-xl flex items-center gap-2 text-white shadow-2xl pointer-events-auto">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] sm:text-xs font-heading font-bold uppercase tracking-wider text-white/90">
            {match.isCup ? `Pohár${match.roundName ? ` · ${match.roundName}` : ""}` : match.round ? `${match.round}. kolo` : "Zápas"} {match.stadium_name ? `· ${match.stadium_name}` : ""}
          </span>
        </div>

        {/* Přepínač režimů TV grafiky */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => setUiMode((prev) => (prev === "hidden" ? "full" : "hidden"))}
            className="bg-black/75 hover:bg-black/90 text-white/80 hover:text-white px-2.5 sm:px-3 py-1.5 rounded-xl border border-white/15 backdrop-blur-md text-xs font-heading font-bold transition-all flex items-center gap-1 shadow-lg"
            title={uiMode === "hidden" ? "Zobrazit TV grafiku" : "Skrýt grafiku pro nerušený oblet"}
          >
            <span>{uiMode === "hidden" ? "👁️ Grafika" : "🎬 Oblet"}</span>
          </button>
        </div>
      </div>

      {/* ═══ 1. MOBILNÍ ZOBRAZENÍ (< sm) ═══ */}
      {uiMode !== "hidden" && (
        <div className="sm:hidden">
          {uiMode === "minimal" ? (
            /* Kompaktní plovoucí kapsle na spodku mobilu */
            <div className="fixed bottom-4 inset-x-3 z-30 pointer-events-auto">
              <div className="bg-black/85 backdrop-blur-xl border border-white/20 rounded-2xl p-2.5 shadow-2xl flex items-center justify-between gap-2">
                <button
                  onClick={() => setUiMode("full")}
                  className="flex items-center gap-2 min-w-0 text-left flex-1"
                >
                  <span className="text-xl shrink-0">{weatherCfg.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-heading font-extrabold text-white truncate">
                      {match.isHome ? `vs ${match.away_name}` : `@ ${match.home_name}`}
                    </div>
                    <div className="text-[10px] text-white/70">
                      {weatherCfg.label} · {weatherCfg.defaultTemp}°C · {match.isHome ? "Doma" : "Venku"}
                    </div>
                  </div>
                </button>
                <button
                  onClick={startMatch}
                  className="shrink-0 bg-pitch-500 hover:bg-pitch-600 active:scale-95 text-white text-xs font-heading font-black px-4 py-2 rounded-xl shadow-lg border border-pitch-400/30 flex items-center gap-1"
                >
                  <span>▶</span>
                  <span>Výkop</span>
                </button>
              </div>
            </div>
          ) : (
            /* Spodní televizní dock na mobilu (Lower-Third Dock) */
            <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-auto">
              <div className="bg-black/90 backdrop-blur-2xl border-t border-white/20 rounded-t-3xl p-3.5 pb-5 shadow-2xl space-y-3">
                {/* Zatahovací lišta nahoře docku */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-white">
                    <span className="text-base">{weatherCfg.icon}</span>
                    <span className="text-xs font-heading font-bold text-white/90">
                      {weatherCfg.label} · {weatherCfg.defaultTemp}°C
                    </span>
                    <span className="text-[10px] text-white/40 font-mono">
                      (Trávník: {match.pitch_condition}%)
                    </span>
                  </div>
                  <button
                    onClick={() => setUiMode("minimal")}
                    className="text-[10px] font-heading font-bold text-white/60 hover:text-white bg-white/10 px-2 py-0.5 rounded-lg"
                  >
                    ▼ Zmenšit
                  </button>
                </div>

                {/* Týmy ve 2 přehledných řádcích — každý tým má celou šířku a vejde se celý název */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5 space-y-1.5">
                  {/* Domácí */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <BadgePreview
                        primary={hc}
                        secondary={match.home_secondary}
                        pattern={match.home_badge as BadgePattern}
                        initials={ini(match.home_name)}
                        size={26}
                      />
                      <span className="font-heading font-extrabold text-white text-xs truncate">
                        {match.home_name}
                      </span>
                    </div>
                    <span className="text-[9px] font-heading font-extrabold tracking-wider px-1.5 py-0.5 rounded bg-pitch-500/20 text-pitch-400 shrink-0">
                      DOMÁCÍ
                    </span>
                  </div>

                  {/* Hosté */}
                  <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-1.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <BadgePreview
                        primary={ac}
                        secondary={match.away_secondary}
                        pattern={match.away_badge as BadgePattern}
                        initials={ini(match.away_name)}
                        size={26}
                      />
                      <span className="font-heading font-extrabold text-white/90 text-xs truncate">
                        {match.away_name}
                      </span>
                    </div>
                    <span className="text-[9px] font-heading font-extrabold tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-white/40 shrink-0">
                      HOSTÉ
                    </span>
                  </div>
                </div>

                {/* Tlačítka */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={startMatch}
                    className="flex-1 py-3 px-4 rounded-xl bg-pitch-500 hover:bg-pitch-600 active:scale-[0.98] text-white font-heading font-black text-sm transition-all shadow-lg flex items-center justify-center gap-1.5 border border-pitch-400/30"
                  >
                    <span>▶</span>
                    <span>Sledovat zápas</span>
                  </button>
                  <button
                    onClick={skipMatch}
                    disabled={skipping}
                    className="py-3 px-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white/70 hover:text-white font-heading font-bold text-xs transition-all whitespace-nowrap"
                  >
                    {skipping ? "..." : "Přeskočit ➔"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 2. DESKTOP / TABLET ZOBRAZENÍ (sm: a výše) ═══ */}
      {uiMode === "full" && (
        <div className="hidden sm:flex absolute inset-0 z-20 pointer-events-none flex-col justify-between p-6 md:p-8">
          <div /> {/* Spacer */}

          {/* Středový broadcast match banner a počasí */}
          <div className="w-full max-w-2xl mx-auto pointer-events-auto my-auto space-y-3">
            <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/15 backdrop-blur-xl bg-black/80">
              {/* Hlavička s týmy */}
              <div className="relative px-6 py-7">
                <div className="flex items-start justify-between gap-4">
                  {/* Domácí tým */}
                  <div className="flex flex-col items-center text-center flex-1 min-w-0">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 p-1 shadow-inner shrink-0">
                      <BadgePreview
                        primary={hc}
                        secondary={match.home_secondary}
                        pattern={match.home_badge as BadgePattern}
                        initials={ini(match.home_name)}
                        size={52}
                      />
                    </div>
                    <div className="font-heading font-extrabold text-white text-sm sm:text-base md:text-lg mt-2.5 leading-snug break-words text-center">
                      {match.home_name}
                    </div>
                    <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-pitch-400 mt-1">
                      Domácí
                    </span>
                  </div>

                  {/* VS oddělovač */}
                  <div className="flex flex-col items-center justify-center shrink-0 px-3 pt-3">
                    <span className="font-heading font-black text-2xl sm:text-3xl text-white/30 tracking-widest">
                      VS
                    </span>
                  </div>

                  {/* Hostující tým */}
                  <div className="flex flex-col items-center text-center flex-1 min-w-0">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 p-1 shadow-inner shrink-0">
                      <BadgePreview
                        primary={ac}
                        secondary={match.away_secondary}
                        pattern={match.away_badge as BadgePattern}
                        initials={ini(match.away_name)}
                        size={52}
                      />
                    </div>
                    <div className="font-heading font-extrabold text-white text-sm sm:text-base md:text-lg mt-2.5 leading-snug break-words text-center">
                      {match.away_name}
                    </div>
                    <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-white/50 mt-1">
                      Hosté
                    </span>
                  </div>
                </div>
              </div>

              {/* Informační lišta o počasí a terénu */}
              <div className="bg-white/10 border-t border-b border-white/10 px-5 py-3 flex items-center justify-between gap-3 text-white">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-2xl shrink-0">{weatherCfg.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-heading font-bold flex items-center gap-2 text-white">
                      <span>{weatherCfg.label}</span>
                      <span className="text-white/40">·</span>
                      <span className="text-amber-400 font-mono">{weatherCfg.defaultTemp}°C</span>
                    </div>
                    <div className="text-micro text-white/70 truncate">{weatherCfg.desc}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-white/50 font-heading uppercase">Trávník</div>
                  <div className="text-xs font-heading font-bold text-pitch-400">{match.pitch_condition}%</div>
                </div>
              </div>

              {/* Akční tlačítka */}
              <div className="p-4 sm:p-5 space-y-2.5 bg-black/40">
                <button
                  onClick={startMatch}
                  className="w-full py-3.5 px-6 rounded-2xl bg-pitch-500 hover:bg-pitch-600 active:scale-[0.99] text-white font-heading font-black text-base transition-all shadow-lg flex items-center justify-center gap-2 border border-pitch-400/30"
                >
                  <span>▶</span>
                  <span>Sledovat zápas</span>
                </button>

                <button
                  onClick={skipMatch}
                  disabled={skipping}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.99] text-white/80 hover:text-white font-heading font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <span>{skipping ? "Načítám..." : "Přeskočit na výsledek ➔"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Spodní nápověda */}
          <div className="text-center text-white/50 text-[11px] font-heading">
            🎥 Filmový oblet stadionu s aktuálním počasím zápasu
          </div>
        </div>
      )}
    </div>
  );
}
