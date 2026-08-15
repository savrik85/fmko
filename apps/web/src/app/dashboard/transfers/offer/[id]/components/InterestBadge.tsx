"use client";

import { useState } from "react";

export interface PlayerInterest {
  level: number; // 0-3
  label: string;
  factors?: { label: string; delta: number }[];
}

const LEVEL_STYLES: Record<number, { chip: string; dot: string }> = {
  0: { chip: "bg-gray-100 text-muted", dot: "bg-gray-400" },
  1: { chip: "bg-yellow-50 text-yellow-700 border border-yellow-200", dot: "bg-yellow-400" },
  2: { chip: "bg-orange-50 text-orange-700 border border-orange-200", dot: "bg-orange-500" },
  3: { chip: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },
};

/**
 * Badge zájmu hráče o přestup (0-3). S factors (vidí jen vlastník hráče)
 * se po kliknutí rozbalí, proč hráč přestup chce/nechce.
 */
export function InterestBadge({ interest, size = "md" }: { interest: PlayerInterest; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const style = LEVEL_STYLES[interest.level] ?? LEVEL_STYLES[0];
  const hasFactors = !!interest.factors?.length;
  const sizeCls = size === "sm" ? "text-micro px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <div className="relative inline-flex flex-col items-center">
      <button
        type="button"
        onClick={() => hasFactors && setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full font-heading font-bold ${sizeCls} ${style.chip} ${hasFactors ? "cursor-pointer" : "cursor-default"}`}
        title={hasFactors ? "Klikni pro detail" : undefined}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {interest.label}
        {hasFactors && <span className="opacity-60">{open ? "▴" : "▾"}</span>}
      </button>
      {open && hasFactors && (
        <div className="absolute top-full mt-1.5 z-20 bg-white rounded-xl shadow-xl border border-gray-100 p-3 min-w-[200px]">
          <div className="text-micro font-heading font-bold text-muted uppercase tracking-wider mb-1.5">Proč?</div>
          <div className="space-y-1">
            {interest.factors!.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs">
                <span>{f.label}</span>
                <span className={`font-heading font-bold tabular-nums ${f.delta > 0 ? "text-red-600" : "text-pitch-500"}`}>
                  {f.delta > 0 ? `+${f.delta}` : f.delta}
                </span>
              </div>
            ))}
          </div>
          <div className="text-micro text-muted mt-2">+ zvyšuje chuť odejít, − drží hráče doma</div>
        </div>
      )}
    </div>
  );
}
