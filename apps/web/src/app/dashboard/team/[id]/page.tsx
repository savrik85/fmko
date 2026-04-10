"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, type Team, type Player, type TeamMatchResults, type ManagerProfile } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { Spinner, SectionLabel, EntityLink, BadgePreview, PositionBadge, JerseyPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

const POS_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";

type SortKey = "position" | "name" | "age" | "rating" | "speed" | "technique" | "shooting" | "passing" | "heading" | "defense" | "goalkeeping" | "condition" | "morale";
type SortDir = "asc" | "desc";

function conditionLabel(condition: number): { text: string; color: string } {
  if (condition >= 80) return { text: "Fit", color: "text-pitch-500" };
  if (condition >= 50) return { text: "OK", color: "text-gold-500" };
  if (condition >= 20) return { text: "Unavený", color: "text-orange-500" };
  return { text: "Vyčerpaný", color: "text-card-red" };
}

function getMoraleEmoji(morale: number): string {
  if (morale >= 80) return "\u{1F60A}";
  if (morale >= 60) return "\u{1F642}";
  if (morale >= 40) return "\u{1F610}";
  if (morale >= 20) return "\u{1F61E}";
  return "\u{1F621}";
}

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-600";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

/** Round to nearest 5 — used when displaying foreign player attributes. */
function roundTo5(v: number): number {
  return Math.round(v / 5) * 5;
}

function getPlayerSortValue(p: Player, key: SortKey): number | string {
  switch (key) {
    case "position": return POS_ORDER[p.position] ?? 9;
    case "name": return p.last_name;
    case "age": return p.age;
    case "rating": return p.overall_rating;
    case "speed": return p.skills?.speed ?? 0;
    case "technique": return p.skills?.technique ?? 0;
    case "shooting": return p.skills?.shooting ?? 0;
    case "passing": return p.skills?.passing ?? 0;
    case "heading": return p.skills?.heading ?? 0;
    case "defense": return p.skills?.defense ?? 0;
    case "goalkeeping": return p.skills?.goalkeeping ?? 0;
    case "condition": return p.lifeContext?.condition ?? 0;
    case "morale": return p.lifeContext?.morale ?? 0;
    default: return 0;
  }
}

export default function TeamPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId: myTeamId } = useTeam();
  const teamId = params.id as string;
  const isOwnTeam = teamId === myTeamId;
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [manager, setManager] = useState<ManagerProfile | null>(null);
  const [leagueTeams, setLeagueTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [leagueName, setLeagueName] = useState("");
  const [leaguePos, setLeaguePos] = useState<number | null>(null);
  const [matchResults, setMatchResults] = useState<TeamMatchResults | null>(null);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<Array<{ id: string; name: string }>>(`/api/teams/${teamId}/league-teams`).catch((e) => { console.error("load league teams:", e); return []; }),
      apiFetch<{ leagueName: string; standings: Array<{ teamId: string | null; pos: number }> }>(`/api/teams/${teamId}/standings`).catch((e) => { console.error("load standings:", e); return null; }),
      apiFetch<TeamMatchResults>(`/api/teams/${teamId}/match-results`).catch((e) => { console.error("load match results:", e); return null; }),
      apiFetch<ManagerProfile>(`/api/teams/${teamId}/manager`).catch((e) => { console.error("load manager:", e); return null; }),
    ]).then(([t, p, lt, standings, results, mgr]) => {
      setTeam(t);
      setPlayers(p);
      setLeagueTeams(lt);
      setMatchResults(results);
      setManager(mgr);
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = getPlayerSortValue(a, sortKey);
      const bVal = getPlayerSortValue(b, sortKey);
      const cmp = typeof aVal === "string" ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number);
      const directed = sortDir === "asc" ? cmp : -cmp;
      if (directed !== 0) return directed;
      return POS_ORDER[a.position] - POS_ORDER[b.position] || b.overall_rating - a.overall_rating;
    });
  }, [filtered, sortKey, sortDir]);

  // Team records from match results
  const records = useMemo(() => {
    if (!matchResults?.matches.length) return null;
    let biggestWin = { diff: 0, match: matchResults.matches[0] };
    let biggestLoss = { diff: 0, match: matchResults.matches[0] };
    for (const m of matchResults.matches) {
      const myGoals = m.isHome ? m.homeScore : m.awayScore;
      const oppGoals = m.isHome ? m.awayScore : m.homeScore;
      const diff = (myGoals as number) - (oppGoals as number);
      if (diff > biggestWin.diff) biggestWin = { diff, match: m };
      if (diff < biggestLoss.diff) biggestLoss = { diff, match: m };
    }
    return { biggestWin: biggestWin.diff > 0 ? biggestWin.match : null, biggestLoss: biggestLoss.diff < 0 ? biggestLoss.match : null };
  }, [matchResults]);

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const light = isLightColor(color);
  const txt = light ? "text-gray-900" : "text-white";
  const txtMuted = light ? "text-gray-500" : "text-white/60";
  const txtSoft = light ? "text-gray-400" : "text-white/40";
  const boxBg = light ? "bg-black/5" : "bg-white/10";
  const boxBgHover = light ? "hover:bg-black/10" : "hover:bg-white/20";
  const boxLabel = light ? "text-gray-400" : "text-white/50";
  const avgRating = players.length > 0 ? Math.round(players.reduce((s, p) => s + p.overall_rating, 0) / players.length) : 0;

  return (
    <>
      {/* ═══ Team header ═══ */}
      <div className="hero-gradient px-3 sm:px-8 py-4 sm:py-5" style={{ backgroundColor: color }}>
        <div className="max-w-[1280px] mx-auto">
          {/* ─── Desktop ─── */}
          <div className="hidden sm:flex items-center gap-4">
            {leagueTeams.length > 1 && (
              <button onClick={() => prevTeam && router.push(`/dashboard/team/${prevTeam.id}`)}
                className={`w-10 h-10 rounded-xl ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} shrink-0 transition-colors`}>&#9664;</button>
            )}
            <BadgePreview primary={color} secondary={team.secondary_color || "#FFFFFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"}
              initials={team.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={56} />
            <div className="flex-1 min-w-0">
              <h1 className={`font-heading font-extrabold ${txt} text-2xl leading-tight truncate`}>{team.name}</h1>
              <div className={`${txtMuted} text-sm mt-0.5`}>
                <EntityLink type="village" id={team.village_name} className={light ? "!text-gray-700 !decoration-gray-300" : "!text-white/80 !decoration-white/30"}>{team.village_name}</EntityLink>
                {" "}&middot; {team.district}
              </div>
              {leaguePos && leagueName && (
                <a href="/dashboard/liga" className={`inline-block mt-1 ${txtMuted} text-sm font-heading font-bold hover:opacity-80 transition-colors underline`}>
                  {leaguePos}. v {leagueName}
                </a>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!isOwnTeam && (team as any).user_id !== "ai" && (
                <button onClick={async () => {
                  if (!myTeamId) return;
                  const res = await apiFetch<{ conversationId: string }>(`/api/teams/${myTeamId}/conversation-with/${teamId}`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
                  }).catch((e) => { console.error("create conversation:", e); return null; });
                  if (res?.conversationId) router.push(`/dashboard/phone/${res.conversationId}`);
                }}
                  className={`${boxBg} ${boxBgHover} rounded-xl px-4 py-2 text-center transition-colors cursor-pointer`}>
                  <div className="text-xl leading-none">💬</div>
                  <div className={`${boxLabel} text-[10px] font-heading font-bold uppercase mt-1`}>Napsat</div>
                </button>
              )}
              <div className={`${boxBg} rounded-xl px-4 py-2 text-center`}>
                <div className={`font-heading font-extrabold text-xl tabular-nums leading-none ${txt}`}>{players.length}</div>
                <div className={`${boxLabel} text-[10px] font-heading font-bold uppercase mt-1`}>Hráčů</div>
              </div>
              {isOwnTeam && (
                <div className={`${boxBg} rounded-xl px-4 py-2 text-center`}>
                  <div className={`font-heading font-extrabold text-xl tabular-nums leading-none ${txt}`}>{avgRating}</div>
                  <div className={`${boxLabel} text-[10px] font-heading font-bold uppercase mt-1`}>Rating</div>
                </div>
              )}
            </div>
            {leagueTeams.length > 1 && (
              <button onClick={() => nextTeam && router.push(`/dashboard/team/${nextTeam.id}`)}
                className={`w-10 h-10 rounded-xl ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} shrink-0 transition-colors`}>&#9654;</button>
            )}
          </div>

          {/* ─── Mobil ─── */}
          <div className="sm:hidden">
            {/* Řádek 1: badge + název + šipky */}
            <div className="flex items-center gap-3">
              <BadgePreview primary={color} secondary={team.secondary_color || "#FFFFFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"}
                initials={team.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={44} />
              <div className="flex-1 min-w-0">
                <h1 className={`font-heading font-extrabold ${txt} text-xl leading-tight truncate`}>{team.name}</h1>
                <div className={`${txtMuted} text-sm`}>
                  <EntityLink type="village" id={team.village_name} className={light ? "!text-gray-700 !decoration-gray-300" : "!text-white/80 !decoration-white/30"}>{team.village_name}</EntityLink>
                  {" "}&middot; {team.district}
                </div>
              </div>
              {leagueTeams.length > 1 && (
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => prevTeam && router.push(`/dashboard/team/${prevTeam.id}`)}
                    className={`w-8 h-8 rounded-lg ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} transition-colors text-sm`}>&#9664;</button>
                  <button onClick={() => nextTeam && router.push(`/dashboard/team/${nextTeam.id}`)}
                    className={`w-8 h-8 rounded-lg ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} transition-colors text-sm`}>&#9654;</button>
                </div>
              )}
            </div>
            {/* Řádek 2: liga + staty + napsat */}
            <div className="flex items-center justify-between mt-3">
              {leaguePos && leagueName ? (
                <a href="/dashboard/liga" className={`${txtMuted} text-sm font-heading font-bold hover:opacity-80 transition-colors`}>
                  {leaguePos}. v {leagueName}
                </a>
              ) : <span />}
              <div className="flex items-center gap-2">
                {!isOwnTeam && (team as any).user_id !== "ai" && (
                  <button onClick={async () => {
                    if (!myTeamId) return;
                    const res = await apiFetch<{ conversationId: string }>(`/api/teams/${myTeamId}/conversation-with/${teamId}`, {
                      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
                    }).catch((e) => { console.error("create conversation (mobile):", e); return null; });
                    if (res?.conversationId) router.push(`/dashboard/phone/${res.conversationId}`);
                  }}
                    className={`${boxBg} ${boxBgHover} rounded-lg px-3 py-1.5 text-center transition-colors cursor-pointer`}>
                    <div className="text-base leading-none">💬</div>
                    <div className={`${boxLabel} text-[8px] font-heading font-bold uppercase mt-0.5`}>Napsat</div>
                  </button>
                )}
                <div className={`${boxBg} rounded-lg px-3 py-1.5 text-center`}>
                  <div className={`font-heading font-extrabold text-base tabular-nums leading-none ${txt}`}>{players.length}</div>
                  <div className={`${boxLabel} text-[8px] font-heading font-bold uppercase mt-0.5`}>Hráčů</div>
                </div>
                {isOwnTeam && (
                  <div className={`${boxBg} rounded-lg px-3 py-1.5 text-center`}>
                    <div className={`font-heading font-extrabold text-base tabular-nums leading-none ${txt}`}>{avgRating}</div>
                    <div className={`${boxLabel} text-[8px] font-heading font-bold uppercase mt-0.5`}>Rating</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    <div className="page-container space-y-5">

      {/* ═══ Top row: Info + Manager + Form ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Info */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-2">
            <SectionLabel>Informace o týmu</SectionLabel>
            <JerseyPreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={team.jersey_pattern as string} size={60} />
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-6">
            <InfoRow label="Vesnice" value={team.village_name} />
            <InfoRow label="Okres" value={team.district} />
            <InfoRow label="Region" value={team.region} />
            <InfoRow label="Populace" value={team.population.toLocaleString("cs")} />
            <InfoRow label="Reputace" value={`${team.reputation}`} />
            {isOwnTeam && <InfoRow label="Rozpočet" value={`${team.budget.toLocaleString("cs")} Kč`} />}
          </div>
          {(team as any).stadium && (
            <>
              <div className="h-px bg-gray-100 my-3" />
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🏟️</span>
                <span className="font-heading font-bold text-sm">{(team as any).stadium.name || "Obecní hřiště"}</span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-6">
                <InfoRow label="Kapacita" value={`${(team as any).stadium.capacity} diváků`} />
                <InfoRow label="Trávník" value={`${(team as any).stadium.pitchCondition}%`} />
              </div>
            </>
          )}
        </div>

        {/* Manager */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Trenér</SectionLabel>
          {manager ? (
            <a href={`/dashboard/manager/${teamId}`} className="flex items-center gap-4 group">
              <div className="shrink-0">
                {manager.avatar && Object.keys(manager.avatar).length > 2 ? (
                  <FaceAvatar faceConfig={manager.avatar} size={56} className="rounded-xl" />
                ) : (
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-heading font-bold text-xl" style={{ backgroundColor: color }}>
                    {manager.name[0]}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-heading font-bold text-lg truncate group-hover:underline">{manager.name}</div>
                {manager.birthplace && <div className="text-sm text-muted">{manager.birthplace}</div>}
                {manager.age && <div className="text-sm text-muted">{manager.age} let</div>}
                <div className="flex gap-3 mt-2 text-xs">
                  <AttrPill label="Kou" value={manager.coaching ?? 40} />
                  <AttrPill label="Mot" value={manager.motivation ?? 40} />
                  <AttrPill label="Tak" value={manager.tactics ?? 40} />
                  <AttrPill label="Dis" value={manager.discipline ?? 40} />
                </div>
              </div>
            </a>
          ) : (
            <div className="text-muted text-sm">Bez trenéra</div>
          )}
        </div>

        {/* Form + Records */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Sezónní bilance</SectionLabel>
          {matchResults && matchResults.matches.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                {matchResults.form.map((f, i) => (
                  <span key={i} className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-heading font-bold text-white ${
                    f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-400"
                  }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-lg py-2">
                  <div className="font-heading font-bold text-lg tabular-nums text-pitch-500">{matchResults.summary.wins}</div>
                  <div className="text-[10px] text-muted uppercase">Výhry</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-2">
                  <div className="font-heading font-bold text-lg tabular-nums">{matchResults.summary.draws}</div>
                  <div className="text-[10px] text-muted uppercase">Remízy</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-2">
                  <div className="font-heading font-bold text-lg tabular-nums text-card-red">{matchResults.summary.losses}</div>
                  <div className="text-[10px] text-muted uppercase">Prohry</div>
                </div>
              </div>
              <div className="flex justify-between text-sm text-muted border-t border-gray-100 pt-2">
                <span>Skóre: <span className="font-heading font-bold text-ink">{matchResults.summary.goalsFor}:{matchResults.summary.goalsAgainst}</span></span>
                <span>Zápasů: <span className="font-heading font-bold text-ink">{matchResults.summary.played}</span></span>
              </div>
              {records && (
                <div className="text-xs text-muted space-y-1 border-t border-gray-100 pt-2">
                  {records.biggestWin && (
                    <div>Nejvyšší výhra: <span className="font-heading font-bold text-pitch-600">{records.biggestWin.homeScore}:{records.biggestWin.awayScore}</span> vs {records.biggestWin.opponent}</div>
                  )}
                  {records.biggestLoss && (
                    <div>Nejvyšší prohra: <span className="font-heading font-bold text-card-red">{records.biggestLoss.homeScore}:{records.biggestLoss.awayScore}</span> vs {records.biggestLoss.opponent}</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted text-sm">Zatím bez zápasů</div>
          )}
        </div>
      </div>

      {/* ═══ Results + Top players ═══ */}
      {matchResults && matchResults.matches.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
          {/* Results */}
          <div className="card p-4 sm:p-5">
            <SectionLabel>Výsledky ({matchResults.matches.length})</SectionLabel>
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-left text-label border-b border-gray-200 text-[11px] uppercase tracking-wide">
                    <th className="pb-2 pl-4 sm:pl-5 pr-2 w-12">Kolo</th>
                    <th className="pb-2 pr-2">Soupeř</th>
                    <th className="pb-2 pr-2 text-center w-20">Výsledek</th>
                    <th className="pb-2 pr-4 sm:pr-5 text-center w-16">Diváci</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResults.matches.map((m) => {
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
                            <span className="font-heading font-bold text-ink truncate max-w-[200px]">{m.opponent ?? "Soupeř"}</span>
                            <span className="text-[10px] text-muted uppercase">{m.isHome ? "D" : "V"}</span>
                          </a>
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-heading font-bold ${resultBg} ${resultText}`}>
                            {m.homeScore}:{m.awayScore}
                          </span>
                        </td>
                        <td className="py-2 pr-4 sm:pr-5 text-center tabular-nums text-muted text-xs">{m.attendance ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top players */}
          {matchResults.topPlayers.length > 0 && (
            <div className="card p-4 sm:p-5">
              <SectionLabel>Statistiky hráčů</SectionLabel>
              <div className="space-y-0">
                {matchResults.topPlayers.map((p) => (
                  <a key={p.playerId} href={`/dashboard/player/${p.playerId}`}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors -mx-2 px-2 rounded">
                    <div className="min-w-0">
                      <div className="font-heading font-bold text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-muted uppercase">{POS_LABELS[p.position] ?? p.position} &middot; {p.appearances} zápasů</div>
                    </div>
                    <div className="flex items-center gap-3 text-sm tabular-nums shrink-0">
                      {(p.goals as number) > 0 && <span className="font-heading font-bold" title="Góly">{p.goals}</span>}
                      {(p.assists as number) > 0 && <span className="text-muted font-heading" title="Asistence">{p.assists}a</span>}
                      {(p.yellowCards as number) > 0 && <span className="inline-block w-2.5 h-3.5 rounded-[1px] bg-gold-400" title={`${p.yellowCards} žlutých`} />}
                      {(p.redCards as number) > 0 && <span className="inline-block w-2.5 h-3.5 rounded-[1px] bg-card-red" title={`${p.redCards} červených`} />}
                      <span className={`font-heading font-bold text-xs px-1.5 py-0.5 rounded ${
                        (p.avgRating as number) >= 7 ? "bg-pitch-50 text-pitch-600" : "bg-gray-50 text-ink"
                      }`}>{(p.avgRating as number)?.toFixed(1) ?? "—"}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Squad ═══ */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Kádr ({players.length})</SectionLabel>
        </div>

        {/* Position filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {(["all", "GK", "DEF", "MID", "FWD"] as PosFilter[]).map((pos) => (
            <button key={pos} onClick={() => setFilter(pos)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${
                filter === pos ? "text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
              }`} style={filter === pos ? { backgroundColor: color } : undefined}>
              {pos === "all" ? "Všichni" : `${POS_LABELS[pos]} (${players.filter((p) => p.position === pos).length})`}
            </button>
          ))}
        </div>

        {/* Own team: FM-style detailed table (desktop), compact card list (mobile) */}
        {isOwnTeam && (
          <div className="hidden md:block overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <SortHeader label="" sortKey="position" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 pl-4 sm:pl-5" />
                  <SortHeader label="Hráč" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} className="min-w-[160px]" />
                  <SortHeader label="Věk" sortKey="age" current={sortKey} dir={sortDir} onSort={handleSort} className="w-12 text-center" />
                  <SortHeader label="Hod." sortKey="rating" current={sortKey} dir={sortDir} onSort={handleSort} className="w-12 text-center" />
                  <SortHeader label="Rch" sortKey="speed" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" title="Rychlost" />
                  <SortHeader label="Tch" sortKey="technique" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" title="Technika" />
                  <SortHeader label="Stř" sortKey="shooting" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" title="Střelba" />
                  <SortHeader label="Při" sortKey="passing" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" title="Přihrávky" />
                  <SortHeader label="Hlv" sortKey="heading" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" title="Hlavičky" />
                  <SortHeader label="Obr" sortKey="defense" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" title="Obrana" />
                  <SortHeader label="Brn" sortKey="goalkeeping" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" title="Brankář" />
                  <SortHeader label="Kon" sortKey="condition" current={sortKey} dir={sortDir} onSort={handleSort} className="w-14 text-center" title="Kondice" />
                  <th className="pb-2 pr-4 sm:pr-5 text-center text-[11px] uppercase tracking-wide text-label w-10">Mor</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const cond = conditionLabel(p.lifeContext?.condition ?? 50);
                  return (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/dashboard/player/${p.id}`)}>
                      <td className="py-2 pl-4 sm:pl-5 pr-1"><PositionBadge position={p.position} /></td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          {p.avatar && typeof p.avatar === "object" && Object.keys(p.avatar).length > 2 ? (
                            <FaceAvatar faceConfig={p.avatar} size={28} className="shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: color }}>
                              {p.first_name[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-heading font-bold truncate block">{p.first_name} {p.last_name}</span>
                            {p.nickname && <span className="text-[10px] text-gold-500 block">&bdquo;{p.nickname}&ldquo;</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-2 text-center tabular-nums text-muted">{p.age}</td>
                      <td className="py-2 pr-2 text-center">
                        <span className="font-heading font-bold tabular-nums" style={{ color }}>{p.overall_rating}</span>
                      </td>
                      <td className={`py-2 pr-2 text-center tabular-nums ${attrColor(p.skills?.speed ?? 0)}`}>{p.skills?.speed ?? 0}</td>
                      <td className={`py-2 pr-2 text-center tabular-nums ${attrColor(p.skills?.technique ?? 0)}`}>{p.skills?.technique ?? 0}</td>
                      <td className={`py-2 pr-2 text-center tabular-nums ${attrColor(p.skills?.shooting ?? 0)}`}>{p.skills?.shooting ?? 0}</td>
                      <td className={`py-2 pr-2 text-center tabular-nums ${attrColor(p.skills?.passing ?? 0)}`}>{p.skills?.passing ?? 0}</td>
                      <td className={`py-2 pr-2 text-center tabular-nums ${attrColor(p.skills?.heading ?? 0)}`}>{p.skills?.heading ?? 0}</td>
                      <td className={`py-2 pr-2 text-center tabular-nums ${attrColor(p.skills?.defense ?? 0)}`}>{p.skills?.defense ?? 0}</td>
                      <td className={`py-2 pr-2 text-center tabular-nums ${attrColor(p.skills?.goalkeeping ?? 0)}`}>{p.skills?.goalkeeping ?? 0}</td>
                      <td className={`py-2 pr-2 text-center tabular-nums text-xs ${cond.color}`}>{p.lifeContext?.condition ?? 0}%</td>
                      <td className="py-2 pr-4 sm:pr-5 text-center">{getMoraleEmoji(p.lifeContext?.morale ?? 50)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Card list — always for foreign team, mobile for own team */}
        <div className={`flex flex-col gap-2 ${isOwnTeam ? "md:hidden" : ""}`}>
          {sorted.map((p) => {
            // Position-specific key skills, rounded to nearest 5
            const pos = p.position;
            type AttrKey = "speed" | "technique" | "shooting" | "passing" | "heading" | "defense" | "goalkeeping";
            const attrSpec: Array<{ key: AttrKey; label: string }> =
              pos === "GK" ? [
                { key: "goalkeeping", label: "Brn" },
                { key: "defense", label: "Obr" },
                { key: "heading", label: "Hlv" },
                { key: "passing", label: "Při" },
              ] : pos === "DEF" ? [
                { key: "defense", label: "Obr" },
                { key: "heading", label: "Hlv" },
                { key: "speed", label: "Rch" },
                { key: "passing", label: "Při" },
              ] : pos === "MID" ? [
                { key: "technique", label: "Tch" },
                { key: "passing", label: "Při" },
                { key: "shooting", label: "Stř" },
                { key: "speed", label: "Rch" },
              ] : [
                { key: "shooting", label: "Stř" },
                { key: "speed", label: "Rch" },
                { key: "technique", label: "Tch" },
                { key: "heading", label: "Hlv" },
              ];
            const attrs = attrSpec.map((a) => ({ ...a, value: roundTo5(p.skills?.[a.key] ?? 0) }));
            const ratingValue = p.overall_rating;
            return (
              <div key={p.id}
                onClick={() => router.push(`/dashboard/player/${p.id}`)}
                className="card px-3 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer">
                <PositionBadge position={p.position} />
                {p.avatar && typeof p.avatar === "object" && Object.keys(p.avatar).length > 2 ? (
                  <FaceAvatar faceConfig={p.avatar} size={36} className="shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: color }}>
                    {p.first_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold text-sm truncate">{p.first_name} {p.last_name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span>{p.age} let</span>
                    {p.nickname && <span className="text-gold-500 truncate">&bdquo;{p.nickname}&ldquo;</span>}
                  </div>
                </div>
                {/* Position-specific rounded attributes + exact overall rating */}
                <div className="shrink-0 flex items-center gap-1">
                  <div className="hidden min-[480px]:grid grid-cols-4 gap-0.5 text-[10px] font-heading font-bold">
                    {attrs.map((a) => (
                      <span key={a.key} className={`w-6 text-center py-0.5 rounded ${attrColor(a.value)}`} title={a.label}>{a.value}</span>
                    ))}
                  </div>
                  <span className="px-2 py-1 rounded-lg font-heading font-bold text-sm tabular-nums text-white ml-1" style={{ backgroundColor: color }}>
                    {ratingValue}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
    </>
  );
}

/* ── Sub-components ── */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-label">{label}</div>
      <div className="font-heading font-bold text-base">{value}</div>
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

function SortHeader({ label, sortKey, current, dir, onSort, className, title }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onSort: (k: SortKey) => void; className?: string; title?: string;
}) {
  const isActive = current === sortKey;
  return (
    <th className={`pb-2 pr-1 text-[11px] uppercase tracking-wide cursor-pointer select-none hover:text-ink transition-colors ${isActive ? "text-ink" : "text-label"} ${className ?? ""}`}
      onClick={() => onSort(sortKey)} title={title}>
      {label}{isActive ? (dir === "asc" ? " \u25B2" : " \u25BC") : ""}
    </th>
  );
}
