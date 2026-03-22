"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { Spinner, SectionLabel, EntityLink } from "@/components/ui";
import { PlayerCardCompact } from "@/components/players/player-card";

const POS_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";

export default function TeamPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [leagueTeams, setLeagueTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<Array<{ id: string; name: string }>>(`/api/teams/${teamId}/league-teams`).catch(() => []),
    ]).then(([t, p, lt]) => {
      setTeam(t);
      setPlayers(p);
      setLeagueTeams(lt);
      setLoading(false);
    });
  }, [teamId]);

  const teamIndex = leagueTeams.findIndex((t) => t.id === teamId);
  const prevTeam = leagueTeams.length > 1 ? leagueTeams[(teamIndex - 1 + leagueTeams.length) % leagueTeams.length] : null;
  const nextTeam = leagueTeams.length > 1 ? leagueTeams[(teamIndex + 1) % leagueTeams.length] : null;

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);
  const sorted = [...filtered].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || b.overall_rating - a.overall_rating);
  const avgRating = players.length > 0 ? Math.round(players.reduce((s, p) => s + p.overall_rating, 0) / players.length) : 0;

  return (
    <div className="min-h-screen bg-paper">
      {/* ═══ Hero header ═══ */}
      <div className="hero-gradient text-white" style={{ backgroundColor: color }}>
        <div className="page-container py-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => router.back()} className="text-white/60 hover:text-white text-sm flex items-center gap-1 transition-colors">
              &#8592; Zpět
            </button>

            {leagueTeams.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => prevTeam && router.push(`/dashboard/team/${prevTeam.id}`)}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  &#9664;
                </button>
                <span className="text-white/50 text-xs font-heading tabular-nums px-1">
                  {teamIndex + 1}/{leagueTeams.length}
                </span>
                <button
                  onClick={() => nextTeam && router.push(`/dashboard/team/${nextTeam.id}`)}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  &#9654;
                </button>
              </div>
            )}
          </div>

          <div className="flex items-start gap-5">
            {/* Team color badge */}
            <div className="shrink-0 w-16 h-16 rounded-xl bg-white/15 border-2 border-white/20 flex items-center justify-center">
              <div className="w-10 h-10 rounded-lg" style={{ backgroundColor: team.secondary_color || "#fff" }} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pt-0.5">
              <h1 className="font-heading font-[800] text-white text-2xl sm:text-3xl leading-tight">
                {team.name}
              </h1>
              <div className="text-white/90 text-sm mt-1">
                <EntityLink type="village" id={team.village_name} className="!text-white/90 !decoration-white/40">{team.village_name}</EntityLink>
                {" "}&middot; {team.district}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className="page-container py-5 space-y-5">

        {/* ── Info grid ── */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Informace o týmu</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-6">
            <InfoRow label="Vesnice" value={team.village_name} />
            <InfoRow label="Okres" value={team.district} />
            <InfoRow label="Region" value={team.region} />
            <InfoRow label="Populace" value={team.population.toLocaleString("cs")} />
            <InfoRow label="Rozpočet" value={`${team.budget.toLocaleString("cs")} Kč`} />
            <InfoRow label="Reputace" value={`${team.reputation}`} />
            <InfoRow label="Hráčů" value={`${players.length}`} />
            <InfoRow label="Průměr hodnocení" value={`${avgRating}`} />
          </div>
        </div>

        {/* ── Squad ── */}
        <div>
          <SectionLabel>Kádr ({players.length})</SectionLabel>

          {/* Position filter */}
          <div className="flex gap-2 mb-4">
            {(["all", "GK", "DEF", "MID", "FWD"] as PosFilter[]).map((pos) => (
              <button
                key={pos}
                onClick={() => setFilter(pos)}
                className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${
                  filter === pos ? "text-white" : "bg-white text-muted shadow-card"
                }`}
                style={filter === pos ? { backgroundColor: color } : undefined}
              >
                {pos === "all" ? "Všichni" : `${POS_LABELS[pos]} (${players.filter((p) => p.position === pos).length})`}
              </button>
            ))}
          </div>

          {/* Player list */}
          <div className="space-y-2">
            {sorted.map((p) => (
              <PlayerCardCompact
                key={p.id}
                player={p}
                teamColor={color}
              />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-label">{label}</div>
      <div className="font-heading font-bold text-base">{value}</div>
    </div>
  );
}
