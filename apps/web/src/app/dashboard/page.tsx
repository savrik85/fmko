"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { Card, CardBody } from "@/components/ui";

export default function DashboardPage() {
  const { teamId } = useTeam();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
    ]).then(([t, p]) => {
      setTeam(t);
      setPlayers(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-3 border-pitch-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!team) return <div className="p-6">Tým nenalezen.</div>;

  const fitCount = players.filter((p) => (p.physical?.stamina ?? 0) > 3).length;
  const injuredCount = players.length - fitCount;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      {/* Team header */}
      <div className="rounded-card p-5 text-white" style={{ backgroundColor: team.primary_color || "#2D5F2D" }}>
        <h1 className="font-heading text-2xl font-bold">{team.name}</h1>
        <div className="text-white/70 text-sm mt-1">
          {team.village_name} &middot; {team.district}
        </div>
        <div className="text-white/70 text-sm">
          Rozpočet: {(team.budget ?? 0).toLocaleString("cs")} Kč &middot; {players.length} hráčů
        </div>
      </div>

      {/* Squad status */}
      <Card>
        <CardBody>
          <div className="text-xs text-muted uppercase font-heading font-bold mb-3">
            Stav kádru
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <StatusItem value={players.length} label="Celkem" color="text-pitch-500" />
            <StatusItem value={fitCount} label="Fit" color="text-pitch-500" />
            <StatusItem value={injuredCount} label="Mimo" color="text-card-red" />
          </div>
        </CardBody>
      </Card>

      {/* Top players */}
      <Card>
        <CardBody>
          <div className="text-xs text-muted uppercase font-heading font-bold mb-3">
            Nejlepší hráči
          </div>
          <div className="space-y-2">
            {[...players].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                  style={{ backgroundColor: team.primary_color || "#2D5F2D" }}
                >
                  {p.first_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {p.first_name} {p.last_name}
                    {p.nickname && <span className="text-gold-500 ml-1">&bdquo;{p.nickname}&ldquo;</span>}
                  </div>
                  <div className="text-xs text-muted">{p.position} &middot; {p.age} let</div>
                </div>
                <div className="font-heading font-bold tabular-nums" style={{ color: team.primary_color || "#2D5F2D" }}>
                  {p.overall_rating}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <a href="/dashboard/squad" className="bg-white rounded-card shadow-card p-4 text-center hover:shadow-hover transition-all">
          <div className="text-2xl mb-1">&#128101;</div>
          <div className="font-heading font-bold text-sm">Kádr</div>
        </a>
        <a href="/dashboard/match" className="bg-white rounded-card shadow-card p-4 text-center hover:shadow-hover transition-all">
          <div className="text-2xl mb-1">&#9917;</div>
          <div className="font-heading font-bold text-sm">Zápas</div>
        </a>
        <a href="/dashboard/table" className="bg-white rounded-card shadow-card p-4 text-center hover:shadow-hover transition-all">
          <div className="text-2xl mb-1">&#128202;</div>
          <div className="font-heading font-bold text-sm">Tabulka</div>
        </a>
        <a href="/dashboard/squad" className="bg-white rounded-card shadow-card p-4 text-center hover:shadow-hover transition-all">
          <div className="text-2xl mb-1">&#127947;</div>
          <div className="font-heading font-bold text-sm">Tréninky</div>
        </a>
      </div>
    </div>
  );
}

function StatusItem({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <div className={`font-heading font-bold text-2xl tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
