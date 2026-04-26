"use client";

import { BadgePreview, type BadgePattern } from "@/components/ui";

interface ClubScarfProps {
  primary: string;
  secondary: string;
  pattern: BadgePattern;
  initials: string;
  symbol?: string | null;
  width?: number;
  height?: number;
}

export function ClubScarf({
  primary,
  secondary,
  pattern,
  initials,
  symbol,
  width = 180,
  height = 78,
}: ClubScarfProps) {
  const fringeWidth = 6;
  const bodyMarginY = 4;
  const innerStripeHeight = (height - bodyMarginY * 2) / 7;
  const badgeSize = Math.min(height - 14, 56);

  return (
    <div className="relative shrink-0 drop-shadow-md" style={{ width, height }}>
      {/* Třásně vlevo */}
      <div
        className="absolute left-0 top-2 bottom-2 flex flex-col justify-evenly pointer-events-none"
        style={{ width: fringeWidth }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`l${i}`}
            className="rounded-l-full"
            style={{
              width: fringeWidth + (i % 2 === 0 ? 0 : 2),
              height: 2,
              background: i % 2 === 0 ? primary : secondary,
              marginLeft: -((i % 3) * 1.5),
            }}
          />
        ))}
      </div>
      {/* Třásně vpravo */}
      <div
        className="absolute right-0 top-2 bottom-2 flex flex-col justify-evenly pointer-events-none"
        style={{ width: fringeWidth }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`r${i}`}
            className="rounded-r-full"
            style={{
              width: fringeWidth + (i % 2 === 0 ? 0 : 2),
              height: 2,
              background: i % 2 === 1 ? primary : secondary,
              marginRight: -((i % 3) * 1.5),
            }}
          />
        ))}
      </div>
      {/* Tělo šály */}
      <div
        className="absolute rounded-sm overflow-hidden"
        style={{
          left: fringeWidth,
          right: fringeWidth,
          top: bodyMarginY,
          bottom: bodyMarginY,
          background: primary,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.15)",
        }}
      >
        {[1, 3, 5, 6].map((i) => (
          <div
            key={i}
            className="absolute inset-x-0"
            style={{
              top: i * innerStripeHeight,
              height: i === 6 ? innerStripeHeight * 0.6 : 2,
              background: secondary,
              opacity: i === 6 ? 1 : 0.85,
            }}
          />
        ))}
      </div>
      {/* Klubový znak uprostřed */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <BadgePreview
          primary={primary}
          secondary={secondary}
          pattern={pattern}
          initials={initials}
          symbol={symbol}
          size={badgeSize}
        />
      </div>
    </div>
  );
}
