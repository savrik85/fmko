import React from "react";
import type { BodyType } from "@okresni-masina/shared";

interface BodyProps {
  bodyType: BodyType;
  fill: string;
  jerseyColor: string;
}

const BODY_PATHS: Record<BodyType, string> = {
  thin:     "M35,90 L33,130 Q32,145 38,150 L62,150 Q68,145 67,130 L65,90",
  athletic: "M30,90 L28,130 Q27,145 36,150 L64,150 Q73,145 72,130 L70,90",
  normal:   "M28,90 L26,130 Q25,148 35,152 L65,152 Q75,148 74,130 L72,90",
  stocky:   "M24,90 L22,130 Q20,148 33,155 L67,155 Q80,148 78,130 L76,90",
  obese:    "M20,90 L16,130 Q14,150 30,158 L70,158 Q86,150 84,130 L80,90",
};

export function Body({ bodyType, fill, jerseyColor }: BodyProps) {
  const path = BODY_PATHS[bodyType];
  return (
    <g className="avatar-body">
      {/* Neck */}
      <rect x={43} y={85} width={14} height={10} rx={3} fill={fill} />
      {/* Body/jersey */}
      <path d={path} fill={jerseyColor} stroke="#00000020" strokeWidth="1" />
    </g>
  );
}
