"use client";

import { useState } from "react";
import Link from "next/link";
import { PositionBadge } from "@/components/ui";

export interface SquadRow {
  id?: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD" | string;
  rating: number;
  age: number;
  height?: number;
  weight?: number;
  foot?: "left" | "right" | "both";
  linkHref?: string;
}

type SortKey = "name" | "position" | "rating" | "age" | "height" | "weight" | "foot";
type SortDir = "asc" | "desc";

const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

const COLUMNS: { key: SortKey; label: string; unit?: string; align: string; width: string }[] = [
  { key: "position", label: "Poz.", align: "text-center", width: "w-12" },
  { key: "name", label: "Hráč", align: "text-left", width: "flex-1" },
  { key: "age", label: "Věk", align: "text-center", width: "w-12" },
  { key: "height", label: "Výš.", unit: "cm", align: "text-center", width: "w-14" },
  { key: "weight", label: "Váha", unit: "kg", align: "text-center", width: "w-14" },
  { key: "foot", label: "Noha", align: "text-center", width: "w-12" },
  { key: "rating", label: "Hod.", align: "text-center", width: "w-12" },
];

function sortRows(rows: SquadRow[], key: SortKey, dir: SortDir): SquadRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "position") cmp = (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9);
    else if (key === "name") cmp = a.name.localeCompare(b.name, "cs");
    else if (key === "age") cmp = a.age - b.age;
    else if (key === "height") cmp = (a.height ?? 0) - (b.height ?? 0);
    else if (key === "weight") cmp = (a.weight ?? 0) - (b.weight ?? 0);
    else if (key === "foot") cmp = (a.foot ?? "right").localeCompare(b.foot ?? "right");
    else if (key === "rating") cmp = a.rating - b.rating;

    if (cmp === 0) cmp = b.rating - a.rating;
    return dir === "desc" ? -cmp : cmp;
  });
}

export function SquadTable({ rows, compact, teamColor }: {
  rows: SquadRow[];
  compact?: boolean;
  teamColor?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "position" ? "asc" : "desc");
    }
  };

  const sorted = sortRows(rows, sortKey, sortDir);
  const py = compact ? "py-1.5" : "py-2.5";
  const textSize = compact ? "text-xs" : "text-sm";

  return (
    <div className="overflow-x-auto">
      {/* Header */}
      <div className={`flex items-center gap-1 px-3 ${py} border-b border-gray-200`}>
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => handleSort(col.key)}
            className={`${col.width} ${col.align} text-[10px] uppercase tracking-wider font-heading font-bold text-muted hover:text-ink transition-colors select-none ${
              sortKey === col.key ? "text-pitch-600" : ""
            }`}
          >
            {col.label}
            {sortKey === col.key && (
              <span className="ml-0.5">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
            )}
          </button>
        ))}
      </div>

      {/* Rows */}
      {sorted.map((p, i) => {
        const content = (
          <div className={`flex items-center gap-1 px-3 ${py} border-b border-gray-100 last:border-b-0 ${
            p.linkHref ? "hover:bg-gray-50 transition-colors" : ""
          }`}>
            <div className="w-12 flex justify-center">
              <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
            </div>
            <div className={`flex-1 min-w-0 font-heading font-bold ${textSize} truncate`}>{p.name}</div>
            <div className={`w-12 text-center ${textSize} text-muted tabular-nums`}>{p.age}</div>
            <div className={`w-14 text-center ${textSize} text-muted tabular-nums`}>{p.height ? `${p.height}` : "—"}</div>
            <div className={`w-14 text-center ${textSize} text-muted tabular-nums`}>{p.weight ? `${p.weight}` : "—"}</div>
            <div className={`w-12 text-center ${textSize} text-muted`}>
              {p.foot === "left" ? "L" : p.foot === "both" ? "O" : "P"}
            </div>
            <div className={`w-12 text-center font-heading font-[800] ${compact ? "text-sm" : "text-base"} tabular-nums`}
              style={teamColor ? { color: teamColor } : undefined}>
              {p.rating}
            </div>
          </div>
        );

        if (p.linkHref) {
          return <Link key={p.id ?? i} href={p.linkHref}>{content}</Link>;
        }
        return <div key={p.id ?? i}>{content}</div>;
      })}
    </div>
  );
}
