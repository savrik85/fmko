"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clientOnly } from "@/components/client-only";
import { apiFetch, type Team } from "@/lib/api";
import Link from "next/link";
import { Spinner, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { HeroBackdrop } from "@/components/ui/hero-backdrop";
import { HeroNavButton, HeroStat, HeroStats, heroTone } from "@/components/ui/hero-kit";
import { readableOnLight } from "@/lib/team-color";
import { KotelPrehravac } from "@/components/stadium/KotelPrehravac";

import { builtExtensionsOf } from "@/components/stadium/stadium-3d/stand-levels";
const Stadium3D = clientOnly(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  <div className="h-full flex items-center justify-center text-muted text-sm">
    <Spinner />
  </div>,
);

const Stadium3DViewer = clientOnly(
  () => import("@/components/stadium/stadium-3d/Stadium3DViewer").then((m) => m.Stadium3DViewer),
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
  standExtensions?: { slots: { slot: string; built?: { kind: string; level: number } | null }[] };
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

  const color = team.primary_color || "#2D5F2D";
  const tone = heroTone(color);
  // Kapacita stojí na plné destičce; na ní se píše barvou klubu.
  const plateText = tone.light ? "#FFFFFF" : readableOnLight(color);
  const statNumber = "font-heading font-extrabold text-lg sm:text-3xl tabular-nums leading-none";
  const badgeProps = {
    primary: team.badge_primary_color || color,
    secondary: team.badge_secondary_color || team.secondary_color || "#FFFFFF",
    pattern: (team.badge_pattern as BadgePattern) || "shield",
    initials: team.badge_initials || teamInitials(team.name),
    symbol: team.badge_symbol,
  };

  return (
    <>
      {/* Hlavička jako u hráče a týmu: znak, název, ukazatele vpravo, listování po lize. */}
      <div className="hero-gradient hero-detail px-3 sm:px-8 py-3 sm:py-5" style={{ backgroundColor: color }}>
        <HeroBackdrop primary={color} secondary={team.secondary_color} pattern={team.badge_pattern ?? null} />
        <div className="max-w-[1280px] mx-auto">
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            {leagueTeams.length > 1 && (
              <HeroNavButton tone={tone} direction="prev" label={`Předchozí stadion: ${predchozi?.name ?? ""}`} className="hidden sm:flex"
                onClick={() => predchozi && router.push(`/tym/${predchozi.id}/stadion`)} />
            )}
            <div className="shrink-0 sm:hidden"><BadgePreview {...badgeProps} size={40} /></div>
            <div className="shrink-0 hidden sm:block"><BadgePreview {...badgeProps} size={76} /></div>
            <div className="flex-1 min-w-0">
              <h1 className={`font-heading font-extrabold ${tone.text} text-lg sm:text-3xl leading-tight`}>
                {stadium.stadiumName || "Obecní hřiště"}
              </h1>
              <div className={`${tone.muted} text-[13px] sm:text-sm sm:mt-0.5`}>
                <Link href={`/tym/${teamId}`} className="underline decoration-current/30 hover:decoration-current">{team.name}</Link>
                {stadium.currentWeather && (
                  <>
                    {" "}&middot; {WEATHER_ICON[stadium.currentWeather] ?? ""} {WEATHER_LABEL[stadium.currentWeather] ?? stadium.currentWeather}
                    {stadium.currentTemperature != null ? ` · ${stadium.currentTemperature} °C` : ""}
                  </>
                )}
              </div>
            </div>
            {leagueTeams.length > 1 && (
              <div className="flex sm:hidden gap-1.5 shrink-0">
                <HeroNavButton tone={tone} direction="prev" label={`Předchozí stadion: ${predchozi?.name ?? ""}`} className="flex"
                  onClick={() => predchozi && router.push(`/tym/${predchozi.id}/stadion`)} />
                <HeroNavButton tone={tone} direction="next" label={`Další stadion: ${dalsi?.name ?? ""}`} className="flex"
                  onClick={() => dalsi && router.push(`/tym/${dalsi.id}/stadion`)} />
              </div>
            )}
            <HeroStats tone={tone}>
              <HeroStat tone={tone} label="Kapacita">
                <span className={`min-w-[38px] sm:min-w-[54px] h-7 sm:h-11 px-1.5 sm:px-2 rounded-control flex items-center justify-center font-heading font-extrabold text-lg sm:text-3xl tabular-nums leading-none ${tone.plate}`}
                  style={{ color: plateText }}>
                  {stadium.capacity.toLocaleString("cs")}
                </span>
              </HeroStat>
              <HeroStat tone={tone} label="Trávník">
                <span className={statNumber}>{stadium.pitchCondition}<span className="text-xs sm:text-sm">%</span></span>
              </HeroStat>
              <HeroStat tone={tone} label="Povrch">
                <span className="font-heading font-extrabold text-base sm:text-xl leading-none">
                  {stadium.pitchType === "natural" ? "Přírodní" : stadium.pitchType === "hybrid" ? "Hybridní" : "Umělý"}
                </span>
              </HeroStat>
            </HeroStats>
            {leagueTeams.length > 1 && (
              <HeroNavButton tone={tone} direction="next" label={`Další stadion: ${dalsi?.name ?? ""}`} className="hidden sm:flex"
                onClick={() => dalsi && router.push(`/tym/${dalsi.id}/stadion`)} />
            )}
          </div>
        </div>
      </div>

    <div className="page-container space-y-5">
      <Stadium3DViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        pitchCondition={stadium.pitchCondition}
        pitchType={stadium.pitchType}
        facilities={stadium.facilities}
        standExtensions={builtExtensionsOf(stadium.standExtensions)}
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
        standExtensions={builtExtensionsOf(stadium.standExtensions)}
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

      </div>

      {/* Chorály cizího kotle. Endpoint `/fans/chants` pouští GET komukoli,
          takže si je poslechne i soupeř. O to jde: rivalita se pozná líp
          z toho, co na tebe zpívají, než z tabulky. */}
      <KotelPrehravac teamId={teamId} zapasovyDen={!!stadium.matchDay} cizi />
    </div>
    </>
  );
}
