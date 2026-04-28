"use client";

import { BadgePreview, type BadgePattern } from "@/components/ui";

export type ScarfPattern = "classic" | "bar" | "block" | "hooped" | "halves" | "vertical";

export const SCARF_PATTERNS: ReadonlyArray<{ key: ScarfPattern; label: string }> = [
  { key: "classic", label: "Klasická" },
  { key: "bar", label: "Bar (jednoduchá)" },
  { key: "block", label: "Tři pruhy" },
  { key: "hooped", label: "Tenké pruhy" },
  { key: "halves", label: "Půlka/půlka" },
  { key: "vertical", label: "Svislé" },
];

interface ClubScarfProps {
  primary: string;
  secondary: string;
  /** Badge pattern (znak uprostřed) */
  pattern: BadgePattern;
  /** Scarf body pattern. Default "classic". */
  scarfPattern?: ScarfPattern;
  initials: string;
  symbol?: string | null;
  /** Fixed dimensions (px). Pokud nejsou zadané, šála zaplní rodičovský box. */
  width?: number;
  height?: number;
  className?: string;
}

function bodyBackground(scarfPattern: ScarfPattern, primary: string, secondary: string): string {
  switch (scarfPattern) {
    case "bar":
      // Klasický bar scarf — úzký okraj S nahoře/dole, primary v mezeře
      return `linear-gradient(180deg,
        ${secondary} 0%, ${secondary} 14%,
        ${primary} 14%, ${primary} 86%,
        ${secondary} 86%, ${secondary} 100%)`;
    case "block":
      return `linear-gradient(180deg,
        ${primary} 0%, ${primary} 33.33%,
        ${secondary} 33.33%, ${secondary} 66.66%,
        ${primary} 66.66%, ${primary} 100%)`;
    case "hooped": {
      const stops: string[] = [];
      const n = 10;
      for (let i = 0; i < n; i++) {
        const c = i % 2 === 0 ? primary : secondary;
        const start = (i * 100) / n;
        const end = ((i + 1) * 100) / n;
        stops.push(`${c} ${start}%, ${c} ${end}%`);
      }
      return `linear-gradient(180deg, ${stops.join(", ")})`;
    }
    case "halves":
      return `linear-gradient(180deg,
        ${primary} 0%, ${primary} 50%,
        ${secondary} 50%, ${secondary} 100%)`;
    case "vertical": {
      const stops: string[] = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const c = i % 2 === 0 ? primary : secondary;
        const start = (i * 100) / n;
        const end = ((i + 1) * 100) / n;
        stops.push(`${c} ${start}%, ${c} ${end}%`);
      }
      return `linear-gradient(90deg, ${stops.join(", ")})`;
    }
    case "classic":
    default:
      return `linear-gradient(180deg,
        ${primary} 0%, ${primary} 22%,
        ${secondary} 22%, ${secondary} 40%,
        ${primary} 40%, ${primary} 60%,
        ${secondary} 60%, ${secondary} 78%,
        ${primary} 78%, ${primary} 100%)`;
  }
}

/**
 * Klubová šála — fan-šál v různých vzorech (classic, bar, block, hooped, halves, vertical).
 * Třásně na obou koncích, klubový znak uprostřed.
 */
export function ClubScarf({
  primary,
  secondary,
  pattern,
  scarfPattern = "classic",
  initials,
  symbol,
  width,
  height,
  className,
}: ClubScarfProps) {
  const fringeW = 8;
  const fringeCount = 14;
  const fixed = width != null && height != null;
  const containerStyle: React.CSSProperties = fixed ? { width, height } : {};

  return (
    <div
      className={`relative shrink-0 ${className ?? ""}`}
      style={containerStyle}
    >
      <div
        className="absolute rounded-sm shadow-md"
        style={{
          left: fringeW,
          right: fringeW,
          top: 0,
          bottom: 0,
          background: bodyBackground(scarfPattern, primary, secondary),
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.18)",
        }}
      />

      <div
        className="absolute left-0 top-1 bottom-1 flex flex-col gap-[1px] pointer-events-none"
        style={{ width: fringeW }}
      >
        {Array.from({ length: fringeCount }).map((_, i) => {
          const isPrim = i % 2 === 0;
          const offset = (i % 3) * 1.5;
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
