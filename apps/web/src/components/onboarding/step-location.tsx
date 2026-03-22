"use client";

import { useState, useMemo, useEffect } from "react";
import type { VillageSelection } from "@/app/onboarding/page";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";

type Village = {
  id: string;
  name: string;
  district: string;
  region: string;
  population: number;
  size: string;
};

function getSizeBadge(size: string): { label: string; emoji: string; bg: string; text: string } {
  switch (size) {
    case "hamlet": return { label: "Hardcore", emoji: "\u{1F525}", bg: "bg-card-red/10", text: "text-card-red" };
    case "village": return { label: "Výzva", emoji: "\u2B50", bg: "bg-gold-500/10", text: "text-gold-600" };
    case "town": return { label: "Dobrý start", emoji: "\u2705", bg: "bg-pitch-500/8", text: "text-pitch-500" };
    default: return { label: "Easy", emoji: "\u{1F7E2}", bg: "bg-pitch-100", text: "text-pitch-400" };
  }
}

function getSizeIcon(size: string): string {
  switch (size) {
    case "hamlet": return "\u{1F3D5}";  // camping (vesnice)
    case "village": return "\u{1F3E0}"; // house (obec)
    case "town": return "\u{1F3D8}";    // houses (městys)
    case "small_city": return "\u{1F3EB}"; // school (malé město)
    case "city": return "\u{1F3D9}";    // cityscape (město)
    default: return "\u{1F3DF}";
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
      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-label mb-2">Krok 1 ze 4</p>
          <h2 className="text-h1 text-ink">Kde hraješ?</h2>
          <p className="text-muted mt-1">Klikni na obec kde chceš založit tým</p>
        </div>

        <div className="flex gap-3 sm:items-center">
          <div className="relative flex-1 sm:w-60">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Hledat obec..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input !py-2.5 pl-10 text-sm"
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

      {/* Count */}
      {!loading && (
        <p className="text-xs text-muted mb-3">
          {filteredVillages.length} {filteredVillages.length === 1 ? "obec" : filteredVillages.length < 5 ? "obce" : "obcí"}
        </p>
      )}

      {/* Village grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredVillages.slice(0, 60).map((v) => {
            const badge = getSizeBadge(v.size);
            const icon = getSizeIcon(v.size);
            return (
              <button
                key={v.id}
                onClick={() => onSelect({
                  id: v.id, name: v.name, district: v.district,
                  region: v.region, population: v.population, size: v.size,
                })}
                className="group bg-surface rounded-xl p-3 text-left flex items-center gap-3 border border-transparent hover:border-pitch-400/30 hover:shadow-hover transition-all active:scale-[0.99]"
              >
                <span className="text-xl shrink-0 w-8 text-center">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink text-sm truncate group-hover:text-pitch-600 transition-colors">{v.name}</div>
                  <div className="text-xs text-muted truncate">{v.district} &middot; {v.population.toLocaleString("cs")} obyv.</div>
                </div>
                <span className={`text-[10px] font-heading font-bold px-2 py-1 rounded-md shrink-0 ${badge.bg} ${badge.text}`}>
                  {badge.label}
                </span>
              </button>
            );
          })}

          {filteredVillages.length === 0 && (
            <p className="col-span-full text-center text-muted py-16">Žádná obec nenalezena</p>
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
