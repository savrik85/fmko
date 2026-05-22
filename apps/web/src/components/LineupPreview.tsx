"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";

export type Comparison = "MUCH_WEAKER" | "WEAKER" | "EVEN" | "STRONGER" | "MUCH_STRONGER";

interface LineStrengths { gk: number; def: number; mid: number; fwd: number }

interface LineupPreviewData {
  own: {
    perLine: LineStrengths;
    attack: number;
    defense: number;
    overall: number;
    tacticEffect: { attackMod: number; defenseMod: number; chanceMod: number };
    notes: string[];
  };
  opponent?: {
    perLine: LineStrengths;
    attack: number;
    defense: number;
    overall: number;
  };
  comparison?: {
    perLine: Record<keyof LineStrengths, Comparison>;
    overall: Comparison;
    overallDelta: number;
  };
  recommendation?: string;
}

interface Props {
  teamId: string;
  matchId?: string;
  formation: string;
  tactic: string;
  captainId: string | null;
  players: Array<{ playerId: string; matchPosition: string }>;
}

const LINE_LABELS: Record<keyof LineStrengths, string> = {
  gk: "Brankář",
  def: "Obrana",
  mid: "Záloha",
  fwd: "Útok",
};

const COMPARISON_COLOR: Record<Comparison, string> = {
  MUCH_STRONGER: "text-pitch-600",
  STRONGER: "text-pitch-500",
  EVEN: "text-muted",
  WEAKER: "text-gold-600",
  MUCH_WEAKER: "text-card-red",
};

const COMPARISON_LABEL: Record<Comparison, string> = {
  MUCH_STRONGER: "Mnohem silnější",
  STRONGER: "Silnější",
  EVEN: "Vyrovnaný",
  WEAKER: "Slabší",
  MUCH_WEAKER: "Mnohem slabší",
};

function barColor(value: number): string {
  if (value >= 70) return "bg-pitch-500";
  if (value >= 50) return "bg-gold-500";
  if (value >= 30) return "bg-amber-500";
  return "bg-card-red";
}

export function LineupPreview({ teamId, matchId, formation, tactic, captainId, players }: Props) {
  const [data, setData] = useState<LineupPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Bez 11 hráčů nemá smysl počítat
    const valid = players.filter((p) => p.playerId).length;
    if (valid !== 11) {
      setData(null);
      return;
    }

    // Debounce — počítej až 400ms po poslední změně
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      apiFetch<LineupPreviewData>(`/api/teams/${teamId}/lineup-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, formation, tactic, captainId, players }),
      })
        .then((d) => setData(d))
        .catch((e) => {
          console.error("lineup-preview failed:", e);
          setData(null);
        })
        .finally(() => setLoading(false));
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [teamId, matchId, formation, tactic, captainId, players]);

  if (!data && !loading) return null;

  return (
    <div className="card p-3">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between text-left mb-2"
      >
        <div>
          <div className="font-heading font-bold text-sm uppercase tracking-wide">Síla sestavy</div>
          <div className="text-[10px] text-muted">
            {data?.opponent ? "Srovnání se soupeřem (jeho nejlepší 11)" : "Bez soupeře — jen vlastní síla"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <div className="text-right">
              <div className="text-[10px] text-muted uppercase">Celkové</div>
              <div className="font-heading font-bold text-xl tabular-nums text-pitch-600">{data.own.overall}</div>
            </div>
          )}
          <span className="text-muted text-lg">{collapsed ? "▾" : "▴"}</span>
        </div>
      </button>

      {!collapsed && data && (
        <>
          {/* Bar chart per linie */}
          <div className="space-y-1.5 mt-2">
            {(Object.keys(LINE_LABELS) as Array<keyof LineStrengths>).map((line) => {
              const ownVal = data.own.perLine[line];
              const oppVal = data.opponent?.perLine[line];
              const cmp = data.comparison?.perLine[line];
              return (
                <div key={line}>
                  <div className="flex items-baseline justify-between text-[11px] mb-0.5">
                    <span className="font-heading font-bold">{LINE_LABELS[line]}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-pitch-600 font-bold">{ownVal}</span>
                      {oppVal !== undefined && (
                        <>
                          <span className="text-muted">vs</span>
                          <span className="text-muted">{oppVal}</span>
                          {cmp && <span className={`text-[10px] uppercase font-bold ${COMPARISON_COLOR[cmp]}`}>{COMPARISON_LABEL[cmp]}</span>}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex gap-1 items-center h-3">
                    <div className="flex-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor(ownVal)} transition-all duration-300`} style={{ width: `${ownVal}%` }} />
                    </div>
                    {oppVal !== undefined && (
                      <div className="flex-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full opacity-60 ${barColor(oppVal)} transition-all duration-300`} style={{ width: `${oppVal}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Attack vs Defense summary */}
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-muted uppercase text-[10px]">Útok:</span>
              <span className="font-heading font-bold tabular-nums">{data.own.attack}</span>
              {data.opponent && <span className="text-muted">vs {data.opponent.attack}</span>}
              {data.own.tacticEffect.attackMod !== 1.0 && (
                <span className={`text-[10px] ${data.own.tacticEffect.attackMod > 1.0 ? "text-pitch-500" : "text-card-red"}`}>
                  {data.own.tacticEffect.attackMod > 1.0 ? "+" : ""}{Math.round((data.own.tacticEffect.attackMod - 1) * 100)}% taktika
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted uppercase text-[10px]">Obrana:</span>
              <span className="font-heading font-bold tabular-nums">{data.own.defense}</span>
              {data.opponent && <span className="text-muted">vs {data.opponent.defense}</span>}
              {data.own.tacticEffect.defenseMod !== 1.0 && (
                <span className={`text-[10px] ${data.own.tacticEffect.defenseMod > 1.0 ? "text-pitch-500" : "text-card-red"}`}>
                  {data.own.tacticEffect.defenseMod > 1.0 ? "+" : ""}{Math.round((data.own.tacticEffect.defenseMod - 1) * 100)}% taktika
                </span>
              )}
            </div>
          </div>

          {/* Recommendation + notes */}
          {data.recommendation && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-pitch-50 border border-pitch-200 text-[12px] text-pitch-800">
              <span className="font-heading font-bold mr-1">💡</span>
              {data.recommendation}
            </div>
          )}
          {data.own.notes.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-amber-700">
              {data.own.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span>⚠️</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
