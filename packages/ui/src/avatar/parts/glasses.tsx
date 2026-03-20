import React from "react";

interface GlassesProps {
  style: string;
}

export function Glasses({ style }: GlassesProps) {
  const y = 44;
  const lx = 37;
  const rx = 63;

  switch (style) {
    case "none":
      return null;
    case "classic":
      return (
        <g className="avatar-glasses" fill="none" stroke="#333" strokeWidth="1.5">
          <rect x={lx - 8} y={y - 6} width={16} height={12} rx={2} />
          <rect x={rx - 8} y={y - 6} width={16} height={12} rx={2} />
          <line x1={lx + 8} y1={y} x2={rx - 8} y2={y} />
          <line x1={lx - 8} y1={y} x2={14} y2={y - 2} />
          <line x1={rx + 8} y1={y} x2={86} y2={y - 2} />
        </g>
      );
    case "round":
      return (
        <g className="avatar-glasses" fill="none" stroke="#333" strokeWidth="1.5">
          <circle cx={lx} cy={y} r="8" />
          <circle cx={rx} cy={y} r="8" />
          <line x1={lx + 8} y1={y} x2={rx - 8} y2={y} />
          <line x1={lx - 8} y1={y} x2={14} y2={y - 2} />
          <line x1={rx + 8} y1={y} x2={86} y2={y - 2} />
        </g>
      );
    case "thick":
      return (
        <g className="avatar-glasses">
          <rect x={lx - 9} y={y - 7} width={18} height={14} rx={3} fill="#33333320" stroke="#222" strokeWidth="2.5" />
          <rect x={rx - 9} y={y - 7} width={18} height={14} rx={3} fill="#33333320" stroke="#222" strokeWidth="2.5" />
          <line x1={lx + 9} y1={y} x2={rx - 9} y2={y} stroke="#222" strokeWidth="2.5" />
          <line x1={lx - 9} y1={y} x2={12} y2={y - 2} stroke="#222" strokeWidth="2" />
          <line x1={rx + 9} y1={y} x2={88} y2={y - 2} stroke="#222" strokeWidth="2" />
        </g>
      );
    case "sport":
      return (
        <g className="avatar-glasses">
          <path d={`M12,${y - 2} L${lx - 10},${y - 5} Q${lx},${y - 8} ${lx + 10},${y - 3} L${rx - 10},${y - 3} Q${rx},${y - 8} ${rx + 10},${y - 5} L88,${y - 2}`}
            fill="#33333340" stroke="#555" strokeWidth="1.5" />
        </g>
      );
    case "square":
    default:
      return (
        <g className="avatar-glasses" fill="none" stroke="#333" strokeWidth="1.5">
          <rect x={lx - 9} y={y - 6} width={18} height={12} rx={1} />
          <rect x={rx - 9} y={y - 6} width={18} height={12} rx={1} />
          <line x1={lx + 9} y1={y} x2={rx - 9} y2={y} />
          <line x1={lx - 9} y1={y} x2={14} y2={y - 2} />
          <line x1={rx + 9} y1={y} x2={86} y2={y - 2} />
        </g>
      );
  }
}
