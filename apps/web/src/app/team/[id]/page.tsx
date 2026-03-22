"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { StatBar, Spinner, PositionBadge, SectionLabel } from "@/components/ui";

const POS_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";

export default function TeamPage() {
  const params = useParams();
  const teamId = params.id as string;
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [selected, setSelected] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
    ]).then(([t, p]) => {
      setTeam(t);
      setPlayers(p);
      setLoading(false);
    });
  }, [teamId]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Spinner />
      </main>
    );
  }

  if (!team) return <main className="p-6">Tým nenalezen.</main>;

  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);
  const sorted = [...filtered].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || b.overall_rating - a.overall_rating);

  return (
    <main className="min-h-screen">
      {/* Team header */}
      <div className="p-6 text-white" style={{ backgroundColor: team.primary_color }}>
        <h1 className="font-heading text-3xl font-bold">{team.name}</h1>
        <p className="text-white/70">{team.village_name} &middot; {team.district}</p>
        <p className="text-white/70 text-sm">Rozpočet: {team.budget.toLocaleString("cs")} Kč &middot; {players.length} hráčů</p>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(["all", "GK", "DEF", "MID", "FWD"] as PosFilter[]).map((pos) => (
            <button
              key={pos}
              onClick={() => setFilter(pos)}
              className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${
                filter === pos ? "text-white" : "bg-white text-muted shadow-card"
              }`}
              style={filter === pos ? { backgroundColor: team.primary_color } : undefined}
            >
              {pos === "all" ? `Všichni (${players.length})` : `${POS_LABELS[pos]} (${players.filter((p) => p.position === pos).length})`}
            </button>
          ))}
        </div>

        {/* Player list */}
        <div className="space-y-2">
          {sorted.map((player) => (
            <button
              key={player.id}
              onClick={() => setSelected(player)}
              className="w-full bg-white rounded-card shadow-card hover:shadow-hover p-4 text-left transition-all flex gap-3 items-center"
            >
              <div
                className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-heading font-bold"
                style={{ backgroundColor: team.primary_color }}
              >
                {player.first_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-heading font-bold truncate">
                    {player.first_name} {player.last_name}
                  </span>
                  {player.nickname && (
                    <span className="text-xs text-gold-500 shrink-0">&bdquo;{player.nickname}&ldquo;</span>
                  )}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  <span className="font-heading font-bold" style={{ color: team.primary_color }}>{POS_LABELS[player.position]}</span>
                  {" "}&middot; {player.age} let &middot; {player.lifeContext.occupation}
                </div>
                <p className="text-xs text-muted mt-1 truncate">{player.description}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="font-heading font-bold text-xl tabular-nums" style={{ color: team.primary_color }}>
                  {player.overall_rating}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Player detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setSelected(null)}>
          <div className="bg-paper w-full sm:max-w-md sm:rounded-card rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 text-white rounded-t-2xl sm:rounded-t-card" style={{ backgroundColor: team.primary_color }}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-heading text-2xl font-bold">{selected.first_name} {selected.last_name}</div>
                  {selected.nickname && <div className="text-white/70">&bdquo;{selected.nickname}&ldquo;</div>}
                  <div className="text-white/70 text-sm mt-1">{selected.age} let &middot; {selected.lifeContext.occupation}</div>
                </div>
                <div className="font-heading font-bold text-4xl tabular-nums">{selected.overall_rating}</div>
              </div>
              <p className="text-white/80 text-sm mt-2">{selected.description}</p>
            </div>

            {/* Skills */}
            <div className="px-5 py-4 space-y-2">
              <div className="text-xs text-muted uppercase font-heading font-bold mb-1">Fotbalové</div>
              <StatBar label="RYC" value={selected.skills.speed} />
              <StatBar label="TEC" value={selected.skills.technique} />
              <StatBar label="STŘ" value={selected.skills.shooting} />
              <StatBar label="PŘI" value={selected.skills.passing} />
              <StatBar label="HLA" value={selected.skills.heading} />
              <StatBar label="OBR" value={selected.skills.defense} />
              {selected.position === "GK" && <StatBar label="BRA" value={selected.skills.goalkeeping} />}

              <div className="text-xs text-muted uppercase font-heading font-bold mt-4 mb-1">Fyzické</div>
              <StatBar label="KON" value={selected.physical.stamina} />
              <StatBar label="SÍL" value={selected.physical.strength} />

              <div className="text-xs text-muted uppercase font-heading font-bold mt-4 mb-1">Osobnost</div>
              <StatBar label="DIS" value={selected.personality.discipline} />
              <StatBar label="PAT" value={selected.personality.patriotism} />
              <StatBar label="ALK" value={selected.personality.alcohol} />
              <StatBar label="TEM" value={selected.personality.temper} />
            </div>

            <div className="p-5 pt-0">
              <button onClick={() => setSelected(null)} className="w-full py-3 rounded-card bg-gray-100 hover:bg-gray-200 font-heading font-bold text-muted transition-colors">
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
