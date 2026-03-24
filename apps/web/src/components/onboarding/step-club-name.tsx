"use client";

import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import type { VillageSelection } from "@/app/onboarding/page";

type NamingChoice = "classic" | "sponsor" | "custom";

interface SponsorOffer {
  name: string;
  teamName: string;
  seasonBonus: number;
  seasons: number;
  terminationFee: number;
  type: string;
  tradeoffs: {
    benefits: string[];
    negatives: string[];
  };
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("cs") + " Kč";
}

interface Props {
  village: VillageSelection;
  initialTeamName: string;
  onBack: () => void;
  onSubmit: (data: {
    teamName: string;
    stadiumName: string;
    sponsor?: {
      name: string;
      type: string;
      seasonBonus: number;
      seasons: number;
      terminationFee: number;
      isNamingRights: boolean;
    };
  }) => void;
}

export function StepClubName({ village, initialTeamName, onBack, onSubmit }: Props) {
  const [namingChoice, setNamingChoice] = useState<NamingChoice>("classic");
  const [teamName, setTeamName] = useState(initialTeamName);
  const [customName, setCustomName] = useState("");
  const [selectedSponsor, setSelectedSponsor] = useState<number | null>(null);

  const [stadiumChoice, setStadiumChoice] = useState<NamingChoice>("classic");
  const [stadiumName, setStadiumName] = useState(`Sportovní areál ${village.name}`);
  const [customStadium, setCustomStadium] = useState("");
  const [selectedStadiumSponsor, setSelectedStadiumSponsor] = useState<number | null>(null);

  const [sponsors, setSponsors] = useState<SponsorOffer[]>([]);
  useEffect(() => {
    apiFetch<{ offers: SponsorOffer[] }>(`/api/villages/${village.id}/sponsors`)
      .then((d) => setSponsors(d.offers))
      .catch(() => {});
  }, [village.id]);

  const stadiumSponsors = useMemo(() => {
    if (sponsors.length === 0) return [];
    return sponsors.slice(0, 2).map((s) => ({
      name: `${s.name.replace(/\s*s\.r\.o\.?\s*/gi, "")} Arena`,
      seasonBonus: Math.round(s.seasonBonus * 0.3),
      seasons: s.seasons,
      terminationFee: Math.round(s.terminationFee * 0.3),
    }));
  }, [sponsors]);

  const displayName = namingChoice === "sponsor" && selectedSponsor !== null
    ? sponsors[selectedSponsor].teamName
    : namingChoice === "custom" ? (customName || "Můj tým") : teamName;

  const displayStadium = stadiumChoice === "sponsor" && selectedStadiumSponsor !== null
    ? stadiumSponsors[selectedStadiumSponsor].name
    : stadiumChoice === "custom" ? (customStadium || "Můj stadion") : stadiumName;

  const canContinue = displayName.trim().length > 0;

  const handleSubmit = () => {
    const s = namingChoice === "sponsor" && selectedSponsor !== null ? sponsors[selectedSponsor] : null;
    onSubmit({
      teamName: displayName,
      stadiumName: displayStadium,
      sponsor: s ? {
        name: s.name,
        type: s.type,
        seasonBonus: s.seasonBonus,
        seasons: s.seasons,
        terminationFee: s.terminationFee,
        isNamingRights: true,
      } : undefined,
    });
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
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "classic" as const, icon: "\u{1F3DB}", label: "Klasický", desc: "Tradiční prefix + název obce" },
              { key: "sponsor" as const, icon: "\u{1F4B0}", label: "Sponzorský", desc: "Místní sponzor v názvu = peníze navíc" },
              { key: "custom" as const, icon: "\u270F\uFE0F", label: "Vlastní", desc: "Napiš si vlastní název klubu" },
            ].map((opt) => (
              <button key={opt.key} onClick={() => { setNamingChoice(opt.key); setSelectedSponsor(null); }}
                className={`p-4 rounded-xl text-center transition-all border-2 ${namingChoice === opt.key ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                <div className="text-2xl mb-1">{opt.icon}</div>
                <div className="font-heading font-bold text-sm">{opt.label}</div>
                <div className="text-[11px] text-muted mt-0.5">{opt.desc}</div>
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

        {/* Sponsor options */}
        {namingChoice === "sponsor" && (
          <div className="space-y-2">
            {sponsors.length === 0 ? (
              <p className="text-muted text-sm py-4 text-center">Načítám sponzory...</p>
            ) : sponsors.map((s, i) => (
              <button key={i} onClick={() => setSelectedSponsor(i)}
                className={`w-full text-left p-4 rounded-xl transition-all border-2 ${selectedSponsor === i ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-heading font-bold">{s.name}</div>
                    <div className="text-sm text-muted">&bdquo;{s.teamName}&ldquo;</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-heading font-bold text-gold-600">+{formatMoney(s.seasonBonus)}/sez</div>
                    <div className="text-[11px] text-muted">{s.seasons} {s.seasons === 1 ? "sezóna" : s.seasons <= 4 ? "sezóny" : "sezón"}</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {s.tradeoffs?.benefits.map((b, bi) => <div key={bi} className="text-[11px] text-pitch-500">+ {b}</div>)}
                  {s.tradeoffs?.negatives.map((n, ni) => <div key={ni} className="text-[11px] text-card-red">- {n}</div>)}
                  <div className="text-[11px] text-card-red">- Sankce za zrušení: {formatMoney(s.terminationFee)}</div>
                </div>
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
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "classic" as const, icon: "\u{1F3DF}", label: "Klasický", desc: "Sportovní areál + obec" },
              { key: "sponsor" as const, icon: "\u{1F4B0}", label: "Sponzorský", desc: "Pojmenuj po sponzorovi" },
              { key: "custom" as const, icon: "\u270F\uFE0F", label: "Vlastní", desc: "Vlastní název" },
            ].map((opt) => (
              <button key={opt.key} onClick={() => { setStadiumChoice(opt.key); setSelectedStadiumSponsor(null); }}
                className={`p-3 rounded-xl text-center transition-all border-2 text-sm ${stadiumChoice === opt.key ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"}`}>
                <div className="text-lg mb-0.5">{opt.icon}</div>
                <div className="font-heading font-bold text-xs">{opt.label}</div>
              </button>
            ))}
          </div>
          {stadiumChoice === "sponsor" && stadiumSponsors.length > 0 && (
            <div className="flex gap-2 mt-2">
              {stadiumSponsors.map((s, i) => (
                <button key={i} onClick={() => setSelectedStadiumSponsor(i)}
                  className={`flex-1 p-3 rounded-xl text-left transition-all border-2 ${selectedStadiumSponsor === i ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface"}`}>
                  <div className="font-semibold text-sm">{s.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-heading font-bold text-gold-600">+{formatMoney(s.seasonBonus)}/sez.</span>
                    <span className="text-[11px] text-muted">{s.seasons} {s.seasons === 1 ? "sezóna" : s.seasons <= 4 ? "sezóny" : "sezón"}</span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <div className="text-[11px] text-pitch-500">+ Lepší zázemí stadionu (šatny Lv.1)</div>
                    <div className="text-[11px] text-card-red">- -2 morálka (tradice vs peníze)</div>
                    <div className="text-[11px] text-card-red">- Sankce za zrušení: {formatMoney(s.terminationFee)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {stadiumChoice === "custom" && (
            <input type="text" value={customStadium} onChange={(e) => setCustomStadium(e.target.value)}
              placeholder="Název vašeho stadionu..." maxLength={40} className="input mt-2" />
          )}
        </div>

        {/* Preview + continue */}
        <div className="card p-4 text-center">
          <div className="font-heading font-[800] text-xl">{displayName}</div>
          <div className="text-sm text-muted mt-1">{displayStadium}</div>
          {namingChoice === "sponsor" && selectedSponsor !== null && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-heading font-bold text-gold-600 bg-gold-500/10 px-3 py-1 rounded-full">
              +{formatMoney(sponsors[selectedSponsor].seasonBonus)}/sezóna
            </div>
          )}
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
