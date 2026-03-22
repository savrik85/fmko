"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, type Village } from "@/lib/api";

const COLOR_PRESETS = [
  "#2D5F2D", "#D94032", "#2563EB", "#F59E0B", "#7C3AED",
  "#0891B2", "#1D4ED8", "#047857", "#B45309", "#1A1A1A",
];

export default function CreatePage() {
  const router = useRouter();
  const [villages, setVillages] = useState<Village[]>([]);
  const [search, setSearch] = useState("");
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const [teamName, setTeamName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2D5F2D");
  const [secondaryColor, setSecondaryColor] = useState("#FFFFFF");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Village[]>("/api/villages").then(setVillages);
  }, []);

  const filtered = search
    ? villages.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))
    : villages;

  async function handleCreate() {
    if (!selectedVillage || !teamName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const result = await apiFetch<{ id: string }>("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          villageId: selectedVillage.id,
          name: teamName,
          primaryColor,
          secondaryColor,
        }),
      });
      router.push(`/team/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <h1 className="text-h1 text-pitch-500 mb-6">Založit tým</h1>

      {/* Step 1: Select village */}
      {!selectedVillage ? (
        <>
          <input
            type="text"
            placeholder="Hledat obec..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-3 rounded-card border border-gray-200 focus:border-pitch-500 focus:outline-none mb-4"
          />
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.map((v) => (
              <button
                key={v.id}
                onClick={() => { setSelectedVillage(v); setTeamName(`SK ${v.name}`); }}
                className="card card-hover w-full p-4 text-left"
              >
                <div className="font-heading font-bold">{v.name}</div>
                <div className="text-sm text-muted">{v.district} &middot; {v.population.toLocaleString("cs")} obyv. &middot; {v.size}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Selected village */}
          <div className="bg-pitch-500/5 rounded-card p-4 mb-6 flex justify-between items-center">
            <div>
              <div className="font-heading font-bold">{selectedVillage.name}</div>
              <div className="text-sm text-muted">{selectedVillage.district} &middot; {selectedVillage.population.toLocaleString("cs")} obyv.</div>
            </div>
            <button onClick={() => setSelectedVillage(null)} className="text-sm text-muted hover:text-pitch-500">Změnit</button>
          </div>

          {/* Team name */}
          <label className="text-sm font-medium text-muted mb-1 block">Název týmu</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full px-4 py-3 rounded-card border border-gray-200 focus:border-pitch-500 focus:outline-none mb-4 font-heading font-bold"
          />

          {/* Colors */}
          <div className="flex gap-6 mb-6">
            <div>
              <div className="text-xs text-muted mb-1">Hlavní</div>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button key={`p${c}`} onClick={() => setPrimaryColor(c)}
                    className={`w-7 h-7 rounded-full ${primaryColor === c ? "ring-2 ring-pitch-500 ring-offset-1" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Doplňková</div>
              <div className="flex gap-1.5 flex-wrap">
                {["#FFFFFF", ...COLOR_PRESETS].map((c) => (
                  <button key={`s${c}`} onClick={() => setSecondaryColor(c)}
                    className={`w-7 h-7 rounded-full border border-gray-200 ${secondaryColor === c ? "ring-2 ring-pitch-500 ring-offset-1" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-card-red text-sm mb-4">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating || !teamName.trim()}
            className="w-full bg-pitch-500 hover:bg-pitch-400 disabled:bg-gray-300 text-white font-heading text-xl font-bold py-4 rounded-card shadow-card transition-all"
          >
            {creating ? "Vytvářím tým..." : `Založit ${teamName}`}
          </button>
        </>
      )}
    </main>
  );
}
