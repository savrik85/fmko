"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { PlayerCardCompact } from "@/components/players/player-card";

const POS_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";

export default function SquadPage() {
  const { teamId } = useTeam();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
    ]).then(([t, p]) => { setTeam(t); setPlayers(p); setLoading(false); });
  }, [teamId]);

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  if (!team) return <div className="p-6">Tým nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);
  const sorted = [...filtered].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || b.overall_rating - a.overall_rating);

  return (
    <div className="page-container space-y-5">

      <div className="flex gap-2">
        {(["all", "GK", "DEF", "MID", "FWD"] as PosFilter[]).map((pos) => (
          <button key={pos} onClick={() => setFilter(pos)}
            className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${filter === pos ? "text-white" : "bg-white text-muted shadow-card"}`}
            style={filter === pos ? { backgroundColor: color } : undefined}>
            {pos === "all" ? "Všichni" : POS_LABELS[pos]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.map((p) => (
          <PlayerCardCompact key={p.id} player={p} teamColor={color} />
        ))}
      </div>
    </div>
  );
}
