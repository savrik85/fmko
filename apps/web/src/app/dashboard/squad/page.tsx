"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { PlayerAvatar } from "@okresni-masina/ui/avatar";
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
            {p.avatar ? (
              <div className="w-11 h-11 shrink-0"><PlayerAvatar config={p.avatar as any} size="sm" jerseyColor={color} /></div>
            ) : (
              <div className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-heading font-bold" style={{ backgroundColor: color }}>{p.first_name[0]}</div>
            )}
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

            {/* Hero header s avatarem */}
            <div className="relative rounded-t-2xl sm:rounded-t-card overflow-hidden" style={{ backgroundColor: color }}>
              {/* Close button */}
              <button onClick={() => setSelected(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/20 text-white flex items-center justify-center text-lg z-10 hover:bg-black/40">&times;</button>

              <div className="flex flex-col items-center pt-6 pb-5 px-5">
                {/* Velký avatar */}
                <div className="w-32 h-32 mb-3">
                  {selected.avatar ? (
                    <PlayerAvatar config={selected.avatar as any} size="lg" jerseyColor={color} />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center text-white font-heading font-bold text-5xl">
                      {selected.first_name[0]}
                    </div>
                  )}
                </div>

                {/* Jméno + přezdívka */}
                <div className="text-center text-white">
                  <div className="font-heading text-2xl font-bold">
                    {selected.first_name} {selected.last_name}
                  </div>
                  {selected.nickname && (
                    <div className="text-white/70 text-lg">&bdquo;{selected.nickname}&ldquo;</div>
                  )}
                </div>

                {/* Position badge + rating */}
                <div className="flex items-center gap-4 mt-3">
                  <span className="bg-white/20 text-white px-3 py-1 rounded-full font-heading font-bold text-sm">
                    {POS_LABELS[selected.position]}
                  </span>
                  <span className="font-heading font-extrabold text-3xl text-white tabular-nums">
                    {selected.overall_rating}
                  </span>
                </div>
              </div>
            </div>

            {/* Bio */}
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-sm italic text-muted leading-relaxed">&ldquo;{selected.description}&rdquo;</p>
            </div>

            {/* Životní kontext */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg">&#128116;</div>
                  <div className="font-heading font-bold text-sm">{selected.age} let</div>
                </div>
                <div>
                  <div className="text-lg">&#128188;</div>
                  <div className="font-heading font-bold text-sm truncate">{selected.lifeContext?.occupation ?? "—"}</div>
                </div>
                <div>
                  <div className="text-lg">&#128170;</div>
                  <div className="font-heading font-bold text-sm">{(selected.lifeContext?.condition ?? 100)}%</div>
                  <div className="text-[10px] text-muted">Kondice</div>
                </div>
              </div>
            </div>

            {/* Osobnostní traits jako popisné labely */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="text-xs text-muted uppercase font-heading font-bold mb-2">Charakter</div>
              <div className="flex flex-wrap gap-2">
                <TraitBadge value={selected.personality?.discipline ?? 50} label="Disciplína" icon="&#128221;" />
                <TraitBadge value={selected.personality?.patriotism ?? 50} label="Patriotismus" icon="&#127463;" />
                <TraitBadge value={selected.personality?.alcohol ?? 30} label="Alkohol" icon="&#127866;" inverted />
                <TraitBadge value={selected.personality?.temper ?? 40} label="Temperament" icon="&#128293;" inverted />
              </div>
            </div>

            {/* Morálka gauge */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted uppercase font-heading font-bold">Morálka</span>
                <span className="text-sm font-heading font-bold">{getMoraleEmoji(selected.lifeContext?.morale ?? 50)} {selected.lifeContext?.morale ?? 50}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${selected.lifeContext?.morale ?? 50}%`,
                  backgroundColor: (selected.lifeContext?.morale ?? 50) >= 70 ? "#2D5F2D" : (selected.lifeContext?.morale ?? 50) >= 40 ? "#C4A035" : "#D94032",
                }} />
              </div>
            </div>

            {/* Fotbalové skilly */}
            <div className="px-5 py-4 space-y-2">
              <div className="text-xs text-muted uppercase font-heading font-bold mb-1">Fotbalové dovednosti</div>
              <StatBar label="Rychlost" value={selected.skills?.speed ?? 0} max={100} />
              <StatBar label="Technika" value={selected.skills?.technique ?? 0} max={100} />
              <StatBar label="Střelba" value={selected.skills?.shooting ?? 0} max={100} />
              <StatBar label="Přihrávky" value={selected.skills?.passing ?? 0} max={100} />
              <StatBar label="Hlavičky" value={selected.skills?.heading ?? 0} max={100} />
              <StatBar label="Obrana" value={selected.skills?.defense ?? 0} max={100} />
              {selected.position === "GK" && <StatBar label="Brankář" value={selected.skills?.goalkeeping ?? 0} max={100} />}

              <div className="text-xs text-muted uppercase font-heading font-bold mt-4 mb-1">Fyzické</div>
              <StatBar label="Kondice" value={selected.physical?.stamina ?? 0} max={100} />
              <StatBar label="Síla" value={selected.physical?.strength ?? 0} max={100} />
            </div>

            <div className="p-5 pt-0">
              <button onClick={() => setSelected(null)} className="w-full py-3 rounded-card bg-gray-100 hover:bg-gray-200 font-heading font-bold text-muted transition-colors">Zavřít</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TraitBadge({ value, label, icon, inverted }: { value: number; label: string; icon: string; inverted?: boolean }) {
  const level = value >= 80 ? "Velmi vysoký" : value >= 60 ? "Vysoký" : value >= 40 ? "Průměrný" : value >= 20 ? "Nízký" : "Velmi nízký";
  const isGood = inverted ? value < 40 : value >= 60;
  const isBad = inverted ? value >= 60 : value < 40;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
      isGood ? "bg-pitch-500/10 text-pitch-600" : isBad ? "bg-card-red/10 text-card-red" : "bg-gray-100 text-muted"
    }`}>
      <span>{icon}</span>
      <span>{label}: {level}</span>
    </span>
  );
}

function getMoraleEmoji(morale: number): string {
  if (morale >= 80) return "\u{1F60A}";
  if (morale >= 60) return "\u{1F642}";
  if (morale >= 40) return "\u{1F610}";
  if (morale >= 20) return "\u{1F61E}";
  return "\u{1F621}";
}
