"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { TalentStars } from "@/components/players/talent-stars";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { Spinner, PositionBadge, Tabs, useTabParam } from "@/components/ui";
import { PositionFilter, SquadAttributeTable, type PosFilter } from "@/components/players/squad-attribute-table";
import { SquadBodyTab } from "@/components/players/squad-body-tab";
import { SquadAnalysisTab } from "@/components/players/squad-analysis-tab";

type Tab = "atributy" | "sezona" | "top" | "dochazka" | "postava" | "rozbor";
// Pořadí určuje i výchozí záložku — první je ta bez ?tab= v adrese.
const TAB_KEYS = ["atributy", "rozbor", "sezona", "postava", "dochazka", "top"] as const;
type StatsKey = "name" | "pos" | "apps" | "min" | "g" | "a" | "ga" | "y" | "r" | "cs" | "mom" | "avg";
type AttKey = "name" | "pos" | "trainPct" | "trainAtt" | "matches" | "injury" | "suspension" | "excuse" | "bench" | "notNominated";
type SortDir = "asc" | "desc";

interface AttendanceRow {
  playerId: string;
  firstName: string;
  lastName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  trainingAttended: number;
  trainingTotal: number;
  trainingPct: number;
  matchesAvailable: number;
  matchesPlayed: number;
  matchesMissed: number;
  breakdown: { injury: number; suspension: number; excuse: number; bench: number; notNominated: number };
}

interface PlayerSeasonStats {
  playerId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  position: "GK" | "DEF" | "MID" | "FWD";
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number;
  avgRating: number | null;
  cleanSheets: number;
  manOfMatch: number;
}

interface TeamStatsResponse {
  stats: PlayerSeasonStats[];
  topScorers: PlayerSeasonStats[];
  topAssists: PlayerSeasonStats[];
}

const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

export default function SquadPage() {
  const { teamId } = useTeam();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  // Potenciál celého kádru jedním dotazem — bez skauta zůstane prázdný
  const [potencial, setPotencial] = useState<Map<string, { strop: number | null; uroven: string | null; slovne: string | null }>>(new Map());
  const [stropOpor, setStropOpor] = useState<number | null>(null);
  const [seasonStats, setSeasonStats] = useState<PlayerSeasonStats[]>([]);
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [statsSortKey, setStatsSortKey] = useState<StatsKey>("g");
  const [statsSortDir, setStatsSortDir] = useState<SortDir>("desc");
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);
  const [attSortKey, setAttSortKey] = useState<AttKey>("trainPct");
  const [attSortDir, setAttSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<TeamStatsResponse>(`/api/teams/${teamId}/stats`).catch((e) => { console.error("team stats:", e); return { stats: [], topScorers: [], topAssists: [] } as TeamStatsResponse; }),
    ]).then(([t, p, s]) => { setTeam(t); setPlayers(p); setSeasonStats(s.stats); setLoading(false); });

    // Potenciál celého kádru — musí se načíst rovnou s kádrem, ne až s nějakým tabem
    apiFetch<{ maSkauta: boolean; stropOpor: number | null; hraci: Array<{ id: string; strop: number | null; uroven: string | null; slovne: string | null }> }>(
      `/api/teams/${teamId}/potencial-kadru`)
      .then((d) => {
        setStropOpor(d.stropOpor);
        setPotencial(new Map(d.hraci.map((h) => [h.id, { strop: h.strop, uroven: h.uroven, slovne: h.slovne }])));
      })
      .catch((e) => console.error("potencial kadru:", e));
  }, [teamId]);

  // Lazy fetch attendance při kliknutí na tab Docházka
  useEffect(() => {
    if (tab !== "dochazka" || !teamId || attendanceLoaded) return;
    apiFetch<{ players: AttendanceRow[]; matchesAvailable: number }>(`/api/teams/${teamId}/attendance`)
      .then((d) => { setAttendance(d.players); setAttendanceLoaded(true); })
      .catch((e) => { console.error("attendance fetch:", e); setAttendanceLoaded(true); });
  }, [tab, teamId, attendanceLoaded]);

  // TOP tab — výpočty leaderů (musí být před early returnem kvůli rules of hooks)
  const topMatchData = useMemo(() => {
    const sortBy = (key: keyof PlayerSeasonStats, min = 0) =>
      seasonStats
        .filter((s) => (s[key] as number) > min)
        .sort((a, b) => (b[key] as number) - (a[key] as number))
        .slice(0, 5);
    const minutesMin = 1;
    return {
      scorers: sortBy("goals", 0),
      assists: sortBy("assists", 0),
      mom: sortBy("manOfMatch", 0),
      cards: [...seasonStats]
        .map((s) => ({ ...s, _disc: (s.yellowCards ?? 0) + (s.redCards ?? 0) * 3 }))
        .filter((s) => s._disc > 0)
        .sort((a, b) => b._disc - a._disc)
        .slice(0, 5),
      cleanSheets: seasonStats
        .filter((s) => s.position === "GK" && (s.cleanSheets ?? 0) > 0)
        .sort((a, b) => (b.cleanSheets ?? 0) - (a.cleanSheets ?? 0))
        .slice(0, 5),
      ratings: seasonStats
        .filter((s) => (s.minutesPlayed ?? 0) >= minutesMin && (s.avgRating ?? 0) > 0)
        .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
        .slice(0, 5),
      minutes: [...seasonStats]
        .sort((a, b) => (b.minutesPlayed ?? 0) - (a.minutesPlayed ?? 0))
        .slice(0, 5),
    };
  }, [seasonStats]);

  // TOP atributy — z player roster, fungují i bez odehraných zápasů
  const topPlayerData = useMemo(() => {
    const active = players.filter((p) => (p as any).status !== "quit");
    const sortBySkill = (skill: string) => [...active]
      .map((p) => ({ p, v: (p.skills as Record<string, number> | undefined)?.[skill] ?? 0 }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    const sortByPhys = (key: string) => [...active]
      .map((p) => ({ p, v: ((p.physical as unknown) as Record<string, number> | undefined)?.[key] ?? 0 }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    const sortByLC = (key: string) => [...active]
      .map((p) => ({ p, v: ((p.lifeContext as unknown as Record<string, number> | undefined))?.[key] ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    return {
      ratings: [...active].sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0)).slice(0, 5),
      speed: sortBySkill("speed"),
      shooting: sortBySkill("shooting"),
      technique: sortBySkill("technique"),
      passing: sortBySkill("passing"),
      heading: sortBySkill("heading"),
      defense: sortBySkill("defense"),
      stamina: sortByPhys("stamina"),
      strength: sortByPhys("strength"),
      condition: sortByLC("condition"),
      morale: sortByLC("morale"),
      youngest: [...active].sort((a, b) => a.age - b.age).slice(0, 5),
      oldest: [...active].sort((a, b) => b.age - a.age).slice(0, 5),
      wages: [...active].sort((a, b) => (b.weekly_wage ?? 0) - (a.weekly_wage ?? 0)).slice(0, 5),
    };
  }, [players]);

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  if (!team) return <div className="p-6">Tým nenalezen.</div>;

  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);

  // Stats tab — filter + sort
  const statsFiltered = filter === "all" ? seasonStats : seasonStats.filter((s) => s.position === filter);
  const getStatsVal = (s: PlayerSeasonStats, k: StatsKey): string | number => {
    switch (k) {
      case "name": return `${s.lastName} ${s.firstName}`;
      case "pos": return POS_ORDER[s.position] ?? 9;
      case "apps": return s.appearances ?? 0;
      case "min": return s.minutesPlayed ?? 0;
      case "g": return s.goals ?? 0;
      case "a": return s.assists ?? 0;
      case "ga": return (s.goals ?? 0) + (s.assists ?? 0);
      case "y": return s.yellowCards ?? 0;
      case "r": return s.redCards ?? 0;
      case "cs": return s.cleanSheets ?? 0;
      case "mom": return s.manOfMatch ?? 0;
      case "avg": return s.avgRating ?? 0;
    }
  };
  const statsSorted = [...statsFiltered].sort((a, b) => {
    const va = getStatsVal(a, statsSortKey);
    const vb = getStatsVal(b, statsSortKey);
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "cs") : (va as number) - (vb as number);
    return statsSortDir === "asc" ? cmp : -cmp;
  });
  const toggleStatsSort = (k: StatsKey) => {
    if (statsSortKey === k) setStatsSortDir(statsSortDir === "asc" ? "desc" : "asc");
    else { setStatsSortKey(k); setStatsSortDir(k === "name" ? "asc" : "desc"); }
  };

  const totalGoals = seasonStats.reduce((s, p) => s + (p.goals ?? 0), 0);
  const totalAssists = seasonStats.reduce((s, p) => s + (p.assists ?? 0), 0);
  const totalApps = seasonStats.reduce((s, p) => s + (p.appearances ?? 0), 0);
  const totalYellow = seasonStats.reduce((s, p) => s + (p.yellowCards ?? 0), 0);
  const totalRed = seasonStats.reduce((s, p) => s + (p.redCards ?? 0), 0);

  // Summary stats
  const avgRating = players.length ? Math.round(players.reduce((s, p) => s + (p.overall_rating ?? 0), 0) / players.length) : 0;
  const totalWage = players.reduce((s, p) => s + (p.weekly_wage ?? 0), 0);
  const avgAge = players.length ? (players.reduce((s, p) => s + p.age, 0) / players.length).toFixed(1) : "0";

  return (
    <div className="page-container space-y-4">

      {/* Summary stats — 4 boxes grid (2x2 mobile, 4 cols desktop) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-2xl tabular-nums">{players.length}</div>
          <div className="text-micro text-muted uppercase tracking-wide">Hráčů</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-2xl tabular-nums">{avgRating}</div>
          <div className="text-micro text-muted uppercase tracking-wide">Ø Rating</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-2xl tabular-nums">{avgAge}</div>
          <div className="text-micro text-muted uppercase tracking-wide">Ø Věk</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-xl tabular-nums text-card-red">{totalWage.toLocaleString("cs")}</div>
          <div className="text-micro text-muted uppercase tracking-wide">Mzdy Kč/týd</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-1.5">
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="Pohled na kádr"
          dense
          mobileIcons={false}
          items={[
            // Rozbor hned za Atributy: na mobilu je vidět bez posouvání lišty, TOP až na konci.
            { key: "atributy", label: "Atributy", icon: "\u{1F4CB}" },
            { key: "rozbor", label: "Rozbor", icon: "\u{1F9ED}" },
            { key: "sezona", label: "Sezóna", icon: "\u{1F4CA}" },
            { key: "postava", label: "Postava", icon: "\u2696\uFE0F" },
            { key: "dochazka", label: "Docházka", icon: "\u{1F4C5}" },
            { key: "top", label: "TOP", icon: "\u{1F3C6}" },
          ]}
        />
      </div>

      {/* Rozbor je za celou jedenáctku, filtr postů by v něm nic neznamenal. */}
      {tab !== "rozbor" && <PositionFilter players={players} value={filter} onChange={setFilter} />}

      {/* FM-style table — Atributy tab */}
      {tab === "atributy" && <SquadAttributeTable players={filtered} potential={potencial} />}

      {/* Sezóna — match stats tab */}
      {tab === "sezona" && (
        <>
          {/* Souhrn sezony — 4 boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-pitch-500">{totalGoals}</div>
              <div className="text-micro text-muted uppercase tracking-wide">Góly</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-blue-500">{totalAssists}</div>
              <div className="text-micro text-muted uppercase tracking-wide">Asistence</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-amber-500">{totalYellow}</div>
              <div className="text-micro text-muted uppercase tracking-wide">Žluté</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-card-red">{totalRed}</div>
              <div className="text-micro text-muted uppercase tracking-wide">Červené</div>
            </div>
          </div>

          {totalApps === 0 && (
            <div className="card p-3 text-center text-xs text-muted">
              {"\u{2139}\u{FE0F}"} Tým zatím neodehrál žádný zápas. Statistiky se naplní postupně po každém kole. <Link href="/rozpis" className="text-pitch-600 underline ml-1">Rozpis zápasů</Link>
            </div>
          )}
          <div className="card overflow-x-auto table-scroll">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  {([
                    ["name", "Jméno", "Jméno hráče"],
                    ["pos", "Poz", "Pozice"],
                    ["apps", "Záp", "Zápasy"],
                    ["min", "Min", "Odehrané minuty"],
                    ["g", "G", "Góly"],
                    ["a", "A", "Asistence"],
                    ["ga", "G+A", "Góly + asistence"],
                    ["y", "ŽK", "Žluté karty"],
                    ["r", "ČK", "Červené karty"],
                    ["cs", "CS", "Čistá konta (brankáři)"],
                    ["mom", "MoM", "Hráč zápasu"],
                    ["avg", "Ø", "Průměrný rating"],
                  ] as Array<[StatsKey, string, string]>).map(([k, label, tip]) => (
                    <th key={k}
                      onClick={() => toggleStatsSort(k)}
                      title={tip}
                      className={`py-2.5 px-1.5 font-heading uppercase cursor-pointer select-none hover:text-pitch-500 transition-colors whitespace-nowrap ${
                        statsSortKey === k ? "text-pitch-600 bg-pitch-50" : "text-muted"
                      } ${k === "name" ? "text-left pl-3 sticky left-0 bg-white z-10" : "text-center"}`}
                    >
                      {label}{statsSortKey === k ? (statsSortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statsSorted.map((s) => (
                  <tr key={s.playerId} className="border-b border-gray-50 hover:bg-pitch-50/30 transition-colors">
                    <td className="py-2 px-1.5 pl-3 sticky left-0 bg-white z-10">
                      <Link href={`/hrac/${s.playerId}`}
                        className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors whitespace-nowrap">
                        {s.firstName} {s.lastName}
                      </Link>
                    </td>
                    <td className="py-2 px-1.5 text-center"><PositionBadge position={s.position} /></td>
                    <td className="py-2 px-1.5 text-center tabular-nums">{s.appearances ?? 0}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums text-muted">{s.minutesPlayed ?? 0}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums font-heading font-bold text-pitch-600">{s.goals ?? 0}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums font-heading font-bold text-blue-600">{s.assists ?? 0}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums font-heading font-bold">{(s.goals ?? 0) + (s.assists ?? 0)}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums text-amber-600">{s.yellowCards ?? 0}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums text-card-red">{s.redCards ?? 0}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums">{s.position === "GK" ? (s.cleanSheets ?? 0) : "—"}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums text-gold-600">{s.manOfMatch ?? 0}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums font-heading font-bold">{s.avgRating != null && s.avgRating > 0 ? s.avgRating.toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TOP hráči — atributy + matchové */}
      {tab === "top" && (
        <>
          <div className="text-micro font-heading font-bold text-muted uppercase tracking-wider mt-1">{"\u{1F3C5}"} Žebříčky kádru</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <PlayerTopList title={"\u{2B50} Nejvyšší rating"} items={topPlayerData.ratings} valueOf={(p) => p.overall_rating ?? 0} />
            <PlayerTopList title={"\u{1F525} Top kondice"} items={topPlayerData.condition.map((x) => x.p)} valueOf={(p) => `${(p.lifeContext as unknown as Record<string, number>)?.condition ?? 0}%`} />
            <PlayerTopList title={"\u{1F60A} Top morálka"} items={topPlayerData.morale.map((x) => x.p)} valueOf={(p) => `${(p.lifeContext as unknown as Record<string, number>)?.morale ?? 0}%`} />
            <PlayerTopList title={"\u{1F4A8} Nejrychlejší"} items={topPlayerData.speed.map((x) => x.p)} valueOf={(p) => p.skills?.speed ?? 0} />
            <PlayerTopList title={"\u{1F3AF} Nejlepší střelba"} items={topPlayerData.shooting.map((x) => x.p)} valueOf={(p) => p.skills?.shooting ?? 0} />
            <PlayerTopList title={"\u{1F3A8} Top technika"} items={topPlayerData.technique.map((x) => x.p)} valueOf={(p) => p.skills?.technique ?? 0} />
            <PlayerTopList title={"\u{1F4E4} Top přihrávky"} items={topPlayerData.passing.map((x) => x.p)} valueOf={(p) => p.skills?.passing ?? 0} />
            <PlayerTopList title={"\u{1F9E0} Top hlavičky"} items={topPlayerData.heading.map((x) => x.p)} valueOf={(p) => p.skills?.heading ?? 0} />
            <PlayerTopList title={"\u{1F6E1}\u{FE0F} Top obrana"} items={topPlayerData.defense.map((x) => x.p)} valueOf={(p) => p.skills?.defense ?? 0} />
            <PlayerTopList title={"\u{1F3C3} Top výdrž"} items={topPlayerData.stamina.map((x) => x.p)} valueOf={(p) => (p.physical as unknown as Record<string, number>)?.stamina ?? 0} />
            <PlayerTopList title={"\u{1F4AA} Top síla"} items={topPlayerData.strength.map((x) => x.p)} valueOf={(p) => (p.physical as unknown as Record<string, number>)?.strength ?? 0} />
            <PlayerTopList title={"\u{1F476} Nejmladší"} items={topPlayerData.youngest} valueOf={(p) => `${p.age} l.`} />
            <PlayerTopList title={"\u{1F474} Nejstarší"} items={topPlayerData.oldest} valueOf={(p) => `${p.age} l.`} />
            <PlayerTopList title={"\u{1F4B0} Nejvyšší mzdy"} items={topPlayerData.wages} valueOf={(p) => (p.weekly_wage ?? 0).toLocaleString("cs")} suffix="Kč" />
          </div>

          {totalApps > 0 && (
            <>
              <div className="text-micro font-heading font-bold text-muted uppercase tracking-wider mt-4">{"\u{26BD}"} Sezónní výkonnost</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <TopList title={"\u{26BD} Nejlepší střelci"} items={topMatchData.scorers} valueOf={(s) => s.goals ?? 0} suffix="g" />
                <TopList title={"\u{1F3AF} Nejlepší asistenti"} items={topMatchData.assists} valueOf={(s) => s.assists ?? 0} suffix="a" />
                <TopList title={"\u{2B50} Avg rating zápasů"} items={topMatchData.ratings} valueOf={(s) => (s.avgRating ?? 0).toFixed(1)} />
                <TopList title={"\u{1F451} Hráč zápasu"} items={topMatchData.mom} valueOf={(s) => s.manOfMatch ?? 0} suffix="×" />
                <TopList title={"\u{23F1}\u{FE0F} Nejvíce minut"} items={topMatchData.minutes} valueOf={(s) => `${s.minutesPlayed ?? 0} '`} />
                <TopList title={"\u{1F9E4} Čistá konta"} items={topMatchData.cleanSheets} valueOf={(s) => s.cleanSheets ?? 0} />
                {topMatchData.cards.length > 0 && (
                  <TopList title={"\u{1F7E5} Disciplinární přestupky"} items={topMatchData.cards as PlayerSeasonStats[]}
                    valueOf={(s) => `${s.yellowCards ?? 0}ŽK / ${s.redCards ?? 0}ČK`} />
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Docházka — týmový přehled */}
      {tab === "dochazka" && (
        !attendanceLoaded ? (
          <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>
        ) : (
          <DochazkaTab
            rows={attendance.filter((r) => filter === "all" || r.position === filter)}
            sortKey={attSortKey}
            sortDir={attSortDir}
            onSort={(k) => {
              if (attSortKey === k) setAttSortDir(attSortDir === "asc" ? "desc" : "asc");
              else { setAttSortKey(k); setAttSortDir(k === "name" ? "asc" : "desc"); }
            }}
          />
        )
      )}

      {tab === "postava" && teamId && <SquadBodyTab teamId={teamId} filter={filter} />}

      {tab === "rozbor" && teamId && <SquadAnalysisTab teamId={teamId} potential={potencial} />}

    </div>
  );
}

function DochazkaTab({ rows, sortKey, sortDir, onSort }: {
  rows: AttendanceRow[];
  sortKey: AttKey;
  sortDir: SortDir;
  onSort: (k: AttKey) => void;
}) {
  const getVal = (r: AttendanceRow, k: AttKey): string | number => {
    switch (k) {
      case "name": return `${r.lastName} ${r.firstName}`;
      case "pos": return POS_ORDER[r.position] ?? 9;
      case "trainPct": return r.trainingPct;
      case "trainAtt": return r.trainingAttended;
      case "matches": return r.matchesPlayed;
      case "injury": return r.breakdown.injury;
      case "suspension": return r.breakdown.suspension;
      case "excuse": return r.breakdown.excuse;
      case "bench": return r.breakdown.bench;
      case "notNominated": return r.breakdown.notNominated;
    }
  };
  const sorted = [...rows].sort((a, b) => {
    const va = getVal(a, sortKey);
    const vb = getVal(b, sortKey);
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "cs") : (va as number) - (vb as number);
    return sortDir === "asc" ? cmp : -cmp;
  });
  const totalMatches = rows[0]?.matchesAvailable ?? 0;
  if (rows.length === 0) {
    return <div className="card p-4 text-sm text-muted text-center">Žádní hráči neodpovídají filtru.</div>;
  }
  return (
    <>
      {totalMatches === 0 && (
        <div className="card p-3 text-center text-xs text-muted">
          {"\u{2139}\u{FE0F}"} Tým zatím neodehrál žádný zápas. Tabulka zobrazí jen tréninkovou docházku.
        </div>
      )}
      <div className="card overflow-x-auto table-scroll">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-gray-200">
              {([
                ["name", "Jméno", "Jméno hráče", "left"],
                ["pos", "Poz", "Pozice", "center"],
                ["trainPct", "Tréninky %", "Procento docházky na trénink", "center"],
                ["trainAtt", "Tréninky", "Účast / celkem", "center"],
                ["matches", "Zápasy", "Odehrané zápasy / dostupné", "center"],
                ["injury", "Zranění", "Zameškáno kvůli zranění", "center"],
                ["suspension", "Stopka", "Zameškáno kvůli stopce za karty", "center"],
                ["excuse", "Výmluvy", "Zameškáno kvůli omluvě (osobní, zdraví, kocovina…)", "center"],
                ["bench", "Lavička", "Byl v nominaci jako náhradník, ale nedostal šanci", "center"],
                ["notNominated", "Nenominován", "Trenér ho do zápasu vůbec nenominoval", "center"],
              ] as Array<[AttKey, string, string, "left" | "center"]>).map(([k, label, tip, align]) => (
                <th key={k}
                  onClick={() => onSort(k)}
                  title={tip}
                  className={`py-2.5 px-1.5 font-heading uppercase cursor-pointer select-none hover:text-pitch-500 transition-colors whitespace-nowrap ${
                    sortKey === k ? "text-pitch-600 bg-pitch-50" : "text-muted"
                  } ${align === "left" ? "text-left pl-3 sticky left-0 bg-white z-10" : "text-center"}`}
                >
                  {label}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const pctColor = r.trainingPct >= 80 ? "text-pitch-600" : r.trainingPct >= 60 ? "text-amber-600" : "text-card-red";
              return (
                <tr key={r.playerId} className="border-b border-gray-50 hover:bg-pitch-50/30 transition-colors">
                  <td className="py-2 px-1.5 pl-3 sticky left-0 bg-white z-10">
                    <Link href={`/hrac/${r.playerId}#ucast`}
                      className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors whitespace-nowrap">
                      {r.firstName} {r.lastName}
                    </Link>
                  </td>
                  <td className="py-2 px-1.5 text-center"><PositionBadge position={r.position} /></td>
                  <td className={`py-2 px-1.5 text-center tabular-nums font-heading font-bold ${pctColor}`}>
                    {r.trainingTotal > 0 ? `${r.trainingPct}%` : "—"}
                  </td>
                  <td className="py-2 px-1.5 text-center tabular-nums text-muted">
                    {r.trainingTotal > 0 ? `${r.trainingAttended}/${r.trainingTotal}` : "—"}
                  </td>
                  <td className="py-2 px-1.5 text-center tabular-nums">
                    {r.matchesPlayed}/{r.matchesAvailable}
                  </td>
                  <td className="py-2 px-1.5 text-center tabular-nums text-card-red">{r.breakdown.injury || "—"}</td>
                  <td className="py-2 px-1.5 text-center tabular-nums text-amber-600">{r.breakdown.suspension || "—"}</td>
                  <td className="py-2 px-1.5 text-center tabular-nums text-blue-600">{r.breakdown.excuse || "—"}</td>
                  <td className="py-2 px-1.5 text-center tabular-nums text-muted">{r.breakdown.bench || "—"}</td>
                  <td className="py-2 px-1.5 text-center tabular-nums text-muted">{r.breakdown.notNominated || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PlayerTopList({ title, items, valueOf, suffix = "" }: {
  title: string;
  items: Player[];
  valueOf: (p: Player) => string | number;
  suffix?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="card p-4">
        <div className="font-heading font-bold text-sm text-ink mb-2">{title}</div>
        <div className="text-xs text-muted">Žádná data.</div>
      </div>
    );
  }
  return (
    <div className="card p-4">
      <div className="font-heading font-bold text-sm text-ink mb-3">{title}</div>
      <div className="space-y-1.5">
        {items.map((p, i) => {
          const medal = i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : `${i + 1}.`;
          return (
            <Link key={p.id} href={`/hrac/${p.id}`}
              className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-pitch-50/50 transition-colors group">
              <span className="w-6 text-center text-sm shrink-0">{medal}</span>
              <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
              <span className="flex-1 min-w-0 truncate font-heading font-bold text-sm group-hover:text-pitch-500 transition-colors">
                {p.first_name} {p.last_name}
              </span>
              <span className="font-heading font-[800] tabular-nums text-pitch-600 text-sm shrink-0">
                {valueOf(p)}{suffix && <span className="text-muted font-normal text-xs ml-0.5">{suffix}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function TopList({ title, items, valueOf, suffix = "" }: {
  title: string;
  items: PlayerSeasonStats[];
  valueOf: (s: PlayerSeasonStats) => string | number;
  suffix?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="card p-4">
        <div className="font-heading font-bold text-sm text-ink mb-2">{title}</div>
        <div className="text-xs text-muted">Žádná data.</div>
      </div>
    );
  }
  return (
    <div className="card p-4">
      <div className="font-heading font-bold text-sm text-ink mb-3">{title}</div>
      <div className="space-y-1.5">
        {items.map((s, i) => {
          const medal = i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : `${i + 1}.`;
          return (
            <Link key={s.playerId} href={`/hrac/${s.playerId}`}
              className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-pitch-50/50 transition-colors group">
              <span className="w-6 text-center text-sm shrink-0">{medal}</span>
              <PositionBadge position={s.position} />
              <span className="flex-1 min-w-0 truncate font-heading font-bold text-sm group-hover:text-pitch-500 transition-colors">
                {s.firstName} {s.lastName}
              </span>
              <span className="font-heading font-[800] tabular-nums text-pitch-600 text-sm shrink-0">
                {valueOf(s)}{suffix && <span className="text-muted font-normal text-xs ml-0.5">{suffix}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
