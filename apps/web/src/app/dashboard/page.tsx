"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Card, CardBody, Spinner, SectionLabel, PositionBadge, EntityLink } from "@/components/ui";

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
      setTeam(t); setPlayers(p); setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  const fitCount = players.filter((p) => (p.physical?.stamina ?? 0) > 3).length;

  return (
    <div className="page-container space-y-4">
      {/* Team header */}
      <div className="hero-gradient rounded-card p-6 text-white" style={{ backgroundColor: team.primary_color || "#2D5F2D" }}>
        <h1 className="text-h1 text-white">{team.name}</h1>
        <p className="text-white/70 text-sm mt-1">{team.village_name} &middot; {team.district}</p>
        <p className="text-white/70 text-sm">Rozpočet: {(team.budget ?? 0).toLocaleString("cs")} Kč &middot; {players.length} hráčů</p>
      </div>

      {/* Squad status */}
      <Card>
        <CardBody>
          <SectionLabel>Stav kádru</SectionLabel>
          <div className="grid grid-cols-3 gap-4 text-center">
            <StatusItem value={players.length} label="Celkem" color="text-pitch-500" />
            <StatusItem value={fitCount} label="Fit" color="text-pitch-500" />
            <StatusItem value={players.length - fitCount} label="Mimo" color="text-card-red" />
          </div>
        </CardBody>
      </Card>

      {/* Top players */}
      <Card>
        <CardBody>
          <SectionLabel>Nejlepší hráči</SectionLabel>
          <div className="space-y-3">
            {[...players].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                {p.avatar && typeof p.avatar === "object" && Object.keys(p.avatar).length > 2 ? (
                  <FaceAvatar faceConfig={p.avatar} size={36} />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-pitch-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{p.first_name[0]}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    <EntityLink type="player" id={p.id}>{p.first_name} {p.last_name}</EntityLink>
                    {p.nickname && <span className="text-gold-500 ml-1">&bdquo;{p.nickname}&ldquo;</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <PositionBadge position={p.position} />
                    <span className="text-xs text-muted">{p.age} let</span>
                  </div>
                </div>
                <div className={`font-heading font-bold text-lg tabular-nums ${p.overall_rating >= 70 ? "rating-gold" : p.overall_rating >= 50 ? "rating-good" : "rating-avg"}`}>
                  {p.overall_rating}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { href: "/dashboard/squad", icon: "\u{1F465}", label: "Kádr" },
          { href: "/dashboard/match", icon: "\u26BD", label: "Zápas" },
          { href: "/dashboard/table", icon: "\u{1F4CA}", label: "Tabulka" },
          { href: "/dashboard/squad", icon: "\u{1F3CB}", label: "Tréninky" },
        ].map((link) => (
          <a key={link.href + link.label} href={link.href}>
            <Card hover className="p-4 text-center">
              <div className="text-2xl mb-1">{link.icon}</div>
              <div className="text-h3">{link.label}</div>
            </Card>
          </a>
        ))}
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
