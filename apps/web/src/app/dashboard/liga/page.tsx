"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview, PositionBadge, PageHeader, TeamName } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

// ═══ Types ═══

interface Standing {
  pos: number; teamId: string | null; team: string;
  played: number; wins: number; draws: number; losses: number;
  gf: number; ga: number; points: number; form: string[];
  isPlayer?: boolean; isAi?: boolean;
  primaryColor?: string; secondaryColor?: string; badgePattern?: string;
}

interface LeagueRound {
  round: number; scheduledAt: string | null;
  matches: Array<{
    id: string; status: string;
    homeTeamId: string; homeName: string; homeColor: string; homeSecondary: string; homeBadge: string; homeScore: number | null;
    awayTeamId: string; awayName: string; awayColor: string; awaySecondary: string; awayBadge: string; awayScore: number | null;
  }>;
}

interface PlayerStat {
  playerId: string; name: string; position: string; teamId: string; teamName: string; teamColor: string;
  teamSecondary: string; teamBadge: string;
  goals: number; assists: number; appearances: number; motm: number;
  yellowCards: number; redCards: number; avgRating: number; cleanSheets: number;
  isMyTeam: boolean;
}

interface StatsData {
  topScorers: PlayerStat[];
  topAssists: PlayerStat[];
  topRated: PlayerStat[];
  mostCards: PlayerStat[];
  mostAppearances: PlayerStat[];
}

// ═══ Helpers ═══

const FORM_COLORS: Record<string, string> = { W: "bg-pitch-400", D: "bg-gold-500", L: "bg-card-red" };
const FORM_LABELS: Record<string, string> = { W: "V", D: "R", L: "P" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }

type Tab = "tabulka" | "rozpis" | "vysledky" | "statistiky" | "zpravodaj";

interface NewsArticle { id: string; type: string; headline: string; body: string; icon: string; date: string; gameWeek?: number | null }

// ═══ Main Page ═══

export default function LigaPageWrapper() {
  return <Suspense><LigaPage /></Suspense>;
}

interface LeagueOption { id: string; name: string; district: string; team_count: number }

function LigaPage() {
  const ctx = useTeam();
  const teamId = ctx.teamId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "tabulka";
  const [tab, setTab] = useState<Tab>(initialTab);

  const [leagueName, setLeagueName] = useState("");
  const [seasonNum, setSeasonNum] = useState<number | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadedTabs, setLoadedTabs] = useState<Set<Tab>>(new Set());

  // League picker
  const [allLeagues, setAllLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const isOtherLeague = selectedLeagueId !== null;

  // Load available leagues
  useEffect(() => {
    apiFetch<{ leagues: LeagueOption[] }>("/api/leagues")
      .then((data) => setAllLeagues(data.leagues))
      .catch(() => {});
  }, []);

  // Load own league standings on mount
  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ leagueName: string; season?: number; standings: Standing[] }>(`/api/teams/${teamId}/standings`)
      .then((data) => {
        setLeagueName(data.leagueName);
        setSeasonNum(data.season ?? null);
        setStandings(data.standings);
        setLoadingStandings(false);
        setLoadedTabs((s) => new Set(s).add("tabulka"));
      })
      .catch(() => setLoadingStandings(false));
  }, [teamId]);

  // Load other league data when selected
  useEffect(() => {
    if (!selectedLeagueId) return;
    setLoadingStandings(true);
    setLoadedTabs(new Set());
    setRounds([]);
    setStatsData(null);
    apiFetch<{ leagueName: string; season?: number; standings: Standing[] }>(`/api/leagues/${selectedLeagueId}/standings`)
      .then((data) => {
        setLeagueName(data.leagueName);
        setSeasonNum(data.season ?? null);
        setStandings(data.standings);
        setLoadingStandings(false);
        setLoadedTabs((s) => new Set(s).add("tabulka"));
      })
      .catch(() => setLoadingStandings(false));
  }, [selectedLeagueId]);

  // Load own league tabs (schedule, stats) — only when viewing own league
  useEffect(() => {
    if (!teamId || isOtherLeague) return;
    if ((tab === "rozpis" || tab === "vysledky") && !loadedTabs.has("rozpis")) {
      apiFetch<{ rounds: LeagueRound[] }>(`/api/teams/${teamId}/league-schedule`)
        .then((data) => {
          setRounds(data.rounds);
          setLoadedTabs((s) => { const n = new Set(s); n.add("rozpis"); n.add("vysledky"); return n; });
        }).catch(() => {});
    }
    if (tab === "statistiky" && !loadedTabs.has("statistiky")) {
      apiFetch<StatsData>(`/api/teams/${teamId}/league-stats`)
        .then((data) => {
          setStatsData(data);
          setLoadedTabs((s) => new Set(s).add("statistiky"));
        }).catch(() => {});
    }
  }, [tab, teamId, loadedTabs, isOtherLeague]);

  // Load zpravodaj for other league
  useEffect(() => {
    if (!isOtherLeague || !selectedLeagueId) return;
    if (tab === "zpravodaj" && !loadedTabs.has("zpravodaj")) {
      apiFetch<{ articles: NewsArticle[] }>(`/api/leagues/${selectedLeagueId}/news`)
        .then((data) => {
          setNewsArticles(data.articles);
          setLoadedTabs((s) => new Set(s).add("zpravodaj"));
        }).catch(() => {});
    }
  }, [tab, selectedLeagueId, loadedTabs, isOtherLeague]);

  const changeTab = (t: Tab) => { setTab(t); router.replace(`/dashboard/liga?tab=${t}`, { scroll: false }); };

  const handleLeagueChange = (leagueId: string) => {
    if (leagueId === "own") {
      setSelectedLeagueId(null);
      // Reload own data
      if (teamId) {
        setLoadingStandings(true);
        setLoadedTabs(new Set());
        apiFetch<{ leagueName: string; season?: number; standings: Standing[] }>(`/api/teams/${teamId}/standings`)
          .then((data) => {
            setLeagueName(data.leagueName);
            setSeasonNum(data.season ?? null);
            setStandings(data.standings);
            setLoadingStandings(false);
            setLoadedTabs((s) => new Set(s).add("tabulka"));
          })
          .catch(() => setLoadingStandings(false));
      }
    } else {
      setSelectedLeagueId(leagueId);
    }
    setTab("tabulka");
  };

  if (loadingStandings) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const displayName = seasonNum ? `${leagueName} — Sezóna ${seasonNum}` : (leagueName || "Liga");
  // Other leagues = leagues that are NOT my own
  const otherLeagues = allLeagues.filter((l) => l.name !== leagueName || isOtherLeague);

  return (
    <>
    <PageHeader name={displayName} detail={ctx.district ? `Okres ${ctx.district}` : undefined} badge={null}>{null}</PageHeader>
    <div className="page-container space-y-5">

      {/* League picker — only show if there are other leagues */}
      {allLeagues.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted font-medium">Zobrazit ligu:</span>
          <select
            value={selectedLeagueId ?? "own"}
            onChange={(e) => handleLeagueChange(e.target.value)}
            className="text-sm bg-white border border-border rounded-lg px-3 py-2 font-medium"
          >
            <option value="own">Moje liga</option>
            {allLeagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.team_count} týmů)</option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs — cizí liga: tabulka + zpravodaj, vlastní: plné menu */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {(isOtherLeague ? ["tabulka", "zpravodaj"] as Tab[] : ["tabulka", "rozpis", "vysledky", "statistiky"] as Tab[]).map((key) => (
          <button key={key} onClick={() => changeTab(key)}
            className={`flex-1 py-2.5 text-sm font-heading font-bold rounded-lg transition-colors ${
              tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}>
            {{ tabulka: "Tabulka", rozpis: "Rozpis", vysledky: "Výsledky", statistiky: "Statistiky", zpravodaj: "Zpravodaj" }[key]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "tabulka" && <StandingsTab standings={standings} teamId={teamId!} />}
      {!isOtherLeague && tab === "rozpis" && <ScheduleTab rounds={rounds} loaded={loadedTabs.has("rozpis")} teamId={teamId!} showAll />}
      {!isOtherLeague && tab === "vysledky" && <ScheduleTab rounds={rounds} loaded={loadedTabs.has("vysledky")} teamId={teamId!} showAll={false} />}
      {!isOtherLeague && tab === "statistiky" && <StatsTab data={statsData} loaded={loadedTabs.has("statistiky")} />}
      {isOtherLeague && tab === "zpravodaj" && (
        !loadedTabs.has("zpravodaj") ? <div className="flex justify-center py-8"><Spinner /></div> : (
          <div className="space-y-3">
            {newsArticles.length === 0 && <p className="text-muted text-sm text-center py-8">Zatím žádné zprávy</p>}
            {newsArticles.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-bold text-base text-ink">{a.headline}</h3>
                    <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-muted/60 mt-2">{a.date ? formatDate(a.date) : ""}{a.gameWeek ? ` — ${a.gameWeek}. kolo` : ""}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
    </>
  );
}

// ═══ Tabulka ═══

type SortKey = "pos" | "team" | "played" | "wins" | "draws" | "losses" | "gd" | "points";
type SortDir = "asc" | "desc";

function StandingsTab({ standings, teamId }: { standings: Standing[]; teamId: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  if (standings.length === 0) return <div className="card p-8 text-center text-muted">Zatím žádné výsledky.</div>;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "team" ? "asc" : "desc"); }
  };

  const sorted = [...standings].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "pos": cmp = a.pos - b.pos; break;
      case "team": cmp = a.team.localeCompare(b.team, "cs"); break;
      case "played": cmp = a.played - b.played; break;
      case "wins": cmp = a.wins - b.wins; break;
      case "draws": cmp = a.draws - b.draws; break;
      case "losses": cmp = a.losses - b.losses; break;
      case "gd": cmp = (a.gf - a.ga) - (b.gf - b.ga); break;
      case "points": cmp = a.points - b.points; break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalTeams = standings.length;
  const cols: Array<{ key: SortKey; label: string; w: string }> = [
    { key: "pos", label: "#", w: "w-8" },
    { key: "team", label: "Tým", w: "flex-1" },
    { key: "played", label: "Z", w: "w-8" },
    { key: "wins", label: "V", w: "w-8" },
    { key: "draws", label: "R", w: "w-8" },
    { key: "losses", label: "P", w: "w-8" },
    { key: "gd", label: "Skóre", w: "w-14" },
    { key: "points", label: "B", w: "w-10" },
  ];

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200">
            {cols.map((col) => {
              const hideMobile = ["played", "wins", "draws", "losses"].includes(col.key);
              return (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  colSpan={col.key === "team" ? 2 : undefined}
                  className={`py-2.5 px-1.5 text-xs font-heading uppercase cursor-pointer select-none hover:text-pitch-500 transition-colors whitespace-nowrap ${
                    col.key === "team" ? "text-left pl-3" : "text-center"
                  } ${sortKey === col.key ? "text-pitch-600" : "text-muted"} ${hideMobile ? "hidden sm:table-cell" : ""}`}>
                  {col.label}{sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              );
            })}
            <th className="py-2.5 px-1.5 text-xs font-heading uppercase text-muted text-center w-28 hidden sm:table-cell">Forma</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const isPromo = row.pos <= 2;
            const isRel = row.pos >= totalTeams - 1;
            return (
              <tr key={row.teamId ?? row.pos}
                className={`border-b border-gray-50 transition-colors ${
                  row.isPlayer ? "bg-pitch-50/60" : idx % 2 === 1 ? "bg-gray-50/30" : "hover:bg-gray-50/50"
                }`}>
                {/* Position */}
                <td className="py-3 px-1.5 text-center">
                  <span className={`font-heading font-[800] text-base tabular-nums ${
                    row.pos === 1 ? "text-gold-500" : isPromo ? "text-pitch-500" : isRel ? "text-card-red" : "text-muted"
                  }`}>
                    {row.pos}
                  </span>
                </td>
                {/* Badge */}
                <td className="py-3 pl-2 pr-0 w-8" style={{ verticalAlign: "middle" }}>
                  <BadgePreview primary={row.primaryColor || "#2D5F2D"} secondary={row.secondaryColor || "#FFF"}
                    pattern={(row.badgePattern as BadgePattern) || "shield"} initials={ini(row.team)} size={24} />
                </td>
                {/* Team */}
                <td className="py-3 px-1.5" style={{ verticalAlign: "middle" }}>
                  {row.teamId && !row.isAi ? (
                    <Link href={`/dashboard/team/${row.teamId}`} className={`font-heading font-bold hover:text-pitch-500 transition-colors ${row.isPlayer ? "text-pitch-600" : ""}`}>
                      <TeamName name={row.team} />
                    </Link>
                  ) : (
                    <span className={`font-heading font-bold ${row.isAi ? "text-muted" : ""}`}><TeamName name={row.team} /></span>
                  )}
                </td>
                {/* Stats — hidden on mobile */}
                <td className="py-3 px-1.5 text-center tabular-nums text-muted hidden sm:table-cell">{row.played}</td>
                <td className="py-3 px-1.5 text-center tabular-nums font-medium hidden sm:table-cell">{row.wins}</td>
                <td className="py-3 px-1.5 text-center tabular-nums font-medium hidden sm:table-cell">{row.draws}</td>
                <td className="py-3 px-1.5 text-center tabular-nums font-medium hidden sm:table-cell">{row.losses}</td>
                <td className="py-3 px-1.5 text-center tabular-nums">{row.gf}:{row.ga}</td>
                {/* Points */}
                <td className="py-3 px-1.5 text-center">
                  <span className="font-heading font-[800] text-xl tabular-nums">{row.points}</span>
                </td>
                {/* Form — hidden on mobile */}
                <td className="py-3 px-1.5 hidden sm:table-cell">
                  <div className="flex gap-1 justify-center">
                    {(row.form ?? []).slice(0, 5).map((f, i) => (
                      <div key={i} className={`w-5 h-5 rounded ${FORM_COLORS[f] ?? "bg-gray-200"} flex items-center justify-center text-white text-[10px] font-bold`}>
                        {FORM_LABELS[f] ?? f}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pitch-500" /> Postup</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-card-red" /> Sestup</span>
      </div>
    </div>
  );
}

// ═══ Rozpis / Výsledky ═══

function ScheduleTab({ rounds, loaded, teamId, showAll }: { rounds: LeagueRound[]; loaded: boolean; teamId: string; showAll: boolean }) {
  if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;

  const displayRounds = showAll
    ? rounds
    : rounds.filter((r) => r.matches.some((m) => m.status === "simulated")).reverse();

  if (displayRounds.length === 0) {
    return <div className="card p-8 text-center text-muted">{showAll ? "Rozpis není dostupný" : "Žádné odehrané zápasy"}</div>;
  }

  return (
    <div className="space-y-4">
      {displayRounds.map((round) => (
        <div key={round.round} className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="font-heading font-bold text-sm">{round.round}. kolo</span>
            {round.scheduledAt && <span className="text-xs text-muted">{formatDate(round.scheduledAt)}</span>}
          </div>
          <div>
            {round.matches.map((m, i) => {
              const isPlayed = m.status === "simulated";
              const isMyMatch = m.homeTeamId === teamId || m.awayTeamId === teamId;
              const content = (
                <div className={`flex items-center px-4 py-3 ${i < round.matches.length - 1 ? "border-b border-gray-50" : ""} ${isMyMatch ? "bg-pitch-50/40" : ""} ${isPlayed ? "hover:bg-gray-50 transition-colors cursor-pointer" : ""}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <TeamName name={m.homeName} className={`font-heading ${m.homeTeamId === teamId ? "font-bold text-pitch-600" : ""}`} />
                    <BadgePreview primary={m.homeColor} secondary={m.homeSecondary} pattern={m.homeBadge as BadgePattern} initials={ini(m.homeName)} size={22} />
                  </div>
                  <div className="shrink-0 w-20 text-center">
                    {isPlayed ? (
                      <span className="font-heading font-[800] text-lg tabular-nums">{m.homeScore} : {m.awayScore}</span>
                    ) : (
                      <span className="text-xs text-muted font-heading">vs</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <BadgePreview primary={m.awayColor} secondary={m.awaySecondary} pattern={m.awayBadge as BadgePattern} initials={ini(m.awayName)} size={22} />
                    <TeamName name={m.awayName} className={`font-heading ${m.awayTeamId === teamId ? "font-bold text-pitch-600" : ""}`} />
                  </div>
                </div>
              );
              if (isPlayed) return <Link key={m.id} href={`/dashboard/match/${m.id}`}>{content}</Link>;
              return <div key={m.id}>{content}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══ Statistiky ═══

function StatsTab({ data, loaded }: { data: StatsData | null; loaded: boolean }) {
  if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  if (!data) return <div className="card p-8 text-center text-muted">Zatím žádné statistiky.</div>;

  const { topScorers, topAssists, topRated, mostCards, mostAppearances } = data;
  const hasAny = topScorers.length > 0 || topAssists.length > 0 || topRated.length > 0 || mostCards.length > 0;
  if (!hasAny) return <div className="card p-8 text-center text-muted">Zatím žádné statistiky.</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {topScorers.length > 0 && (
        <StatTable title="⚽ Nejlepší střelci" rows={topScorers} valueKey="goals" label="Góly" />
      )}
      {topAssists.length > 0 && (
        <StatTable title="👟 Nejlepší nahrávači" rows={topAssists} valueKey="assists" label="Asist." />
      )}
      {topRated.length > 0 && (
        <StatTable title="⭐ Nejlepší hodnocení" rows={topRated} valueKey="avgRating" label="Hod." decimal />
      )}
      {mostAppearances.length > 0 && (
        <StatTable title="🏃 Nejvíc zápasů" rows={mostAppearances} valueKey="appearances" label="Zápasy" />
      )}
      {mostCards.length > 0 && (
        <StatTable title="🟨 Nejvíc karet" rows={mostCards} valueKey="cards" label="Karty" renderValue={(p) => (
          <span className="flex items-center gap-1 justify-end">
            {p.yellowCards > 0 && <span className="text-gold-500 font-heading font-bold">{p.yellowCards}🟨</span>}
            {p.redCards > 0 && <span className="text-card-red font-heading font-bold">{p.redCards}🟥</span>}
          </span>
        )} />
      )}
    </div>
  );
}

function StatTable({ title, rows, valueKey, label, decimal, renderValue }: {
  title: string; rows: PlayerStat[]; valueKey: string; label: string; decimal?: boolean;
  renderValue?: (p: PlayerStat) => React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-heading font-bold uppercase text-muted">{title}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className={`border-b border-gray-50 last:border-b-0 ${p.isMyTeam ? "bg-pitch-50/40" : ""}`}>
              <td className="py-2 pl-4 w-8 text-center font-heading font-bold tabular-nums text-muted">{i + 1}</td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                  <Link href={`/dashboard/player/${p.playerId}`} className={`font-heading font-bold hover:text-pitch-500 transition-colors ${p.isMyTeam ? "text-pitch-600" : ""}`}>{p.name}</Link>
                </div>
              </td>
              <td className="py-2 px-2">
                <Link href={`/dashboard/team/${p.teamId}`} className="flex items-center gap-1.5 hover:text-pitch-500 transition-colors">
                  <BadgePreview primary={p.teamColor} secondary={p.teamSecondary} pattern={p.teamBadge as BadgePattern} initials={ini(p.teamName)} size={16} />
                  <span className="text-xs text-muted">{p.teamName}</span>
                </Link>
              </td>
              <td className="py-2 pr-4 text-right font-heading font-[800] text-lg tabular-nums">
                {renderValue ? renderValue(p) : decimal ? ((p as any)[valueKey] as number).toFixed(1) : (p as any)[valueKey]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
