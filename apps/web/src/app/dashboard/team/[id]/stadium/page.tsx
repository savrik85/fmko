"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiFetch, type Team } from "@/lib/api";
import { Spinner } from "@/components/ui";

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
}

interface StadiumData {
  stadiumName: string | null;
  capacity: number;
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  customization: Customization;
}

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

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<StadiumData>(`/api/teams/${teamId}/stadium`),
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<{ bannerContracts: Array<{ sponsorName: string }> }>(`/api/teams/${teamId}/sponsors`)
        .catch((e) => { console.warn("sponsors fetch:", e); return null; }),
    ])
      .then(([s, t, sp]) => {
        setStadium(s); setTeam(t);
        setSponsors(sp?.bannerContracts?.map((c) => c.sponsorName) ?? []);
      })
      .catch((e) => console.error("visit stadium load:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!stadium || !team) return <div className="page-container">Stadion nenalezen.</div>;

  return (
    <div className="page-container space-y-5">
      {/* Header s tlačítkem zpět */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-pitch-500 font-heading font-bold hover:text-pitch-600">
          ← Zpět
        </button>
        <div className="text-right">
          <div className="font-heading font-bold text-base">{team.name}</div>
          {stadium.stadiumName && <div className="text-xs text-muted">{stadium.stadiumName}</div>}
        </div>
      </div>

      <Stadium3DViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        pitchCondition={stadium.pitchCondition}
        pitchType={stadium.pitchType}
        facilities={stadium.facilities}
        teamColor={team.primary_color}
        secondaryColor={team.secondary_color}
        badgePattern={team.badge_pattern}
        badgeInitials={teamInitials(team.name)}
        stadiumName={stadium.stadiumName}
        sponsors={sponsors}
        customization={stadium.customization}
      />

      {/* 3D scéna */}
      <div className="card p-4 sm:p-5">
        <div className="h-[280px] sm:h-[500px] rounded-xl overflow-hidden bg-gradient-to-b from-sky-100 to-sky-50" style={{ touchAction: "pan-y" }}>
          <Stadium3D
            pitchCondition={stadium.pitchCondition}
            pitchType={stadium.pitchType}
            facilities={stadium.facilities}
            teamColor={team.primary_color}
            secondaryColor={team.secondary_color}
            badgePattern={team.badge_pattern}
            badgeInitials={teamInitials(team.name)}
            stadiumName={stadium.stadiumName}
            sponsors={sponsors}
            customization={stadium.customization}
          />
        </div>
        <button
          onClick={() => setViewerOpen(true)}
          className="w-full mt-2 py-2 bg-pitch-500 hover:bg-pitch-600 text-white rounded-lg text-sm font-heading font-bold transition-colors"
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
    </div>
  );
}
