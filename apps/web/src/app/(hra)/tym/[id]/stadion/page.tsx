"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiFetch, type Team } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { KotelPrehravac } from "@/components/stadium/KotelPrehravac";

const Stadium3D = dynamic(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-muted text-sm">
        <Spinner />
      </div>
    ),
  }
);

const Stadium3DViewer = dynamic(
  () => import("@/components/stadium/stadium-3d/Stadium3DViewer").then((m) => m.Stadium3DViewer),
  { ssr: false }
);

interface Customization {
  fenceColor: string | null;
  standColor: string | null;
  seatColor: string | null;
  roofColor: string | null;
  accentColor: string | null;
  scoreboardLevel: number;
  flagSize: number;
  ultrasText: string | null;
  ultrasBannerColor: string | null;
  ultrasTextColor: string | null;
}

interface StadiumData {
  /** Počasí nad areálem právě teď, stejný zdroj jako na vlastním Stadionu. */
  currentWeather?: string | null;
  currentTemperature?: number | null;
  /** Hraje se tu dnes doma? Pak se scéna otevře v zápasovém režimu. */
  matchDay?: boolean;
  matchDayOpponent?: string | null;
  stadiumName: string | null;
  capacity: number;
  pitchCondition: number;
  pitchType: string;
  pitchHeating?: number;
  pitchIrrigation?: number;
  mowerLevel?: number;
  pitchMoisture?: number;
  facilities: Record<string, number>;
  customization: Customization;
}

/** Počasí nad areálem, stejné popisky jako na vlastním Stadionu. */
const WEATHER_LABEL: Record<string, string> = {
  sunny: "Slunečno", cloudy: "Zataženo", rain: "Déšť", snow: "Sníh", wind: "Vítr",
};
const WEATHER_ICON: Record<string, string> = {
  sunny: "☀️", cloudy: "⛅", rain: "🌧️", snow: "❄️", wind: "💨",
};

function teamInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
}

export default function VisitStadiumPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const teamId = params.id;
  const [stadium, setStadium] = useState<StadiumData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [sponsors, setSponsors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Procházení po lize šipkami, stejně jako na profilu klubu. Bez toho se
  // musel hráč vracet na tabulku a proklikávat se k dalšímu stadionu zvlášť.
  const [leagueTeams, setLeagueTeams] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<StadiumData>(`/api/teams/${teamId}/stadium`),
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Array<{ id: string; name: string }>>(`/api/teams/${teamId}/league-teams`)
        .catch((e) => { console.error("soupiska ligy:", e); return []; }),
      apiFetch<{ bannerContracts: Array<{ sponsorName: string }> }>(`/api/teams/${teamId}/sponsors`)
        .catch((e) => { console.warn("sponsors fetch:", e); return null; }),
    ])
      .then(([s, t, lt, sp]) => {
        setStadium(s); setTeam(t); setLeagueTeams(lt);
        setSponsors(sp?.bannerContracts?.map((c) => c.sponsorName) ?? []);
      })
      .catch((e) => console.error("visit stadium load:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  const indexVLize = leagueTeams.findIndex((t) => t.id === teamId);
  const predchozi = leagueTeams.length > 1
    ? leagueTeams[(indexVLize - 1 + leagueTeams.length) % leagueTeams.length] : null;
  const dalsi = leagueTeams.length > 1
    ? leagueTeams[(indexVLize + 1) % leagueTeams.length] : null;

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!stadium || !team) return <div className="page-container">Stadion nenalezen.</div>;

  return (
    <div className="page-container space-y-5">
      {/* Header: zpět, šipky po lize a název. Na mobilu se to musí zalomit,
          jinak se dlouhý název stadionu pere se šipkami o místo. */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => router.back()} className="text-sm text-pitch-500 font-heading font-bold hover:text-pitch-600">
          ← Zpět
        </button>
        <div className="flex items-center gap-3">
          {leagueTeams.length > 1 && (
            <button
              onClick={() => predchozi && router.push(`/tym/${predchozi.id}/stadion`)}
              aria-label={`Předchozí stadion: ${predchozi?.name ?? ""}`}
              className="w-8 h-8 rounded-soft bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm shrink-0"
            >
              &#9664;
            </button>
          )}
          <div className="text-right min-w-0">
            <div className="font-heading font-bold text-base truncate">{team.name}</div>
            {stadium.stadiumName && <div className="text-sm text-muted truncate">{stadium.stadiumName}</div>}
            {stadium.currentWeather && (
              <div className="text-sm text-muted">
                {WEATHER_ICON[stadium.currentWeather] ?? ""} {WEATHER_LABEL[stadium.currentWeather] ?? stadium.currentWeather}
                {stadium.currentTemperature != null ? ` · ${stadium.currentTemperature} °C` : ""}
              </div>
            )}
          </div>
          {leagueTeams.length > 1 && (
            <button
              onClick={() => dalsi && router.push(`/tym/${dalsi.id}/stadion`)}
              aria-label={`Další stadion: ${dalsi?.name ?? ""}`}
              className="w-8 h-8 rounded-soft bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm shrink-0"
            >
              &#9654;
            </button>
          )}
        </div>
      </div>

      <Stadium3DViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        pitchCondition={stadium.pitchCondition}
        pitchType={stadium.pitchType}
        facilities={stadium.facilities}
        pitchHeating={stadium.pitchHeating ?? 0}
        pitchIrrigation={stadium.pitchIrrigation ?? 0}
        mowerLevel={stadium.mowerLevel ?? 2}
        pitchMoisture={stadium.pitchMoisture ?? 50}
        initialWeather={(stadium.currentWeather as never) ?? "cloudy"}
        initialMode={stadium.matchDay ? "match_day" : "training_day"}
        teamColor={team.primary_color}
        secondaryColor={team.secondary_color}
        badgePattern={team.badge_pattern}
        badgeInitials={team.badge_initials || teamInitials(team.name)}
        badgeSymbol={team.badge_symbol}
        badgePrimary={team.badge_primary_color}
        badgeSecondary={team.badge_secondary_color}
        stadiumName={stadium.stadiumName}
        sponsors={sponsors}
        customization={stadium.customization}
      />

      {/* 3D scéna */}
      <div className="card p-4 sm:p-5">
        <div className="h-[280px] sm:h-[500px] rounded-xl overflow-hidden bg-gradient-to-b from-sky-100 to-sky-50" style={{ touchAction: "pan-y" }}>
          {!viewerOpen && (
            <Stadium3D
              pitchCondition={stadium.pitchCondition}
              pitchType={stadium.pitchType}
              facilities={stadium.facilities}
              pitchHeating={stadium.pitchHeating ?? 0}
              pitchIrrigation={stadium.pitchIrrigation ?? 0}
              mowerLevel={stadium.mowerLevel ?? 2}
              pitchMoisture={stadium.pitchMoisture ?? 50}
              initialWeather={(stadium.currentWeather as never) ?? "cloudy"}
              initialMode={stadium.matchDay ? "match_day" : "training_day"}
              teamColor={team.primary_color}
              secondaryColor={team.secondary_color}
              badgePattern={team.badge_pattern}
              badgeInitials={team.badge_initials || teamInitials(team.name)}
              badgeSymbol={team.badge_symbol}
              badgePrimary={team.badge_primary_color}
              badgeSecondary={team.badge_secondary_color}
              stadiumName={stadium.stadiumName}
              sponsors={sponsors}
              customization={stadium.customization}
            />
          )}
        </div>
        <button
          onClick={() => setViewerOpen(true)}
          className="w-full mt-2 py-2 bg-pitch-500 hover:bg-pitch-600 text-white rounded-soft text-sm font-heading font-bold transition-colors"
        >
          🔍 Prohlédnout v plné velikosti
        </button>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-center mt-4 pt-4 border-t border-gray-100">
          <div>
            <div className="font-heading font-bold text-xl tabular-nums text-ink">{stadium.capacity}</div>
            <div className="text-sm text-muted">Kapacita</div>
          </div>
          <div>
            <div className="font-heading font-bold text-xl tabular-nums text-ink">{stadium.pitchCondition}%</div>
            <div className="text-sm text-muted">Trávník</div>
          </div>
          <div>
            <div className="font-heading font-bold text-xl tabular-nums text-ink">
              {stadium.pitchType === "natural" ? "Přírodní" : stadium.pitchType === "hybrid" ? "Hybridní" : "Umělý"}
            </div>
            <div className="text-sm text-muted">Povrch</div>
          </div>
        </div>
      </div>

      {/* Chorály cizího kotle. Endpoint `/fans/chants` pouští GET komukoli,
          takže si je poslechne i soupeř. O to jde: rivalita se pozná líp
          z toho, co na tebe zpívají, než z tabulky. */}
      <KotelPrehravac teamId={teamId} zapasovyDen={!!stadium.matchDay} cizi />
    </div>
  );
}
