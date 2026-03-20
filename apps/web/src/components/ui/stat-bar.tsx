import React from "react";

interface StatBarProps {
  label: string;
  value: number; // 1-20
  max?: number;
}

function getBarColor(value: number): string {
  if (value >= 16) return "bg-pitch-400";
  if (value >= 12) return "bg-pitch-500";
  if (value >= 8) return "bg-gold-500";
  if (value >= 5) return "bg-orange-400";
  return "bg-card-red";
}

export function StatBar({ label, value, max = 20 }: StatBarProps) {
  const pct = (value / max) * 100;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted w-12 text-right uppercase">
        {label}
      </span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getBarColor(value)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-heading font-bold tabular-nums w-6 text-right">
        {value}
      </span>
    </div>
  );
}
