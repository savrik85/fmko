import React from "react";

interface HairProps {
  style: string;
  color: string;
}

/** SVG hair paths mapped by style name */
const HAIR_PATHS: Record<string, (color: string) => React.ReactNode> = {
  short_classic: (c) => (
    <path d="M22,35 Q25,12 50,10 Q75,12 78,35 L75,30 Q72,18 50,16 Q28,18 25,30Z" fill={c} />
  ),
  buzz_cut: (c) => (
    <path d="M20,40 Q22,14 50,12 Q78,14 80,40 L78,38 Q76,18 50,16 Q24,18 22,38Z" fill={c} opacity="0.7" />
  ),
  bald: () => null,
  receding: (c) => (
    <g>
      <path d="M28,32 Q35,16 50,15 Q65,16 72,32 L70,28 Q64,20 50,19 Q36,20 30,28Z" fill={c} />
    </g>
  ),
  bald_top: (c) => (
    <g>
      <path d="M15,50 Q14,38 20,35 L22,40 Q18,42 17,50Z" fill={c} />
      <path d="M85,50 Q86,38 80,35 L78,40 Q82,42 83,50Z" fill={c} />
    </g>
  ),
  medium: (c) => (
    <path d="M18,50 Q18,10 50,8 Q82,10 82,50 L80,45 Q78,16 50,14 Q22,16 20,45Z" fill={c} />
  ),
  long: (c) => (
    <g>
      <path d="M16,55 Q15,8 50,6 Q85,8 84,55 L82,50 Q80,14 50,12 Q20,14 18,50Z" fill={c} />
      <path d="M16,55 Q15,70 18,80 L20,75 Q18,65 18,55Z" fill={c} />
      <path d="M84,55 Q85,70 82,80 L80,75 Q82,65 82,55Z" fill={c} />
    </g>
  ),
  dreads: (c) => (
    <g>
      <path d="M18,45 Q18,10 50,8 Q82,10 82,45" fill={c} />
      {[20, 30, 40, 50, 60, 70, 80].map((x) => (
        <line key={x} x1={x * 0.85 + 5} y1={45} x2={x * 0.85 + 3} y2={75} stroke={c} strokeWidth="3" strokeLinecap="round" />
      ))}
    </g>
  ),
  sideburns: (c) => (
    <g>
      <path d="M22,35 Q25,14 50,12 Q75,14 78,35 L75,30 Q72,18 50,16 Q28,18 25,30Z" fill={c} />
      <rect x={16} y={40} width={5} height={18} rx={2} fill={c} />
      <rect x={79} y={40} width={5} height={18} rx={2} fill={c} />
    </g>
  ),
  fringe: (c) => (
    <g>
      <path d="M20,38 Q22,12 50,10 Q78,12 80,38 L78,34 Q76,16 50,14 Q24,16 22,34Z" fill={c} />
      <path d="M22,34 Q30,28 42,36 Q35,30 28,35Z" fill={c} />
    </g>
  ),
  mohawk: (c) => (
    <path d="M42,30 Q44,4 50,2 Q56,4 58,30 L56,25 Q54,8 50,6 Q46,8 44,25Z" fill={c} />
  ),
  mullet: (c) => (
    <g>
      <path d="M22,35 Q25,14 50,12 Q75,14 78,35 L75,30 Q72,18 50,16 Q28,18 25,30Z" fill={c} />
      <path d="M25,35 Q22,55 24,80 L28,75 Q26,55 28,38Z" fill={c} />
      <path d="M75,35 Q78,55 76,80 L72,75 Q74,55 72,38Z" fill={c} />
    </g>
  ),
  combover: (c) => (
    <path d="M20,40 Q22,18 50,16 Q60,16 72,22 L68,20 Q58,18 50,18 Q26,20 24,38Z" fill={c} />
  ),
  curly: (c) => (
    <g>
      {[25, 33, 41, 50, 59, 67, 75].map((x) => (
        <circle key={x} cx={x} cy={18 + Math.sin(x) * 3} r="7" fill={c} />
      ))}
      {[28, 38, 48, 58, 68, 72].map((x) => (
        <circle key={x} cx={x} cy={12 + Math.cos(x) * 2} r="5" fill={c} />
      ))}
    </g>
  ),
  spiky: (c) => (
    <g>
      {[30, 38, 46, 54, 62, 70].map((x) => (
        <path key={x} d={`M${x - 3},25 L${x},${6 + (x % 7)} L${x + 3},25Z`} fill={c} />
      ))}
      <path d="M22,35 Q25,20 50,18 Q75,20 78,35 L75,32 Q72,22 50,20 Q28,22 25,32Z" fill={c} />
    </g>
  ),
};

export function Hair({ style, color }: HairProps) {
  const renderer = HAIR_PATHS[style];
  if (!renderer) return null;
  const result = renderer(color);
  return result ? <g className="avatar-hair">{result}</g> : null;
}
