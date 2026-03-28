"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player, type ManagerProfile, type TeamMatchResults } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner, SectionLabel, PositionBadge, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface Standing {
  pos: number;
  team: string;
  teamId: string | null;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  isPlayer?: boolean;
}

interface ScheduleMatch {
  id: string;
  round: number | null;
  status: string;
  homeName: string;
  homeColor?: string;
  homeSecondary?: string;
  homeBadge?: string;
  awayName: string;
  awayColor?: string;
  awaySecondary?: string;
  awayBadge?: string;
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

function conditionLabel(condition: number): { text: string; color: string } {
  if (condition >= 80) return { text: "Fit", color: "text-pitch-500" };
  if (condition >= 50) return { text: "OK", color: "text-gold-500" };
  if (condition >= 20) return { text: "Unavený", color: "text-orange-500" };
  return { text: "Vyčerpaný", color: "text-card-red" };
}

export default function DashboardPage() {
  const { teamId } = useTeam();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  // unseen state removed — redirect handled inline in useEffect
  const [manager, setManager] = useState<ManagerProfile | null>(null);
  const [matchResults, setMatchResults] = useState<TeamMatchResults | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<{ standings: Standing[] }>(`/api/teams/${teamId}/standings`).catch(() => ({ standings: [] })),
      apiFetch<{ matches: ScheduleMatch[] }>(`/api/teams/${teamId}/schedule`).catch(() => ({ matches: [] })),
      apiFetch<ManagerProfile>(`/api/teams/${teamId}/manager`).catch(() => null),
      apiFetch<TeamMatchResults>(`/api/teams/${teamId}/match-results`).catch(() => null),
    ]).then(([t, p, s, m, mgr, mr]) => {
      setTeam(t);
      setPlayers(p);
      setStandings(s.standings);
      setMatches(m.matches);
      setManager(mgr);
      setMatchResults(mr);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);


  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const nextMatch = matches.find((m) => m.status !== "simulated");
  const myStanding = standings.find((s) => s.isPlayer);
  const avgCondition = players.length > 0 ? Math.round(players.reduce((s, p) => s + (p.lifeContext?.condition ?? 50), 0) / players.length) : 0;
  const avgMorale = players.length > 0 ? Math.round(players.reduce((s, p) => s + (p.lifeContext?.morale ?? 50), 0) / players.length) : 0;
  const injuredCount = players.filter((p) => (p.lifeContext?.condition ?? 100) < 30).length;
  const lowMoraleCount = players.filter((p) => (p.lifeContext?.morale ?? 50) < 30).length;

  // Determine today's program
  const gameDate = team.game_date ? new Date(team.game_date) : null;
  const dayOfWeek = gameDate?.getUTCDay() ?? 0;
  const isTrainingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
  // Match day: next match is on the SAME calendar date as game_date
  const isMatchDay = (() => {
    if (!nextMatch?.scheduledAt || !gameDate) return false;
    const matchDate = new Date(nextMatch.scheduledAt);
    return matchDate.getUTCFullYear() === gameDate.getUTCFullYear()
      && matchDate.getUTCMonth() === gameDate.getUTCMonth()
      && matchDate.getUTCDate() === gameDate.getUTCDate();
  })();
  const matchOpponent = nextMatch ? (nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName) : null;
  const dayName = gameDate ? gameDate.toLocaleDateString("cs", { weekday: "long" }) : "";

  return (
    <div className="page-container space-y-5">

      {/* ═══ Today's program ═══ */}
      <div className={`card p-4 sm:p-5 ${isMatchDay ? "ring-2 ring-pitch-400 bg-pitch-50/30" : ""}`}>
        <div className="flex items-center gap-4">
          <div className="text-3xl">
            {isMatchDay ? "⚽" : isTrainingDay ? "🏋️" : "🌴"}
          </div>
          <div className="flex-1">
            <div className="font-heading font-bold text-lg">
              {isMatchDay ? "Zápasový den!" : isTrainingDay ? "Tréninkový den" : "Volný den"}
            </div>
            <div className="text-sm text-muted">
              {dayName && <span className="capitalize">{dayName}</span>}
              {isMatchDay && matchOpponent && (
                <span> · <span className="font-heading font-bold text-pitch-600">{matchOpponent}</span> · výkop v 18:00</span>
              )}
              {isTrainingDay && !isMatchDay && (
                <span> · Trénink dle plánu</span>
              )}
              {!isTrainingDay && !isMatchDay && (
                <span> · Regenerace, žádný program</span>
              )}
            </div>
          </div>
          {isMatchDay && (
            <Link href="/dashboard/match" className="py-2 px-4 rounded-lg bg-pitch-500 text-white font-heading font-bold text-sm hover:bg-pitch-600 transition-colors">
              Sestava →
            </Link>
          )}
        </div>
      </div>

      {/* ═══ Row 1: Next match + Form + League position ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Next match */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Další zápas</SectionLabel>
          {nextMatch ? (
            <Link href={`/dashboard/match/${nextMatch.id}/replay`} className="block group">
              <div className="flex items-center justify-between">
                <div className="text-center flex-1">
                  <BadgePreview primary={color} secondary={team.secondary_color || "#FFF"}
                    pattern={(team.badge_pattern as BadgePattern) || "shield"}
                    initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={40} />
                  <div className="font-heading font-bold text-sm mt-1.5 truncate">{team.name}</div>
                </div>
                <div className="px-4 text-center">
                  <div className="font-heading font-[800] text-2xl text-muted">vs</div>
                  <div className="text-[10px] text-muted uppercase mt-1">{nextMatch.round}. kolo</div>
                </div>
                <div className="text-center flex-1">
                  <BadgePreview
                    primary={nextMatch.isHome ? (nextMatch.awayColor || "#666") : (nextMatch.homeColor || "#666")}
                    secondary={nextMatch.isHome ? (nextMatch.awaySecondary || "#FFF") : (nextMatch.homeSecondary || "#FFF")}
                    pattern={((nextMatch.isHome ? nextMatch.awayBadge : nextMatch.homeBadge) as BadgePattern) || "shield"}
                    initials={(nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName).split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={40} />
                  <div className="font-heading font-bold text-sm mt-1.5 truncate">{nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName}</div>
                </div>
              </div>
              <div className="text-center mt-3">
                <span className="text-xs text-pitch-500 font-heading font-bold group-hover:underline">Přehled zápasu →</span>
              </div>
            </Link>
          ) : (
            <div className="text-center text-muted py-4">Žádný naplánovaný zápas</div>
          )}
        </div>

        {/* Form + Results */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Forma</SectionLabel>
          {matchResults && matchResults.matches.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-1.5">
                {matchResults.form.map((f, i) => (
                  <span key={i} className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-heading font-bold text-white ${
                    f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-400"
                  }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-lg py-1.5">
                  <div className="font-heading font-bold text-lg tabular-nums text-pitch-500">{matchResults.summary.wins}</div>
                  <div className="text-[9px] text-muted uppercase">Výhry</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-1.5">
                  <div className="font-heading font-bold text-lg tabular-nums">{matchResults.summary.draws}</div>
                  <div className="text-[9px] text-muted uppercase">Remízy</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-1.5">
                  <div className="font-heading font-bold text-lg tabular-nums text-card-red">{matchResults.summary.losses}</div>
                  <div className="text-[9px] text-muted uppercase">Prohry</div>
                </div>
              </div>
              <div className="text-center text-sm text-muted">
                Skóre <span className="font-heading font-bold text-ink">{matchResults.summary.goalsFor}:{matchResults.summary.goalsAgainst}</span>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted py-4">Zatím bez zápasů</div>
          )}
        </div>

        {/* League position */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Liga</SectionLabel>
          {myStanding ? (
            <div className="text-center">
              <div className="font-heading font-[800] text-5xl tabular-nums" style={{ color }}>{myStanding.pos}.</div>
              <div className="text-sm text-muted mt-1">{myStanding.points} bodů · {myStanding.played} zápasů</div>
              {myStanding.goalsFor != null && myStanding.goalsAgainst != null && (
                <div className="text-xs text-muted mt-0.5">
                  {myStanding.goalsFor}:{myStanding.goalsAgainst} ({myStanding.goalsFor - myStanding.goalsAgainst >= 0 ? "+" : ""}{myStanding.goalsFor - myStanding.goalsAgainst})
                </div>
              )}
              <Link href="/dashboard/liga" className="text-sm text-pitch-500 font-heading font-bold hover:underline mt-2 inline-block">
                Zobrazit tabulku →
              </Link>
            </div>
          ) : (
            <div className="text-center text-muted py-4">
              <div>Zatím žádné výsledky</div>
              <Link href="/dashboard/match" className="text-sm text-pitch-500 font-heading font-bold hover:underline mt-2 inline-block">Hrát zápas →</Link>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Row 2: Squad health + Mini league table + Manager ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Squad health */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Stav kádru</SectionLabel>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="font-heading font-bold text-2xl tabular-nums" style={{ color }}>{players.length}</div>
                <div className="text-[10px] text-muted uppercase">Hráčů</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className={`font-heading font-bold text-2xl tabular-nums ${conditionLabel(avgCondition).color}`}>{avgCondition}%</div>
                <div className="text-[10px] text-muted uppercase">Prům. kondice</div>
              </div>
            </div>
            <div className="space-y-1.5">
              {injuredCount > 0 && (
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted">Zranění / vyčerpaní</span>
                  <span className="font-heading font-bold text-card-red">{injuredCount}</span>
                </div>
              )}
              {lowMoraleCount > 0 && (
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted">Nízká morálka</span>
                  <span className="font-heading font-bold text-gold-600">{lowMoraleCount}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm py-1">
                <span className="text-muted">Prům. morálka</span>
                <span className="font-heading font-bold">{avgMorale}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1">
                <span className="text-muted">Prům. rating</span>
                <span className="font-heading font-bold">{players.length > 0 ? Math.round(players.reduce((s, p) => s + p.overall_rating, 0) / players.length) : 0}</span>
              </div>
            </div>
            <Link href="/dashboard/squad" className="text-xs text-pitch-500 font-heading font-bold hover:underline block text-center pt-1">
              Zobrazit kádr →
            </Link>
          </div>
        </div>

        {/* Mini league table */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Tabulka</SectionLabel>
          {standings.length > 0 ? (
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-label border-b border-gray-200 text-[10px] uppercase tracking-wide">
                    <th className="pb-1.5 pl-4 sm:pl-5 pr-1 w-6">#</th>
                    <th className="pb-1.5 pr-2">Tým</th>
                    <th className="pb-1.5 pr-1 text-center w-8">Z</th>
                    <th className="pb-1.5 pr-1 text-center w-8">V</th>
                    <th className="pb-1.5 pr-1 text-center w-8">R</th>
                    <th className="pb-1.5 pr-1 text-center w-8">P</th>
                    <th className="pb-1.5 pr-4 sm:pr-5 text-center w-8">B</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.slice(0, 8).map((s) => (
                    <tr key={s.teamId ?? s.pos} className={`border-b border-gray-50 ${s.isPlayer ? "bg-pitch-50/50 font-bold" : ""}`}>
                      <td className="py-1.5 pl-4 sm:pl-5 pr-1 tabular-nums text-muted text-xs">{s.pos}</td>
                      <td className="py-1.5 pr-2">
                        <span className={`text-xs truncate block max-w-[140px] ${s.isPlayer ? "font-heading font-bold" : ""}`}>
                          {s.team}
                        </span>
                      </td>
                      <td className="py-1.5 pr-1 text-center tabular-nums text-xs">{s.played}</td>
                      <td className="py-1.5 pr-1 text-center tabular-nums text-xs">{s.wins}</td>
                      <td className="py-1.5 pr-1 text-center tabular-nums text-xs">{s.draws}</td>
                      <td className="py-1.5 pr-1 text-center tabular-nums text-xs">{s.losses}</td>
                      <td className="py-1.5 pr-4 sm:pr-5 text-center tabular-nums text-xs font-heading font-bold">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-center pt-2 px-4">
                <Link href="/dashboard/liga" className="text-xs text-pitch-500 font-heading font-bold hover:underline">Celá tabulka →</Link>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted py-4">Žádná data</div>
          )}
        </div>

        {/* Manager */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Trenér</SectionLabel>
          {manager ? (
            <a href={`/dashboard/manager/${teamId}`} className="block group">
              <div className="flex items-center gap-3">
                {manager.avatar && Object.keys(manager.avatar).length > 2 ? (
                  <FaceAvatar faceConfig={manager.avatar} size={48} className="shrink-0 rounded-xl" />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-heading font-bold text-lg shrink-0" style={{ backgroundColor: color }}>
                    {manager.name[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-heading font-bold group-hover:underline truncate">{manager.name}</div>
                  {manager.birthplace && <div className="text-xs text-muted">{manager.birthplace}</div>}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <AttrPill label="Kou" value={manager.coaching ?? 40} />
                <AttrPill label="Mot" value={manager.motivation ?? 40} />
                <AttrPill label="Tak" value={manager.tactics ?? 40} />
                <AttrPill label="Dis" value={manager.discipline ?? 40} />
              </div>
            </a>
          ) : (
            <div className="text-muted text-sm">Bez trenéra</div>
          )}

          {/* Finance quick view */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <SectionLabel>Finance</SectionLabel>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Rozpočet</span>
              <span className="font-heading font-bold">{team.budget.toLocaleString("cs")} Kč</span>
            </div>
            <Link href="/dashboard/finances" className="text-xs text-pitch-500 font-heading font-bold hover:underline block mt-2">
              Detail financí →
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ Row 3: Recent matches + Top performers ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">

        {/* Recent matches */}
        {matchResults && matchResults.matches.length > 0 && (
          <div className="card p-4 sm:p-5">
            <SectionLabel>Poslední zápasy</SectionLabel>
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-label border-b border-gray-200 text-[11px] uppercase tracking-wide">
                    <th className="pb-2 pl-4 sm:pl-5 pr-2 w-10">Kolo</th>
                    <th className="pb-2 pr-2">Soupeř</th>
                    <th className="pb-2 pr-4 sm:pr-5 text-center w-20">Výsledek</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResults.matches.slice(0, 5).map((m) => {
                    const resultBg = m.result === "W" ? "bg-pitch-50" : m.result === "L" ? "bg-red-50" : "bg-gray-50";
                    const resultText = m.result === "W" ? "text-pitch-600" : m.result === "L" ? "text-card-red" : "text-muted";
                    return (
                      <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-2 pl-4 sm:pl-5 pr-2 tabular-nums text-muted">{m.round ?? "—"}</td>
                        <td className="py-2 pr-2">
                          <a href={`/dashboard/match/${m.id}/replay`} className="flex items-center gap-2 hover:underline">
                            <BadgePreview primary={m.opponentColor} secondary={m.opponentSecondary}
                              pattern={(m.opponentBadge as BadgePattern) || "shield"}
                              initials={(m.opponent ?? "").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={20} />
                            <span className="font-heading font-bold text-ink truncate max-w-[200px]">{m.opponent}</span>
                            <span className="text-[10px] text-muted uppercase">{m.isHome ? "D" : "V"}</span>
                          </a>
                        </td>
                        <td className="py-2 pr-4 sm:pr-5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-heading font-bold ${resultBg} ${resultText}`}>
                            {m.homeScore}:{m.awayScore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-center pt-2">
              <Link href="/dashboard/schedule" className="text-xs text-pitch-500 font-heading font-bold hover:underline">Všechny zápasy →</Link>
            </div>
          </div>
        )}

        {/* Top performers */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Nejlepší hráči sezóny</SectionLabel>
          {matchResults && matchResults.topPlayers.length > 0 ? (
            <div className="space-y-0">
              {matchResults.topPlayers.slice(0, 7).map((p, i) => (
                <a key={p.playerId} href={`/dashboard/player/${p.playerId}`}
                  className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors -mx-2 px-2 rounded">
                  <span className="text-xs text-muted w-4 tabular-nums">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-bold text-sm truncate">{p.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                      <span className="text-[10px] text-muted">{p.appearances} zápasů</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm tabular-nums shrink-0">
                    {(p.goals as number) > 0 && <span className="font-heading font-bold">{p.goals}g</span>}
                    {(p.assists as number) > 0 && <span className="text-muted">{p.assists}a</span>}
                    {(p.yellowCards as number) > 0 && <span className="inline-block w-2.5 h-3.5 rounded-[1px] bg-gold-400" />}
                    <span className={`font-heading font-bold text-xs px-1.5 py-0.5 rounded ${
                      (p.avgRating as number) >= 7 ? "bg-pitch-50 text-pitch-600" : "bg-gray-50 text-ink"
                    }`}>{(p.avgRating as number)?.toFixed(1)}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[...players].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 5).map((p) => (
                <a key={p.id} href={`/dashboard/player/${p.id}`} className="flex items-center gap-3 hover:bg-gray-50/50 -mx-2 px-2 py-1 rounded transition-colors">
                  {p.avatar && typeof p.avatar === "object" && Object.keys(p.avatar).length > 2 ? (
                    <FaceAvatar faceConfig={p.avatar} size={32} className="shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: color }}>{p.first_name[0]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-heading font-bold truncate">{p.first_name} {p.last_name}</div>
                    <div className="flex items-center gap-1.5">
                      <PositionBadge position={p.position} />
                      <span className="text-xs text-muted">{p.age} let</span>
                    </div>
                  </div>
                  <span className="font-heading font-bold text-lg tabular-nums" style={{ color }}>{p.overall_rating}</span>
                </a>
              ))}
            </div>
          )}
          <Link href="/dashboard/squad" className="text-xs text-pitch-500 font-heading font-bold hover:underline block text-center pt-2">
            Celý kádr →
          </Link>
        </div>
      </div>
    </div>
  );
}

function AttrPill({ label, value }: { label: string; value: number }) {
  const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 text-card-red";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-heading font-bold ${bg}`}>
      <span className="text-muted font-normal">{label}</span>{value}
    </span>
  );
}
