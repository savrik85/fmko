"use client";

/**
 * Tabulka hráčů na procházení — kádr cizího týmu, sledovaní hráči.
 *
 * Počítač: řaditelná tabulka. Mobil: seznam bez sloupců navíc; u každého hráče čtyři
 * klíčové dovednosti jeho pozice s popiskem a výběr řazení nad seznamem.
 *
 * Dovednosti a kondici cizích hráčů posílá API už zaokrouhlené. Tržní cena je jen odhad
 * zaokrouhlený na tisíce, stejně jako v profilu hráče.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { marketValue, marketValueEstimate } from "@okresni-masina/shared";
import { PositionBadge } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

type Position = "GK" | "DEF" | "MID" | "FWD";
type SkillKey = "speed" | "technique" | "shooting" | "passing" | "heading" | "defense" | "goalkeeping";
type PosFilter = "all" | Position;
type SortKey = "position" | "name" | "club" | "age" | "rating" | SkillKey | "condition" | "value";
type SortDir = "asc" | "desc";

export interface BrowseRow {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  age: number;
  position: Position;
  rating: number;
  skills: Partial<Record<SkillKey, number>>;
  avatar?: Record<string, unknown> | null;
  condition?: number | null;
  injury?: { type: string | null; daysRemaining: number } | null;
  club?: { id: string; name: string } | null;
  form?: { matches: number; goals: number; assists: number; avgRating: number } | null;
  watchedSince?: string | null;
}

const POS_LABELS: Record<Position, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

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
const KEY_SKILLS: Record<Position, SkillKey[]> = {
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

const rowValue = (r: BrowseRow) => marketValueEstimate(marketValue(r.rating, r.age, r.position));
const formatValue = (v: number) => `cca ${v.toLocaleString("cs")} Kč`;
const skillShort = (k: SkillKey) => SKILL_COLUMNS.find((c) => c.key === k)?.short ?? k;
const formatForm = (f: NonNullable<BrowseRow["form"]>) =>
  `${f.matches} z · ${f.goals} g · ${f.assists} a${f.matches > 0 ? ` · ${f.avgRating.toFixed(1)}` : ""}`;
function formatDay(iso: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso) ? `${iso.replace(" ", "T")}Z` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-600";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

function sortValue(r: BrowseRow, key: SortKey): number | string {
  switch (key) {
    case "position": return POS_ORDER[r.position] ?? 9;
    case "name": return r.lastName;
    case "club": return r.club?.name ?? "";
    case "age": return r.age;
    case "rating": return r.rating;
    case "condition": return r.condition ?? 0;
    case "value": return rowValue(r);
    default: return r.skills[key] ?? 0;
  }
}

export function PlayerBrowseTable({ rows, color, onColorText, ratingColor, columns, onRemove, emptyText }: {
  rows: BrowseRow[];
  color: string;
  onColorText: string;
  ratingColor: string;
  columns: { club?: boolean; condition?: boolean; form?: boolean; watchedSince?: boolean };
  onRemove?: (row: BrowseRow) => void;
  emptyText?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<PosFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortBy = (key: SortKey) => {
    if (sortKey === key) { setSortDir(sortDir === "asc" ? "desc" : "asc"); return; }
    setSortKey(key);
    setSortDir(key === "name" || key === "club" || key === "position" ? "asc" : "desc");
  };

  const sorted = useMemo(() => {
    const list = filter === "all" ? rows : rows.filter((r) => r.position === filter);
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string, "cs") : (av as number) - (bv as number);
      const directed = sortDir === "asc" ? cmp : -cmp;
      return directed || POS_ORDER[a.position] - POS_ORDER[b.position] || b.rating - a.rating;
    });
  }, [rows, filter, sortKey, sortDir]);

  if (rows.length === 0) return <p className="text-sm text-muted">{emptyText ?? "Nikdo tu není."}</p>;

  const avatar = (r: BrowseRow, size: number) => r.avatar && typeof r.avatar === "object" && Object.keys(r.avatar).length > 2
    ? <FaceAvatar faceConfig={r.avatar} size={size} className="shrink-0" />
    : (
      <div className={`rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${onColorText}`}
        style={{ backgroundColor: color, width: size, height: size }}>
        {r.firstName[0]}
      </div>
    );

  const header = (key: SortKey, label: string, className: string, title?: string) => (
    <th key={key} className={`pb-2 pr-2 text-sm font-heading font-bold uppercase cursor-pointer select-none whitespace-nowrap hover:text-pitch-500 transition-colors ${sortKey === key ? "text-pitch-600" : "text-muted"} ${className}`}
      onClick={() => sortBy(key)} title={title ?? label}>
      {label}{sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  const removeButton = (r: BrowseRow) => onRemove && (
    <button onClick={(e) => { e.stopPropagation(); onRemove(r); }}
      className="text-sm font-heading font-bold text-card-red hover:underline whitespace-nowrap">
      Odebrat
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-2 overflow-x-auto">
          {(["all", "GK", "DEF", "MID", "FWD"] as PosFilter[]).map((pos) => (
            <button key={pos} onClick={() => setFilter(pos)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${filter === pos ? "text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`}
              style={filter === pos ? { backgroundColor: color } : undefined}>
              {pos === "all" ? "Všichni" : `${POS_LABELS[pos]} (${rows.filter((r) => r.position === pos).length})`}
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
              {columns.club && header("club", "Klub", "min-w-[130px]")}
              {header("age", "Věk", "w-12 text-center")}
              {header("rating", "Hod", "w-12 text-center", "Hodnocení")}
              {SKILL_COLUMNS.map((c) => header(c.key, c.short, "w-11 text-center", c.label))}
              {columns.condition && header("condition", "Kon", "w-14 text-center", "Kondice")}
              {columns.form && <th className="pb-2 pr-2 text-sm font-heading font-bold uppercase text-muted whitespace-nowrap" title="Zápasy · góly · asistence · průměrná známka">Forma</th>}
              {header("value", "Cena", "w-32 text-right", "Tržní cena (odhad)")}
              <th className="pb-2 pr-2 text-sm font-heading font-bold uppercase text-muted text-center w-20">Stav</th>
              {columns.watchedSince && <th className="pb-2 pr-2 text-sm font-heading font-bold uppercase text-muted whitespace-nowrap">Sleduji od</th>}
              {onRemove && <th className="pb-2 pr-4 sm:pr-5" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/hrac/${r.id}`)}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer">
                <td className="py-2 pl-4 sm:pl-5 pr-1"><PositionBadge position={r.position} /></td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    {avatar(r, 28)}
                    <div className="min-w-0">
                      <span className="font-heading font-bold text-base truncate block">{r.firstName} {r.lastName}</span>
                      {r.nickname && <span className="text-sm text-gold-500 block">&bdquo;{r.nickname}&ldquo;</span>}
                    </div>
                  </div>
                </td>
                {columns.club && (
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {r.club
                      ? <Link href={`/tym/${r.club.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.club.name}</Link>
                      : <span className="text-muted">bez klubu</span>}
                  </td>
                )}
                <td className="py-2 pr-2 text-center tabular-nums text-muted">{r.age}</td>
                <td className="py-2 pr-2 text-center">
                  <span className="font-heading font-bold tabular-nums" style={{ color: ratingColor }}>{r.rating}</span>
                </td>
                {SKILL_COLUMNS.map((c) => (
                  <td key={c.key} className={`py-2 pr-2 text-center tabular-nums ${attrColor(r.skills[c.key] ?? 0)}`}>{r.skills[c.key] ?? "—"}</td>
                ))}
                {columns.condition && <td className="py-2 pr-2 text-center tabular-nums text-muted">{r.condition ?? "—"} %</td>}
                {columns.form && <td className="py-2 pr-2 tabular-nums text-muted whitespace-nowrap">{r.form ? formatForm(r.form) : "—"}</td>}
                <td className="py-2 pr-2 text-right tabular-nums font-heading font-bold whitespace-nowrap">{formatValue(rowValue(r))}</td>
                <td className="py-2 pr-2 text-center whitespace-nowrap">
                  {r.injury
                    ? <span className="text-sm font-heading font-bold text-card-red" title={r.injury.type ?? "Zranění"}>🩹 {r.injury.daysRemaining} d</span>
                    : <span className="text-muted">—</span>}
                </td>
                {columns.watchedSince && <td className="py-2 pr-2 text-muted whitespace-nowrap">{r.watchedSince ? formatDay(r.watchedSince) : "—"}</td>}
                {onRemove && <td className="py-2 pr-4 sm:pr-5 text-right">{removeButton(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobil: seznam s popsanými dovednostmi ── */}
      <div className="md:hidden flex flex-col gap-2">
        {sorted.map((r) => (
          <div key={r.id} onClick={() => router.push(`/hrac/${r.id}`)}
            className="card px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <PositionBadge position={r.position} />
              {avatar(r, 36)}
              <div className="flex-1 min-w-0">
                <div className="font-heading font-bold text-base truncate">{r.firstName} {r.lastName}</div>
                <div className="text-sm text-muted tabular-nums truncate">
                  {columns.club && r.club ? `${r.club.name} · ` : ""}{r.age} let · {formatValue(rowValue(r))}
                </div>
              </div>
              <span className={`px-2 py-1 rounded-soft font-heading font-bold text-base tabular-nums shrink-0 ${onColorText}`} style={{ backgroundColor: color }}>
                {r.rating}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
              {KEY_SKILLS[r.position].map((k) => (
                <span key={k} className="tabular-nums">
                  <span className="text-muted">{skillShort(k)}</span>{" "}
                  <span className={`font-heading font-bold ${attrColor(r.skills[k] ?? 0)}`}>{r.skills[k] ?? "—"}</span>
                </span>
              ))}
              {r.injury && (
                <span className="font-heading font-bold text-card-red" title={r.injury.type ?? "Zranění"}>🩹 zraněn {r.injury.daysRemaining} d</span>
              )}
            </div>
            {(columns.form && r.form) || onRemove ? (
              <div className="flex items-center justify-between gap-2 mt-1.5 text-sm text-muted">
                <span className="tabular-nums">{columns.form && r.form ? `Forma: ${formatForm(r.form)}` : ""}</span>
                {removeButton(r)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
