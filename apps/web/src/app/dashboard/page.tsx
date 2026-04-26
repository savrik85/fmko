"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError, type Team, type Player, type ManagerProfile, type TeamMatchResults } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner, SectionLabel, PositionBadge, BadgePreview, useConfirm } from "@/components/ui";
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
  promoted?: boolean;
  promotionCost?: number | null;
  presetSlot?: "A" | "B" | "C" | null;
  hasLineup?: boolean;
  isDefaultLineup?: boolean;
  defaultPresetSlot?: "A" | "B" | "C" | null;
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
  squad?: Array<{ age: number; position?: string; rating?: number }>;
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
  const [promotionPrice, setPromotionPrice] = useState<number | null>(null);
  // unseen state removed — redirect handled inline in useEffect
  const [manager, setManager] = useState<ManagerProfile | null>(null);
  const [matchResults, setMatchResults] = useState<TeamMatchResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<MatchPreview | null>(null);
  const [news, setNews] = useState<Array<{ id: string; type: string; headline: string; icon: string; date: string }>>([]);
  const [achievements, setAchievements] = useState<Array<{ key: string; icon: string; title: string; tier: string; earnedAt: string | null }>>([]);
  const [hofRank, setHofRank] = useState<{ myRank: number | null; myTotal: number; myGold: number; mySilver: number; myBronze: number; top3: Array<{ rank: number; teamName: string; total: number }>; totalEntries: number } | null>(null);
  const [pubSession, setPubSession] = useState<{ gameDate: string; attendees: Array<{ playerId: string; firstName: string; lastName: string; alcohol: number; teamId: string; isVisitor: boolean; fromTeamName?: string }>; incidents: Array<{ type: string; playerIds: string[]; text: string }> } | null>(null);
  const [promoting, setPromoting] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<{ standings: Standing[] }>(`/api/teams/${teamId}/standings`).catch(() => ({ standings: [] })),
      apiFetch<{ matches: ScheduleMatch[]; promotionPrice?: number }>(`/api/teams/${teamId}/schedule`).catch(() => ({ matches: [] })),
      apiFetch<ManagerProfile>(`/api/teams/${teamId}/manager`).catch((e) => { console.error("manager fetch:", e); return null; }),
      apiFetch<TeamMatchResults>(`/api/teams/${teamId}/match-results`).catch((e) => { console.error("match-results fetch:", e); return null; }),
    ]).then(([t, p, s, m, mgr, mr]) => {
      setTeam(t);
      setPlayers(p);
      setStandings(s.standings);
      setMatches(m.matches);
      setPromotionPrice((m as { promotionPrice?: number }).promotionPrice ?? null);
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
      // Fetch recent achievements (last 3 earned)
      apiFetch<{ achievements: Array<{ key: string; icon: string; title: string; tier: string; earnedAt: string | null }> }>(`/api/teams/${teamId}/achievements`)
        .then((d) => setAchievements(
          d.achievements
            .filter((a) => a.earnedAt)
            .sort((a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""))
            .slice(0, 3)
        ))
        .catch((e) => console.error("achievements fetch:", e));
      // Fetch poslední pub session
      apiFetch<{ session: { gameDate: string; attendees: Array<{ playerId: string; firstName: string; lastName: string; alcohol: number; teamId: string; isVisitor: boolean; fromTeamName?: string }>; incidents: Array<{ type: string; playerIds: string[]; text: string }> } | null }>(`/api/teams/${teamId}/pub-session`)
        .then((d) => setPubSession(d.session))
        .catch((e) => console.error("pub-session fetch:", e));
      // Fetch Hall of Fame — compute my rank (humans only)
      apiFetch<{ entries: Array<{ rank: number; teamId: string; teamName: string; isHuman: boolean; total: number; gold: number; silver: number; bronze: number }> }>(`/api/hall-of-fame`)
        .then((d) => {
          const humans = d.entries.filter((e) => e.isHuman);
          const meIdx = humans.findIndex((e) => e.teamId === teamId);
          const me = meIdx >= 0 ? humans[meIdx] : null;
          setHofRank({
            myRank: me ? meIdx + 1 : null,
            myTotal: me?.total ?? 0,
            myGold: me?.gold ?? 0,
            mySilver: me?.silver ?? 0,
            myBronze: me?.bronze ?? 0,
            top3: humans.slice(0, 3).map((e, i) => ({ rank: i + 1, teamName: e.teamName, total: e.total })),
            totalEntries: humans.length,
          });
        })
        .catch((e) => console.error("hall of fame fetch:", e));
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

  const promoteMatch = async (m: ScheduleMatch) => {
    if (!teamId || promoting) return;
    const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";
    const ok = await confirm({
      title: `Propagovat zápas proti ${m.awayName}?`,
      description: `Doma · ${m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString("cs") : ""}. Vyjde článek ve Zpravodaji a přijde +25 % diváků.`,
      details: [{ label: "Cena", value: `-${priceStr}`, color: "text-card-red" }],
      confirmLabel: promotionPrice != null ? `Propagovat za ${priceStr}` : "Propagovat",
    });
    if (!ok) return;
    setPromoting(true);
    const res = await apiFetch<{ ok?: boolean; cost?: number; error?: string }>(
      `/api/teams/${teamId}/matches/${m.id}/promote`,
      { method: "POST" },
    ).catch((e) => { console.error("promote:", e); return { error: "Chyba při propagaci" }; });
    setPromoting(false);
    if (res?.error) { showError("Chyba", res.error ?? "Zkus to prosím znovu."); return; }
    const refreshed = await apiFetch<{ matches: ScheduleMatch[] }>(`/api/teams/${teamId}/schedule`)
      .catch((e) => { console.error("refresh schedule:", e); return null; });
    if (refreshed) setMatches(refreshed.matches);
  };
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
      {confirmDialog}

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

      {/* ═══ Hospoda U Pralesa — co se včera dělo ═══ */}
      {pubSession && (pubSession.attendees.length > 0 || pubSession.incidents.length > 0) && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2 gap-2">
            <SectionLabel>Hospoda U Pralesa</SectionLabel>
            <span className="text-[10px] uppercase text-muted font-heading whitespace-nowrap">
              {new Date(pubSession.gameDate).toLocaleDateString("cs", { day: "numeric", month: "numeric" })} večer
            </span>
          </div>

          {pubSession.attendees.length > 0 && (
            <div className="text-sm mb-3">
              <span className="text-muted">🪑 V hospodě seděli: </span>
              {pubSession.attendees.map((a, i) => (
                <span key={a.playerId}>
                  {i > 0 && ", "}
                  <Link href={a.isVisitor ? "#" : `/dashboard/player/${a.playerId}`} className={`font-heading font-bold ${a.isVisitor ? "text-amber-600" : "hover:text-pitch-500 underline decoration-pitch-500/20"}`}>
                    {a.firstName} {a.lastName}
                  </Link>
                  {a.isVisitor && <span className="text-[10px] text-amber-600 ml-1">({a.fromTeamName})</span>}
                </span>
              ))}
            </div>
          )}

          {pubSession.incidents.length > 0 && (
            <ul className="space-y-1.5">
              {pubSession.incidents.map((inc, i) => {
                const icon = inc.type === "cross_team_fight" ? "🥊"
                  : inc.type === "cross_team_brotherhood" ? "🍻"
                  : inc.type === "cross_team_provocation" ? "👊"
                  : inc.type === "drink_record" ? "🍺"
                  : inc.type === "automat_win" ? "💰"
                  : inc.type === "story" ? "📰"
                  : inc.type === "lone_drinker" ? "🪑"
                  : inc.type === "nobody" ? "🌙"
                  : "•";
                return (
                  <li key={i} className="text-sm flex gap-2 items-start">
                    <span className="shrink-0">{icon}</span>
                    <span className="text-ink leading-snug">{inc.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ═══ Row 1: Next match | Tabulka | Stav kádru ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[auto_auto] gap-5">

        {/* Next match — rich preview, spans both rows */}
        <div className="card p-4 sm:p-5 lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <SectionLabel>Další zápas</SectionLabel>
          {nextMatch ? (() => {
            const my = preview?.isHome ? preview.home : preview?.away;
            const opp = preview?.isHome ? preview.away : preview?.home;
            const oppName = nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName;
            const oppColor = nextMatch.isHome ? (nextMatch.awayColor || "#666") : (nextMatch.homeColor || "#666");
            const oppSecondary = nextMatch.isHome ? (nextMatch.awaySecondary || "#FFF") : (nextMatch.homeSecondary || "#FFF");
            const oppBadge = (nextMatch.isHome ? nextMatch.awayBadge : nextMatch.homeBadge) as BadgePattern || "shield";
            // Domácí tým zápasu = my (pokud isHome) / soupeř (pokud venku, čili preview.home)
            // Hostující = my (pokud venku) / soupeř (pokud doma, čili preview.away)
            const myTeamData = { id: teamId!, name: team.name,
              color: team.badge_primary_color || color,
              secondary: team.badge_secondary_color || team.secondary_color || "#FFF",
              badge: (team.badge_pattern as BadgePattern) || "shield",
              customInitials: team.badge_initials, symbol: team.badge_symbol, pos: my };
            const oppTeamData = { id: (nextMatch.isHome ? preview?.away?.id : preview?.home?.id) ?? "",
              name: oppName, color: oppColor, secondary: oppSecondary, badge: oppBadge,
              customInitials: null, symbol: null, pos: opp };
            const homeTeam = nextMatch.isHome ? myTeamData : oppTeamData;
            const awayTeam = nextMatch.isHome ? oppTeamData : myTeamData;
            const homeForm = preview ? (nextMatch.isHome ? my : opp) : null;
            const awayForm = preview ? (nextMatch.isHome ? opp : my) : null;
            const ini = (n: string) => n.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
            return (
              <div className="overflow-hidden rounded-xl border border-gray-100">
                {/* Dark header — kolo + badges + jména */}
                <div className="bg-gradient-to-b from-[#1e2d1e] to-[#2a3f2a] px-4 py-5 text-white">
                  <div className="text-center mb-4 flex items-center justify-center gap-2">
                    <span className="text-[10px] font-heading font-bold uppercase tracking-widest text-white/40">{nextMatch.round != null ? `${nextMatch.round}. kolo` : "Přátelák"}</span>
                    {(() => {
                      if (!nextMatch.scheduledAt || !gameDate) return null;
                      const matchDate = new Date(nextMatch.scheduledAt);
                      const daysUntil = Math.max(0, Math.round((matchDate.getTime() - gameDate.getTime()) / 86400000));
                      const label = daysUntil === 0 ? "dnes!" : daysUntil === 1 ? "zítra" : `za ${daysUntil} dní`;
                      return (
                        <>
                          <span className="text-white/20">•</span>
                          <span className={`text-[10px] font-heading font-bold uppercase tracking-widest ${daysUntil === 0 ? "text-pitch-400" : "text-white/60"}`}>{label}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-start gap-3">
                    {/* Domácí */}
                    <Link href={`/dashboard/team/${homeTeam.id}`} className="flex-1 text-center hover:opacity-80 transition-opacity">
                      <div className="flex justify-center mb-2">
                        <BadgePreview primary={homeTeam.color} secondary={homeTeam.secondary} pattern={homeTeam.badge} initials={homeTeam.customInitials || ini(homeTeam.name)} symbol={homeTeam.symbol} size={48} />
                      </div>
                      <div className="font-heading font-bold text-sm leading-tight">{homeTeam.name}</div>
                    </Link>
                    {/* VS */}
                    <div className="shrink-0 flex flex-col items-center pt-3">
                      <div className="w-10 h-10 rounded-full border-2 border-white/10 flex items-center justify-center">
                        <span className="font-heading font-[800] text-sm text-white/30">VS</span>
                      </div>
                    </div>
                    {/* Hosté */}
                    <Link href={`/dashboard/team/${awayTeam.id}`} className="flex-1 text-center hover:opacity-80 transition-opacity">
                      <div className="flex justify-center mb-2">
                        <BadgePreview primary={awayTeam.color} secondary={awayTeam.secondary} pattern={awayTeam.badge} initials={awayTeam.customInitials || ini(awayTeam.name)} symbol={awayTeam.symbol} size={48} />
                      </div>
                      <div className="font-heading font-bold text-sm leading-tight">{awayTeam.name}</div>
                    </Link>
                  </div>
                  {/* Pozice — jen pro ligové zápasy */}
                  {nextMatch.round != null && (homeTeam.pos || awayTeam.pos) && (
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 text-center text-[10px] text-white/40 tabular-nums">{homeTeam.pos ? `${homeTeam.pos.position}. místo` : ""}</div>
                      <div className="shrink-0 w-10" />
                      <div className="flex-1 text-center text-[10px] text-white/40 tabular-nums">{awayTeam.pos ? `${awayTeam.pos.position}. místo` : ""}</div>
                    </div>
                  )}
                </div>

                {/* Forma */}
                {homeForm && awayForm && (
                  <div className="flex items-center px-4 py-3 border-b border-gray-100 overflow-hidden">
                    <div className="flex-1 min-w-0 flex gap-1 justify-end overflow-hidden">
                      {homeForm.form.slice(0, 5).map((f, i) => (
                        <span key={i} className={`shrink-0 w-5 h-5 rounded-md text-[9px] flex items-center justify-center font-bold text-white ${
                          f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-300"
                        }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
                      ))}
                    </div>
                    <div className="shrink-0 w-12 text-center text-[9px] text-muted uppercase font-heading">Forma</div>
                    <div className="flex-1 min-w-0 flex gap-1 overflow-hidden">
                      {awayForm.form.slice(0, 5).map((f, i) => (
                        <span key={i} className={`shrink-0 w-5 h-5 rounded-md text-[9px] flex items-center justify-center font-bold text-white ${
                          f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-300"
                        }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stats — horizontal bars */}
                {preview && my && opp && (() => {
                  const home = nextMatch.isHome ? my : opp;
                  const away = nextMatch.isHome ? opp : my;
                  const avgByPos = (squad: typeof home.squad, pos: string) => {
                    const players = (squad ?? []).filter(p => p.position === pos);
                    return players.length ? Math.round(players.reduce((s, p) => s + (p.rating ?? 0), 0) / players.length) : 0;
                  };
                  const homeAge = home.squad?.length ? Math.round(home.squad.reduce((s, p) => s + p.age, 0) / home.squad.length) : 0;
                  const awayAge = away.squad?.length ? Math.round(away.squad.reduce((s, p) => s + p.age, 0) / away.squad.length) : 0;
                  const stats = [
                    { label: "Rating", h: home.avgRating, a: away.avgRating, higherBetter: true },
                    { label: "BRA", h: avgByPos(home.squad, "GK"), a: avgByPos(away.squad, "GK"), higherBetter: true },
                    { label: "OBR", h: avgByPos(home.squad, "DEF"), a: avgByPos(away.squad, "DEF"), higherBetter: true },
                    { label: "ZÁL", h: avgByPos(home.squad, "MID"), a: avgByPos(away.squad, "MID"), higherBetter: true },
                    { label: "ÚTO", h: avgByPos(home.squad, "FWD"), a: avgByPos(away.squad, "FWD"), higherBetter: true },
                    { label: "Věk", h: homeAge, a: awayAge, higherBetter: false },
                  ];
                  return (
                    <div className="px-4 py-3 space-y-2.5 border-b border-gray-100">
                      {stats.map((s) => {
                        const total = (s.h + s.a) || 1;
                        const hPct = Math.round((s.h / total) * 100);
                        const hBetter = s.higherBetter ? s.h > s.a : s.h < s.a;
                        const aBetter = s.higherBetter ? s.a > s.h : s.a < s.h;
                        return (
                          <div key={s.label}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs font-heading font-bold tabular-nums ${hBetter ? "text-pitch-600" : aBetter ? "text-card-red" : "text-ink"}`}>{s.h}</span>
                              <span className="text-[9px] text-muted uppercase font-heading">{s.label}</span>
                              <span className={`text-xs font-heading font-bold tabular-nums ${aBetter ? "text-pitch-600" : hBetter ? "text-card-red" : "text-ink"}`}>{s.a}</span>
                            </div>
                            <div className="flex h-1.5 rounded-full overflow-hidden">
                              <div className="transition-all" style={{ width: `${hPct}%`, background: hBetter ? "#3D7A3D" : "#dc6b6b" }} />
                              <div className="transition-all flex-1" style={{ background: aBetter ? "#3D7A3D" : "#dc6b6b" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Footer — weather + venue */}
                {preview && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="text-base">{preview.weather.icon}</span>
                      <span>{preview.weather.temperature}°C</span>
                      {(preview.weather.expected === "rain" || preview.weather.expected === "snow" || preview.weather.expected === "wind") && (
                        <span className="text-card-red text-[10px] font-heading font-bold">
                          {preview.weather.expected === "rain" ? "-20%" : preview.weather.expected === "snow" ? "-30%" : "-10%"}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted">{preview.venue.name}</span>
                  </div>
                )}
                <div className="text-center px-4 py-2">
                  <Link href="/dashboard/match" className="inline text-xs text-pitch-500 font-heading font-bold hover:underline">Sestava →</Link>
                  {nextMatch.isHome && nextMatch.promoted && (
                    <span className="inline ml-4 text-xs text-gold-600 font-heading font-bold">📢 Propagováno</span>
                  )}
                  {nextMatch.isHome && !nextMatch.promoted && (
                    <button
                      onClick={() => promoteMatch(nextMatch)}
                      disabled={promoting}
                      className="inline ml-4 text-xs text-gold-600 font-heading font-bold hover:underline disabled:opacity-50"
                    >
                      {promoting ? "..." : "📢 Propagovat"}
                    </button>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="text-center text-muted py-4">Žádný naplánovaný zápas</div>
          )}
        </div>

        {/* Tabulka — row 1 col 2 */}
        <div className="card p-4 sm:p-5 lg:col-start-2 lg:row-start-1">
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
                      <td className="py-1 pl-3 sm:pl-5 pr-1 tabular-nums text-muted text-xs align-top pt-2">{s.pos}</td>
                      <td className="py-1 pr-1 align-top pt-2">
                        {s.teamId ? (
                          <Link href={`/dashboard/team/${s.teamId}`} className={`text-xs hover:text-pitch-500 transition-colors leading-tight ${s.isPlayer ? "font-heading font-bold" : ""}`}>
                            {s.team}
                          </Link>
                        ) : (
                          <span className={`text-xs leading-tight ${s.isPlayer ? "font-heading font-bold" : ""}`}>{s.team}</span>
                        )}
                      </td>
                      <td className="py-1 px-1 text-center tabular-nums text-xs">{s.played}</td>
                      <td className="py-1 px-1 text-center tabular-nums text-xs">{s.wins}</td>
                      <td className="py-1 px-1 text-center tabular-nums text-xs">{s.draws}</td>
                      <td className="py-1 px-1 text-center tabular-nums text-xs">{s.losses}</td>
                      <td className="py-1 pr-3 sm:pr-5 text-center tabular-nums text-xs font-heading font-bold">{s.points}</td>
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

        {/* Trenér + Finance — row 2 col 2 */}
        <div className="card p-4 sm:p-5 lg:col-start-2 lg:row-start-2">
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

        {/* Stav kádru — row 1 col 3 */}
        <div className="card p-4 sm:p-5 lg:col-start-3 lg:row-start-1">
          <SectionLabel>Stav kádru</SectionLabel>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="font-heading font-bold text-xl tabular-nums" style={{ color: safeColor }}>{players.length}</div>
                <div className="text-[9px] text-muted uppercase">Hráčů</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className={`font-heading font-bold text-xl tabular-nums ${conditionLabel(avgCondition).color}`}>{avgCondition}%</div>
                <div className="text-[9px] text-muted uppercase">Kondice</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="font-heading font-bold text-xl tabular-nums">{players.length > 0 ? Math.round(players.reduce((s, p) => s + p.overall_rating, 0) / players.length) : 0}</div>
                <div className="text-[9px] text-muted uppercase">Rating</div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-muted">Prům. morálka</span>
                <span className="font-heading font-bold">{avgMorale}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-muted">Prům. věk</span>
                <span className="font-heading font-bold">{players.length > 0 ? Math.round(players.reduce((s, p) => s + p.age, 0) / players.length * 10) / 10 : 0}</span>
              </div>
              {injuredCount > 0 && (
                <div className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                  <span className="text-muted">Zranění</span>
                  <span className="font-heading font-bold text-card-red">{injuredCount}</span>
                </div>
              )}
              {lowMoraleCount > 0 && (
                <div className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                  <span className="text-muted">Nízká morálka</span>
                  <span className="font-heading font-bold text-gold-600">{lowMoraleCount}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-muted">Brankáři</span>
                <span className="font-heading font-bold tabular-nums">{players.filter(p => p.position === "GK").length}× · ø{players.filter(p => p.position === "GK").length > 0 ? Math.round(players.filter(p => p.position === "GK").reduce((s, p) => s + p.overall_rating, 0) / players.filter(p => p.position === "GK").length) : 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-muted">Obránci</span>
                <span className="font-heading font-bold tabular-nums">{players.filter(p => p.position === "DEF").length}× · ø{players.filter(p => p.position === "DEF").length > 0 ? Math.round(players.filter(p => p.position === "DEF").reduce((s, p) => s + p.overall_rating, 0) / players.filter(p => p.position === "DEF").length) : 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-muted">Záložníci</span>
                <span className="font-heading font-bold tabular-nums">{players.filter(p => p.position === "MID").length}× · ø{players.filter(p => p.position === "MID").length > 0 ? Math.round(players.filter(p => p.position === "MID").reduce((s, p) => s + p.overall_rating, 0) / players.filter(p => p.position === "MID").length) : 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1">
                <span className="text-muted">Útočníci</span>
                <span className="font-heading font-bold tabular-nums">{players.filter(p => p.position === "FWD").length}× · ø{players.filter(p => p.position === "FWD").length > 0 ? Math.round(players.filter(p => p.position === "FWD").reduce((s, p) => s + p.overall_rating, 0) / players.filter(p => p.position === "FWD").length) : 0}</span>
              </div>
            </div>
            <Link href="/dashboard/squad" className="text-xs text-pitch-500 font-heading font-bold hover:underline block text-center pt-1">
              Zobrazit kádr →
            </Link>
          </div>
        </div>

        {/* Poslední zápasy — row 2 col 3 */}
        {matchResults && matchResults.matches.length > 0 && (
          <div className="card p-4 sm:p-5 lg:col-start-3 lg:row-start-2">
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
                          <a href={`/dashboard/match/${m.id}`} className="flex items-center gap-2 hover:underline">
                            <BadgePreview primary={m.opponentColor} secondary={m.opponentSecondary}
                              pattern={(m.opponentBadge as BadgePattern) || "shield"}
                              initials={(m.opponent ?? "").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={20} />
                            <span className="font-heading font-bold text-ink truncate max-w-[200px]">{m.opponent}</span>
                            <span className="text-[10px] text-muted uppercase">{m.isHome ? "D" : "V"}</span>
                          </a>
                        </td>
                        <td className="py-2 pr-4 sm:pr-5 text-center">
                          <a href={`/dashboard/match/${m.id}`} className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-heading font-bold hover:opacity-80 transition-opacity ${resultBg} ${resultText}`}>
                            {m.homeScore}:{m.awayScore}
                          </a>
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
      </div>

      {/* ═══ Row 2: Rozpis + Bilance + Zpravodaj ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Rozpis — nadcházející zápasy */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Rozpis</SectionLabel>
          {(() => {
            const upcoming = matches.filter((m) => m.status !== "simulated").slice(0, 4);
            return upcoming.length > 0 ? (
              <div className="space-y-2">
                {upcoming.map((m) => {
                  const opp = m.isHome ? m.awayName : m.homeName;
                  const date = m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString("cs", { day: "numeric", month: "numeric" }) : "";
                  // Schedule endpoint vrací calendarId pro ligový, null pro friendly (kde id = match.id)
                  const switchId = (m as any).calendarId ?? m.id;
                  return (
                    <Link key={m.id} href={`/dashboard/match?calendarId=${switchId}`} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors">
                      <span className="text-xs text-muted tabular-nums w-5">{m.round}.</span>
                      <span className="text-sm font-heading font-bold flex-1 truncate">{opp}</span>
                      <span className={`text-[9px] font-heading font-bold uppercase ${m.isHome ? "text-pitch-600" : "text-muted"}`}>{m.isHome ? "D" : "V"}</span>
                      {m.presetSlot
                        ? <span className="text-[9px] font-heading font-bold px-1.5 py-0.5 rounded bg-pitch-100 text-pitch-700">{m.presetSlot}</span>
                        : m.hasLineup
                          ? <span className="text-[9px] text-pitch-600" title="Sestava nastavena">✓</span>
                          : m.isDefaultLineup
                            ? (m.defaultPresetSlot
                                ? <span className="text-[9px] font-heading font-bold px-1.5 py-0.5 rounded bg-gray-100 text-muted" title="Výchozí sestava">{m.defaultPresetSlot}</span>
                                : <span className="text-[9px] text-muted" title="Použije se výchozí sestava">✓</span>)
                            : <span className="text-[9px] text-card-red font-bold" title="Bez sestavy — použije se auto">!</span>}
                      <span className="text-[10px] text-muted tabular-nums">{date}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-muted py-4 text-sm">Žádné naplánované</div>
            );
          })()}
          <Link href="/dashboard/schedule" className="text-xs text-pitch-500 font-heading font-bold hover:underline block text-center pt-2">
            Celý rozpis →
          </Link>
        </div>

        {/* Bilance sezóny */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Bilance</SectionLabel>
          {myStanding ? (
            <div className="space-y-2">
              <div className="text-center mb-3">
                <div className="font-heading font-[800] text-4xl tabular-nums" style={{ color: safeColor }}>{myStanding.pos}.</div>
                <div className="text-xs text-muted">{myStanding.points} bodů · {myStanding.played} zápasů</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-lg py-1.5">
                  <div className="font-heading font-bold text-lg tabular-nums text-pitch-500">{myStanding.wins}</div>
                  <div className="text-[9px] text-muted uppercase">Výhry</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-1.5">
                  <div className="font-heading font-bold text-lg tabular-nums">{myStanding.draws}</div>
                  <div className="text-[9px] text-muted uppercase">Remízy</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-1.5">
                  <div className="font-heading font-bold text-lg tabular-nums text-card-red">{myStanding.losses}</div>
                  <div className="text-[9px] text-muted uppercase">Prohry</div>
                </div>
              </div>
              <div className="text-center text-sm text-muted">
                Skóre <span className="font-heading font-bold text-ink">{myStanding.goalsFor}:{myStanding.goalsAgainst}</span>
                <span className="ml-1 text-xs">({(myStanding.goalsFor ?? 0) - (myStanding.goalsAgainst ?? 0) >= 0 ? "+" : ""}{(myStanding.goalsFor ?? 0) - (myStanding.goalsAgainst ?? 0)})</span>
              </div>
              {matchResults && matchResults.form.length > 0 && (
                <div className="flex items-center justify-center gap-1 pt-1">
                  {matchResults.form.map((f, i) => (
                    <span key={i} className={`w-6 h-6 rounded-md text-[10px] flex items-center justify-center font-bold text-white ${
                      f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-400"
                    }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
                  ))}
                </div>
              )}
              <Link href="/dashboard/liga" className="text-xs text-pitch-500 font-heading font-bold hover:underline block text-center pt-1">
                Zobrazit tabulku →
              </Link>
            </div>
          ) : (
            <div className="text-center text-muted py-4">Zatím bez zápasů</div>
          )}
        </div>

        {/* Zpravodaj */}
        {news.length > 0 ? (
          <div className="card p-4 sm:p-5">
            <SectionLabel>Zpravodaj</SectionLabel>
            <div className="space-y-2">
              {news.map((article) => {
                const daysAgo = Math.max(0, Math.floor((Date.now() - new Date(article.date).getTime()) / 86400000));
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
        ) : <div />}
      </div>

      {/* ═══ Row 3: Naposledy odemčené úspěchy + Žebříček ═══ */}
      {(achievements.length > 0 || hofRank) && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
          {/* Naposledy odemčené */}
          {achievements.length > 0 ? (
            <div className="card p-4 sm:p-5">
              <SectionLabel>Naposledy odemčené úspěchy</SectionLabel>
              <div className="mt-2 space-y-1">
                {achievements.map((a) => {
                  const days = a.earnedAt ? Math.max(0, Math.floor((Date.now() - new Date(a.earnedAt).getTime()) / 86400000)) : 0;
                  const timeLabel = days === 0 ? "dnes" : days === 1 ? "včera" : `před ${days}d`;
                  const tierColor = a.tier === "gold" ? "text-amber-600" : a.tier === "silver" ? "text-gray-500" : "text-orange-700";
                  return (
                    <Link
                      key={a.key}
                      href={`/dashboard/manager/${teamId}`}
                      className="flex items-center gap-2.5 py-1.5 px-1 hover:bg-gray-50/60 rounded-md transition-colors"
                    >
                      <div className="text-xl shrink-0 leading-none">{a.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className={`font-heading font-bold text-sm truncate ${tierColor}`}>{a.title}</div>
                        <div className="text-[10px] text-muted mt-0.5">{timeLabel}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="text-center pt-2">
                <Link href={`/dashboard/manager/${teamId}`} className="text-xs text-pitch-500 font-heading font-bold hover:underline">Všechny úspěchy →</Link>
              </div>
            </div>
          ) : <div />}

          {/* Žebříček — moje pořadí */}
          {hofRank && (
            <div className="card p-4 sm:p-5">
              <SectionLabel>Síň slávy</SectionLabel>
              <div className="mt-2 text-center">
                {hofRank.myRank ? (
                  <>
                    <div className="font-heading font-[800] text-4xl tabular-nums" style={{ color: safeColor }}>{hofRank.myRank}.</div>
                    <div className="text-xs text-muted mt-1">
                      z {hofRank.totalEntries} trenérů
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-3 text-sm tabular-nums">
                      <span className="text-amber-600">🥇 {hofRank.myGold}</span>
                      <span className="text-gray-500">🥈 {hofRank.mySilver}</span>
                      <span className="text-orange-700">🥉 {hofRank.myBronze}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted py-3">Ještě bez úspěchů</div>
                )}
              </div>
              <div className="text-center pt-3">
                <Link href="/dashboard/hall-of-fame" className="text-xs text-pitch-500 font-heading font-bold hover:underline">Celý žebříček →</Link>
              </div>
            </div>
          )}
        </div>
      )}

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
