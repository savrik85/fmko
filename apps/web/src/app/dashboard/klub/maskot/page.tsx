"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, SectionLabel } from "@/components/ui";

interface Mascot {
  id: string;
  name: string;
  animal: string;
  style: string;
  story: string | null;
  imageUrl: string | null;
  isSelected: boolean;
  createdAt: string;
}

const ANIMALS: Array<{ value: string; label: string; emoji: string }> = [
  { value: "bear", label: "Medvěd", emoji: "\u{1F43B}" },
  { value: "lion", label: "Lev", emoji: "\u{1F981}" },
  { value: "eagle", label: "Orel", emoji: "\u{1F985}" },
  { value: "wolf", label: "Vlk", emoji: "\u{1F43A}" },
  { value: "boar", label: "Kanec", emoji: "\u{1F417}" },
  { value: "deer", label: "Jelen", emoji: "\u{1F98C}" },
  { value: "horse", label: "Kůň", emoji: "\u{1F434}" },
  { value: "rooster", label: "Kohout", emoji: "\u{1F413}" },
  { value: "dog", label: "Pes", emoji: "\u{1F415}" },
  { value: "cow", label: "Kráva", emoji: "\u{1F404}" },
  { value: "bull", label: "Býk", emoji: "\u{1F402}" },
  { value: "fox", label: "Liška", emoji: "\u{1F98A}" },
  { value: "dragon", label: "Drak", emoji: "\u{1F409}" },
  { value: "pepper", label: "Paprička", emoji: "\u{1F336}️" },
  { value: "tree", label: "Strom", emoji: "\u{1F332}" },
  { value: "pirate", label: "Pirát", emoji: "\u{1F3F4}‍☠️" },
  { value: "jester", label: "Šašek", emoji: "\u{1F921}" },
  { value: "human", label: "Lidská postava", emoji: "\u{1F9D1}" },
];

const STYLES: Array<{ value: string; label: string; desc: string }> = [
  { value: "cartoon", label: "Cartoon (Disney/Pixar)", desc: "Kulaté tvary, výrazné oči" },
  { value: "sports_mascot", label: "Sportovní maskot", desc: "NBA styl, hravý, dynamický" },
  { value: "retro_80s", label: "Retro 80s", desc: "Vintage, jednoduché linky" },
  { value: "watercolor", label: "Akvarel", desc: "Měkké pastelové barvy" },
  { value: "minimalist", label: "Minimalistický", desc: "Flat design, 2-3 barvy" },
];

export default function MaskotPage() {
  const { teamId } = useTeam();
  const [loading, setLoading] = useState(true);
  const [mascots, setMascots] = useState<Mascot[]>([]);
  const [maxAttempts, setMaxAttempts] = useState(3);

  const [name, setName] = useState("");
  const [animal, setAnimal] = useState("bear");
  const [style, setStyle] = useState("cartoon");
  const [generating, setGenerating] = useState(false);
  const [storyLoading, setStoryLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMascots = async () => {
    if (!teamId) return;
    try {
      const res = await apiFetch<{ mascots: Mascot[]; maxAttempts: number }>(`/api/teams/${teamId}/club/mascot/list`);
      setMascots(res.mascots);
      setMaxAttempts(res.maxAttempts);
      setLoading(false);
    } catch (e) {
      console.error("load mascots:", e);
      setLoading(false);
    }
  };

  useEffect(() => { loadMascots(); /* eslint-disable-next-line */ }, [teamId]);

  async function handleGenerate() {
    if (!teamId || generating || !name.trim()) return;
    setError(null);
    setGenerating(true);
    try {
      await apiFetch(`/api/teams/${teamId}/club/mascot/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), animal, style }),
      });
      setName("");
      await loadMascots();
    } catch (e) {
      console.error("generate mascot:", e);
      setError((e as Error).message || "Generace selhala");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSelect(mascotId: string) {
    if (!teamId) return;
    try {
      await apiFetch(`/api/teams/${teamId}/club/mascot/${mascotId}/select`, { method: "POST" });
      await loadMascots();
    } catch (e) {
      console.error("select mascot:", e);
      alert((e as Error).message || "Výběr selhal");
    }
  }

  async function handleDelete(mascotId: string) {
    if (!teamId) return;
    if (!confirm("Smazat tohoto maskota?")) return;
    try {
      await apiFetch(`/api/teams/${teamId}/club/mascot/${mascotId}`, { method: "DELETE" });
      await loadMascots();
    } catch (e) {
      console.error("delete mascot:", e);
      alert((e as Error).message || "Smazání selhalo");
    }
  }

  async function handleGenerateStory(mascotId: string) {
    if (!teamId || storyLoading) return;
    setStoryLoading(mascotId);
    try {
      await apiFetch(`/api/teams/${teamId}/club/mascot/${mascotId}/story`, { method: "POST" });
      await loadMascots();
    } catch (e) {
      console.error("generate story:", e);
      alert((e as Error).message || "Generace příběhu selhala");
    } finally {
      setStoryLoading(null);
    }
  }

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;

  const canGenerate = mascots.length < maxAttempts;

  return (
    <div className="page-container">
      <div className="mb-5">
        <Link href="/dashboard/klub" className="text-sm text-muted hover:text-ink">← Zpět na Klub</Link>
        <h1 className="font-heading font-extrabold text-2xl text-ink mt-1">Klubový maskot</h1>
        <p className="text-sm text-muted mt-0.5">
          AI vygeneruje obrázek maskota ({mascots.length}/{maxAttempts} v historii). Vyber jednoho jako aktuálního.
        </p>
      </div>

      {/* Galerie */}
      {mascots.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
              <span>{"\u{1F9F8}"}</span> Tví maskoti ({mascots.length}/{maxAttempts})
            </h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mascots.map((m) => {
                const animalLabel = ANIMALS.find((a) => a.value === m.animal)?.label ?? m.animal;
                const styleLabel = STYLES.find((s) => s.value === m.style)?.label ?? m.style;
                return (
                  <div key={m.id} className={`rounded-xl border-2 overflow-hidden transition-colors ${m.isSelected ? "border-pitch-500" : "border-gray-200"}`}>
                    {m.imageUrl && (
                      <div className="relative bg-gray-50 aspect-square">
                        <img src={m.imageUrl} alt={m.name} className="w-full h-full object-contain" />
                        {m.isSelected && (
                          <span className="absolute top-2 left-2 text-[10px] font-bold bg-pitch-500 text-white px-2 py-0.5 rounded-full">AKTUÁLNÍ</span>
                        )}
                      </div>
                    )}
                    <div className="p-3">
                      <h3 className="font-heading font-bold text-ink text-base truncate">{m.name}</h3>
                      <div className="text-xs text-muted mt-0.5">{animalLabel} · {styleLabel}</div>
                      {m.story && (
                        <p className="text-xs text-ink/80 mt-2 italic">&ldquo;{m.story}&rdquo;</p>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        {!m.isSelected && (
                          <button type="button" onClick={() => handleSelect(m.id)}
                            className="flex-1 text-xs font-heading font-bold text-pitch-600 hover:text-pitch-700 px-3 py-1.5 rounded-lg border border-pitch-200 hover:bg-pitch-50 transition-colors">
                            Vybrat
                          </button>
                        )}
                        {!m.story && (
                          <button type="button" onClick={() => handleGenerateStory(m.id)} disabled={storyLoading === m.id}
                            className="flex-1 text-xs font-heading font-bold text-ink hover:text-pitch-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-pitch-50 transition-colors disabled:opacity-50">
                            {storyLoading === m.id ? "..." : "+ Příběh"}
                          </button>
                        )}
                        <button type="button" onClick={() => handleDelete(m.id)} title="Smazat"
                          className="text-muted hover:text-card-red text-lg px-1">
                          {"\u{1F5D1}️"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {!canGenerate && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Máš {maxAttempts}/{maxAttempts} maskotů. Pro novou generaci smaž některého.
        </div>
      )}

      {/* Generator */}
      {canGenerate && (
        <Card className="mb-4">
          <CardHeader>
            <h2 className="font-heading font-bold text-base text-ink">{mascots.length === 0 ? "Vytvořit maskota" : "Další maskot"}</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div>
              <SectionLabel>Jméno maskota</SectionLabel>
              <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 50))}
                placeholder="např. Medvěd Bohuš, Ryska, Hot Pepper Joe"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
            </div>

            <div>
              <SectionLabel>Typ bytosti</SectionLabel>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {ANIMALS.map((a) => {
                  const active = animal === a.value;
                  return (
                    <button type="button" key={a.value} onClick={() => setAnimal(a.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                        active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}>
                      <span className="text-2xl leading-none">{a.emoji}</span>
                      <span className={`text-[10px] font-medium text-center ${active ? "text-pitch-700 font-bold" : "text-muted"}`}>{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <SectionLabel>Styl</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STYLES.map((s) => {
                  const active = style === s.value;
                  return (
                    <button type="button" key={s.value} onClick={() => setStyle(s.value)}
                      className={`px-3 py-2.5 rounded-lg text-sm text-left border-2 transition-all ${
                        active ? "border-pitch-500 bg-pitch-50 text-pitch-700 font-bold" : "border-gray-200 hover:border-gray-300 bg-white text-ink"
                      }`}>
                      <div>{s.label}</div>
                      <div className={`text-[11px] ${active ? "text-pitch-600" : "text-muted"} font-normal`}>{s.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button type="button" onClick={handleGenerate}
              disabled={generating || !name.trim()}
              className="px-6 py-3 rounded-lg text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors self-start">
              {generating ? "Generuji obrázek... (5-10s)" : "\u{1F3A8} Vygenerovat maskota"}
            </button>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
