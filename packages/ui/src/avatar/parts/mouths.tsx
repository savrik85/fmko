import React from "react";

interface MouthProps {
  variant: number; // 1-5
}

export function Mouth({ variant }: MouthProps) {
  const cx = 50;
  const cy = 68;

  switch (variant) {
    case 1: // Úsměv
      return (
        <path
          d={`M${cx - 8},${cy} Q${cx},${cy + 8} ${cx + 8},${cy}`}
          fill="none"
          stroke="#333"
          strokeWidth="2"
          strokeLinecap="round"
        />
      );
    case 2: // Neutrální
      return (
        <line
          x1={cx - 6} y1={cy} x2={cx + 6} y2={cy}
          stroke="#333"
          strokeWidth="2"
          strokeLinecap="round"
        />
      );
    case 3: // Zamračený
      return (
        <path
          d={`M${cx - 8},${cy + 3} Q${cx},${cy - 5} ${cx + 8},${cy + 3}`}
          fill="none"
          stroke="#333"
          strokeWidth="2"
          strokeLinecap="round"
        />
      );
    case 4: // Otevřená pusa (překvapení)
      return (
        <g className="avatar-mouth">
          <ellipse cx={cx} cy={cy} rx="5" ry="6" fill="#333" />
          <ellipse cx={cx} cy={cy - 1} rx="4" ry="3" fill="#8B0000" />
        </g>
      );
    case 5: // Zubatý úsměv
    default:
      return (
        <g className="avatar-mouth">
          <path
            d={`M${cx - 9},${cy} Q${cx},${cy + 9} ${cx + 9},${cy}`}
            fill="white"
            stroke="#333"
            strokeWidth="1.5"
          />
          <path
            d={`M${cx - 9},${cy} Q${cx},${cy + 2} ${cx + 9},${cy}`}
            fill="none"
            stroke="#333"
            strokeWidth="1"
          />
        </g>
      );
  }
}
