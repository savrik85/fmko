"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, SectionLabel } from "@/components/ui";

interface Anthem {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  url: string | null;
  isSelected: boolean;
  createdAt: string;
  generating: boolean;
}

const STYLE_PRESETS: Array<{ value: string; label: string }> = [
  { value: "czech football anthem, marching tempo, strong male choir, energetic", label: "Klasická fotbalová hymna" },
  { value: "czech folk song, accordion, mixed choir, cheerful tempo", label: "Vesnická lidovka" },
  { value: "czech rock anthem, electric guitar, drums, stadium feeling", label: "Stadium rock" },
  { value: "czech folk ballad, acoustic guitar, male voice, simple accompaniment", label: "Folk / písnička" },
  { value: "czech punk rock, fast tempo, raw vocals, punk energy", label: "Punk / bigbít" },
];

export default function HymnaPage() {
  const { teamId } = useTeam();
  const [loading, setLoading] = useState(true);
  const [anthems, setAnthems] = useState<Anthem[]>([]);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [attemptsUsed, setAttemptsUsed] = useState(0);

  // Lyrics editor
  const [lyricsMode, setLyricsMode] = useState<"auto" | "custom">("auto");
  const [hints, setHints] = useState("");
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [generatingLyrics, setGeneratingLyrics] = useState(false);

  // Music
  const [style, setStyle] = useState(STYLE_PRESETS[0].value);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadAnthems = async () => {
    if (!teamId) return;
    try {
      const res = await apiFetch<{ anthems: Anthem[]; maxAttempts: number; attemptsUsed: number }>(`/api/teams/${teamId}/club/anthem/list`);
      setAnthems(res.anthems);
      setMaxAttempts(res.maxAttempts);
      setAttemptsUsed(res.attemptsUsed);
      setLoading(false);
    } catch (e) {
      console.error("load anthems:", e);
      setLoading(false);
    }
  };

  useEffect(() => { loadAnthems(); /* eslint-disable-next-line */ }, [teamId]);

  // Polling pokud je nějaká generace v průběhu
  useEffect(() => {
    const hasPending = anthems.some((a) => a.generating);
    if (!hasPending || !teamId) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ status: string; messages?: string[] }>(`/api/teams/${teamId}/club/anthem/status`);
        if (res.messages) {
          // Zobrazit chybové zprávy
          for (const m of res.messages) {
            if (m.startsWith("ERROR:")) {
              const parts = m.split(":");
              setMusicError(parts.slice(2).join(":"));
            }
          }
          await loadAnthems();
        }
      } catch (e) {
        console.error("poll anthem:", e);
      }
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line
  }, [anthems, teamId]);

  async function handleGenerateLyrics() {
    if (!teamId || generatingLyrics) return;
    setGeneratingLyrics(true);
    try {
      const res = await apiFetch<{ title: string; lyrics: string }>(`/api/teams/${teamId}/club/anthem/lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: lyricsMode, hints: lyricsMode === "custom" ? hints : undefined }),
      });
      setTitle(res.title);
      setLyrics(res.lyrics);
    } catch (e) {
      console.error("generate lyrics:", e);
      showError("Generace textu selhala", (e as Error).message || "Zkus to prosím znovu.");
    } finally {
      setGeneratingLyrics(false);
    }
  }

  async function handleGenerateMusic() {
    if (!teamId || generatingMusic || !title.trim() || !lyrics.trim()) return;
    setMusicError(null);
    setGeneratingMusic(true);
    try {
      await apiFetch(`/api/teams/${teamId}/club/anthem/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), lyrics: lyrics.trim(), style }),
      });
      await loadAnthems();
      setTitle(""); setLyrics(""); setHints("");
    } catch (e) {
      console.error("generate music:", e);
      setMusicError((e as Error).message || "Generace selhala");
    } finally {
      setGeneratingMusic(false);
    }
  }

  async function handleSelect(anthemId: string) {
    if (!teamId) return;
    try {
      await apiFetch(`/api/teams/${teamId}/club/anthem/${anthemId}/select`, { method: "POST" });
      await loadAnthems();
    } catch (e) {
      console.error("select anthem:", e);
      showError("Výběr selhal", (e as Error).message || "Zkus to prosím znovu.");
    }
  }

  async function handleDelete(anthemId: string) {
    if (!teamId) return;
    if (!confirm("Smazat tuto hymnu? Uvolní tím místo v historii pro novou generaci.")) return;
    try {
      await apiFetch(`/api/teams/${teamId}/club/anthem/${anthemId}`, { method: "DELETE" });
      await loadAnthems();
    } catch (e) {
      console.error("delete anthem:", e);
      showError("Smazání selhalo", (e as Error).message || "Zkus to prosím znovu.");
    }
  }

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;

  const canGenerate = attemptsUsed < maxAttempts;

  return (
    <div className="page-container">
      <div className="mb-5">
        <Link href="/dashboard/klub" className="text-sm text-muted hover:text-ink">← Zpět na Klub</Link>
        <h1 className="font-heading font-extrabold text-2xl text-ink mt-1">Klubová hymna</h1>
      </div>

      <div className="mb-5 p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-ink">
        Na generování hymny máš {maxAttempts} pokusy. Rozmysli si text i styl — pokusy se neobnovují a mazání hymny z historie je nevrací zpět.
        Zbývá <span className="font-bold tabular-nums">{maxAttempts - attemptsUsed}/{maxAttempts}</span>.
      </div>

      {/* Historie hymen */}
      {anthems.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
              <span>{"\u{1F3B5}"}</span> Tvé hymny ({anthems.length})
            </h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            {anthems.map((a) => (
              <div key={a.id} className={`rounded-xl border-2 p-4 transition-colors ${a.isSelected ? "border-pitch-500 bg-pitch-50" : "border-gray-200 bg-white"}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold text-base text-ink truncate">{a.title}</h3>
                      {a.isSelected && <span className="text-[10px] font-bold bg-pitch-500 text-white px-2 py-0.5 rounded-full">AKTUÁLNÍ</span>}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {STYLE_PRESETS.find((p) => p.value === a.style)?.label || a.style}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.url && !a.isSelected && (
                      <button type="button" onClick={() => handleSelect(a.id)}
                        className="text-xs font-heading font-bold text-pitch-600 hover:text-pitch-700 px-3 py-1.5 rounded-lg border border-pitch-200 hover:bg-pitch-50 transition-colors">
                        Vybrat
                      </button>
                    )}
                    <button type="button" onClick={() => handleDelete(a.id)} title="Smazat hymnu"
                      className="text-muted hover:text-card-red text-xl px-2">
                      {"\u{1F5D1}️"}
                    </button>
                  </div>
                </div>
                {a.generating ? (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Spinner /> Hudba se generuje… (30-90s)
                  </div>
                ) : a.url ? (
                  <audio controls src={a.url} className="w-full">
                    Váš prohlížeč nepodporuje audio.
                  </audio>
                ) : (
                  <div className="text-sm text-card-red">Neznámý stav — zkus refresh nebo smazat.</div>
                )}
                <details className="mt-3">
                  <summary className="text-xs text-muted cursor-pointer hover:text-ink">Text hymny</summary>
                  <pre className="whitespace-pre-wrap text-xs text-ink font-mono bg-gray-50 rounded-lg p-3 mt-2 max-h-[200px] overflow-auto">{a.lyrics}</pre>
                </details>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {!canGenerate && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Vyčerpal jsi všechny {maxAttempts} pokusy generace. Hymny v historii si můžeš nadále vybírat / mazat.
        </div>
      )}

      {/* Generator */}
      {canGenerate && (
        <>
          {/* Krok 1: Text */}
          <Card className="mb-4">
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink">{anthems.length === 0 ? "1." : "Nová hymna:"} Text</h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setLyricsMode("auto")}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-heading font-bold transition-colors ${
                    lyricsMode === "auto" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"
                  }`}>
                  {"\u{1F916}"} Automaticky
                </button>
                <button type="button" onClick={() => setLyricsMode("custom")}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-heading font-bold transition-colors ${
                    lyricsMode === "custom" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"
                  }`}>
                  {"\u{270F}️"} S vlastními slovy
                </button>
              </div>

              {lyricsMode === "custom" && (
                <div>
                  <SectionLabel>Klíčová slova, fráze, téma</SectionLabel>
                  <textarea value={hints} onChange={(e) => setHints(e.target.value.slice(0, 500))}
                    placeholder="Např.: Medvědi, hospoda U Lípy, nikdy nezapomeneme, bratři Novákové"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none resize-none" />
                  <div className="text-xs text-muted mt-1">{hints.length}/500 znaků</div>
                </div>
              )}

              <button type="button" onClick={handleGenerateLyrics}
                disabled={generatingLyrics || (lyricsMode === "custom" && !hints.trim())}
                className="px-6 py-2.5 rounded-lg text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors self-start">
                {generatingLyrics ? "Generuji..." : title ? "Vygenerovat znovu" : "Vygenerovat text"}
              </button>

              {(title || lyrics) && (
                <>
                  <div>
                    <SectionLabel>Název hymny</SectionLabel>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
                  </div>
                  <div>
                    <SectionLabel>Text (můžeš upravit)</SectionLabel>
                    <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value.slice(0, 3000))}
                      rows={12}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:border-pitch-500 focus:outline-none resize-vertical" />
                    <div className="text-xs text-muted mt-1">{lyrics.length}/3000 znaků</div>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          {/* Krok 2: Styl */}
          <Card className="mb-4">
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink">{anthems.length === 0 ? "2." : "Nová hymna:"} Styl hudby</h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STYLE_PRESETS.map((preset) => {
                  const active = style === preset.value;
                  return (
                    <button type="button" key={preset.value} onClick={() => setStyle(preset.value)}
                      className={`px-3 py-2.5 rounded-lg text-sm text-left border-2 transition-all ${
                        active ? "border-pitch-500 bg-pitch-50 text-pitch-700 font-bold" : "border-gray-200 hover:border-gray-300 bg-white text-ink"
                      }`}>
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted">
              Pokusy: <span className="font-bold">{attemptsUsed}/{maxAttempts}</span>. Zbývá {maxAttempts - attemptsUsed}.
            </div>
            <button type="button" onClick={handleGenerateMusic}
              disabled={generatingMusic || !title.trim() || !lyrics.trim()}
              className="px-6 py-3 rounded-lg text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors">
              {generatingMusic ? "Odesílám..." : "\u{1F3A4} Vygenerovat hudbu"}
            </button>
          </div>

          {musicError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {musicError}
            </div>
          )}
        </>
      )}
    </div>
  );
}
