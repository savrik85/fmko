"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clientOnly } from "@/components/client-only";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { pMobileTheme } from "@/components/brand/p-mobile";
import { BRAND, DayBlock, dayLabel, stageTitle, type Competition } from "../../competition";
import { venueColors, venueExtensions, venueFacilities } from "../../venue-scene";

const Stadium3D = clientOnly(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  <div className="h-full flex items-center justify-center text-muted text-sm">
    <Spinner />
  </div>,
);

const Stadium3DViewer = clientOnly(
  () => import("@/components/stadium/stadium-3d/Stadium3DViewer").then((m) => m.Stadium3DViewer),
);

interface TournamentResponse {
  tournament: { name: string; city: string } | null;
  competition?: Competition | null;
}

/** Hřiště areálu Turnaje P-Mobile: 3D jako stadion klubu, kapacita, povrch a zápasy, které se tu hrají. */
export default function TournamentVenuePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId } = useTeam();
  const [data, setData] = useState<TournamentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<TournamentResponse>(`/api/teams/${teamId}/tournament`)
      .then(setData)
      .catch((e) => console.error("hřiště turnaje:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  const venues = data?.competition?.venues ?? [];
  const index = venues.findIndex((v) => v.id === id);
  const venue = venues[index];
  if (!data?.tournament || !venue) return <div className="page-container">Hřiště nenalezeno.</div>;

  const look = venue.look ?? {};
  const pitchType = typeof look.pitch_type === "string" ? look.pitch_type : "natural";
  const colors = venueColors(look, BRAND);
  const prev = venues[(index - 1 + venues.length) % venues.length];
  const next = venues[(index + 1) % venues.length];
  const matches = (data.competition?.matches ?? []).filter((m) => m.venue?.id === venue.id);
  const days = [...new Set(matches.map((m) => m.day))].sort((a, b) => a - b);

  const scene = {
    pitchCondition: 100,
    pitchType,
    facilities: venueFacilities(look),
    standExtensions: venueExtensions(look),
    teamColor: colors.primary,
    secondaryColor: colors.secondary,
    badgePattern: "shield",
    badgeInitials: "PM",
    sponsors: ["P-Mobile"],
    adBoardColor: BRAND,
    stadiumName: venue.name,
  };

  return (
    <div style={pMobileTheme}>
      <div className="page-container space-y-5">
        {/* Zpět, šipky po hřištích areálu a název — stejně jako u stadionu klubu. */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.back()} className="text-sm text-pitch-500 font-heading font-bold hover:text-pitch-600">
            ← Zpět
          </button>
          <div className="flex items-center gap-3">
            {venues.length > 1 && (
              <button
                onClick={() => router.push(`/turnaj/hriste/${prev.id}`)}
                aria-label={`Předchozí hřiště: ${prev.name}`}
                className="w-8 h-8 rounded-soft bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm shrink-0"
              >
                &#9664;
              </button>
            )}
            <div className="text-right min-w-0">
              <div className="font-heading font-bold text-base truncate">{venue.isMain ? "🏟️ " : ""}{venue.name}</div>
              <div className="text-sm text-muted truncate">{data.tournament.name}, {data.tournament.city}</div>
            </div>
            {venues.length > 1 && (
              <button
                onClick={() => router.push(`/turnaj/hriste/${next.id}`)}
                aria-label={`Další hřiště: ${next.name}`}
                className="w-8 h-8 rounded-soft bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm shrink-0"
              >
                &#9654;
              </button>
            )}
          </div>
        </div>

        <Stadium3DViewer open={viewerOpen} onClose={() => setViewerOpen(false)} {...scene} />

        <div className="card p-4 sm:p-5">
          <div className="h-[280px] sm:h-[500px] rounded-xl overflow-hidden bg-gradient-to-b from-sky-100 to-sky-50" style={{ touchAction: "pan-y" }}>
            {!viewerOpen && <Stadium3D {...scene} />}
          </div>
          <button
            onClick={() => setViewerOpen(true)}
            className="w-full mt-2 py-2 bg-pitch-500 hover:bg-pitch-600 text-white rounded-soft text-sm font-heading font-bold transition-colors"
          >
            🔍 Prohlédnout v plné velikosti
          </button>

          <div className="grid grid-cols-3 gap-4 text-center mt-4 pt-4 border-t border-gray-100">
            <div>
              <div className="font-heading font-bold text-xl tabular-nums text-ink">{venue.capacity.toLocaleString("cs")}</div>
              <div className="text-sm text-muted">Kapacita</div>
            </div>
            <div>
              <div className="font-heading font-bold text-xl text-ink">
                {pitchType === "natural" ? "Přírodní" : pitchType === "hybrid" ? "Hybridní" : "Umělý"}
              </div>
              <div className="text-sm text-muted">Povrch</div>
            </div>
            <div>
              <div className="font-heading font-bold text-xl text-ink">{venue.isMain ? "Hlavní" : "Vedlejší"}</div>
              <div className="text-sm text-muted">Hřiště</div>
            </div>
          </div>
        </div>

        {days.length === 0 ? (
          <div className="card p-6 text-center text-sm text-muted">Na tomhle hřišti se zatím žádný zápas nehraje.</div>
        ) : (
          days.map((d) => {
            const today = matches.filter((m) => m.day === d);
            return <DayBlock key={d} title={`${stageTitle(today[0])}, ${dayLabel(today[0].scheduledAt)}`} matches={today} myTeamId={teamId} />;
          })
        )}
      </div>
    </div>
  );
}
