"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { StatBar } from "@/components/ui";

const POS_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";

export default function SquadPage() {
  const { teamId } = useTeam();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [selected, setSelected] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
    ]).then(([t, p]) => { setTeam(t); setPlayers(p); setLoading(false); });
  }, [teamId]);

  if (loading) return <div className="p-6 flex justify-center min-h-[50vh] items-center"><div className="w-8 h-8 border-3 border-pitch-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!team) return <div className="p-6">Tým nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);
  const sorted = [...filtered].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || b.overall_rating - a.overall_rating);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="font-heading text-2xl font-bold text-pitch-500 mb-4">Kádr ({players.length})</h1>

      <div className="flex gap-2 mb-4">
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
          <button key={p.id} onClick={() => setSelected(p)} className="w-full bg-white rounded-card shadow-card hover:shadow-hover p-4 text-left transition-all flex gap-3 items-center">
            <div className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-heading font-bold" style={{ backgroundColor: color }}>{p.first_name[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading font-bold truncate">{p.first_name} {p.last_name}</span>
                {p.nickname && <span className="text-xs text-gold-500 shrink-0">&bdquo;{p.nickname}&ldquo;</span>}
              </div>
              <div className="text-xs text-muted mt-0.5">
                <span className="font-heading font-bold" style={{ color }}>{POS_LABELS[p.position]}</span> &middot; {p.age} let &middot; {p.lifeContext?.occupation ?? ""}
              </div>
              <p className="text-xs text-muted mt-1 truncate">{p.description}</p>
            </div>
            <div className="font-heading font-bold text-xl tabular-nums" style={{ color }}>{p.overall_rating}</div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setSelected(null)}>
          <div className="bg-paper w-full sm:max-w-md sm:rounded-card rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 text-white rounded-t-2xl sm:rounded-t-card" style={{ backgroundColor: color }}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-heading text-2xl font-bold">{selected.first_name} {selected.last_name}</div>
                  {selected.nickname && <div className="text-white/70">&bdquo;{selected.nickname}&ldquo;</div>}
                  <div className="text-white/70 text-sm mt-1">{selected.age} let &middot; {selected.lifeContext?.occupation ?? ""}</div>
                </div>
                <div className="font-heading font-bold text-4xl tabular-nums">{selected.overall_rating}</div>
              </div>
              <p className="text-white/80 text-sm mt-2">{selected.description}</p>
            </div>
            <div className="px-5 py-4 space-y-2">
              <div className="text-xs text-muted uppercase font-heading font-bold mb-1">Fotbalové</div>
              <StatBar label="RYC" value={selected.skills?.speed ?? 0} max={100} />
              <StatBar label="TEC" value={selected.skills?.technique ?? 0} max={100} />
              <StatBar label="STŘ" value={selected.skills?.shooting ?? 0} max={100} />
              <StatBar label="PŘI" value={selected.skills?.passing ?? 0} max={100} />
              <StatBar label="HLA" value={selected.skills?.heading ?? 0} max={100} />
              <StatBar label="OBR" value={selected.skills?.defense ?? 0} max={100} />
              {selected.position === "GK" && <StatBar label="BRA" value={selected.skills?.goalkeeping ?? 0} max={100} />}
              <div className="text-xs text-muted uppercase font-heading font-bold mt-4 mb-1">Fyzické</div>
              <StatBar label="KON" value={selected.physical?.stamina ?? 0} max={100} />
              <StatBar label="SÍL" value={selected.physical?.strength ?? 0} max={100} />
              <div className="text-xs text-muted uppercase font-heading font-bold mt-4 mb-1">Osobnost</div>
              <StatBar label="DIS" value={selected.personality?.discipline ?? 0} max={100} />
              <StatBar label="PAT" value={selected.personality?.patriotism ?? 0} max={100} />
              <StatBar label="ALK" value={selected.personality?.alcohol ?? 0} max={100} />
              <StatBar label="TEM" value={selected.personality?.temper ?? 0} max={100} />
            </div>
            <div className="p-5 pt-0">
              <button onClick={() => setSelected(null)} className="w-full py-3 rounded-card bg-gray-100 hover:bg-gray-200 font-heading font-bold text-muted">Zavřít</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
