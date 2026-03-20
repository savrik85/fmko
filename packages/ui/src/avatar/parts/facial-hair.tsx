import React from "react";

interface FacialHairProps {
  style: string;
  color: string;
}

const FACIAL_HAIR_RENDERERS: Record<string, (c: string) => React.ReactNode> = {
  none: () => null,
  stubble_1day: (c) => (
    <g opacity="0.3">
      {Array.from({ length: 20 }, (_, i) => (
        <circle key={i} cx={35 + (i % 5) * 6 + Math.sin(i) * 2} cy={65 + Math.floor(i / 5) * 4} r="0.5" fill={c} />
      ))}
    </g>
  ),
  stubble_3day: (c) => (
    <g opacity="0.5">
      {Array.from({ length: 35 }, (_, i) => (
        <circle key={i} cx={33 + (i % 7) * 5 + Math.sin(i) * 1.5} cy={62 + Math.floor(i / 7) * 4} r="0.7" fill={c} />
      ))}
    </g>
  ),
  mustache: (c) => (
    <path d="M40,63 Q45,60 50,62 Q55,60 60,63 Q55,66 50,65 Q45,66 40,63Z" fill={c} />
  ),
  mustache_goatee: (c) => (
    <g>
      <path d="M40,63 Q45,60 50,62 Q55,60 60,63 Q55,66 50,65 Q45,66 40,63Z" fill={c} />
      <ellipse cx={50} cy={76} rx={5} ry={6} fill={c} />
    </g>
  ),
  full_short: (c) => (
    <g>
      <path d="M35,62 Q35,58 50,60 Q65,58 65,62 L65,78 Q65,85 50,86 Q35,85 35,78Z" fill={c} opacity="0.7" />
    </g>
  ),
  full_long: (c) => (
    <g>
      <path d="M33,60 Q33,56 50,58 Q67,56 67,60 L68,85 Q68,95 50,96 Q32,95 32,85Z" fill={c} opacity="0.7" />
    </g>
  ),
  goatee: (c) => (
    <ellipse cx={50} cy={76} rx={6} ry={8} fill={c} opacity="0.8" />
  ),
  sideburns_beard: (c) => (
    <g>
      <rect x={16} y={45} width={5} height={25} rx={2} fill={c} opacity="0.7" />
      <rect x={79} y={45} width={5} height={25} rx={2} fill={c} opacity="0.7" />
    </g>
  ),
  unkempt: (c) => (
    <g opacity="0.6">
      {Array.from({ length: 40 }, (_, i) => (
        <circle key={i} cx={32 + (i % 8) * 5 + Math.sin(i * 3) * 2} cy={60 + Math.floor(i / 8) * 5 + Math.cos(i * 2)} r={0.6 + (i % 3) * 0.3} fill={c} />
      ))}
    </g>
  ),
};

export function FacialHair({ style, color }: FacialHairProps) {
  const renderer = FACIAL_HAIR_RENDERERS[style];
  if (!renderer) return null;
  const result = renderer(color);
  return result ? <g className="avatar-facial-hair">{result}</g> : null;
}
