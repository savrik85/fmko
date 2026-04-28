"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { Spinner, PositionBadge } from "@/components/ui";

type Tab = "atributy" | "sezona" | "top";
type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";
type SortKey = "name" | "pos" | "age" | "rat" | "spd" | "tec" | "sho" | "pas" | "hea" | "def" | "gk" | "sta" | "str" | "cond" | "mor" | "wage";
type StatsKey = "name" | "pos" | "apps" | "min" | "g" | "a" | "ga" | "y" | "r" | "cs" | "mom" | "avg";
type SortDir = "asc" | "desc";

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

const COLUMNS: Array<{ key: SortKey; label: string; tip: string }> = [
  { key: "name", label: "Jméno", tip: "Jméno hráče" },
  { key: "pos", label: "Poz", tip: "Pozice" },
  { key: "age", label: "Věk", tip: "Věk" },
  { key: "rat", label: "Rat", tip: "Celkový rating" },
  { key: "spd", label: "Rch", tip: "Rychlost" },
  { key: "tec", label: "Tch", tip: "Technika" },
  { key: "sho", label: "Stř", tip: "Střelba" },
  { key: "pas", label: "Přh", tip: "Přihrávky" },
  { key: "hea", label: "Hlv", tip: "Hlavičky" },
  { key: "def", label: "Obr", tip: "Obrana" },
  { key: "gk", label: "Brk", tip: "Brankář" },
  { key: "sta", label: "Výd", tip: "Výdrž" },
  { key: "str", label: "Síl", tip: "Síla" },
  { key: "cond", label: "Kon", tip: "Kondice" },
  { key: "mor", label: "Mor", tip: "Morálka" },
  { key: "wage", label: "Mzda", tip: "Týdenní mzda" },
];

function getVal(p: Player, key: SortKey): string | number {
  const s = p.skills as Record<string, number> | undefined;
  const lc = p.lifeContext as unknown as Record<string, number> | undefined;
  switch (key) {
    case "name": return `${p.last_name} ${p.first_name}`;
    case "pos": return POS_ORDER[p.position] ?? 9;
    case "age": return p.age;
    case "rat": return p.overall_rating ?? 0;
    case "spd": return s?.speed ?? 0;
    case "tec": return s?.technique ?? 0;
    case "sho": return s?.shooting ?? 0;
    case "pas": return s?.passing ?? 0;
    case "hea": return s?.heading ?? 0;
    case "def": return s?.defense ?? 0;
    case "gk": return s?.goalkeeping ?? 0;
    case "sta": return s?.stamina ?? 0;
    case "str": return s?.strength ?? 0;
    case "cond": return lc?.condition ?? 0;
    case "mor": return lc?.morale ?? 0;
    case "wage": return p.weekly_wage ?? 0;
  }
}

function cellColor(v: number): string {
  if (v >= 70) return "bg-pitch-500 text-white font-bold";
  if (v >= 55) return "bg-pitch-100 text-pitch-800";
  if (v >= 40) return "bg-gray-50 text-ink";
  if (v >= 25) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-card-red";
}

function condColor(v: number): string {
  if (v >= 80) return "text-pitch-500";
  if (v >= 50) return "text-gold-600";
  return "text-card-red";
}

function moraleIcon(v: number): string {
  if (v >= 80) return "😊";
  if (v >= 60) return "🙂";
  if (v >= 40) return "😐";
  if (v >= 20) return "😞";
  return "😡";
}

export default function SquadPage() {
  const { teamId } = useTeam();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasonStats, setSeasonStats] = useState<PlayerSeasonStats[]>([]);
  const [tab, setTab] = useState<Tab>("atributy");
  const [filter, setFilter] = useState<PosFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statsSortKey, setStatsSortKey] = useState<StatsKey>("g");
  const [statsSortDir, setStatsSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<TeamStatsResponse>(`/api/teams/${teamId}/stats`).catch((e) => { console.error("team stats:", e); return { stats: [], topScorers: [], topAssists: [] } as TeamStatsResponse; }),
    ]).then(([t, p, s]) => { setTeam(t); setPlayers(p); setSeasonStats(s.stats); setLoading(false); });
  }, [teamId]);

  // TOP tab — výpočty leaderů (musí být před early returnem kvůli rules of hooks)
  const topData = useMemo(() => {
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

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  if (!team) return <div className="p-6">Tým nenalezen.</div>;

  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);

  const sorted = [...filtered].sort((a, b) => {
    const va = getVal(a, sortKey);
    const vb = getVal(b, sortKey);
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "cs") : (va as number) - (vb as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

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
  const totalCards = seasonStats.reduce((s, p) => s + (p.yellowCards ?? 0) + (p.redCards ?? 0), 0);

  // Summary stats
  const avgRating = players.length ? Math.round(players.reduce((s, p) => s + (p.overall_rating ?? 0), 0) / players.length) : 0;
  const totalWage = players.reduce((s, p) => s + (p.weekly_wage ?? 0), 0);
  const avgAge = players.length ? (players.reduce((s, p) => s + p.age, 0) / players.length).toFixed(1) : "0";
  const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) posCounts[p.position as keyof typeof posCounts]++;

  return (
    <div className="page-container space-y-4">

      {/* Summary stats — 4 boxes grid (2x2 mobile, 4 cols desktop) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-2xl tabular-nums">{players.length}</div>
          <div className="text-[10px] text-muted uppercase tracking-wide">Hráčů</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-2xl tabular-nums">{avgRating}</div>
          <div className="text-[10px] text-muted uppercase tracking-wide">Ø Rating</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-2xl tabular-nums">{avgAge}</div>
          <div className="text-[10px] text-muted uppercase tracking-wide">Ø Věk</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-xl tabular-nums text-card-red">{totalWage.toLocaleString("cs")}</div>
          <div className="text-[10px] text-muted uppercase tracking-wide">Mzdy Kč/týd</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-1.5">
        <div className="flex rounded-lg bg-gray-50 p-0.5 gap-0.5">
          {([
            ["atributy", "Atributy", "\u{1F4CB}"],
            ["sezona", "Sezóna", "\u{1F4CA}"],
            ["top", "TOP hráči", "\u{1F3C6}"],
          ] as Array<[Tab, string, string]>).map(([k, label, icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 px-2 rounded-md text-center transition-all font-heading font-bold text-sm ${
                tab === k ? "bg-white shadow-sm text-pitch-600" : "text-muted hover:text-ink"
              }`}
            >
              <span className="mr-1.5">{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>

      {/* Position filter — segmented control */}
      <div className="card p-3">
        <div className="text-[10px] text-muted font-heading uppercase tracking-wide mb-2">Filtr pozice</div>
        <div className="flex rounded-xl bg-gray-50 p-0.5 gap-0.5">
          {([
            ["all", "Vše", players.length],
            ["GK", "Brankáři", posCounts.GK],
            ["DEF", "Obrana", posCounts.DEF],
            ["MID", "Záloha", posCounts.MID],
            ["FWD", "Útok", posCounts.FWD],
          ] as Array<[PosFilter, string, number]>).map(([pos, label, count]) => (
            <button
              key={pos}
              onClick={() => setFilter(pos)}
              className={`flex-1 py-1.5 px-1 rounded-lg text-center transition-all font-heading font-bold ${
                filter === pos
                  ? "bg-white shadow-sm text-pitch-600"
                  : "text-muted hover:text-ink"
              }`}
            >
              <div className="text-xs sm:text-sm truncate">{label}</div>
              <div className={`text-[10px] tabular-nums ${filter === pos ? "text-pitch-500" : "text-muted-light"}`}>{count}</div>
            </button>
          ))}
        </div>
      </div>

      {/* FM-style table — Atributy tab */}
      {tab === "atributy" && (
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-gray-200">
              {COLUMNS.map((col) => (
                <th key={col.key}
                  onClick={() => toggleSort(col.key)}
                  title={col.tip}
                  className={`py-2.5 px-1.5 font-heading uppercase cursor-pointer select-none hover:text-pitch-500 transition-colors whitespace-nowrap ${
                    sortKey === col.key ? "text-pitch-600 bg-pitch-50" : "text-muted"
                  } ${col.key === "name" ? "text-left pl-3 sticky left-0 bg-white z-10" : "text-center"}`}
                >
                  {col.label}{sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const s = p.skills as Record<string, number> | undefined;
              const lc = p.lifeContext as unknown as Record<string, number> | undefined;
              const cond = lc?.condition ?? 100;
              const morale = lc?.morale ?? 50;
              const isQuit = (p as any).status === "quit";

              return (
                <tr key={p.id} className={`border-b border-gray-50 hover:bg-pitch-50/30 transition-colors ${isQuit ? "opacity-40" : ""}`}>
                  {/* Name — sticky */}
                  <td className="py-2 px-1.5 pl-3 sticky left-0 bg-white z-10">
                    <Link href={`/dashboard/player/${p.id}`}
                      className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors whitespace-nowrap">
                      {p.first_name} {p.last_name}
                    </Link>
                    {p.loan_from_team_id && (
                      <span className="ml-1.5 text-[10px] bg-yellow-100 text-yellow-700 font-heading font-bold px-1.5 py-0.5 rounded-full">Host.</span>
                    )}
                    {(() => {
                      const inj = (p as unknown as { injury?: { type?: string; daysRemaining: number } | null }).injury;
                      if (!inj) return null;
                      const daysLabel = inj.daysRemaining === 1 ? "den" : inj.daysRemaining < 5 ? "dny" : "dní";
                      const tip = `Zraněný${inj.type ? ` — ${inj.type}` : ""} · ${inj.daysRemaining} ${daysLabel} do návratu`;
                      return (
                        <span className="ml-1.5 text-[10px] bg-red-100 text-red-700 font-heading font-bold px-1.5 py-0.5 rounded-full cursor-help" title={tip} aria-label={tip}>🩹</span>
                      );
                    })()}
                    {(() => {
                      const abs = (p as unknown as { absence?: { reason?: string; category?: string } | null }).absence;
                      if (!abs) return null;
                      const tip = `Chybí dnes${abs.reason ? ` — ${abs.reason}` : ""}`;
                      return (
                        <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 font-heading font-bold px-1.5 py-0.5 rounded-full cursor-help" title={tip} aria-label={tip}>🚫</span>
                      );
                    })()}
                    {(lc as unknown as { hangover?: number | boolean } | undefined)?.hangover ? (
                      <span className="ml-1.5 cursor-help" title="Ranní kocovina po včerejší výhře (−15 kondice)" aria-label="Kocovina">🍺</span>
                    ) : null}
                  </td>
                  {/* Position */}
                  <td className="py-2 px-1.5 text-center"><PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} /></td>
                  {/* Age */}
                  <td className="py-2 px-1.5 text-center tabular-nums text-muted">{p.age}</td>
                  {/* Rating */}
                  <td className={`py-2 px-1.5 text-center tabular-nums font-heading font-bold ${cellColor(p.overall_rating ?? 0)}`}>{p.overall_rating}</td>
                  {/* Skills */}
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.speed ?? 0)}`}>{s?.speed ?? "—"}</td>
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.technique ?? 0)}`}>{s?.technique ?? "—"}</td>
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.shooting ?? 0)}`}>{s?.shooting ?? "—"}</td>
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.passing ?? 0)}`}>{s?.passing ?? "—"}</td>
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.heading ?? 0)}`}>{s?.heading ?? "—"}</td>
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.defense ?? 0)}`}>{s?.defense ?? "—"}</td>
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.goalkeeping ?? 0)}`}>{s?.goalkeeping ?? "—"}</td>
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.stamina ?? 0)}`}>{s?.stamina ?? "—"}</td>
                  <td className={`py-2 px-1.5 text-center tabular-nums ${cellColor(s?.strength ?? 0)}`}>{s?.strength ?? "—"}</td>
                  {/* Condition */}
                  <td className={`py-2 px-1.5 text-center tabular-nums font-heading font-bold ${condColor(cond)}`}>{cond}%</td>
                  {/* Morale */}
                  <td className="py-2 px-1.5 text-center" title={`${morale}%`}>{moraleIcon(morale)}</td>
                  {/* Wage */}
                  <td className="py-2 px-1.5 text-center tabular-nums text-muted">{(p.weekly_wage ?? 0).toLocaleString("cs")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Sezóna — match stats tab */}
      {tab === "sezona" && (
        <>
          {/* Souhrn sezony — 4 boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-pitch-500">{totalGoals}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">Góly</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-blue-500">{totalAssists}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">Asistence</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums">{totalApps}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">Starty</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-card-red">{totalCards}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">Karty</div>
            </div>
          </div>

          {totalApps === 0 && (
            <div className="card p-3 text-center text-xs text-muted">
              {"\u{2139}\u{FE0F}"} Tým zatím neodehrál žádný zápas. Statistiky se naplní postupně po každém kole. <Link href="/dashboard/schedule" className="text-pitch-600 underline ml-1">Rozpis zápasů</Link>
            </div>
          )}
          <div className="card overflow-x-auto">
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
                      <Link href={`/dashboard/player/${s.playerId}`}
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

      {/* TOP hráči */}
      {tab === "top" && (
        totalApps === 0 ? (
          <div className="card p-6 text-center text-sm text-muted">
            {"\u{2139}\u{FE0F}"} Žebříčky se naplní po prvním odehraném zápase.{" "}
            <Link href="/dashboard/schedule" className="text-pitch-600 underline">Rozpis zápasů</Link>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TopList title="\u{26BD} Nejlepší střelci" items={topData.scorers} valueOf={(s) => s.goals ?? 0} suffix="g" />
          <TopList title="\u{1F3AF} Nejlepší asistenti" items={topData.assists} valueOf={(s) => s.assists ?? 0} suffix="a" />
          <TopList title="\u{2B50} Nejlepší rating" items={topData.ratings} valueOf={(s) => (s.avgRating ?? 0).toFixed(1)} />
          <TopList title="\u{1F451} Hráč zápasu" items={topData.mom} valueOf={(s) => s.manOfMatch ?? 0} suffix="×" />
          <TopList title="\u{23F1}\u{FE0F} Nejvíce minut" items={topData.minutes} valueOf={(s) => `${s.minutesPlayed ?? 0} '`} />
          <TopList title="\u{1F9E4} Čistá konta" items={topData.cleanSheets} valueOf={(s) => s.cleanSheets ?? 0} suffix="" />
          {topData.cards.length > 0 && (
            <TopList title="\u{1F7E5} Disciplinární přestupky" items={topData.cards as PlayerSeasonStats[]}
              valueOf={(s) => `${s.yellowCards ?? 0}ŽK / ${s.redCards ?? 0}ČK`} />
          )}
        </div>
        )
      )}
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
            <Link key={s.playerId} href={`/dashboard/player/${s.playerId}`}
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
