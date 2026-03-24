"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Card, CardBody, Spinner, SectionLabel, PositionBadge, EntityLink, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface Standing {
  pos: number;
  team: string;
  teamId: string | null;
  points: number;
  played: number;
  isPlayer?: boolean;
}

interface ScheduleMatch {
  id: string;
  round: number | null;
  status: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  scheduledAt: string | null;
  isHome: boolean;
}

interface UnseenMatch {
  matchId: string;
  opponent: string;
  round: number;
  isHome: boolean;
}

export default function DashboardPage() {
  const { teamId } = useTeam();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  const [unseen, setUnseen] = useState<UnseenMatch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<{ standings: Standing[] }>(`/api/teams/${teamId}/standings`).catch(() => ({ standings: [] })),
      apiFetch<{ matches: ScheduleMatch[] }>(`/api/teams/${teamId}/schedule`).catch(() => ({ matches: [] })),
      apiFetch<UnseenMatch | null>(`/api/teams/${teamId}/unseen-match`).catch(() => null),
    ]).then(([t, p, s, m, u]) => {
      setTeam(t);
      setPlayers(p);
      setStandings(s.standings);
      setMatches(m.matches);
      setUnseen(u);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  // Unseen match overlay
  if (unseen) {
    const teamColor = team.primary_color || "#2D5F2D";
    return (
      <div className="flex items-center justify-center min-h-[70vh] px-4">
        <div className="w-full max-w-lg animate-slide-up">
          {/* Dark match card */}
          <div className="rounded-2xl overflow-hidden shadow-2xl">
            {/* Header with team color accent */}
            <div className="relative py-8 px-6 text-center" style={{ background: `linear-gradient(135deg, ${teamColor} 0%, #0f170f 100%)` }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
              <div className="relative">
                <div className="text-white/50 text-sm font-heading font-bold uppercase tracking-widest mb-3">
                  {unseen.round}. kolo · {unseen.isHome ? "Domácí" : "Venku"}
                </div>
                <div className="flex items-center justify-center gap-6">
                  <div className="text-center">
                    <BadgePreview
                      primary={teamColor}
                      secondary={team.secondary_color || "#FFFFFF"}
                      pattern={(team.badge_pattern as BadgePattern) || "shield"}
                      initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()}
                      size={52}
                    />
                    <div className="font-heading font-bold text-white text-sm mt-2 max-w-[100px] truncate">{team.name}</div>
                  </div>
                  <div className="font-heading font-[800] text-4xl text-white/30">vs</div>
                  <div className="text-center">
                    <div className="w-[52px] h-[52px] rounded-xl bg-white/10 flex items-center justify-center text-white/70 font-heading font-bold text-xl mx-auto">
                      {unseen.opponent.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div className="font-heading font-bold text-white text-sm mt-2 max-w-[100px] truncate">{unseen.opponent}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white p-6 space-y-3">
              <Link
                href={`/dashboard/match/${unseen.matchId}/replay`}
                className="btn btn-primary btn-lg w-full text-center"
              >
                Sledovat zápas
              </Link>
              <button
                onClick={async () => {
                  await apiFetch(`/api/matches/${unseen.matchId}/mark-seen`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ teamId }),
                  });
                  setUnseen(null);
                }}
                className="w-full text-center py-2.5 text-sm text-muted hover:text-ink transition-colors"
              >
                Zobrazit výsledek
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const fitCount = players.filter((p) => (p.physical?.stamina ?? 0) > 3).length;
  const nextMatch = matches.find((m) => m.status !== "simulated");
  const recentMatches = matches.filter((m) => m.status === "simulated").slice(-5).reverse();
  const myStanding = standings.find((s) => s.isPlayer);

  return (
    <div className="page-container space-y-4">

      {/* 3-column overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Squad status */}
        <Card>
          <CardBody>
            <SectionLabel>Kádr</SectionLabel>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-heading font-bold text-2xl tabular-nums text-pitch-500">{players.length}</div>
                <div className="text-xs text-muted">Celkem</div>
              </div>
              <div>
                <div className="font-heading font-bold text-2xl tabular-nums text-pitch-500">{fitCount}</div>
                <div className="text-xs text-muted">Fit</div>
              </div>
              <div>
                <div className="font-heading font-bold text-2xl tabular-nums text-card-red">{players.length - fitCount}</div>
                <div className="text-xs text-muted">Mimo</div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Next match */}
        <Card>
          <CardBody>
            <SectionLabel>Další zápas</SectionLabel>
            {nextMatch ? (
              <div className="text-center">
                <div className="font-heading font-bold text-base">{nextMatch.isHome ? team.name : nextMatch.homeName}</div>
                <div className="text-muted text-sm my-1">vs</div>
                <div className="font-heading font-bold text-base">{nextMatch.isHome ? nextMatch.awayName : team.name}</div>
                {nextMatch.round && <div className="text-xs text-muted mt-2">{nextMatch.round}. kolo</div>}
              </div>
            ) : (
              <div className="text-center text-muted py-2">Žádný naplánovaný zápas</div>
            )}
          </CardBody>
        </Card>

        {/* League position */}
        <Card>
          <CardBody>
            <SectionLabel>Liga</SectionLabel>
            {myStanding ? (
              <div className="text-center">
                <div className="font-heading font-[800] text-4xl tabular-nums text-pitch-500">{myStanding.pos}.</div>
                <div className="text-sm text-muted">{myStanding.points} bodů · {myStanding.played} zápasů</div>
                <Link href="/dashboard/liga" className="text-sm text-pitch-500 font-heading font-bold hover:underline mt-2 inline-block">Zobrazit tabulku →</Link>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-muted py-2">Zatím žádné výsledky</div>
                <Link href="/dashboard/match" className="text-sm text-pitch-500 font-heading font-bold hover:underline">Hrát zápas →</Link>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Recent matches */}
      {recentMatches.length > 0 && (
        <Card>
          <CardBody>
            <SectionLabel>Poslední zápasy</SectionLabel>
            <div className="space-y-2">
              {recentMatches.map((m) => {
                const won = m.isHome ? (m.homeScore ?? 0) > (m.awayScore ?? 0) : (m.awayScore ?? 0) > (m.homeScore ?? 0);
                const draw = m.homeScore === m.awayScore;
                return (
                  <Link key={m.id} href={`/dashboard/match/${m.id}`} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-surface transition-colors">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${won ? "bg-pitch-400" : draw ? "bg-gold-500" : "bg-card-red"}`}>
                      {won ? "V" : draw ? "R" : "P"}
                    </div>
                    <div className="flex-1 font-heading text-sm">{m.homeName} vs {m.awayName}</div>
                    <div className="font-heading font-[800] text-base tabular-nums">{m.homeScore} : {m.awayScore}</div>
                  </Link>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

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
      <div className="grid grid-cols-4 gap-3">
        {[
          { href: "/dashboard/squad", icon: "\u{1F465}", label: "Kádr" },
          { href: "/dashboard/match", icon: "\u26BD", label: "Zápas" },
          { href: "/dashboard/liga", icon: "\u{1F3C6}", label: "Liga" },
          { href: "/dashboard/training", icon: "\u{1F3CB}", label: "Tréninky" },
        ].map((link) => (
          <a key={link.href} href={link.href}>
            <Card hover className="p-4 text-center">
              <div className="text-2xl mb-1">{link.icon}</div>
              <div className="font-heading font-bold text-sm">{link.label}</div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
