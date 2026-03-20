import React from "react";

interface EyesProps {
  variant: number; // 1-8
}

export function Eyes({ variant }: EyesProps) {
  const y = 45;
  const lx = 37;
  const rx = 63;

  switch (variant) {
    case 1: // Malé kulaté
      return (
        <g className="avatar-eyes">
          <circle cx={lx} cy={y} r="3" fill="#1A1A1A" />
          <circle cx={rx} cy={y} r="3" fill="#1A1A1A" />
        </g>
      );
    case 2: // Velké kulaté
      return (
        <g className="avatar-eyes">
          <ellipse cx={lx} cy={y} rx="5" ry="5.5" fill="white" stroke="#333" strokeWidth="1" />
          <circle cx={lx} cy={y} r="2.5" fill="#1A1A1A" />
          <ellipse cx={rx} cy={y} rx="5" ry="5.5" fill="white" stroke="#333" strokeWidth="1" />
          <circle cx={rx} cy={y} r="2.5" fill="#1A1A1A" />
        </g>
      );
    case 3: // Šikmé (asijské)
      return (
        <g className="avatar-eyes">
          <path d={`M${lx - 5},${y} Q${lx},${y - 3} ${lx + 5},${y} Q${lx},${y + 1} ${lx - 5},${y}Z`} fill="#1A1A1A" />
          <path d={`M${rx - 5},${y} Q${rx},${y - 3} ${rx + 5},${y} Q${rx},${y + 1} ${rx - 5},${y}Z`} fill="#1A1A1A" />
        </g>
      );
    case 4: // Unavené (přivřené)
      return (
        <g className="avatar-eyes">
          <ellipse cx={lx} cy={y} rx="5" ry="2" fill="white" stroke="#333" strokeWidth="1" />
          <circle cx={lx} cy={y + 0.5} r="1.5" fill="#1A1A1A" />
          <ellipse cx={rx} cy={y} rx="5" ry="2" fill="white" stroke="#333" strokeWidth="1" />
          <circle cx={rx} cy={y + 0.5} r="1.5" fill="#1A1A1A" />
        </g>
      );
    case 5: // Lišácké
      return (
        <g className="avatar-eyes">
          <path d={`M${lx - 5},${y + 1} L${lx},${y - 3} L${lx + 5},${y + 1}`} fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" />
          <circle cx={lx} cy={y + 1} r="1.5" fill="#1A1A1A" />
          <path d={`M${rx - 5},${y + 1} L${rx},${y - 3} L${rx + 5},${y + 1}`} fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" />
          <circle cx={rx} cy={y + 1} r="1.5" fill="#1A1A1A" />
        </g>
      );
    case 6: // Překvapené (velké)
      return (
        <g className="avatar-eyes">
          <ellipse cx={lx} cy={y} rx="6" ry="7" fill="white" stroke="#333" strokeWidth="1" />
          <circle cx={lx} cy={y} r="3" fill="#1A1A1A" />
          <circle cx={lx - 1} cy={y - 2} r="1" fill="white" />
          <ellipse cx={rx} cy={y} rx="6" ry="7" fill="white" stroke="#333" strokeWidth="1" />
          <circle cx={rx} cy={y} r="3" fill="#1A1A1A" />
          <circle cx={rx - 1} cy={y - 2} r="1" fill="white" />
        </g>
      );
    case 7: // Zamračené
      return (
        <g className="avatar-eyes">
          <line x1={lx - 5} y1={y - 5} x2={lx + 4} y2={y - 3} stroke="#333" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={lx} cy={y} r="3" fill="#1A1A1A" />
          <line x1={rx + 5} y1={y - 5} x2={rx - 4} y2={y - 3} stroke="#333" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={rx} cy={y} r="3" fill="#1A1A1A" />
        </g>
      );
    case 8: // Vesele přimhouřené
    default:
      return (
        <g className="avatar-eyes">
          <path d={`M${lx - 4},${y} Q${lx},${y - 5} ${lx + 4},${y}`} fill="none" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" />
          <path d={`M${rx - 4},${y} Q${rx},${y - 5} ${rx + 4},${y}`} fill="none" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
  }
}
