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

interface Props {
  village: VillageSelection;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  onBack: () => void;
  onSubmit: (teamName: string, primary: string, secondary: string) => void;
}

export function StepTeam({ village, teamName: initialName, primaryColor: initialPrimary, secondaryColor: initialSecondary, onBack, onSubmit }: Props) {
  const [namingChoice, setNamingChoice] = useState<NamingChoice>("classic");
  const [teamName, setTeamName] = useState(initialName);
  const [customName, setCustomName] = useState("");
  const [selectedSponsor, setSelectedSponsor] = useState<number | null>(null);
  const [primaryColor, setPrimaryColor] = useState(initialPrimary);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondary);

  const sponsors = useMemo(() => generateSponsors(village.name), [village.name]);

  const displayName = namingChoice === "sponsor" && selectedSponsor !== null
    ? sponsors[selectedSponsor].teamName
    : namingChoice === "custom" ? (customName || "Můj tým") : teamName;

  return (
    <div className="flex-1 p-5 sm:p-8 w-full max-w-4xl mx-auto">
      <button onClick={onBack} className="btn btn-ghost btn-sm mb-4 -ml-2">&#8592; Zpět</button>

      <div className="mb-6">
        <p className="text-label mb-2">Krok 3 ze 4</p>
        <h2 className="text-h1 text-ink">Tvůj tým</h2>
        <p className="text-muted mt-1">{village.name}, {village.district}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left column — naming + colors */}
        <div className="space-y-6">
          {/* Naming choice */}
          <div>
            <p className="text-label mb-3">Název klubu</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { key: "classic" as const, icon: "\u{1F3DB}", label: "Klasický", desc: "Tradice" },
                { key: "sponsor" as const, icon: "\u{1F4B0}", label: "Sponzorský", desc: "Peníze navíc" },
                { key: "custom" as const, icon: "\u270F\uFE0F", label: "Vlastní", desc: "Tvůj výběr" },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setNamingChoice(opt.key)}
                  className={`p-3 rounded-xl text-center transition-all border-2 ${
                    namingChoice === opt.key
                      ? "border-pitch-500 bg-pitch-500/5"
                      : "border-transparent bg-surface hover:border-pitch-500/20"
                  }`}
                >
                  <div className="text-xl mb-1">{opt.icon}</div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-muted">{opt.desc}</div>
                </button>
              ))}
            </div>

            {/* Classic — prefix buttons */}
            {namingChoice === "classic" && (
              <div>
                <div className="grid grid-cols-4 gap-1.5">
                  {["SK", "FK", "TJ", "Sokol", "Slavoj", "Spartak", "Jiskra", "FC"].map((prefix) => {
                    const name = `${prefix} ${village.name}`;
                    return (
                      <button key={prefix} onClick={() => setTeamName(name)}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                          teamName === name ? "bg-pitch-500 text-white" : "bg-surface hover:bg-pitch-50 text-ink-light"
                        }`}>
                        {prefix}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sponsor — offers */}
            {namingChoice === "sponsor" && (
              <div className="space-y-2">
                {sponsors.map((s, i) => (
                  <button key={i} onClick={() => setSelectedSponsor(i)}
                    className={`w-full p-3 rounded-xl text-left transition-all border-2 flex items-start gap-3 ${
                      selectedSponsor === i ? "border-gold-500 bg-gold-500/5" : "border-transparent bg-surface hover:border-gold-500/20"
                    }`}>
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

            {/* Custom */}
            {namingChoice === "custom" && (
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Dynamo Kebab, FC Kocouři..."
                maxLength={30}
                className="input"
              />
            )}
          </div>

          {/* Colors — compact */}
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
        </div>

        {/* Right column — live preview */}
        <div className="lg:sticky lg:top-8 self-start">
          <div className="card p-6 text-center">
            <svg width="140" height="160" viewBox="0 0 120 140" className="mx-auto mb-4">
              <path d="M30,35 L15,50 L15,130 L105,130 L105,50 L90,35 L80,25 C75,22 65,20 60,20 C55,20 45,22 40,25Z"
                fill={primaryColor} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
              <path d="M40,25 C45,22 55,20 60,20 C65,20 75,22 80,25 L75,30 C70,27 65,25 60,25 C55,25 50,27 45,30Z"
                fill={secondaryColor} />
              <rect x="15" y="50" width="18" height="8" fill={secondaryColor} opacity="0.8" />
              <rect x="87" y="50" width="18" height="8" fill={secondaryColor} opacity="0.8" />
              <text x="60" y="92" textAnchor="middle" fontSize="34" fontWeight="bold"
                fill={secondaryColor} fontFamily="var(--font-heading)" opacity="0.85">10</text>
            </svg>

            <div className="font-heading font-bold text-lg text-ink leading-tight">{displayName}</div>
            <div className="text-xs text-muted mt-1">{village.name} &middot; {village.district}</div>

            {namingChoice === "sponsor" && selectedSponsor !== null && (
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-heading font-bold text-gold-600 bg-gold-500/10 px-3 py-1 rounded-full">
                +{(sponsors[selectedSponsor].bonus / 1000).toFixed(0)}k Kč/sezóna
              </div>
            )}
          </div>

          <button
            onClick={() => onSubmit(displayName, primaryColor, secondaryColor)}
            disabled={!displayName.trim() || (namingChoice === "sponsor" && selectedSponsor === null)}
            className="btn btn-primary btn-lg w-full mt-4"
          >
            Založit tým
          </button>
        </div>
      </div>
    </div>
  );
}
