export type ProgressTone = "ok" | "warn" | "danger" | "neutral";

const FILL: Record<ProgressTone, string> = {
  ok: "bg-pitch-500",
  warn: "bg-gold-500",
  danger: "bg-card-red",
  neutral: "bg-muted",
};

/**
 * Proužek průběhu (splátky, kondice, stav trávníku). Barvu podle hodnoty počítá
 * stránka a předá ji jako `tone`; díl žádné prahy nezná. `label` čte jen čtečka obrazovky.
 */
export function ProgressBar({ value, max = 100, tone = "ok", size = "md", label, className = "" }: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  size?: "sm" | "md";
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      className={`block w-full rounded-full overflow-hidden bg-surface-3 ${size === "sm" ? "h-1.5" : "h-2"} ${className}`}
      role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <span className={`block h-full rounded-full ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </span>
  );
}
