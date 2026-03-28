"use client";
export const runtime = "edge";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }

interface MatchInfo {
  id: string; round: number | null;
  home_name: string; away_name: string;
  home_color: string; away_color: string;
  home_secondary: string; away_secondary: string;
  home_badge: string; away_badge: string;
  home_score: number; away_score: number;
  home_team_id: string; away_team_id: string;
  isHome: boolean;
}

export default function MatchDayPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const matchId = params.id as string;
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    apiFetch<Record<string, unknown>>(`/api/matches/${matchId}`)
      .then((r) => {
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
          home_team_id: r.home_team_id as string,
          away_team_id: r.away_team_id as string,
          isHome: r.home_team_id === teamId,
        });
        setLoading(false);
      })
      .catch(() => {
        // Mark as seen to prevent redirect loop, then go to dashboard
        apiFetch(`/api/matches/${matchId}/mark-seen`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
        }).catch(() => {});
        setLoading(false);
        router.push("/dashboard");
      });
  }, [matchId, teamId]);

  const skipMatch = async () => {
    setSkipping(true);
    const tid = teamId ?? (match?.isHome ? match.home_team_id : match?.away_team_id);
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
    await fetch(`${API}/api/matches/${matchId}/mark-seen`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: tid }),
    }).catch(() => {});
    window.location.href = `/dashboard/match/${matchId}`;
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner size="lg" /></div>;
  if (!match) return null;

  const hc = match.home_color;
  const ac = match.away_color;

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-md">
        {/* Match card */}
        <div className="rounded-2xl overflow-hidden shadow-xl">
          {/* Dark header with teams */}
          <div className="relative px-6 py-8" style={{ background: "#0a0a0a" }}>
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
            <div className="relative">
              {match.round && (
                <div className="text-white/40 text-sm font-heading font-bold uppercase tracking-widest mb-4 text-center">
                  {match.round}. kolo · Zápas odehrán
                </div>
              )}
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <BadgePreview primary={hc} secondary={match.home_secondary} pattern={match.home_badge as BadgePattern} initials={ini(match.home_name)} size={56} />
                  <div className="font-heading font-bold text-white text-base mt-2 max-w-[120px]">{match.home_name}</div>
                </div>
                <div className="font-heading font-[800] text-5xl text-white/30">vs</div>
                <div className="text-center">
                  <BadgePreview primary={ac} secondary={match.away_secondary} pattern={match.away_badge as BadgePattern} initials={ini(match.away_name)} size={56} />
                  <div className="font-heading font-bold text-white text-base mt-2 max-w-[120px]">{match.away_name}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white p-6 space-y-3">
            <button
              onClick={async () => {
                const tid = teamId ?? (match?.isHome ? match.home_team_id : match?.away_team_id);
                const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
                await fetch(`${API}/api/matches/${matchId}/mark-seen`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ teamId: tid }),
                }).catch(() => {});
                window.location.href = `/dashboard/match/${matchId}/replay`;
              }}
              className="btn btn-primary btn-lg w-full font-heading font-bold text-lg py-4">
              ▶ Sledovat zápas
            </button>
            <button onClick={skipMatch} disabled={skipping}
              className="btn btn-ghost btn-lg w-full font-heading font-bold">
              {skipping ? "..." : "Přeskočit → zobrazit výsledek"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
