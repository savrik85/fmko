"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

type Impact = "HIGH_NEGATIVE" | "MEDIUM_NEGATIVE" | "LOW_NEGATIVE" | "NEUTRAL" | "LOW_POSITIVE" | "MEDIUM_POSITIVE" | "HIGH_POSITIVE";
type FactorType = "key_matchup" | "tactic" | "discipline" | "captain" | "goalkeeper" | "absences";

interface SummaryFactor {
  type: FactorType;
  label: string;
  description: string;
  impact: Impact;
  ownValue?: number;
  oppValue?: number;
}

interface MatchSummary {
  factors: SummaryFactor[];
  ownStrength: { gk: number; def: number; mid: number; fwd: number };
  opponentStrength: { gk: number; def: number; mid: number; fwd: number };
  ownTactic: string;
  opponentTactic: string;
  outcome: "WIN" | "DRAW" | "LOSS";
  summaryText: string;
}

interface Props { teamId: string; matchId: string }

const FACTOR_EMOJI: Record<FactorType, string> = {
  key_matchup: "📊",
  tactic: "⚙️",
  discipline: "🟥",
  captain: "🎖️",
  goalkeeper: "🧤",
  absences: "🚫",
};

const IMPACT_COLOR: Record<Impact, string> = {
  HIGH_POSITIVE: "border-pitch-500 bg-pitch-50 text-pitch-800",
  MEDIUM_POSITIVE: "border-pitch-400 bg-pitch-50/60 text-pitch-700",
  LOW_POSITIVE: "border-gray-200 bg-gray-50 text-ink",
  NEUTRAL: "border-gray-200 bg-gray-50 text-ink",
  LOW_NEGATIVE: "border-gray-200 bg-gray-50 text-ink",
  MEDIUM_NEGATIVE: "border-amber-300 bg-amber-50 text-amber-900",
  HIGH_NEGATIVE: "border-red-300 bg-red-50 text-red-900",
};

const IMPACT_LABEL: Record<Impact, string> = {
  HIGH_POSITIVE: "Silně pozitivní",
  MEDIUM_POSITIVE: "Pozitivní",
  LOW_POSITIVE: "Lehce pozitivní",
  NEUTRAL: "Neutrální",
  LOW_NEGATIVE: "Lehce negativní",
  MEDIUM_NEGATIVE: "Negativní",
  HIGH_NEGATIVE: "Silně negativní",
};

const LINE_LABELS = { gk: "Brankář", def: "Obrana", mid: "Záloha", fwd: "Útok" } as const;

function barColor(value: number): string {
  if (value >= 7.5) return "bg-pitch-500";
  if (value >= 6.5) return "bg-gold-500";
  if (value >= 5.5) return "bg-amber-500";
  return "bg-card-red";
}

// Safe rendering of "**bold**" markers from server-generated summaryText.
// Splits the string by **...** pairs and wraps odd indices in <strong>.
function renderBoldMarkers(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>));
}

export function MatchBreakdown({ teamId, matchId }: Props) {
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MatchSummary>(`/api/teams/${teamId}/match-summary/${matchId}`)
      .then((s) => setSummary(s))
      .catch((e) => {
        console.warn("match-summary load failed:", e);
        setError("fail");
      });
  }, [teamId, matchId]);

  if (error || !summary) return null;

  const outcomeColor =
    summary.outcome === "WIN" ? "from-pitch-500 to-pitch-600"
    : summary.outcome === "LOSS" ? "from-card-red to-red-600"
    : "from-gold-500 to-gold-600";

  return (
    <div className="card overflow-hidden">
      <div className={`px-3 py-2 bg-gradient-to-r ${outcomeColor} text-white flex items-center gap-2`}>
        <span className="text-base">{summary.outcome === "WIN" ? "🏆" : summary.outcome === "LOSS" ? "❌" : "🤝"}</span>
        <span className="font-heading font-bold text-sm uppercase tracking-wide">Co rozhodlo</span>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        {/* Souhrnný text */}
        <p className="text-sm leading-relaxed text-ink">{renderBoldMarkers(summary.summaryText)}</p>

        {/* Top faktory — karty */}
        {summary.factors.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {summary.factors.map((f, i) => (
              <div key={i} className={`border rounded-lg p-2.5 ${IMPACT_COLOR[f.impact]}`}>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-base">{FACTOR_EMOJI[f.type]}</span>
                  <span className="font-heading font-bold text-sm">{f.label}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide opacity-75">{IMPACT_LABEL[f.impact]}</span>
                </div>
                <p className="text-[12px] leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Bar chart síly po liniích */}
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[10px] text-muted font-heading uppercase tracking-wide mb-1.5">
            Síla po liniích (průměrný rating)
          </div>
          <div className="space-y-1.5">
            {(Object.keys(LINE_LABELS) as Array<keyof typeof LINE_LABELS>).map((line) => {
              const own = summary.ownStrength[line];
              const opp = summary.opponentStrength[line];
              return (
                <div key={line}>
                  <div className="flex items-baseline justify-between text-[11px] mb-0.5">
                    <span className="font-heading font-bold">{LINE_LABELS[line]}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-pitch-600 font-bold">{own.toFixed(1)}</span>
                      <span className="text-muted">vs</span>
                      <span className="text-muted">{opp.toFixed(1)}</span>
                    </span>
                  </div>
                  <div className="flex gap-1 items-center h-2">
                    <div className="flex-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor(own)} transition-all`} style={{ width: `${Math.min(100, own * 10)}%` }} />
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full opacity-60 ${barColor(opp)} transition-all`} style={{ width: `${Math.min(100, opp * 10)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tactic info — skryj pokud taktika neznáma (stare zapasy) */}
        {summary.ownTactic && summary.opponentTactic && (
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
            <span className="text-muted">
              Taktika: <span className="font-heading font-bold text-ink">{summary.ownTactic}</span>
              <span className="text-muted-light mx-1">vs</span>
              <span className="font-heading font-bold text-ink">{summary.opponentTactic}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
