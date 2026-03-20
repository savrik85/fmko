import React from "react";

interface EarsProps {
  variant: number; // 1-4
  fill: string;
  shadow: string;
}

export function Ears({ variant, fill, shadow }: EarsProps) {
  switch (variant) {
    case 1: // Malé přiléhavé
      return (
        <g className="avatar-ears">
          <ellipse cx={14} cy={50} rx="4" ry="6" fill={fill} stroke={shadow} strokeWidth="1" />
          <ellipse cx={86} cy={50} rx="4" ry="6" fill={fill} stroke={shadow} strokeWidth="1" />
        </g>
      );
    case 2: // Normální
      return (
        <g className="avatar-ears">
          <ellipse cx={12} cy={50} rx="5" ry="8" fill={fill} stroke={shadow} strokeWidth="1" />
          <ellipse cx={88} cy={50} rx="5" ry="8" fill={fill} stroke={shadow} strokeWidth="1" />
        </g>
      );
    case 3: // Velké odstáté
      return (
        <g className="avatar-ears">
          <ellipse cx={8} cy={50} rx="8" ry="10" fill={fill} stroke={shadow} strokeWidth="1" />
          <path d="M10,45 Q13,50 10,55" fill="none" stroke={shadow} strokeWidth="0.8" />
          <ellipse cx={92} cy={50} rx="8" ry="10" fill={fill} stroke={shadow} strokeWidth="1" />
          <path d="M90,45 Q87,50 90,55" fill="none" stroke={shadow} strokeWidth="0.8" />
        </g>
      );
    case 4: // Špičaté
    default:
      return (
        <g className="avatar-ears">
          <path d={`M16,42 L8,48 L16,58`} fill={fill} stroke={shadow} strokeWidth="1" />
          <path d={`M84,42 L92,48 L84,58`} fill={fill} stroke={shadow} strokeWidth="1" />
        </g>
      );
  }
}
