import React from "react";

const POS_LABELS: Record<string, string> = {
  GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO",
};

const POS_CSS: Record<string, string> = {
  GK: "pos-gk", DEF: "pos-def", MID: "pos-mid", FWD: "pos-fwd",
};

export function PositionBadge({ position }: { position: string }) {
  return (
    <span className={`pos-badge ${POS_CSS[position] ?? ""}`}>
      {POS_LABELS[position] ?? position}
    </span>
  );
}

export function PositionDot({ position }: { position: string }) {
  return <span className={`pos-dot ${POS_CSS[position] ?? ""}`} />;
}
