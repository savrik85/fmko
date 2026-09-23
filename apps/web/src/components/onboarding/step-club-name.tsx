"use client";

import { useState } from "react";
import type { VillageSelection } from "@/app/onboarding/page";

type NamingChoice = "classic" | "custom";

interface Props {
  village: VillageSelection;
  initialTeamName: string;
  onBack: () => void;
  onSubmit: (data: { teamName: string; stadiumName: string }) => void;
}

export function StepClubName({ village, initialTeamName, onBack, onSubmit }: Props) {
  const [namingChoice, setNamingChoice] = useState<NamingChoice>("classic");
  const [teamName, setTeamName] = useState(initialTeamName);
  const [customName, setCustomName] = useState("");

  const [stadiumChoice, setStadiumChoice] = useState<NamingChoice>("classic");
  const [stadiumName, setStadiumName] = useState(`Sportovní areál ${village.name}`);
  const [customStadium, setCustomStadium] = useState("");

  const displayName = namingChoice === "custom" ? (customName || "Můj tým") : teamName;

  const displayStadium = stadiumChoice === "custom" ? (customStadium || "Můj stadion") : stadiumName;

  const canContinue = displayName.trim().length > 0;

  const handleSubmit = () => {
    onSubmit({ teamName: displayName, stadiumName: displayStadium });
  };

  return (
    <div className="flex-1 p-5 sm:p-8 w-full max-w-4xl mx-auto">
      <button onClick={onBack} className="btn btn-ghost btn-sm mb-4 -ml-2">&#8592; Zpět</button>

      <div className="mb-6">
        <p className="text-label mb-2">Krok 3a ze 5</p>
        <h2 className="text-h1 text-ink">Název klubu</h2>
        <p className="text-muted mt-1">{village.name}, {village.district}</p>
      </div>

      <div className="space-y-6">
        {/* Naming choice */}
        <div>
          <p className="text-label mb-3">Název klubu</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "classic" as const, icon: "\u{1F3DB}", label: "Klasický", desc: "Tradiční prefix + název obce" },
              { key: "custom" as const, icon: "\u270F\uFE0F", label: "Vlastní", desc: "Napiš si vlastní název klubu" },
            ].map((opt) => (
              <button key={opt.key} onClick={() => setNamingChoice(opt.key)}
                className={`p-4 rounded-xl text-center transition-all border-2 ${namingChoice === opt.key ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                <div className="text-2xl mb-1">{opt.icon}</div>
                <div className="font-heading font-bold text-sm">{opt.label}</div>
                <div className="text-micro text-muted mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Classic name options */}
        {namingChoice === "classic" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[`SK ${village.name}`, `FK ${village.name}`, `TJ ${village.name}`, `Sokol ${village.name}`, `Slavoj ${village.name}`, `Jiskra ${village.name}`].map((n) => (
              <button key={n} onClick={() => setTeamName(n)}
                className={`p-3 rounded-xl text-sm font-heading font-bold transition-all border-2 ${teamName === n ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                {n}
              </button>
            ))}
          </div>
        )}

        {/* Custom name */}
        {namingChoice === "custom" && (
          <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
            placeholder="Název vašeho klubu..." maxLength={40} className="input" />
        )}

        {/* Stadium */}
        <div>
          <p className="text-label mb-3">Název stadionu</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "classic" as const, icon: "\u{1F3DF}", label: "Klasický", desc: "Sportovní areál + obec" },
              { key: "custom" as const, icon: "\u270F\uFE0F", label: "Vlastní", desc: "Vlastní název" },
            ].map((opt) => (
              <button key={opt.key} onClick={() => setStadiumChoice(opt.key)}
                className={`p-3 rounded-xl text-center transition-all border-2 text-sm ${stadiumChoice === opt.key ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                <div className="text-lg mb-0.5">{opt.icon}</div>
                <div className="font-heading font-bold text-xs">{opt.label}</div>
              </button>
            ))}
          </div>
          {stadiumChoice === "custom" && (
            <input type="text" value={customStadium} onChange={(e) => setCustomStadium(e.target.value)}
              placeholder="Název vašeho stadionu..." maxLength={40} className="input mt-2" />
          )}
        </div>

        <p className="text-sm text-muted">
          Hlavního sponzora do názvu klubu a sponzora stadionu si vyjednáš ve hře na stránce Sponzoři, s majiteli místních firem.
        </p>

        {/* Preview + continue */}
        <div className="card p-4 text-center">
          <div className="font-heading font-[800] text-xl">{displayName}</div>
          <div className="text-sm text-muted mt-1">{displayStadium}</div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canContinue}
          className="btn btn-primary btn-lg w-full"
        >
          Pokračovat na vzhled
        </button>
      </div>
    </div>
  );
}
