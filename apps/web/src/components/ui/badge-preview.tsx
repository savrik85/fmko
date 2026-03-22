"use client";

export type BadgePattern = "shield" | "circle" | "diamond" | "hexagon" | "crest" | "rounded_shield" | "pennant" | "square";

export function BadgePreview({ primary, secondary, pattern, initials, size = 64 }: { primary: string; secondary: string; pattern: BadgePattern; initials: string; size?: number }) {
  const s = size;
  const half = s / 2;
  const stroke = secondary;
  const fontSize = s * 0.28;

  const shapes: Record<BadgePattern, string> = {
    shield: `M${half},${s * 0.05} L${s * 0.9},${s * 0.25} L${s * 0.9},${s * 0.6} Q${s * 0.9},${s * 0.85} ${half},${s * 0.95} Q${s * 0.1},${s * 0.85} ${s * 0.1},${s * 0.6} L${s * 0.1},${s * 0.25}Z`,
    circle: "",
    diamond: `M${half},${s * 0.05} L${s * 0.92},${half} L${half},${s * 0.95} L${s * 0.08},${half}Z`,
    hexagon: `M${half},${s * 0.05} L${s * 0.9},${s * 0.27} L${s * 0.9},${s * 0.73} L${half},${s * 0.95} L${s * 0.1},${s * 0.73} L${s * 0.1},${s * 0.27}Z`,
    crest: `M${half},${s * 0.02} L${s * 0.85},${s * 0.15} L${s * 0.92},${s * 0.2} L${s * 0.88},${s * 0.6} Q${s * 0.85},${s * 0.85} ${half},${s * 0.98} Q${s * 0.15},${s * 0.85} ${s * 0.12},${s * 0.6} L${s * 0.08},${s * 0.2} L${s * 0.15},${s * 0.15}Z`,
    rounded_shield: `M${half},${s * 0.08} Q${s * 0.85},${s * 0.08} ${s * 0.88},${s * 0.3} L${s * 0.88},${s * 0.55} Q${s * 0.88},${s * 0.9} ${half},${s * 0.95} Q${s * 0.12},${s * 0.9} ${s * 0.12},${s * 0.55} L${s * 0.12},${s * 0.3} Q${s * 0.15},${s * 0.08} ${half},${s * 0.08}Z`,
    pennant: `M${s * 0.15},${s * 0.05} L${s * 0.85},${s * 0.05} L${half},${s * 0.95}Z`,
    square: "",
  };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {pattern === "circle" ? (
        <circle cx={half} cy={half} r={half * 0.85} fill={primary} stroke={stroke} strokeWidth={s * 0.04} />
      ) : pattern === "square" ? (
        <rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} rx={s * 0.12} fill={primary} stroke={stroke} strokeWidth={s * 0.04} />
      ) : (
        <path d={shapes[pattern]} fill={primary} stroke={stroke} strokeWidth={s * 0.04} strokeLinejoin="round" />
      )}
      <text x={half} y={half + fontSize * 0.35} textAnchor="middle" fontSize={fontSize * 0.85} fontWeight="800"
        fill="white" stroke="rgba(0,0,0,0.4)" strokeWidth={s * 0.02} paintOrder="stroke"
        fontFamily="var(--font-heading)" letterSpacing="0.05em">{initials}</text>
    </svg>
  );
}
