"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { Spinner, PositionBadge } from "@/components/ui";

type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";
type SortKey = "name" | "pos" | "age" | "rat" | "spd" | "tec" | "sho" | "pas" | "hea" | "def" | "gk" | "sta" | "str" | "cond" | "mor" | "wage";
type SortDir = "asc" | "desc";

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
  const [filter, setFilter] = useState<PosFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
    ]).then(([t, p]) => { setTeam(t); setPlayers(p); setLoading(false); });
  }, [teamId]);

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

      {/* FM-style table */}
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
    </div>
  );
}
