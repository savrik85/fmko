import React from "react";

interface StatBarProps {
  label: string;
  value: number;
  max?: number;
}

function getBarColor(value: number, max: number): string {
  const pct = value / max;
  if (pct >= 0.75) return "bg-pitch-400";
  if (pct >= 0.55) return "bg-pitch-500";
  if (pct >= 0.35) return "bg-gold-500";
  if (pct >= 0.2) return "bg-orange-400";
  return "bg-card-red";
}

export function StatBar({ label, value, max = 100 }: StatBarProps) {
  const pct = (value / max) * 100;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted w-20 text-right truncate">
        {label}
      </span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getBarColor(value, max)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-heading font-bold tabular-nums w-8 text-right">
        {Math.round(value)}
      </span>
    </div>
  );
}
