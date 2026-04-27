"use client";

import { BadgePreview, type BadgePattern } from "@/components/ui";

interface ClubFlagProps {
  primary: string;
  secondary: string;
  pattern: BadgePattern;
  initials: string;
  symbol?: string | null;
  width?: number;
  height?: number;
}

/**
 * Klubová vlajka — solid primary obdélník s tenkým secondary lemem,
 * dvěma vodorovnými pruhy a klubovým znakem uprostřed.
 * Žerď není; je to "banner" / "prapor".
 */
export function ClubScarf({
  primary,
  secondary,
  pattern,
  initials,
  symbol,
  width = 150,
  height = 100,
}: ClubFlagProps) {
  const badgeSize = Math.min(height - 20, width - 20, 64);

  return (
    <div
      className="relative shrink-0 rounded-md overflow-hidden shadow-md"
      style={{
        width,
        height,
        background: primary,
        boxShadow: `0 2px 6px rgba(0,0,0,0.15), inset 0 0 0 3px ${secondary}`,
      }}
    >
      {/* Horní pruh */}
      <div
        className="absolute inset-x-0"
        style={{ top: height * 0.18, height: 3, background: secondary }}
      />
      {/* Dolní pruh */}
      <div
        className="absolute inset-x-0"
        style={{ bottom: height * 0.18, height: 3, background: secondary }}
      />
      {/* Klubový znak uprostřed */}
      <div className="absolute inset-0 flex items-center justify-center">
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
