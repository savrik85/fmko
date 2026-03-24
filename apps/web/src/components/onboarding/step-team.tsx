"use client";

import { useState, useMemo, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import type { VillageSelection } from "@/app/onboarding/page";

const COLORS = [
  { hex: "#2D5F2D", name: "Zelená" },
  { hex: "#16A34A", name: "Světle zelená" },
  { hex: "#D94032", name: "Červená" },
  { hex: "#9F1239", name: "Vínová" },
  { hex: "#2563EB", name: "Modrá" },
  { hex: "#1D4ED8", name: "Tmavě modrá" },
  { hex: "#3B82F6", name: "Světle modrá" },
  { hex: "#06B6D4", name: "Tyrkysová" },
  { hex: "#F59E0B", name: "Žlutá" },
  { hex: "#F97316", name: "Oranžová" },
  { hex: "#7C3AED", name: "Fialová" },
  { hex: "#EC4899", name: "Růžová" },
  { hex: "#047857", name: "Smaragdová" },
  { hex: "#B45309", name: "Hnědá" },
  { hex: "#78716C", name: "Šedá" },
  { hex: "#1A1A1A", name: "Černá" },
  { hex: "#FFFFFF", name: "Bílá" },
];

type NamingChoice = "classic" | "sponsor" | "custom";

interface SponsorOffer {
  name: string;
  teamName: string;
  seasonBonus: number;
  type: string;
  tradeoffs: {
    benefits: string[];
    negatives: string[];
  };
}

function deriveStadiumSponsors(teamSponsors: SponsorOffer[]): Array<{ name: string; seasonBonus: number }> {
  if (teamSponsors.length === 0) return [];
  return teamSponsors.slice(0, 2).map((s) => ({
    name: `${s.name} Arena`,
    seasonBonus: Math.round(s.seasonBonus * 0.3),
  }));
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("cs") + " Kč";
}

/* ═══════════════════════════════════════
   JERSEY SVG PATTERNS
   ═══════════════════════════════════════ */

type JerseyPattern = "solid" | "stripes" | "hoops" | "halves" | "sash" | "sleeves" | "chest_band" | "pinstripes" | "quarters" | "gradient";

const JERSEY_PATTERNS: Array<{ id: JerseyPattern; label: string }> = [
  { id: "solid", label: "Klasický" },
  { id: "stripes", label: "Pruhy" },
  { id: "hoops", label: "Proužky" },
  { id: "halves", label: "Půlený" },
  { id: "sash", label: "Šerpa" },
  { id: "sleeves", label: "Rukávy" },
  { id: "chest_band", label: "Prsní pás" },
  { id: "pinstripes", label: "Tenké pruhy" },
  { id: "quarters", label: "Čtvrtiny" },
  { id: "gradient", label: "Přechod" },
];

function JerseyPreview({ primary, secondary, pattern, size = 140 }: { primary: string; secondary: string; pattern: JerseyPattern; size?: number }) {
  const id = `jp-${pattern}-${size}`;
  // Realistic football shirt shape — viewBox 0 0 200 220
  // Shoulders wide, sleeves angled, body tapered, round neck cutout
  const bodyPath = "M70,30 L30,45 L5,75 L10,110 L40,95 L40,200 L160,200 L160,95 L190,110 L195,75 L170,45 L130,30";
  const leftSleeve = "M30,45 L5,75 L10,110 L40,95 L40,50Z";
  const rightSleeve = "M170,45 L195,75 L190,110 L160,95 L160,50Z";
  const neckCut = "M70,30 C80,18 90,12 100,12 C110,12 120,18 130,30 L120,38 C112,28 108,24 100,24 C92,24 88,28 80,38Z";
  const outline = "M70,30 L30,45 L5,75 L10,110 L40,95 L40,200 L160,200 L160,95 L190,110 L195,75 L170,45 L130,30 C120,18 110,12 100,12 C90,12 80,18 70,30Z";

  const patternFill = pattern === "stripes" || pattern === "hoops" || pattern === "pinstripes" ? `url(#${id}-p)`
    : pattern === "gradient" ? `url(#${id}-g)` : primary;
  const sleeveFill = pattern === "sleeves" ? secondary : patternFill;

  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 200 220">
      <defs>
        <clipPath id={`${id}-clip`}><path d={outline} /></clipPath>
        {pattern === "stripes" && (
          <pattern id={`${id}-p`} width="24" height="220" patternUnits="userSpaceOnUse">
            <rect width="12" height="220" fill={primary} />
            <rect x="12" width="12" height="220" fill={secondary} />
          </pattern>
        )}
        {pattern === "hoops" && (
          <pattern id={`${id}-p`} width="200" height="30" patternUnits="userSpaceOnUse">
            <rect width="200" height="15" fill={primary} />
            <rect y="15" width="200" height="15" fill={secondary} />
          </pattern>
        )}
        {pattern === "pinstripes" && (
          <pattern id={`${id}-p`} width="10" height="220" patternUnits="userSpaceOnUse">
            <rect width="8" height="220" fill={primary} />
            <rect x="8" width="2" height="220" fill={secondary} />
          </pattern>
        )}
        {pattern === "gradient" && (
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary} />
            <stop offset="100%" stopColor={secondary} />
          </linearGradient>
        )}
      </defs>

      {/* Base fill */}
      <path d={outline} fill={patternFill} />

      {/* Sleeves (separate fill for "sleeves" pattern) */}
      {pattern === "sleeves" && <>
        <path d={leftSleeve} fill={secondary} />
        <path d={rightSleeve} fill={secondary} />
      </>}

      {/* Pattern overlays — clipped to jersey shape */}
      <g clipPath={`url(#${id}-clip)`}>
        {pattern === "halves" && (
          <rect x="100" y="0" width="100" height="220" fill={secondary} />
        )}
        {pattern === "sash" && (
          <polygon points="40,30 130,30 200,180 200,220 110,220 0,60 0,30" fill={secondary} opacity="0.85" />
        )}
        {pattern === "quarters" && <>
          <rect x="100" y="30" width="100" height="85" fill={secondary} />
          <rect x="0" y="115" width="100" height="105" fill={secondary} />
        </>}
        {pattern === "chest_band" && (
          <rect x="0" y="80" width="200" height="30" fill={secondary} />
        )}
      </g>

      {/* Neck cutout */}
      <path d={neckCut} fill={secondary} />

      {/* Outline */}
      <path d={outline} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="3" strokeLinejoin="round" />

      {/* Number */}
      <text x="100" y="155" textAnchor="middle" fontSize="54" fontWeight="bold"
        fill="white" stroke="rgba(0,0,0,0.5)" strokeWidth="2" paintOrder="stroke"
        fontFamily="var(--font-heading)">10</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   BADGE SVG PATTERNS
   ═══════════════════════════════════════ */

type BadgePattern = "shield" | "circle" | "diamond" | "hexagon" | "crest" | "rounded_shield" | "pennant" | "square";

const BADGE_PATTERNS: Array<{ id: BadgePattern; label: string }> = [
  { id: "shield", label: "Štít" },
  { id: "circle", label: "Kruh" },
  { id: "diamond", label: "Kosočtverec" },
  { id: "hexagon", label: "Šestiúhelník" },
  { id: "crest", label: "Erb" },
  { id: "rounded_shield", label: "Zaoblený" },
  { id: "pennant", label: "Vlaječka" },
  { id: "square", label: "Čtverec" },
];

function BadgePreview({ primary, secondary, pattern, initials, size = 64 }: { primary: string; secondary: string; pattern: BadgePattern; initials: string; size?: number }) {
  const s = size;
  const half = s / 2;
  const stroke = secondary;
  const fontSize = s * 0.28;

  const shapes: Record<BadgePattern, string> = {
    shield: `M${half},${s * 0.05} L${s * 0.9},${s * 0.25} L${s * 0.9},${s * 0.6} Q${s * 0.9},${s * 0.85} ${half},${s * 0.95} Q${s * 0.1},${s * 0.85} ${s * 0.1},${s * 0.6} L${s * 0.1},${s * 0.25}Z`,
    circle: "", // use <circle>
    diamond: `M${half},${s * 0.05} L${s * 0.92},${half} L${half},${s * 0.95} L${s * 0.08},${half}Z`,
    hexagon: `M${half},${s * 0.05} L${s * 0.9},${s * 0.27} L${s * 0.9},${s * 0.73} L${half},${s * 0.95} L${s * 0.1},${s * 0.73} L${s * 0.1},${s * 0.27}Z`,
    crest: `M${half},${s * 0.02} L${s * 0.85},${s * 0.15} L${s * 0.92},${s * 0.2} L${s * 0.88},${s * 0.6} Q${s * 0.85},${s * 0.85} ${half},${s * 0.98} Q${s * 0.15},${s * 0.85} ${s * 0.12},${s * 0.6} L${s * 0.08},${s * 0.2} L${s * 0.15},${s * 0.15}Z`,
    rounded_shield: `M${half},${s * 0.08} Q${s * 0.85},${s * 0.08} ${s * 0.88},${s * 0.3} L${s * 0.88},${s * 0.55} Q${s * 0.88},${s * 0.9} ${half},${s * 0.95} Q${s * 0.12},${s * 0.9} ${s * 0.12},${s * 0.55} L${s * 0.12},${s * 0.3} Q${s * 0.15},${s * 0.08} ${half},${s * 0.08}Z`,
    pennant: `M${s * 0.15},${s * 0.05} L${s * 0.85},${s * 0.05} L${half},${s * 0.95}Z`,
    square: "", // use <rect>
  };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {pattern === "circle" ? (
        <circle cx={half} cy={half} r={half * 0.85} fill={primary} stroke={stroke} strokeWidth={s * 0.04} />
      ) : pattern === "square" ? (
        <rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} rx={s * 0.12} fill={primary} stroke={stroke} strokeWidth={s * 0.04} />
      ) : (
        <path d={shapes[pattern]} fill={primary} stroke={stroke} strokeWidth={s * 0.04} strokeLinejoin="round" />
      )}
      <text x={half} y={half + fontSize * 0.35} textAnchor="middle" fontSize={fontSize * 0.85} fontWeight="800"
        fill="white" stroke="rgba(0,0,0,0.4)" strokeWidth={s * 0.02} paintOrder="stroke"
        fontFamily="var(--font-heading)" letterSpacing="0.05em">{initials}</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   STEP TEAM COMPONENT
   ═══════════════════════════════════════ */

interface Props {
  village: VillageSelection;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  onBack: () => void;
  onSubmit: (teamName: string, primary: string, secondary: string, jerseyPattern?: string, badgePattern?: string) => void;
}

export function StepTeam({ village, teamName, primaryColor: initialPrimary, secondaryColor: initialSecondary, onBack, onSubmit }: Props) {
  const [primaryColor, setPrimaryColor] = useState(initialPrimary);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondary);
  const [jerseyPattern, setJerseyPattern] = useState<JerseyPattern>("solid");
  const [badgePattern, setBadgePattern] = useState<BadgePattern>("shield");

  const displayName = teamName;
  const initials = displayName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();

  return (
    <div className="flex-1 p-5 sm:p-8 w-full max-w-5xl mx-auto">
      <button onClick={onBack} className="btn btn-ghost btn-sm mb-4 -ml-2">&#8592; Zpět</button>

      <div className="mb-6">
        <p className="text-label mb-2">Krok 4 ze 5</p>
        <h2 className="text-h1 text-ink">Vzhled týmu</h2>
        <p className="text-muted mt-1">{displayName}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="space-y-6">
          {/* Barvy */}
          <div>
            <p className="text-label mb-3">Barvy dresu</p>
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-muted mb-2">Hlavní</p>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((c) => (
                    <button key={`p-${c.hex}`} onClick={() => setPrimaryColor(c.hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${primaryColor === c.hex ? "border-ink scale-110" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c.hex }} title={c.name} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted mb-2">Doplňková</p>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((c) => (
                    <button key={`s-${c.hex}`} onClick={() => setSecondaryColor(c.hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${secondaryColor === c.hex ? "border-ink scale-110" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c.hex }} title={c.name} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Vzor dresu */}
          <div>
            <p className="text-label mb-3">Vzor dresu</p>
            <div className="grid grid-cols-5 gap-2">
              {JERSEY_PATTERNS.map((jp) => (
                <button key={jp.id} onClick={() => setJerseyPattern(jp.id)}
                  className={`p-1.5 rounded-lg transition-all border-2 flex flex-col items-center ${jerseyPattern === jp.id ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                  <JerseyPreview primary={primaryColor} secondary={secondaryColor} pattern={jp.id} size={40} />
                  <span className="text-[9px] text-muted mt-1">{jp.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Znak klubu */}
          <div>
            <p className="text-label mb-3">Znak klubu</p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {BADGE_PATTERNS.map((bp) => (
                <button key={bp.id} onClick={() => setBadgePattern(bp.id)}
                  className={`p-2 rounded-lg transition-all border-2 flex flex-col items-center ${badgePattern === bp.id ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                  <BadgePreview primary={primaryColor} secondary={secondaryColor} pattern={bp.id} initials={initials} size={36} />
                  <span className="text-[9px] text-muted mt-1">{bp.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onSubmit(displayName, primaryColor, secondaryColor, jerseyPattern, badgePattern)}
            className="btn btn-primary btn-lg w-full"
          >
            Vytvořit tým!
          </button>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-8 self-start">
          <div className="card p-6 text-center">
            <JerseyPreview primary={primaryColor} secondary={secondaryColor} pattern={jerseyPattern} size={140} />
            <div className="mt-3">
              <BadgePreview primary={primaryColor} secondary={secondaryColor} pattern={badgePattern} initials={initials} size={48} />
            </div>
            <div className="font-heading font-bold text-lg mt-2">{displayName}</div>
            <div className="text-sm text-muted">{village.name} &middot; {village.district}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
