"use client";

/**
 * Kádr cizího týmu — na procházení kvůli přestupům i před zápasem.
 *
 * Počítač: řaditelná tabulka (dovednosti, kondice, tržní cena, zranění).
 * Mobil: seznam bez sloupců navíc; u každého hráče čtyři klíčové dovednosti jeho pozice
 * s popiskem a výběr řazení nad seznamem.
 *
 * Dovednosti a kondici posílá API cizímu klubu už zaokrouhlené (na pětky, kondici na
 * desítky). Tržní cena je jen odhad zaokrouhlený na tisíce, stejně jako v profilu hráče.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { marketValue, marketValueEstimate } from "@okresni-masina/shared";
import type { Player } from "@/lib/api";
import { PositionBadge, SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

const POS_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";
type SkillKey = "speed" | "technique" | "shooting" | "passing" | "heading" | "defense" | "goalkeeping";
type SortKey = "position" | "name" | "age" | "rating" | SkillKey | "condition" | "value";
type SortDir = "asc" | "desc";

const SKILL_COLUMNS: Array<{ key: SkillKey; short: string; label: string }> = [
  { key: "speed", short: "Rch", label: "Rychlost" },
  { key: "technique", short: "Tch", label: "Technika" },
  { key: "shooting", short: "Stř", label: "Střelba" },
  { key: "passing", short: "Při", label: "Přihrávky" },
  { key: "heading", short: "Hlv", label: "Hlavičky" },
  { key: "defense", short: "Obr", label: "Obrana" },
  { key: "goalkeeping", short: "Brn", label: "Brankář" },
];

/** Čtyři dovednosti, podle kterých se hráč na své pozici posuzuje. */
const KEY_SKILLS: Record<string, SkillKey[]> = {
  GK: ["goalkeeping", "defense", "heading", "passing"],
  DEF: ["defense", "heading", "speed", "passing"],
  MID: ["technique", "passing", "shooting", "speed"],
  FWD: ["shooting", "speed", "technique", "heading"],
};

const MOBILE_SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "position", label: "Pozice" },
  { key: "rating", label: "Hodnocení" },
  { key: "value", label: "Tržní cena" },
  { key: "age", label: "Věk" },
];

const playerValue = (p: Player) => marketValueEstimate(marketValue(p.overall_rating, p.age, p.position));
const formatValue = (v: number) => `cca ${v.toLocaleString("cs")} Kč`;
const skillShort = (k: SkillKey) => SKILL_COLUMNS.find((c) => c.key === k)?.short ?? k;

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-600";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

function sortValue(p: Player, key: SortKey): number | string {
  switch (key) {
    case "position": return POS_ORDER[p.position] ?? 9;
    case "name": return p.last_name;
    case "age": return p.age;
    case "rating": return p.overall_rating;
    case "condition": return p.lifeContext?.condition ?? 0;
    case "value": return playerValue(p);
    default: return p.skills?.[key] ?? 0;
  }
}

export function ForeignSquad({ players, color, onColorText, ratingColor }: {
  players: Player[];
  color: string;
  onColorText: string;
  ratingColor: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<PosFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortBy = (key: SortKey) => {
    if (sortKey === key) { setSortDir(sortDir === "asc" ? "desc" : "asc"); return; }
    setSortKey(key);
    setSortDir(key === "name" || key === "position" ? "asc" : "desc");
  };

  const sorted = useMemo(() => {
    const list = filter === "all" ? players : players.filter((p) => p.position === filter);
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string, "cs") : (av as number) - (bv as number);
      const directed = sortDir === "asc" ? cmp : -cmp;
      return directed || POS_ORDER[a.position] - POS_ORDER[b.position] || b.overall_rating - a.overall_rating;
    });
  }, [players, filter, sortKey, sortDir]);

  const avatar = (p: Player, size: number) => p.avatar && typeof p.avatar === "object" && Object.keys(p.avatar).length > 2
    ? <FaceAvatar faceConfig={p.avatar} size={size} className="shrink-0" />
    : (
      <div className={`rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${onColorText}`}
        style={{ backgroundColor: color, width: size, height: size }}>
        {p.first_name[0]}
      </div>
    );

  const header = (key: SortKey, label: string, className: string, title?: string) => (
    <th className={`pb-2 pr-2 text-sm font-heading font-bold uppercase cursor-pointer select-none whitespace-nowrap hover:text-pitch-500 transition-colors ${sortKey === key ? "text-pitch-600" : "text-muted"} ${className}`}
      onClick={() => sortBy(key)} title={title ?? label}>
      {label}{sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Kádr ({players.length})</SectionLabel>

      <div className="flex flex-wrap items-center gap-2 mt-3 mb-4">
        <div className="flex gap-2 overflow-x-auto">
          {(["all", "GK", "DEF", "MID", "FWD"] as PosFilter[]).map((pos) => (
            <button key={pos} onClick={() => setFilter(pos)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${filter === pos ? "text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`}
              style={filter === pos ? { backgroundColor: color } : undefined}>
              {pos === "all" ? "Všichni" : `${POS_LABELS[pos]} (${players.filter((p) => p.position === pos).length})`}
            </button>
          ))}
        </div>
        {/* Mobil nemá záhlaví tabulky, řadí se výběrem */}
        <label className="md:hidden flex items-center gap-2 text-sm text-muted ml-auto">
          Řadit
          <select value={sortKey} onChange={(e) => { const k = e.target.value as SortKey; setSortKey(k); setSortDir(k === "position" ? "asc" : "desc"); }}
            className="text-sm font-heading font-bold text-ink bg-gray-100 rounded-soft px-2 py-1.5">
            {MOBILE_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {/* ── Počítač: řaditelná tabulka ── */}
      <div className="hidden md:block overflow-x-auto -mx-4 sm:-mx-5 table-scroll">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="text-left border-b border-gray-200">
              {header("position", "Poz", "w-12 pl-4 sm:pl-5", "Pozice")}
              {header("name", "Hráč", "min-w-[170px]")}
              {header("age", "Věk", "w-12 text-center")}
              {header("rating", "Hod", "w-12 text-center", "Hodnocení")}
              {SKILL_COLUMNS.map((c) => header(c.key, c.short, "w-11 text-center", c.label))}
              {header("condition", "Kon", "w-14 text-center", "Kondice")}
              {header("value", "Cena", "w-32 text-right", "Tržní cena (odhad)")}
              <th className="pb-2 pr-4 sm:pr-5 text-sm font-heading font-bold uppercase text-muted text-center w-20">Stav</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} onClick={() => router.push(`/hrac/${p.id}`)}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer">
                <td className="py-2 pl-4 sm:pl-5 pr-1"><PositionBadge position={p.position} /></td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    {avatar(p, 28)}
                    <div className="min-w-0">
                      <span className="font-heading font-bold text-base truncate block">{p.first_name} {p.last_name}</span>
                      {p.nickname && <span className="text-sm text-gold-500 block">&bdquo;{p.nickname}&ldquo;</span>}
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-2 text-center tabular-nums text-muted">{p.age}</td>
                <td className="py-2 pr-2 text-center">
                  <span className="font-heading font-bold tabular-nums" style={{ color: ratingColor }}>{p.overall_rating}</span>
                </td>
                {SKILL_COLUMNS.map((c) => (
                  <td key={c.key} className={`py-2 pr-2 text-center tabular-nums ${attrColor(p.skills?.[c.key] ?? 0)}`}>{p.skills?.[c.key] ?? "—"}</td>
                ))}
                <td className="py-2 pr-2 text-center tabular-nums text-muted">{p.lifeContext?.condition ?? "—"} %</td>
                <td className="py-2 pr-2 text-right tabular-nums font-heading font-bold whitespace-nowrap">{formatValue(playerValue(p))}</td>
                <td className="py-2 pr-4 sm:pr-5 text-center whitespace-nowrap">
                  {p.injury
                    ? <span className="text-sm font-heading font-bold text-card-red" title={p.injury.type}>🩹 {p.injury.daysRemaining} d</span>
                    : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobil: seznam s popsanými dovednostmi ── */}
      <div className="md:hidden flex flex-col gap-2">
        {sorted.map((p) => (
          <div key={p.id} onClick={() => router.push(`/hrac/${p.id}`)}
            className="card px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <PositionBadge position={p.position} />
              {avatar(p, 36)}
              <div className="flex-1 min-w-0">
                <div className="font-heading font-bold text-base truncate">{p.first_name} {p.last_name}</div>
                <div className="text-sm text-muted tabular-nums truncate">
                  {p.age} let · {formatValue(playerValue(p))}
                </div>
              </div>
              <span className={`px-2 py-1 rounded-soft font-heading font-bold text-base tabular-nums shrink-0 ${onColorText}`} style={{ backgroundColor: color }}>
                {p.overall_rating}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
              {(KEY_SKILLS[p.position] ?? KEY_SKILLS.MID).map((k) => (
                <span key={k} className="tabular-nums">
                  <span className="text-muted">{skillShort(k)}</span>{" "}
                  <span className={`font-heading font-bold ${attrColor(p.skills?.[k] ?? 0)}`}>{p.skills?.[k] ?? "—"}</span>
                </span>
              ))}
              {p.injury && (
                <span className="font-heading font-bold text-card-red ml-auto" title={p.injury.type}>🩹 zraněn {p.injury.daysRemaining} d</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
