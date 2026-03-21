"use client";

import { useState, useMemo, useEffect } from "react";
import type { VillageSelection } from "@/app/onboarding/page";
import { apiFetch } from "@/lib/api";

type Village = {
  id: string;
  name: string;
  code?: string;
  district: string;
  district_code?: string;
  region: string;
  region_code?: string;
  population: number;
  size: string;
  category?: string;
  pitch_type?: string;
  base_budget: number;
};

function getDifficultyStars(size: string): string {
  switch (size) {
    case "hamlet": return "\u2B50\u2B50\u2B50 Hardcore";
    case "village": return "\u2B50\u2B50 Výzva";
    case "town": return "\u2705 Dobrý start";
    case "small_city": return "\u{1F7E2} Easy mode";
    case "city": return "\u{1F7E2} Easy mode";
    default: return "";
  }
}

interface Props {
  onSelect: (village: VillageSelection) => void;
}

export function StepLocation({ onSelect }: Props) {
  const [villages, setVillages] = useState<Village[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");

  useEffect(() => {
    apiFetch<Village[]>("/api/villages")
      .then((data) => { setVillages(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const regions = useMemo(() =>
    [...new Map(villages.map((v) => [v.region, v.region])).entries()]
      .map(([, name]) => ({ code: name, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "cs")),
  [villages]);

  const districts = useMemo(() => {
    if (!selectedRegion) return [];
    const filtered = villages.filter((v) => v.region === selectedRegion);
    return [...new Map(filtered.map((v) => [v.district, v.district])).entries()]
      .map(([, name]) => ({ code: name, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [selectedRegion, villages]);

  const filteredVillages = useMemo(() => {
    let result = villages;
    if (selectedRegion) result = result.filter((v) => v.region === selectedRegion);
    if (selectedDistrict) result = result.filter((v) => v.district === selectedDistrict);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((v) => v.name.toLowerCase().includes(q));
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [selectedRegion, selectedDistrict, search]);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      <h2 className="font-heading text-3xl font-bold text-pitch-500 mb-1">
        Kde hraješ?
      </h2>
      <p className="text-muted mb-6">Vyber obec, kde založíš svůj tým.</p>

      {/* Search */}
      <input
        type="text"
        placeholder="Hledat obec..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-3 rounded-card border border-gray-200 focus:border-pitch-500 focus:outline-none mb-4 text-base"
      />

      {/* Region filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select
          value={selectedRegion}
          onChange={(e) => { setSelectedRegion(e.target.value); setSelectedDistrict(""); }}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
        >
          <option value="">Všechny kraje</option>
          {regions.map((r) => (
            <option key={r.code} value={r.code}>{r.name}</option>
          ))}
        </select>

        {districts.length > 0 && (
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="">Všechny okresy</option>
            {districts.map((d) => (
              <option key={d.code} value={d.code}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Village list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredVillages.slice(0, 50).map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect({
              id: v.id,
              name: v.name,
              district: v.district,
              region: v.region,
              population: v.population,
              size: v.size,
            })}
            className="w-full bg-white rounded-card shadow-card hover:shadow-hover p-4 text-left transition-all flex justify-between items-center"
          >
            <div>
              <div className="font-heading font-bold text-lg">{v.name}</div>
              <div className="text-sm text-muted">
                {v.district} &middot; {v.population.toLocaleString("cs")} obyvatel
              </div>
            </div>
            <div className="text-xs text-right">
              <div>{getDifficultyStars(v.size)}</div>
              <div className="text-muted mt-1">
                {v.pitch_type === "hlinak" ? "Hlinkak" : v.pitch_type === "trava" ? "Trava" : "Umelka"}
              </div>
            </div>
          </button>
        ))}

        {filteredVillages.length === 0 && (
          <p className="text-center text-muted py-8">Zádná obec nenalezena</p>
        )}

        {filteredVillages.length > 50 && (
          <p className="text-center text-muted py-4 text-sm">
            Zobrazeno 50 z {filteredVillages.length} obcí. Zúži hledání.
          </p>
        )}
      </div>
    </div>
  );
}
