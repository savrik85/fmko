"use client";

import { BadgePreview, type BadgePattern } from "@/components/ui";

interface ClubScarfProps {
  primary: string;
  secondary: string;
  pattern: BadgePattern;
  initials: string;
  symbol?: string | null;
  /** Fixed dimensions (px). Pokud nejsou zadané, šála zaplní rodičovský box. */
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Klubová šála — autentický fan-šál vzor.
 * 5 horizontálních pruhů (P/S/P/S/P), inset shadow tkaniny,
 * třásně na obou koncích (nitky alternujících barev),
 * klubový znak uprostřed.
 */
export function ClubScarf({
  primary,
  secondary,
  pattern,
  initials,
  symbol,
  width,
  height,
  className,
}: ClubScarfProps) {
  const fringeW = 8;
  const fringeCount = 14; // počet nitek na každé straně
  const fixed = width != null && height != null;
  const containerStyle: React.CSSProperties = fixed ? { width, height } : {};

  return (
    <div
      className={`relative shrink-0 ${className ?? ""}`}
      style={containerStyle}
    >
      {/* TĚLO šály — pruhy přes celou plochu mezi třásněmi */}
      <div
        className="absolute rounded-sm shadow-md"
        style={{
          left: fringeW,
          right: fringeW,
          top: 0,
          bottom: 0,
          background: `linear-gradient(180deg,
            ${primary} 0%, ${primary} 22%,
            ${secondary} 22%, ${secondary} 40%,
            ${primary} 40%, ${primary} 60%,
            ${secondary} 60%, ${secondary} 78%,
            ${primary} 78%, ${primary} 100%)`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.18)",
        }}
      />

      {/* TŘÁSNĚ vlevo */}
      <div
        className="absolute left-0 top-1 bottom-1 flex flex-col gap-[1px] pointer-events-none"
        style={{ width: fringeW }}
      >
        {Array.from({ length: fringeCount }).map((_, i) => {
          const isPrim = i % 2 === 0;
          const offset = (i % 3) * 1.5; // různé dlšky vláken
          return (
            <div
              key={`l${i}`}
              className="flex-1 rounded-l-full"
              style={{
                background: isPrim ? primary : secondary,
                width: fringeW,
                marginLeft: -offset,
              }}
            />
          );
        })}
      </div>

      {/* TŘÁSNĚ vpravo */}
      <div
        className="absolute right-0 top-1 bottom-1 flex flex-col gap-[1px] pointer-events-none"
        style={{ width: fringeW }}
      >
        {Array.from({ length: fringeCount }).map((_, i) => {
          const isPrim = i % 2 === 1;
          const offset = (i % 3) * 1.5;
          return (
            <div
              key={`r${i}`}
              className="flex-1 rounded-r-full"
              style={{
                background: isPrim ? primary : secondary,
                width: fringeW,
                marginRight: -offset,
              }}
            />
          );
        })}
      </div>

      {/* Klubový znak — menší, aby šála byla čitelná */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="rounded-full ring-2 ring-black/85"
          style={{
            background: "rgba(255,255,255,0.95)",
            padding: 2,
          }}
        >
          <BadgePreview
            primary={primary}
            secondary={secondary}
            pattern={pattern}
            initials={initials}
            symbol={symbol}
            size={fixed ? Math.min((height as number) - 18, 38) : 36}
          />
        </div>
      </div>
    </div>
  );
}
