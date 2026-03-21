"use client";

import { useState } from "react";
import type { VillageSelection } from "@/app/onboarding/page";

const COLOR_PRESETS = [
  "#2D5F2D", "#D94032", "#2563EB", "#F59E0B", "#7C3AED",
  "#0891B2", "#DC2626", "#1D4ED8", "#047857", "#B45309",
  "#1A1A1A", "#9F1239", "#4338CA", "#0E7490", "#92400E",
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
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      <button onClick={onBack} className="text-muted hover:text-pitch-500 mb-4 text-sm self-start">
        &larr; Zpět na výběr obce
      </button>

      <h2 className="font-heading text-3xl font-bold text-pitch-500 mb-1">
        Tvůj tým
      </h2>
      <p className="text-muted mb-6">{village.name}, {village.district}</p>

      {/* Team name */}
      <label className="text-sm font-medium text-muted mb-2 block">Název týmu</label>
      <input
        type="text"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        className="w-full px-4 py-3 rounded-card border border-gray-200 focus:border-pitch-500 focus:outline-none mb-2 text-base font-heading font-bold text-lg"
      />
      <div className="flex gap-2 mb-6 flex-wrap">
        {TEAM_PREFIXES.map((prefix) => (
          <button
            key={prefix}
            onClick={() => setTeamName(`${prefix} ${village.name}`)}
            className="px-3 py-1 text-xs rounded-full bg-gray-100 hover:bg-pitch-500/10 hover:text-pitch-500 transition-colors"
          >
            {prefix} {village.name}
          </button>
        ))}
      </div>

      {/* Jersey preview */}
      <label className="text-sm font-medium text-muted mb-3 block">Barvy dresu</label>
      <div className="flex items-center gap-8 mb-6">
        {/* SVG Jersey */}
        <svg width="120" height="140" viewBox="0 0 120 140" className="shrink-0">
          {/* Body */}
          <path d="M30,35 L15,50 L15,130 L105,130 L105,50 L90,35 L80,25 C75,22 65,20 60,20 C55,20 45,22 40,25Z"
            fill={primaryColor} stroke="#00000020" strokeWidth="1" />
          {/* Collar */}
          <path d="M40,25 C45,22 55,20 60,20 C65,20 75,22 80,25 L75,30 C70,27 65,25 60,25 C55,25 50,27 45,30Z"
            fill={secondaryColor} />
          {/* Sleeves stripe */}
          <rect x="15" y="50" width="18" height="8" fill={secondaryColor} opacity="0.8" />
          <rect x="87" y="50" width="18" height="8" fill={secondaryColor} opacity="0.8" />
          {/* Number */}
          <text x="60" y="90" textAnchor="middle" fontSize="32" fontWeight="bold"
            fill={secondaryColor} fontFamily="var(--font-heading)" opacity="0.9">
            10
          </text>
        </svg>

        <div className="space-y-4">
          <div>
            <div className="text-xs text-muted mb-1">Hlavní barva</div>
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={`p-${c}`}
                  onClick={() => setPrimaryColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${primaryColor === c ? "ring-2 ring-pitch-500 ring-offset-2 scale-110" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Doplňková barva</div>
            <div className="flex gap-1.5 flex-wrap">
              {["#FFFFFF", ...COLOR_PRESETS].map((c) => (
                <button
                  key={`s-${c}`}
                  onClick={() => setSecondaryColor(c)}
                  className={`w-8 h-8 rounded-full border border-gray-200 transition-transform ${secondaryColor === c ? "ring-2 ring-pitch-500 ring-offset-2 scale-110" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-card shadow-card p-4 mb-6">
        <div className="font-heading font-bold text-lg">{teamName}</div>
        <div className="text-sm text-muted">
          {village.name} &middot; {village.population.toLocaleString("cs")} obyvatel &middot; {village.district}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={() => onSubmit(teamName, primaryColor, secondaryColor)}
        disabled={!teamName.trim()}
        className="w-full bg-pitch-500 hover:bg-pitch-400 disabled:bg-gray-300 text-white font-heading text-xl font-bold py-4 rounded-card shadow-card hover:shadow-hover transition-all"
      >
        Založit {teamName || "tým"}
      </button>
    </div>
  );
}
