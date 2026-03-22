"use client";

import { useState, useMemo } from "react";
import type { VillageSelection } from "@/app/onboarding/page";

const COLORS = [
  { hex: "#2D5F2D", name: "Zelená" },
  { hex: "#D94032", name: "Červená" },
  { hex: "#2563EB", name: "Modrá" },
  { hex: "#F59E0B", name: "Žlutá" },
  { hex: "#7C3AED", name: "Fialová" },
  { hex: "#0891B2", name: "Tyrkysová" },
  { hex: "#1D4ED8", name: "Tmavě modrá" },
  { hex: "#047857", name: "Smaragdová" },
  { hex: "#B45309", name: "Hnědá" },
  { hex: "#1A1A1A", name: "Černá" },
  { hex: "#DC2626", name: "Tmavě červená" },
  { hex: "#FFFFFF", name: "Bílá" },
];

type NamingChoice = "classic" | "sponsor" | "custom";

interface SponsorOffer {
  name: string;
  teamName: string;
  bonus: number;
  extra?: string;
}

function generateSponsors(villageName: string): SponsorOffer[] {
  const surnames = ["Novotný", "Kuchař", "Dvořák", "Procházka", "Kovář", "Sedláček"];
  const picked = surnames.sort(() => Math.random() - 0.5).slice(0, 3);
  return [
    { name: `Autoservis ${picked[0]}`, teamName: `SK Autoservis ${picked[0]}`, bonus: 25000, extra: "Požadavek: top 8 v tabulce" },
    { name: `Řeznictví ${picked[1]}`, teamName: `FK Řeznictví ${picked[1]} ${villageName}`, bonus: 15000 },
    { name: `Hospoda U ${picked[2]}ů`, teamName: `TJ U ${picked[2]}ů ${villageName}`, bonus: 8000, extra: "Pivo po zápase zdarma" },
  ];
}

function generateStadiumSponsors(): Array<{ name: string; bonus: number }> {
  const surnames = ["Kuchař", "Kovář", "Dvořák", "Sedláček", "Novotný"];
  const picked = surnames.sort(() => Math.random() - 0.5).slice(0, 2);
  return [
    { name: `${picked[0]} Arena`, bonus: 5000 },
    { name: `${picked[1]} Stadion`, bonus: 3000 },
  ];
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
  onSubmit: (teamName: string, primary: string, secondary: string, jerseyPattern: string, badgePattern: string, stadiumName: string) => void;
}

export function StepTeam({ village, teamName: initialName, primaryColor: initialPrimary, secondaryColor: initialSecondary, onBack, onSubmit }: Props) {
  const [namingChoice, setNamingChoice] = useState<NamingChoice>("classic");
  const [teamName, setTeamName] = useState(initialName);
  const [customName, setCustomName] = useState("");
  const [selectedSponsor, setSelectedSponsor] = useState<number | null>(null);
  const [primaryColor, setPrimaryColor] = useState(initialPrimary);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondary);
  const [jerseyPattern, setJerseyPattern] = useState<JerseyPattern>("solid");
  const [badgePattern, setBadgePattern] = useState<BadgePattern>("shield");

  // Stadium
  const [stadiumChoice, setStadiumChoice] = useState<NamingChoice>("classic");
  const [stadiumName, setStadiumName] = useState(`Sportovní areál ${village.name}`);
  const [customStadium, setCustomStadium] = useState("");
  const [selectedStadiumSponsor, setSelectedStadiumSponsor] = useState<number | null>(null);

  const sponsors = useMemo(() => generateSponsors(village.name), [village.name]);
  const stadiumSponsors = useMemo(() => generateStadiumSponsors(), []);

  const displayName = namingChoice === "sponsor" && selectedSponsor !== null
    ? sponsors[selectedSponsor].teamName
    : namingChoice === "custom" ? (customName || "Můj tým") : teamName;

  const displayStadium = stadiumChoice === "sponsor" && selectedStadiumSponsor !== null
    ? stadiumSponsors[selectedStadiumSponsor].name
    : stadiumChoice === "custom" ? (customStadium || "Můj stadion") : stadiumName;

  // Initials for badge
  const initials = displayName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();

  return (
    <div className="flex-1 p-5 sm:p-8 w-full max-w-5xl mx-auto">
      <button onClick={onBack} className="btn btn-ghost btn-sm mb-4 -ml-2">&#8592; Zpět</button>

      <div className="mb-6">
        <p className="text-label mb-2">Krok 3 ze 4</p>
        <h2 className="text-h1 text-ink">Tvůj tým</h2>
        <p className="text-muted mt-1">{village.name}, {village.district}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        <div className="space-y-8">

          {/* 1. Název klubu */}
          <div>
            <p className="text-label mb-3">Název klubu</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { key: "classic" as const, icon: "\u{1F3DB}", label: "Klasický", desc: "Tradice" },
                { key: "sponsor" as const, icon: "\u{1F4B0}", label: "Sponzorský", desc: "Peníze navíc" },
                { key: "custom" as const, icon: "\u270F\uFE0F", label: "Vlastní", desc: "Tvůj výběr" },
              ]).map((opt) => (
                <button key={opt.key} onClick={() => setNamingChoice(opt.key)}
                  className={`p-3 rounded-xl text-center transition-all border-2 ${namingChoice === opt.key ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                  <div className="text-xl mb-1">{opt.icon}</div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-muted">{opt.desc}</div>
                </button>
              ))}
            </div>
            {namingChoice === "classic" && (
              <div className="grid grid-cols-4 gap-1.5">
                {["SK", "FK", "TJ", "Sokol", "Slavoj", "Spartak", "Jiskra", "FC"].map((prefix) => {
                  const name = `${prefix} ${village.name}`;
                  return (
                    <button key={prefix} onClick={() => setTeamName(name)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${teamName === name ? "bg-pitch-500 text-white" : "bg-surface hover:bg-pitch-50 text-ink-light"}`}>
                      {prefix}
                    </button>
                  );
                })}
              </div>
            )}
            {namingChoice === "sponsor" && (
              <div className="space-y-2">
                {sponsors.map((s, i) => (
                  <button key={i} onClick={() => setSelectedSponsor(i)}
                    className={`w-full p-3 rounded-xl text-left transition-all border-2 flex items-start gap-3 ${selectedSponsor === i ? "border-gold-500 bg-gold-500/5" : "border-transparent bg-surface hover:border-gold-500/20"}`}>
                    <span className="text-lg mt-0.5">{i === 0 ? "\u{1F527}" : i === 1 ? "\u{1F356}" : "\u{1F37A}"}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{s.name}</div>
                      <div className="text-xs text-muted mt-0.5">&bdquo;{s.teamName}&ldquo;</div>
                      {s.extra && <div className="text-xs text-muted">{s.extra}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-heading font-bold text-gold-600">+{(s.bonus / 1000).toFixed(0)}k</div>
                      <div className="text-[10px] text-muted">Kč/sez.</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {namingChoice === "custom" && (
              <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
                placeholder="Dynamo Kebab, FC Kocouři..." maxLength={30} className="input" />
            )}
          </div>

          {/* 2. Barvy dresu */}
          <div>
            <p className="text-label mb-3">Barvy dresu</p>
            <div className="flex gap-6">
              <div>
                <div className="text-xs text-muted mb-2">Hlavní</div>
                <div className="flex gap-1.5 flex-wrap max-w-[210px]">
                  {COLORS.filter((c) => c.hex !== "#FFFFFF").map((c) => (
                    <button key={`p-${c.hex}`} onClick={() => setPrimaryColor(c.hex)} title={c.name}
                      className={`w-7 h-7 rounded-md transition-all hover:scale-110 ${primaryColor === c.hex ? "ring-2 ring-pitch-500 ring-offset-1 scale-110" : ""}`}
                      style={{ backgroundColor: c.hex }} />
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted mb-2">Doplňková</div>
                <div className="flex gap-1.5 flex-wrap max-w-[210px]">
                  {COLORS.map((c) => (
                    <button key={`s-${c.hex}`} onClick={() => setSecondaryColor(c.hex)} title={c.name}
                      className={`w-7 h-7 rounded-md transition-all hover:scale-110 ${c.hex === "#FFFFFF" ? "border border-gray-200" : ""} ${secondaryColor === c.hex ? "ring-2 ring-pitch-500 ring-offset-1 scale-110" : ""}`}
                      style={{ backgroundColor: c.hex }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Vzor dresu */}
          <div>
            <p className="text-label mb-3">Vzor dresu</p>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {JERSEY_PATTERNS.map((jp) => (
                <button key={jp.id} onClick={() => setJerseyPattern(jp.id)}
                  className={`p-2 rounded-xl text-center transition-all border-2 ${jerseyPattern === jp.id ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                  <div className="flex justify-center mb-1">
                    <JerseyPreview primary={primaryColor} secondary={secondaryColor} pattern={jp.id} size={40} />
                  </div>
                  <div className="text-[9px] font-medium text-ink-light leading-tight">{jp.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Znak klubu */}
          <div>
            <p className="text-label mb-3">Znak klubu</p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {BADGE_PATTERNS.map((bp) => (
                <button key={bp.id} onClick={() => setBadgePattern(bp.id)}
                  className={`p-2 rounded-xl text-center transition-all border-2 ${badgePattern === bp.id ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                  <div className="flex justify-center mb-1">
                    <BadgePreview primary={primaryColor} secondary={secondaryColor} pattern={bp.id} initials={initials} size={36} />
                  </div>
                  <div className="text-[9px] font-medium text-ink-light leading-tight">{bp.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 5. Stadion */}
          <div>
            <p className="text-label mb-3">Stadion</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                { key: "classic" as const, icon: "\u{1F3DF}", label: "Klasický" },
                { key: "sponsor" as const, icon: "\u{1F4B0}", label: "Sponzorský" },
                { key: "custom" as const, icon: "\u270F\uFE0F", label: "Vlastní" },
              ]).map((opt) => (
                <button key={opt.key} onClick={() => setStadiumChoice(opt.key)}
                  className={`p-2.5 rounded-xl text-center transition-all border-2 ${stadiumChoice === opt.key ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                  <div className="text-lg mb-0.5">{opt.icon}</div>
                  <div className="text-xs font-semibold">{opt.label}</div>
                </button>
              ))}
            </div>
            {stadiumChoice === "classic" && (
              <div className="grid grid-cols-2 gap-1.5">
                {[`Sportovní areál ${village.name}`, "Stadion Na Hřišti", "Hřiště Pod Lipami", `Sokolovna ${village.name}`].map((name) => (
                  <button key={name} onClick={() => setStadiumName(name)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${stadiumName === name ? "bg-pitch-500 text-white" : "bg-surface hover:bg-pitch-50 text-ink-light"}`}>
                    {name}
                  </button>
                ))}
              </div>
            )}
            {stadiumChoice === "sponsor" && (
              <div className="space-y-2">
                {stadiumSponsors.map((s, i) => (
                  <button key={i} onClick={() => setSelectedStadiumSponsor(i)}
                    className={`w-full p-3 rounded-xl text-left transition-all border-2 flex items-center justify-between ${selectedStadiumSponsor === i ? "border-gold-500 bg-gold-500/5" : "border-transparent bg-surface hover:border-gold-500/20"}`}>
                    <span className="font-semibold text-sm">{s.name}</span>
                    <span className="text-sm font-heading font-bold text-gold-600">+{(s.bonus / 1000).toFixed(0)}k Kč/sez.</span>
                  </button>
                ))}
              </div>
            )}
            {stadiumChoice === "custom" && (
              <input type="text" value={customStadium} onChange={(e) => setCustomStadium(e.target.value)}
                placeholder="Název vašeho stadionu..." maxLength={40} className="input" />
            )}
          </div>
          {/* ── Submit ── */}
          <button
            onClick={() => onSubmit(displayName, primaryColor, secondaryColor, jerseyPattern, badgePattern, displayStadium)}
            disabled={!displayName.trim() || (namingChoice === "sponsor" && selectedSponsor === null)}
            className="btn btn-primary btn-xl w-full"
          >
            Založit tým
          </button>
        </div>

        {/* ══ Right — sticky preview ══ */}
        <div className="hidden lg:block">
          <div className="sticky top-8">
            <div className="card p-6 text-center">
              <div className="flex justify-center mb-2">
                <JerseyPreview primary={primaryColor} secondary={secondaryColor} pattern={jerseyPattern} size={150} />
              </div>
              <div className="flex justify-center mb-3">
                <BadgePreview primary={primaryColor} secondary={secondaryColor} pattern={badgePattern} initials={initials} size={52} />
              </div>
              <div className="font-heading font-bold text-lg text-ink leading-tight">{displayName}</div>
              <div className="text-xs text-muted mt-1">{village.name} &middot; {village.district}</div>
              {displayStadium && (
                <div className="text-xs text-muted mt-1">{"\u{1F3DF}"} {displayStadium}</div>
              )}
              {namingChoice === "sponsor" && selectedSponsor !== null && (
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-heading font-bold text-gold-600 bg-gold-500/10 px-3 py-1 rounded-full">
                  +{(sponsors[selectedSponsor].bonus / 1000).toFixed(0)}k Kč/sezóna
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
