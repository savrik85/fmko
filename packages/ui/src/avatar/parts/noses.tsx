import React from "react";

interface NoseProps {
  variant: number; // 1-6
  fill: string;
}

export function Nose({ variant, fill }: NoseProps) {
  const cx = 50;
  const cy = 57;

  switch (variant) {
    case 1: // Malý kulatý
      return <circle cx={cx} cy={cy} r="3" fill={fill} stroke="#00000020" strokeWidth="0.5" />;
    case 2: // Velký kulatý (bulva)
      return (
        <g className="avatar-nose">
          <ellipse cx={cx} cy={cy} rx="5" ry="4.5" fill={fill} stroke="#00000020" strokeWidth="0.5" />
          <circle cx={cx - 2.5} cy={cy + 1} r="1.5" fill="#00000010" />
          <circle cx={cx + 2.5} cy={cy + 1} r="1.5" fill="#00000010" />
        </g>
      );
    case 3: // Orlí
      return (
        <path
          d={`M${cx},${cy - 6} Q${cx + 3},${cy - 2} ${cx + 2},${cy + 2} Q${cx},${cy + 4} ${cx - 2},${cy + 2} Q${cx - 3},${cy - 2} ${cx},${cy - 6}Z`}
          fill={fill}
          stroke="#00000020"
          strokeWidth="0.5"
        />
      );
    case 4: // Tupý/plochý
      return (
        <g className="avatar-nose">
          <ellipse cx={cx} cy={cy} rx="6" ry="3" fill={fill} stroke="#00000020" strokeWidth="0.5" />
        </g>
      );
    case 5: // Špičatý
      return (
        <path
          d={`M${cx},${cy - 5} L${cx + 3},${cy + 3} L${cx - 3},${cy + 3}Z`}
          fill={fill}
          stroke="#00000020"
          strokeWidth="0.5"
        />
      );
    case 6: // Zahnutý dolů
    default:
      return (
        <path
          d={`M${cx},${cy - 5} Q${cx + 4},${cy} ${cx + 2},${cy + 4} Q${cx},${cy + 5} ${cx - 2},${cy + 4} Q${cx - 4},${cy} ${cx},${cy - 5}Z`}
          fill={fill}
          stroke="#00000020"
          strokeWidth="0.5"
        />
      );
  }
}
