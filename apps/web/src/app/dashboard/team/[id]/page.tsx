"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { Spinner, SectionLabel, EntityLink, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
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
  const [leagueName, setLeagueName] = useState("");
  const [leaguePos, setLeaguePos] = useState<number | null>(null);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<Array<{ id: string; name: string }>>(`/api/teams/${teamId}/league-teams`).catch(() => []),
      apiFetch<{ leagueName: string; standings: Array<{ teamId: string | null; pos: number }> }>(`/api/teams/${teamId}/standings`).catch(() => null),
    ]).then(([t, p, lt, standings]) => {
      setTeam(t);
      setPlayers(p);
      setLeagueTeams(lt);
      if (standings) {
        setLeagueName(standings.leagueName);
        const myPos = standings.standings.find((s) => s.teamId === teamId);
        if (myPos) setLeaguePos(myPos.pos);
      }
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
    <>
      {/* ═══ Team header — full width, team color ═══ */}
      <div className="hero-gradient px-5 sm:px-8 py-5" style={{ backgroundColor: color }}>
        <div className="flex items-center gap-4 max-w-5xl mx-auto">
          {leagueTeams.length > 1 && (
            <button
              onClick={() => prevTeam && router.push(`/dashboard/team/${prevTeam.id}`)}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
            >
              &#9664;
            </button>
          )}

          <BadgePreview
            primary={color}
            secondary={team.secondary_color || "#FFFFFF"}
            pattern={(team.badge_pattern as BadgePattern) || "shield"}
            initials={team.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()}
            size={56}
          />

          <div className="flex-1 min-w-0">
            <h1 className="font-heading font-extrabold text-white text-xl sm:text-2xl leading-tight truncate">
              {team.name}
            </h1>
            <div className="text-white/60 text-sm mt-0.5">
              <EntityLink type="village" id={team.village_name} className="!text-white/80 !decoration-white/30">{team.village_name}</EntityLink>
              {" "}&middot; {team.district}
            </div>
            {leaguePos && leagueName && (
              <a href="/dashboard/liga" className="inline-block mt-1 text-white/90 text-sm font-heading font-bold hover:text-white transition-colors underline decoration-white/30">
                {leaguePos}. v {leagueName}
              </a>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
              <div className="font-heading font-extrabold text-xl tabular-nums leading-none text-white">{players.length}</div>
              <div className="text-white/50 text-[10px] font-heading font-bold uppercase mt-1">Hráčů</div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
              <div className="font-heading font-extrabold text-xl tabular-nums leading-none text-white">{avgRating}</div>
              <div className="text-white/50 text-[10px] font-heading font-bold uppercase mt-1">Rating</div>
            </div>
          </div>

          {leagueTeams.length > 1 && (
            <button
              onClick={() => nextTeam && router.push(`/dashboard/team/${nextTeam.id}`)}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
            >
              &#9654;
            </button>
          )}
        </div>
      </div>

    <div className="page-container space-y-5">

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
    </>
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
