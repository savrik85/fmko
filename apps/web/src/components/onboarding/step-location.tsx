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
    <div className="flex-1 flex flex-col p-5 sm:p-8 w-full max-w-5xl mx-auto">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-label mb-2">Krok 1 ze 3</p>
          <h2 className="text-h1 text-ink">Kde hraješ?</h2>
          <p className="text-muted mt-1">Vyber obec, kde založíš svůj tým</p>
        </div>

        {/* Filters inline on desktop */}
        <div className="flex gap-3 sm:items-center">
          <div className="relative flex-1 sm:w-56">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-light text-sm">&#128269;</span>
            <input
              type="text"
              placeholder="Hledat obec..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 !py-2.5 text-sm"
            />
          </div>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="select"
          >
            <option value="">Všechny kraje</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Village grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-pitch-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filteredVillages.slice(0, 60).map((v) => {
            const s = getSizeLabel(v.size);
            return (
              <button
                key={v.id}
                onClick={() => onSelect({
                  id: v.id, name: v.name, district: v.district,
                  region: v.region, population: v.population, size: v.size,
                })}
                className="card card-hover p-3.5 text-left flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-pitch-500/8 flex items-center justify-center shrink-0">
                  <span className="font-heading font-bold text-pitch-500 text-sm">{v.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink text-sm truncate">{v.name}</div>
                  <div className="text-xs text-muted truncate">{v.district} &middot; {v.population.toLocaleString("cs")}</div>
                </div>
                <span className={`text-[10px] font-heading font-bold shrink-0 ${s.color}`}>{s.label}</span>
              </button>
            );
          })}

          {filteredVillages.length === 0 && !loading && (
            <p className="col-span-full text-center text-muted py-12">Žádná obec nenalezena</p>
          )}
        </div>
      )}

      {filteredVillages.length > 60 && (
        <p className="text-center text-muted py-3 text-xs">
          Zobrazeno 60 z {filteredVillages.length}. Upřesni hledání.
        </p>
      )}
    </div>
  );
}
