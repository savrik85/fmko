"use client";

import { useState } from "react";
import type { VillageSelection } from "@/app/onboarding/page";

const COLOR_PRESETS = [
  "#2D5F2D", "#D94032", "#2563EB", "#F59E0B", "#7C3AED",
  "#0891B2", "#1D4ED8", "#047857", "#B45309", "#1A1A1A",
];

const TEAM_PREFIXES = ["SK", "FK", "TJ", "Sokol", "Slavoj", "Spartak", "Jiskra", "FC"];

interface Props {
  village: VillageSelection;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  onBack: () => void;
  onSubmit: (teamName: string, primary: string, secondary: string) => void;
}

export function StepTeam({ village, teamName: initialName, primaryColor: initialPrimary, secondaryColor: initialSecondary, onBack, onSubmit }: Props) {
  const [teamName, setTeamName] = useState(initialName);
  const [primaryColor, setPrimaryColor] = useState(initialPrimary);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondary);

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 max-w-xl mx-auto w-full">
      <button onClick={onBack} className="btn btn-ghost btn-sm self-start mb-4 -ml-2">
        &#8592; Zpět
      </button>

      <div className="mb-8">
        <p className="text-label mb-2">Krok 2 ze 3</p>
        <h2 className="text-h1 text-ink">Tvůj tým</h2>
        <p className="text-muted mt-1">{village.name}, {village.district}</p>
      </div>

      {/* Team name */}
      <div className="mb-4">
        <label className="input-label">Název týmu</label>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="input font-heading font-bold text-lg"
        />
      </div>

      {/* Quick prefix buttons */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {TEAM_PREFIXES.map((prefix) => (
          <button
            key={prefix}
            onClick={() => setTeamName(`${prefix} ${village.name}`)}
            className="btn btn-ghost btn-sm text-xs"
          >
            {prefix} {village.name}
          </button>
        ))}
      </div>

      {/* Jersey preview + colors */}
      <div className="card p-6 mb-8">
        <p className="text-label mb-4">Barvy dresu</p>
        <div className="flex items-start gap-8">
          {/* SVG Jersey */}
          <svg width="100" height="120" viewBox="0 0 120 140" className="shrink-0">
            <path d="M30,35 L15,50 L15,130 L105,130 L105,50 L90,35 L80,25 C75,22 65,20 60,20 C55,20 45,22 40,25Z"
              fill={primaryColor} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
            <path d="M40,25 C45,22 55,20 60,20 C65,20 75,22 80,25 L75,30 C70,27 65,25 60,25 C55,25 50,27 45,30Z"
              fill={secondaryColor} />
            <rect x="15" y="50" width="18" height="8" fill={secondaryColor} opacity="0.8" />
            <rect x="87" y="50" width="18" height="8" fill={secondaryColor} opacity="0.8" />
            <text x="60" y="90" textAnchor="middle" fontSize="32" fontWeight="bold"
              fill={secondaryColor} fontFamily="var(--font-heading)" opacity="0.9">10</text>
          </svg>

          <div className="flex-1 space-y-4">
            <div>
              <div className="text-xs text-muted mb-2 font-medium">Hlavní barva</div>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button key={`p-${c}`} onClick={() => setPrimaryColor(c)}
                    className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${primaryColor === c ? "ring-2 ring-pitch-500 ring-offset-2 scale-110" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-2 font-medium">Doplňková</div>
              <div className="flex gap-2 flex-wrap">
                {["#FFFFFF", ...COLOR_PRESETS].map((c) => (
                  <button key={`s-${c}`} onClick={() => setSecondaryColor(c)}
                    className={`w-8 h-8 rounded-lg border border-black/5 transition-transform hover:scale-110 ${secondaryColor === c ? "ring-2 ring-pitch-500 ring-offset-2 scale-110" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="card p-4 mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-heading font-bold"
          style={{ backgroundColor: primaryColor }}>
          {teamName[0] ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{teamName || "Název týmu"}</div>
          <div className="text-xs text-muted">{village.name} &middot; {village.population.toLocaleString("cs")} obyv.</div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={() => onSubmit(teamName, primaryColor, secondaryColor)}
        disabled={!teamName.trim()}
        className="btn btn-primary btn-lg w-full"
      >
        Založit {teamName || "tým"}
      </button>
    </div>
  );
}
