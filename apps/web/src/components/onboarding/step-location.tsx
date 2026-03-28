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

type Stats = {
  villageCounts: Record<string, number>;
  districtCounts: Record<string, number>;
  regionCounts: Record<string, number>;
};

type Step = "region" | "district" | "village";

function getSizeBadge(size: string): { label: string; bg: string; text: string } {
  switch (size) {
    case "hamlet": return { label: "Hardcore", bg: "bg-card-red/10", text: "text-card-red" };
    case "village": return { label: "Výzva", bg: "bg-gold-500/10", text: "text-gold-600" };
    case "town": return { label: "Dobrý start", bg: "bg-pitch-500/8", text: "text-pitch-500" };
    default: return { label: "Easy", bg: "bg-pitch-100", text: "text-pitch-400" };
  }
}

interface Props {
  onSelect: (village: VillageSelection) => void;
}

export function StepLocation({ onSelect }: Props) {
  const [villages, setVillages] = useState<Village[]>([]);
  const [stats, setStats] = useState<Stats>({ villageCounts: {}, districtCounts: {}, regionCounts: {} });
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("region");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<Village[]>("/api/villages"),
      apiFetch<Stats>("/api/villages/stats").catch(() => ({ villageCounts: {}, districtCounts: {}, regionCounts: {} })),
    ]).then(([v, s]) => {
      setVillages(v);
      setStats(s);
      setLoading(false);
    });
  }, []);

  // Derived data
  const regions = useMemo(() => {
    const map = new Map<string, { count: number; villages: number }>();
    for (const v of villages) {
      const existing = map.get(v.region) || { count: 0, villages: 0 };
      existing.villages++;
      map.set(v.region, existing);
    }
    return [...map.entries()]
      .map(([name, data]) => ({
        name,
        villages: data.villages,
        players: stats.regionCounts[name] ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [villages, stats]);

  const districts = useMemo(() => {
    if (!selectedRegion) return [];
    const map = new Map<string, number>();
    for (const v of villages) {
      if (v.region !== selectedRegion) continue;
      map.set(v.district, (map.get(v.district) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, villageCount]) => ({
        name,
        villages: villageCount,
        players: stats.districtCounts[name] ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [villages, selectedRegion, stats]);

  const districtVillages = useMemo(() => {
    if (!selectedDistrict) return [];
    return villages
      .filter((v) => v.district === selectedDistrict)
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [villages, selectedDistrict]);

  function handleRegion(region: string) {
    setSelectedRegion(region);
    setStep("district");
  }

  function handleDistrict(district: string) {
    setSelectedDistrict(district);
    setStep("village");
  }

  function handleBack() {
    if (step === "village") { setStep("district"); setSelectedDistrict(""); }
    else if (step === "district") { setStep("region"); setSelectedRegion(""); }
  }

  const breadcrumb = step === "region" ? "Vyber kraj" : step === "district" ? selectedRegion : `${selectedRegion} › ${selectedDistrict}`;

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 w-full max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-label mb-2">Krok 1 ze 4</p>
        <h2 className="text-h1 text-ink">Kde hraješ?</h2>
        <p className="text-muted mt-1">{breadcrumb}</p>
      </div>

      {step !== "region" && (
        <button onClick={handleBack} className="btn btn-ghost btn-sm mb-4 -ml-2 self-start">
          &#8592; Zpět
        </button>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20"><Spinner /></div>
      ) : step === "region" ? (
        /* ═══ Region selection ═══ */
        <>
        <div className="bg-pitch-50 border border-pitch-200 rounded-xl px-4 py-3 mb-4 text-sm text-pitch-800 leading-relaxed">
          <span className="font-bold">{"🌱 První testovací sezóna."}</span>{" "}
          {"Pro nejlepší zážitek zvol"} <span className="font-bold">{"Jihočeský kraj → Prachatice"}</span> {"— tento okres má nejvíc personalizovaných dat."}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {regions.map((r) => (
            <button
              key={r.name}
              onClick={() => handleRegion(r.name)}
              className="card card-hover p-4 text-left flex items-center justify-between"
            >
              <div>
                <div className="font-heading font-bold text-base">{r.name}</div>
                <div className="text-sm text-muted">{r.villages} obcí</div>
              </div>
              <div className="text-right">
                <div className={`font-heading font-bold text-lg ${r.players > 0 ? "text-pitch-500" : "text-muted-light"}`}>{r.players}</div>
                <div className="text-[10px] text-muted">hráčů</div>
              </div>
            </button>
          ))}
        </div>
        </>
      ) : step === "district" ? (
        /* ═══ District selection ═══ */
        <>
        <div className="bg-pitch-50 border border-pitch-200 rounded-xl px-4 py-3 mb-4 text-sm text-pitch-800 leading-relaxed">
          <span className="font-bold">{"🌱 První testovací sezóna!"}</span>{" "}
          {"Pro nejlepší zážitek doporučuju okres"} <span className="font-bold">{"Prachatice"}</span> {"— má personalizovaná data (reálná příjmení, místní názvy). Ostatní okresy fungují také, ale s obecnějšími daty. Pokud chceš personalizaci pro svůj okres, dej vědět!"}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {districts.map((d) => (
            <button
              key={d.name}
              onClick={() => handleDistrict(d.name)}
              className="card card-hover p-4 text-left flex items-center justify-between"
            >
              <div>
                <div className="font-heading font-bold text-base">{d.name}</div>
                <div className="text-sm text-muted">{d.villages} obcí</div>
              </div>
              <div className="text-right">
                <div className={`font-heading font-bold text-lg ${d.players > 0 ? "text-pitch-500" : "text-muted-light"}`}>{d.players}</div>
                <div className="text-[10px] text-muted">hráčů</div>
              </div>
            </button>
          ))}
        </div>
        </>
      ) : (
        /* ═══ Village selection ═══ */
        <>
          <p className="text-sm text-muted mb-3">{districtVillages.length} obcí v okrese {selectedDistrict}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {districtVillages.map((v) => {
              const badge = getSizeBadge(v.size);
              const playerCount = stats.villageCounts[v.id] ?? 0;
              return (
                <button
                  key={v.id}
                  onClick={() => onSelect({
                    id: v.id, name: v.name, district: v.district,
                    region: v.region, population: v.population, size: v.size,
                  })}
                  className="card card-hover p-4 text-left flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold text-base truncate">{v.name}</div>
                    <div className="text-sm text-muted">{v.population.toLocaleString("cs")} obyvatel</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {playerCount > 0 && (
                      <div className="text-center">
                        <div className="font-heading font-bold text-pitch-500 text-sm">{playerCount}</div>
                        <div className="text-[9px] text-muted">hráčů</div>
                      </div>
                    )}
                    <span className={`text-[10px] font-heading font-bold px-2 py-1 rounded-md ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
