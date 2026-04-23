"use client";

export type BadgePattern =
  | "shield" | "rounded_shield" | "crest" | "double_shield"
  | "circle" | "oval" | "square" | "diamond"
  | "hexagon" | "octagon" | "triangle" | "star"
  | "pennant" | "banner" | "chevron" | "arch";

// Special patterns rendered bez <path> elementu (použijí custom SVG elementy)
const SPECIAL = ["circle", "oval", "square"] as const;
type SpecialPattern = typeof SPECIAL[number];

// Hvězda 5-cípá — path s outer/inner vrcholy
function starPath(cx: number, cy: number, R: number, r: number, points = 5): string {
  const step = Math.PI / points;
  let p = `M`;
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? R : r;
    const angle = i * step - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    p += `${i === 0 ? "" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return p + "Z";
}

export function BadgePreview({ primary, secondary, pattern, initials, size = 64, symbol }: { primary: string; secondary: string; pattern: BadgePattern; initials: string; size?: number; symbol?: string | null }) {
  const s = size;
  const half = s / 2;
  // Pokud je symbol → iniciály nahoru + symbol dole, menší font
  const hasSymbol = !!symbol;
  const fontSize = hasSymbol ? s * 0.2 : s * 0.28;
  const initialsY = hasSymbol ? s * 0.42 : half + fontSize * 0.35;
  const symbolY = s * 0.68;
  const symbolSize = s * 0.32;

  const lum = (hex: string) => {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  };
  const primaryLight = lum(primary) > 200;
  const stroke = primaryLight && lum(secondary) > 200 ? "#bbb" : secondary;
  const textFill = primaryLight ? "#333" : "white";

  const shapes: Record<Exclude<BadgePattern, SpecialPattern>, string> = {
    shield: `M${half},${s * 0.05} L${s * 0.9},${s * 0.25} L${s * 0.9},${s * 0.6} Q${s * 0.9},${s * 0.85} ${half},${s * 0.95} Q${s * 0.1},${s * 0.85} ${s * 0.1},${s * 0.6} L${s * 0.1},${s * 0.25}Z`,
    diamond: `M${half},${s * 0.05} L${s * 0.92},${half} L${half},${s * 0.95} L${s * 0.08},${half}Z`,
    hexagon: `M${half},${s * 0.05} L${s * 0.9},${s * 0.27} L${s * 0.9},${s * 0.73} L${half},${s * 0.95} L${s * 0.1},${s * 0.73} L${s * 0.1},${s * 0.27}Z`,
    crest: `M${half},${s * 0.02} L${s * 0.85},${s * 0.15} L${s * 0.92},${s * 0.2} L${s * 0.88},${s * 0.6} Q${s * 0.85},${s * 0.85} ${half},${s * 0.98} Q${s * 0.15},${s * 0.85} ${s * 0.12},${s * 0.6} L${s * 0.08},${s * 0.2} L${s * 0.15},${s * 0.15}Z`,
    rounded_shield: `M${half},${s * 0.08} Q${s * 0.85},${s * 0.08} ${s * 0.88},${s * 0.3} L${s * 0.88},${s * 0.55} Q${s * 0.88},${s * 0.9} ${half},${s * 0.95} Q${s * 0.12},${s * 0.9} ${s * 0.12},${s * 0.55} L${s * 0.12},${s * 0.3} Q${s * 0.15},${s * 0.08} ${half},${s * 0.08}Z`,
    pennant: `M${s * 0.15},${s * 0.05} L${s * 0.85},${s * 0.05} L${half},${s * 0.95}Z`,
    triangle: `M${s * 0.08},${s * 0.85} L${s * 0.92},${s * 0.85} L${half},${s * 0.1}Z`,
    octagon: `M${s * 0.3},${s * 0.07} L${s * 0.7},${s * 0.07} L${s * 0.93},${s * 0.3} L${s * 0.93},${s * 0.7} L${s * 0.7},${s * 0.93} L${s * 0.3},${s * 0.93} L${s * 0.07},${s * 0.7} L${s * 0.07},${s * 0.3}Z`,
    star: starPath(half, half * 1.02, half * 0.85, half * 0.36, 5),
    banner: `M${s * 0.1},${s * 0.08} L${s * 0.9},${s * 0.08} L${s * 0.9},${s * 0.75} L${half},${s * 0.92} L${s * 0.1},${s * 0.75}Z`,
    chevron: `M${half},${s * 0.1} L${s * 0.92},${s * 0.5} L${half},${s * 0.9} L${s * 0.08},${s * 0.5}Z`,
    arch: `M${s * 0.12},${s * 0.95} L${s * 0.12},${s * 0.4} Q${s * 0.12},${s * 0.05} ${half},${s * 0.05} Q${s * 0.88},${s * 0.05} ${s * 0.88},${s * 0.4} L${s * 0.88},${s * 0.95}Z`,
    double_shield: `M${half},${s * 0.05} L${s * 0.9},${s * 0.2} L${s * 0.9},${s * 0.58} Q${s * 0.9},${s * 0.85} ${half},${s * 0.95} Q${s * 0.1},${s * 0.85} ${s * 0.1},${s * 0.58} L${s * 0.1},${s * 0.2}Z M${half},${s * 0.05} L${half},${s * 0.95}`,
  };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ verticalAlign: "middle", flexShrink: 0 }}>
      {pattern === "circle" ? (
        <circle cx={half} cy={half} r={half * 0.85} fill={primary} stroke={stroke} strokeWidth={s * 0.04} />
      ) : pattern === "oval" ? (
        <ellipse cx={half} cy={half} rx={half * 0.82} ry={half * 0.65} fill={primary} stroke={stroke} strokeWidth={s * 0.04} />
      ) : pattern === "square" ? (
        <rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} rx={s * 0.12} fill={primary} stroke={stroke} strokeWidth={s * 0.04} />
      ) : (
        <path d={shapes[pattern as Exclude<BadgePattern, SpecialPattern>]} fill={primary} stroke={stroke} strokeWidth={s * 0.04} strokeLinejoin="round" />
      )}
      <text x={half} y={initialsY} textAnchor="middle" fontSize={fontSize * 0.85} fontWeight="800"
        fill={textFill} stroke={primaryLight ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.4)"} strokeWidth={s * 0.02} paintOrder="stroke"
        fontFamily="var(--font-heading)" letterSpacing="0.05em">{initials}</text>
      {symbol && (
        <text x={half} y={symbolY} textAnchor="middle" fontSize={symbolSize}
          dominantBaseline="middle" style={{ fontFamily: "system-ui, -apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif" }}>
          {symbol}
        </text>
      )}
    </svg>
  );
}
