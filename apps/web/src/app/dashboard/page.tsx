"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player, type ManagerProfile, type TeamMatchResults } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner, SectionLabel, PositionBadge, BadgePreview, TeamName } from "@/components/ui";
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

interface PreviewTeam {
  id: string; name: string;
  primaryColor: string; secondaryColor: string; badgePattern: string;
  position: number; points: number; played: number;
  wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number;
  form: string[];
  avgRating: number; squadSize: number;
  squad?: Array<{ age: number }>;
  isPlayer?: boolean;
}

interface MatchPreview {
  matchId: string; round: number; scheduledAt: string | null; isHome: boolean;
  home: PreviewTeam; away: PreviewTeam;
  venue: { name: string; capacity: number; pitchCondition: number; pitchType: string };
  weather: { icon: string; expected: string; temperature: number; description: string };
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
  const [preview, setPreview] = useState<MatchPreview | null>(null);
  const [news, setNews] = useState<Array<{ id: string; type: string; headline: string; icon: string; date: string }>>([]);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<{ standings: Standing[] }>(`/api/teams/${teamId}/standings`).catch(() => ({ standings: [] })),
      apiFetch<{ matches: ScheduleMatch[] }>(`/api/teams/${teamId}/schedule`).catch(() => ({ matches: [] })),
      apiFetch<ManagerProfile>(`/api/teams/${teamId}/manager`).catch((e) => { console.error("manager fetch:", e); return null; }),
      apiFetch<TeamMatchResults>(`/api/teams/${teamId}/match-results`).catch((e) => { console.error("match-results fetch:", e); return null; }),
    ]).then(([t, p, s, m, mgr, mr]) => {
      setTeam(t);
      setPlayers(p);
      setStandings(s.standings);
      setMatches(m.matches);
      setManager(mgr);
      setMatchResults(mr);
      setLoading(false);
      // Fetch match preview for next unplayed match
      const next = m.matches.find((mx: ScheduleMatch) => mx.status !== "simulated");
      if (next) {
        apiFetch<MatchPreview>(`/api/teams/${teamId}/match-preview/${next.id}`)
          .then(setPreview)
          .catch((e) => console.error("match-preview fetch:", e));
      }
      // Fetch news
      apiFetch<{ articles: typeof news }>(`/api/teams/${teamId}/news`)
        .then((d) => setNews(d.articles.filter((a) => a.type !== "standing").slice(0, 3)))
        .catch((e) => console.error("news fetch:", e));
    }).catch(() => setLoading(false));
  }, [teamId]);


  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const safeColor = (() => {
    const c = color.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 200 ? "#2D5F2D" : color;
  })();
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

        {/* Next match — rich preview */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Další zápas</SectionLabel>
          {nextMatch ? (() => {
            const my = preview?.isHome ? preview.home : preview?.away;
            const opp = preview?.isHome ? preview.away : preview?.home;
            const oppName = nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName;
            const oppColor = nextMatch.isHome ? (nextMatch.awayColor || "#666") : (nextMatch.homeColor || "#666");
            const oppSecondary = nextMatch.isHome ? (nextMatch.awaySecondary || "#FFF") : (nextMatch.homeSecondary || "#FFF");
            const oppBadge = (nextMatch.isHome ? nextMatch.awayBadge : nextMatch.homeBadge) as BadgePattern || "shield";
            return (
              <div className="space-y-3">
                {/* Badges + vs — home team always on the left */}
                {(() => {
                  const homeTeam = nextMatch.isHome
                    ? { name: team.name, color, secondary: team.secondary_color || "#FFF", badge: (team.badge_pattern as BadgePattern) || "shield", pos: my }
                    : { name: oppName, color: oppColor, secondary: oppSecondary, badge: oppBadge, pos: opp };
                  const awayTeam = nextMatch.isHome
                    ? { name: oppName, color: oppColor, secondary: oppSecondary, badge: oppBadge, pos: opp }
                    : { name: team.name, color, secondary: team.secondary_color || "#FFF", badge: (team.badge_pattern as BadgePattern) || "shield", pos: my };
                  return (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <BadgePreview primary={homeTeam.color} secondary={homeTeam.secondary}
                      pattern={homeTeam.badge}
                      initials={homeTeam.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={36} />
                    <div className="font-heading font-bold mt-1 max-w-full text-center leading-tight"><TeamName name={homeTeam.name} /></div>
                    {homeTeam.pos && <div className="text-[10px] text-muted tabular-nums">{homeTeam.pos.position}. místo</div>}
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    <div className="font-heading font-[800] text-xl text-muted">vs</div>
                    <div className="text-[10px] text-muted uppercase mt-0.5 whitespace-nowrap">{nextMatch.round}. kolo</div>
                  </div>
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <BadgePreview primary={awayTeam.color} secondary={awayTeam.secondary}
                      pattern={awayTeam.badge}
                      initials={awayTeam.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={36} />
                    <div className="font-heading font-bold mt-1 max-w-full text-center leading-tight"><TeamName name={awayTeam.name} /></div>
                    {awayTeam.pos && <div className="text-[10px] text-muted tabular-nums">{awayTeam.pos.position}. místo</div>}
                  </div>
                </div>
                  );
                })()}

                {/* Form comparison — home left, away right */}
                {preview && my && opp && (() => {
                  const homeForm = nextMatch.isHome ? my : opp;
                  const awayForm = nextMatch.isHome ? opp : my;
                  return (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-0.5">
                      {homeForm.form.map((f, i) => (
                        <span key={i} className={`w-5 h-5 rounded text-[9px] flex items-center justify-center font-bold text-white ${
                          f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-400"
                        }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
                      ))}
                    </div>
                    <span className="text-[9px] text-muted uppercase">Forma</span>
                    <div className="flex gap-0.5">
                      {awayForm.form.map((f, i) => (
                        <span key={i} className={`w-5 h-5 rounded text-[9px] flex items-center justify-center font-bold text-white ${
                          f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-400"
                        }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
                      ))}
                    </div>
                  </div>
                  );
                })()}

                {/* Stats comparison row — home left, away right */}
                {preview && my && opp && (() => {
                  const home = nextMatch.isHome ? my : opp;
                  const away = nextMatch.isHome ? opp : my;
                  const homeAge = home.squad?.length ? Math.round(home.squad.reduce((s, p) => s + p.age, 0) / home.squad.length) : 0;
                  const awayAge = away.squad?.length ? Math.round(away.squad.reduce((s, p) => s + p.age, 0) / away.squad.length) : 0;
                  const stats = [
                    { label: "Rating", hVal: home.avgRating, aVal: away.avgRating },
                    { label: "Góly", hVal: home.goalsFor, aVal: away.goalsFor },
                    { label: "Věk", hVal: homeAge, aVal: awayAge },
                  ];
                  return (
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                      {stats.map((s) => (
                        <div key={s.label} className="bg-gray-50 rounded-lg py-1.5 px-1">
                          <div className="font-heading font-bold tabular-nums flex items-center justify-center gap-1">
                            <span className={s.hVal > s.aVal ? "text-pitch-500" : s.hVal < s.aVal ? "text-card-red" : ""}>{s.hVal}</span>
                            <span className="text-muted text-[9px]">vs</span>
                            <span className={s.aVal > s.hVal ? "text-pitch-500" : s.aVal < s.hVal ? "text-card-red" : ""}>{s.aVal}</span>
                          </div>
                          <div className="text-muted text-[9px] uppercase">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Weather + venue */}
                {preview && (
                  <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg">{preview.weather.icon}</span>
                      <span className="text-muted text-xs">{preview.weather.temperature}°C</span>
                      {(preview.weather.expected === "rain" || preview.weather.expected === "snow" || preview.weather.expected === "wind") && (
                        <span className="text-card-red text-[10px] font-heading font-bold">
                          {preview.weather.expected === "rain" ? "-20% tech" : preview.weather.expected === "snow" ? "-30% tech" : "-10% tech"}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted truncate ml-2">{preview.venue.name}</span>
                  </div>
                )}

                <Link href="/dashboard/match" className="text-center block">
                  <span className="text-xs text-pitch-500 font-heading font-bold hover:underline">Sestava →</span>
                </Link>
              </div>
            );
          })() : (
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
              <div className="font-heading font-[800] text-5xl tabular-nums" style={{ color: safeColor }}>{myStanding.pos}.</div>
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
                <div className="font-heading font-bold text-2xl tabular-nums" style={{ color: safeColor }}>{players.length}</div>
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

      {/* ═══ Row 3: Recent matches + Zpravodaj ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {matchResults && matchResults.matches.length > 0 && (
          <div className="card p-4 sm:p-5">
            <SectionLabel>Poslední zápasy</SectionLabel>
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-sm">
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

        {news.length > 0 && (
          <div className="card p-4 sm:p-5">
            <SectionLabel>Okresní zpravodaj</SectionLabel>
            <div className="space-y-2">
              {news.map((article) => {
                const daysAgo = Math.floor((Date.now() - new Date(article.date).getTime()) / 86400000);
                const timeLabel = daysAgo === 0 ? "dnes" : daysAgo === 1 ? "včera" : `před ${daysAgo}d`;
                return (
                  <Link key={article.id} href="/dashboard/news"
                    className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 -mx-1 px-1 rounded transition-colors">
                    <span className="text-lg shrink-0">{article.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-heading font-bold truncate">{article.headline}</div>
                    </div>
                    <span className="text-[10px] text-muted shrink-0">{timeLabel}</span>
                  </Link>
                );
              })}
            </div>
            <div className="text-center pt-2">
              <Link href="/dashboard/news" className="text-xs text-pitch-500 font-heading font-bold hover:underline">Celý zpravodaj →</Link>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Row 4: Top performers — 3 columns ═══ */}
      {matchResults && matchResults.topPlayers.length > 0 && (() => {
          const topScorers = [...matchResults.topPlayers].filter(p => (p.goals as number) > 0).sort((a, b) => (b.goals as number) - (a.goals as number)).slice(0, 5);
          const topAssisters = [...matchResults.topPlayers].filter(p => (p.assists as number) > 0).sort((a, b) => (b.assists as number) - (a.assists as number)).slice(0, 5);
          const topRated = [...matchResults.topPlayers].filter(p => (p.appearances as number) >= 1).sort((a, b) => (b.avgRating as number) - (a.avgRating as number)).slice(0, 5);
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="card p-4 sm:p-5">
                <SectionLabel>Střelci</SectionLabel>
                {topScorers.length > 0 ? topScorers.map((p, i) => (
                  <a key={p.playerId} href={`/dashboard/player/${p.playerId}`}
                    className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 -mx-1 px-1 rounded transition-colors">
                    <span className="text-xs text-muted w-4 tabular-nums">{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading font-bold text-sm truncate">{p.name}</div>
                    </div>
                    <span className="font-heading font-bold tabular-nums">{p.goals}</span>
                  </a>
                )) : <div className="text-sm text-muted py-2">Žádné góly</div>}
              </div>
              <div className="card p-4 sm:p-5">
                <SectionLabel>Nahrávači</SectionLabel>
                {topAssisters.length > 0 ? topAssisters.map((p, i) => (
                  <a key={p.playerId} href={`/dashboard/player/${p.playerId}`}
                    className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 -mx-1 px-1 rounded transition-colors">
                    <span className="text-xs text-muted w-4 tabular-nums">{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading font-bold text-sm truncate">{p.name}</div>
                    </div>
                    <span className="font-heading font-bold tabular-nums">{p.assists}</span>
                  </a>
                )) : <div className="text-sm text-muted py-2">Žádné asistence</div>}
              </div>
              <div className="card p-4 sm:p-5">
                <SectionLabel>Hodnocení</SectionLabel>
                {topRated.length > 0 ? topRated.map((p, i) => (
                  <a key={p.playerId} href={`/dashboard/player/${p.playerId}`}
                    className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 -mx-1 px-1 rounded transition-colors">
                    <span className="text-xs text-muted w-4 tabular-nums">{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading font-bold text-sm truncate">{p.name}</div>
                    </div>
                    <span className={`font-heading font-bold text-xs px-1.5 py-0.5 rounded tabular-nums ${
                      (p.avgRating as number) >= 7 ? "bg-pitch-50 text-pitch-600" : "bg-gray-50 text-ink"
                    }`}>{(p.avgRating as number)?.toFixed(1)}</span>
                  </a>
                )) : <div className="text-sm text-muted py-2">Žádná data</div>}
              </div>
            </div>
          );
      })()}
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
