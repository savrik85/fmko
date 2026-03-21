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
  base_budget?: number;
};

function getSizeLabel(size: string): { label: string; color: string } {
  switch (size) {
    case "hamlet": return { label: "Hardcore", color: "text-card-red" };
    case "village": return { label: "Výzva", color: "text-gold-600" };
    case "town": return { label: "Dobrý start", color: "text-pitch-400" };
    default: return { label: "Easy", color: "text-pitch-300" };
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

  useEffect(() => {
    apiFetch<Village[]>("/api/villages")
      .then((data) => { setVillages(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const regions = useMemo(() =>
    [...new Set(villages.map((v) => v.region))].sort((a, b) => a.localeCompare(b, "cs")),
  [villages]);

  const filteredVillages = useMemo(() => {
    let result = villages;
    if (selectedRegion) result = result.filter((v) => v.region === selectedRegion);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((v) => v.name.toLowerCase().includes(q));
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [villages, selectedRegion, search]);

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 max-w-xl mx-auto w-full">
      <div className="mb-8">
        <p className="text-label mb-2">Krok 1 ze 3</p>
        <h2 className="text-h1 text-ink">Kde hraješ?</h2>
        <p className="text-muted mt-1">Vyber obec, kde založíš svůj tým</p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-light">&#128269;</span>
        <input
          type="text"
          placeholder="Hledat obec..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-11"
        />
      </div>

      {/* Region filter */}
      <select
        value={selectedRegion}
        onChange={(e) => setSelectedRegion(e.target.value)}
        className="select mb-5"
      >
        <option value="">Všechny kraje</option>
        {regions.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Village list */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-pitch-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
          {filteredVillages.slice(0, 50).map((v) => {
            const s = getSizeLabel(v.size);
            return (
              <button
                key={v.id}
                onClick={() => onSelect({
                  id: v.id, name: v.name, district: v.district,
                  region: v.region, population: v.population, size: v.size,
                })}
                className="card card-hover w-full p-4 text-left flex justify-between items-center"
              >
                <div>
                  <div className="font-semibold text-ink">{v.name}</div>
                  <div className="text-sm text-muted mt-0.5">
                    {v.district} &middot; {v.population.toLocaleString("cs")} obyv.
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <span className={`text-xs font-heading font-bold ${s.color}`}>{s.label}</span>
                </div>
              </button>
            );
          })}

          {filteredVillages.length === 0 && !loading && (
            <p className="text-center text-muted py-12">Žádná obec nenalezena</p>
          )}

          {filteredVillages.length > 50 && (
            <p className="text-center text-muted py-4 text-xs">
              Zobrazeno 50 z {filteredVillages.length}. Upřesni hledání.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
