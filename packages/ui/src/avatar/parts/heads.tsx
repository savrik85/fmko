import React from "react";

interface HeadProps {
  variant: number; // 1-6
  fill: string;
  shadow: string;
}

const HEAD_PATHS: Record<number, string> = {
  // 1: Kulatá
  1: "M50,15 C72,15 85,30 85,55 C85,78 72,90 50,90 C28,90 15,78 15,55 C15,30 28,15 50,15Z",
  // 2: Oválná
  2: "M50,12 C70,12 82,28 82,52 C82,80 70,92 50,92 C30,92 18,80 18,52 C18,28 30,12 50,12Z",
  // 3: Hranatá
  3: "M22,18 L78,18 C83,18 86,22 86,28 L86,72 C86,82 78,90 68,90 L32,90 C22,90 14,82 14,72 L14,28 C14,22 17,18 22,18Z",
  // 4: Úzká/dlouhá
  4: "M50,10 C68,10 78,25 78,48 C78,75 68,95 50,95 C32,95 22,75 22,48 C22,25 32,10 50,10Z",
  // 5: Široká
  5: "M50,18 C76,18 90,32 90,52 C90,74 76,88 50,88 C24,88 10,74 10,52 C10,32 24,18 50,18Z",
  // 6: Trojúhelníková (úzké čelo, široká čelist)
  6: "M50,14 C66,14 76,26 78,45 C80,68 72,88 50,88 C28,88 20,68 22,45 C24,26 34,14 50,14Z",
};

export function Head({ variant, fill, shadow }: HeadProps) {
  const path = HEAD_PATHS[variant] ?? HEAD_PATHS[1];
  return (
    <g className="avatar-head">
      <path d={path} fill={fill} stroke={shadow} strokeWidth="1.5" />
    </g>
  );
}
