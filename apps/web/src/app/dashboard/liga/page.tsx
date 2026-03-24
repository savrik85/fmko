"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, Button, BadgePreview, PositionBadge, PageHeader } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

// ═══ Types ═══

interface Standing {
  pos: number;
  teamId: string | null;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
  form: string[];
  isPlayer?: boolean;
  isAi?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  badgePattern?: string;
}

interface LeagueRound {
  round: number;
  scheduledAt: string | null;
  matches: Array<{
    id: string;
    status: string;
    homeTeamId: string;
    homeName: string;
    homeColor: string;
    homeSecondary: string;
    homeBadge: string;
    homeScore: number | null;
    awayTeamId: string;
    awayName: string;
    awayColor: string;
    awaySecondary: string;
    awayBadge: string;
    awayScore: number | null;
  }>;
}

interface PlayerStat {
  name: string;
  position: string;
  teamName: string;
  teamColor: string;
  teamSecondary: string;
  teamBadge: string;
  goals: number;
  assists: number;
  appearances: number;
  motm: number;
  isMyTeam: boolean;
}

// ═══ Helpers ═══

const FORM_COLORS: Record<string, string> = { W: "bg-pitch-400", D: "bg-gold-500", L: "bg-card-red" };
const FORM_LABELS: Record<string, string> = { W: "V", D: "R", L: "P" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}
function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" });
}

type Tab = "tabulka" | "rozpis" | "vysledky" | "statistiky";
const TABS: { key: Tab; label: string }[] = [
  { key: "tabulka", label: "Tabulka" },
  { key: "rozpis", label: "Rozpis" },
  { key: "vysledky", label: "Výsledky" },
  { key: "statistiky", label: "Statistiky" },
];

// ═══ Main Page ═══

export default function LigaPage() {
  const { teamId } = useTeam();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "tabulka";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Data
  const [leagueName, setLeagueName] = useState("");
  const [standings, setStandings] = useState<Standing[]>([]);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [topScorers, setTopScorers] = useState<PlayerStat[]>([]);
  const [topAssists, setTopAssists] = useState<PlayerStat[]>([]);

  // Loading states
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadedTabs, setLoadedTabs] = useState<Set<Tab>>(new Set());

  // Load standings on mount (always needed for header)
  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ leagueName: string; season?: number; standings: Standing[] }>(`/api/teams/${teamId}/standings`)
      .then((data) => {
        setLeagueName(data.season ? `${data.leagueName} — Sezóna ${data.season}` : data.leagueName);
        setStandings(data.standings);
        setLoadingStandings(false);
        setLoadedTabs((s) => new Set(s).add("tabulka"));
      })
      .catch(() => setLoadingStandings(false));
  }, [teamId]);

  // Lazy-load tab data (rozpis + vysledky share the same data)
  useEffect(() => {
    if (!teamId) return;

    if ((tab === "rozpis" || tab === "vysledky") && !loadedTabs.has("rozpis")) {
      apiFetch<{ rounds: LeagueRound[] }>(`/api/teams/${teamId}/league-schedule`)
        .then((data) => {
          setRounds(data.rounds);
          setLoadedTabs((s) => { const n = new Set(s); n.add("rozpis"); n.add("vysledky"); return n; });
        })
        .catch(() => {});
    }

    if (tab === "statistiky" && !loadedTabs.has("statistiky")) {
      apiFetch<{ topScorers: PlayerStat[]; topAssists: PlayerStat[] }>(`/api/teams/${teamId}/league-stats`)
        .then((data) => {
          setTopScorers(data.topScorers);
          setTopAssists(data.topAssists);
          setLoadedTabs((s) => new Set(s).add("statistiky"));
        })
        .catch(() => {});
    }
  }, [tab, teamId, loadedTabs]);

  const changeTab = (t: Tab) => {
    setTab(t);
    router.replace(`/dashboard/liga?tab=${t}`, { scroll: false });
  };

  if (loadingStandings) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  return (
    <>
      <PageHeader name={leagueName || "Liga"} badge={null}>{null}</PageHeader>
    <div className="page-container space-y-5">

      {/* FM-style tabs */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => changeTab(key)}
            className={`flex-1 py-2.5 text-sm font-heading font-bold rounded-lg transition-colors ${
              tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "tabulka" && <StandingsTab standings={standings} teamId={teamId!} />}
      {tab === "rozpis" && <ScheduleTab rounds={rounds} loaded={loadedTabs.has("rozpis")} teamId={teamId!} showAll />}
      {tab === "vysledky" && <ScheduleTab rounds={rounds} loaded={loadedTabs.has("vysledky")} teamId={teamId!} showAll={false} />}
      {tab === "statistiky" && <StatsTab scorers={topScorers} assists={topAssists} loaded={loadedTabs.has("statistiky")} teamId={teamId!} />}
    </div>
    </>
  );
}

// ═══ Tabulka ═══

type SortKey = "pos" | "team" | "played" | "wins" | "draws" | "losses" | "gd" | "points";
type SortDir = "asc" | "desc";

const SORT_COLUMNS: { key: SortKey; label: string; center?: boolean }[] = [
  { key: "pos", label: "#", center: true },
  { key: "team", label: "Tým" },
  { key: "played", label: "Z", center: true },
  { key: "wins", label: "V", center: true },
  { key: "draws", label: "R", center: true },
  { key: "losses", label: "P", center: true },
  { key: "gd", label: "Skóre", center: true },
  { key: "points", label: "B", center: true },
];

function sortStandings(rows: Standing[], key: SortKey, dir: SortDir): Standing[] {
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "pos": cmp = a.pos - b.pos; break;
      case "team": cmp = a.team.localeCompare(b.team, "cs"); break;
      case "played": cmp = a.played - b.played; break;
      case "wins": cmp = a.wins - b.wins; break;
      case "draws": cmp = a.draws - b.draws; break;
      case "losses": cmp = a.losses - b.losses; break;
      case "gd": cmp = (a.gf - a.ga) - (b.gf - b.ga); break;
      case "points": cmp = a.points - b.points; break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return <span className="ml-0.5 text-[10px] text-pitch-500">{dir === "asc" ? "\u25B2" : "\u25BC"}</span>;
}

function StandingsTab({ standings, teamId }: { standings: Standing[]; teamId: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  if (standings.length === 0) {
    return (
      <div className="card p-8 text-center text-muted">
        <p className="text-lg mb-2">Zatím žádné výsledky</p>
        <p className="text-base mb-4">Odehraj první zápas!</p>
        <a href="/dashboard/match"><Button>Hrát zápas</Button></a>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default desc for numeric columns, asc for text
      setSortDir(key === "team" ? "asc" : "desc");
    }
  };

  const sorted = sortStandings(standings, sortKey, sortDir);
  const totalTeams = standings.length;

  return (
    <div className="card overflow-hidden">
      {/* Sortable header */}
      <div className="grid grid-cols-[2.5rem_1fr_3rem_3rem_3rem_3rem_4.5rem_3.5rem_7.5rem] gap-0 px-4 py-2.5 border-b border-gray-200">
        {SORT_COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => handleSort(col.key)}
            className={`text-label cursor-pointer hover:text-pitch-600 transition-colors select-none flex items-center gap-0.5 ${
              col.center ? "justify-center" : ""
            } ${sortKey === col.key ? "text-pitch-600" : ""}`}
          >
            {col.label}
            <SortArrow active={sortKey === col.key} dir={sortDir} />
          </button>
        ))}
        <div className="text-label text-center">Forma</div>
      </div>

      {sorted.map((row, idx) => {
        const teamCell = row.isAi ? (
          <span className="text-muted">{row.team}</span>
        ) : row.teamId ? (
          <Link href={`/dashboard/team/${row.teamId}`} className="entity-link">{row.team}</Link>
        ) : (
          <span>{row.team}</span>
        );

        return (
          <div
            key={row.teamId ?? row.pos}
            className={`grid grid-cols-[2.5rem_1fr_3rem_3rem_3rem_3rem_4.5rem_3.5rem_7.5rem] gap-0 px-4 py-4 border-b border-gray-200 items-center transition-colors ${
              row.isPlayer ? "bg-pitch-50/50" : idx % 2 === 1 ? "bg-gray-50/30" : "hover:bg-gray-50/50"
            }`}
          >
            <div className={`text-center font-heading font-bold tabular-nums ${
              row.pos === 1 ? "text-gold-500" : row.pos <= 2 ? "text-pitch-500" : row.pos >= totalTeams - 1 ? "text-card-red" : "text-muted"
            }`}>
              {row.pos}
            </div>
            <div className={`flex items-center gap-2 font-heading font-bold text-base truncate ${row.isPlayer ? "text-pitch-600" : ""}`}>
              <BadgePreview
                primary={row.primaryColor || "#2D5F2D"}
                secondary={row.secondaryColor || "#FFFFFF"}
                pattern={(row.badgePattern as BadgePattern) || "shield"}
                initials={row.team.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                size={22}
              />
              {teamCell}
            </div>
            <div className="text-center tabular-nums text-base text-muted">{row.played}</div>
            <div className="text-center tabular-nums text-base">{row.wins}</div>
            <div className="text-center tabular-nums text-base">{row.draws}</div>
            <div className="text-center tabular-nums text-base">{row.losses}</div>
            <div className="text-center tabular-nums text-base">{row.gf}:{row.ga}</div>
            <div className="text-center font-heading font-[800] tabular-nums text-xl">{row.points}</div>
            <div className="flex gap-1 justify-center">
              {(row.form ?? []).slice(0, 5).map((f, i) => (
                <div key={i} className={`w-6 h-6 rounded-full ${FORM_COLORS[f] ?? "bg-gray-200"} flex items-center justify-center text-white text-xs font-bold leading-none`}>
                  {FORM_LABELS[f] ?? f}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══ Rozpis ═══

function ScheduleTab({ rounds, loaded, teamId, showAll }: { rounds: LeagueRound[]; loaded: boolean; teamId: string; showAll: boolean }) {
  if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;

  // Výsledky tab: only show rounds that have at least one played match
  const displayRounds = showAll
    ? rounds
    : rounds.filter((r) => r.matches.some((m) => m.status === "simulated")).reverse();

  if (displayRounds.length === 0) {
    return (
      <div className="card p-8 text-center text-muted">
        <p className="text-lg">{showAll ? "Rozpis ligy není dostupný" : "Zatím žádné odehrané zápasy"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {displayRounds.map((round) => (
        <div key={round.round}>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-heading font-bold text-base text-pitch-600">{round.round}. kolo</span>
            {round.scheduledAt && (
              <span className="text-sm text-muted">{formatDate(round.scheduledAt)} {formatTime(round.scheduledAt)}</span>
            )}
          </div>
          <div className="space-y-1.5">
            {round.matches.map((m) => {
              const isPlayed = m.status === "simulated";
              const isMyMatch = m.homeTeamId === teamId || m.awayTeamId === teamId;
              const inner = (
                <div className={`card flex items-center gap-3 px-4 py-3 ${isMyMatch ? "ring-1 ring-pitch-400/30 bg-pitch-500/[0.03]" : ""} ${isPlayed ? "hover:bg-gray-50 transition-colors" : ""}`}>
                  <div className="flex-1 min-w-0 flex items-center gap-2 justify-end">
                    <span className={`text-sm font-heading truncate ${m.homeTeamId === teamId ? "font-bold text-pitch-600" : ""}`}>{m.homeName}</span>
                    <BadgePreview primary={m.homeColor} secondary={m.homeSecondary} pattern={m.homeBadge as BadgePattern}
                      initials={m.homeName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={22} />
                  </div>
                  <div className="shrink-0 w-16 text-center">
                    {isPlayed ? (
                      <span className="font-heading font-[800] text-lg tabular-nums">{m.homeScore} : {m.awayScore}</span>
                    ) : (
                      <span className="text-xs text-muted font-heading">vs</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <BadgePreview primary={m.awayColor} secondary={m.awaySecondary} pattern={m.awayBadge as BadgePattern}
                      initials={m.awayName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={22} />
                    <span className={`text-sm font-heading truncate ${m.awayTeamId === teamId ? "font-bold text-pitch-600" : ""}`}>{m.awayName}</span>
                  </div>
                </div>
              );
              if (isPlayed) return <Link key={m.id} href={`/dashboard/match/${m.id}`}>{inner}</Link>;
              return <div key={m.id}>{inner}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══ Statistiky ═══

function StatsTab({ scorers, assists, loaded, teamId }: {
  scorers: PlayerStat[];
  assists: PlayerStat[];
  loaded: boolean;
  teamId: string;
}) {
  if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;

  if (scorers.length === 0 && assists.length === 0) {
    return (
      <div className="card p-8 text-center text-muted">
        <p className="text-lg">Zatím žádné statistiky</p>
        <p className="text-base mt-1">Statistiky se zobrazí po odehraných zápasech.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {scorers.length > 0 && (
        <div>
          <SectionLabel>Nejlepší střelci</SectionLabel>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_auto_4rem] gap-0 px-4 py-2.5 border-b border-gray-200">
              <div className="text-label text-center">#</div>
              <div className="text-label">Hráč</div>
              <div className="text-label text-right pr-4">Tým</div>
              <div className="text-label text-center">Góly</div>
            </div>
            {scorers.map((p, i) => (
              <div key={i} className={`grid grid-cols-[2.5rem_1fr_auto_4rem] gap-0 px-4 py-3 border-b border-gray-100 items-center ${p.isMyTeam ? "bg-pitch-50/50" : ""}`}>
                <div className="text-center font-heading font-bold tabular-nums text-muted">{i + 1}</div>
                <div className="flex items-center gap-2">
                  <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                  <span className={`font-heading font-bold text-sm ${p.isMyTeam ? "text-pitch-600" : ""}`}>{p.name}</span>
                </div>
                <div className="flex items-center gap-1.5 pr-4">
                  <BadgePreview primary={p.teamColor} secondary={p.teamSecondary} pattern={p.teamBadge as BadgePattern}
                    initials={p.teamName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={18} />
                  <span className="text-xs text-muted truncate max-w-[120px]">{p.teamName}</span>
                </div>
                <div className="text-center font-heading font-[800] text-lg tabular-nums">{p.goals}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {assists.length > 0 && (
        <div>
          <SectionLabel>Nejlepší nahrávači</SectionLabel>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_auto_4rem] gap-0 px-4 py-2.5 border-b border-gray-200">
              <div className="text-label text-center">#</div>
              <div className="text-label">Hráč</div>
              <div className="text-label text-right pr-4">Tým</div>
              <div className="text-label text-center">Asist.</div>
            </div>
            {assists.map((p, i) => (
              <div key={i} className={`grid grid-cols-[2.5rem_1fr_auto_4rem] gap-0 px-4 py-3 border-b border-gray-100 items-center ${p.isMyTeam ? "bg-pitch-50/50" : ""}`}>
                <div className="text-center font-heading font-bold tabular-nums text-muted">{i + 1}</div>
                <div className="flex items-center gap-2">
                  <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                  <span className={`font-heading font-bold text-sm ${p.isMyTeam ? "text-pitch-600" : ""}`}>{p.name}</span>
                </div>
                <div className="flex items-center gap-1.5 pr-4">
                  <BadgePreview primary={p.teamColor} secondary={p.teamSecondary} pattern={p.teamBadge as BadgePattern}
                    initials={p.teamName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={18} />
                  <span className="text-xs text-muted truncate max-w-[120px]">{p.teamName}</span>
                </div>
                <div className="text-center font-heading font-[800] text-lg tabular-nums">{p.assists}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
