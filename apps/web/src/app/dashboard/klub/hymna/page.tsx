"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, SectionLabel } from "@/components/ui";

interface ClubAnthemData {
  name: string;
  anthem: {
    url: string | null;
    lyrics: string | null;
    title: string | null;
    style: string | null;
    attemptsUsed: number;
    attemptsMax: number;
    generating: boolean;
  };
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
  const [club, setClub] = useState<ClubAnthemData | null>(null);
  const [loading, setLoading] = useState(true);

  // Lyrics generation
  const [lyricsMode, setLyricsMode] = useState<"auto" | "custom">("auto");
  const [hints, setHints] = useState("");
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [generatingLyrics, setGeneratingLyrics] = useState(false);

  // Music generation
  const [style, setStyle] = useState(STYLE_PRESETS[0].value);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadClub = async () => {
    if (!teamId) return;
    try {
      const data = await apiFetch<ClubAnthemData>(`/api/teams/${teamId}/club`);
      setClub(data);
      if (data.anthem.title) setTitle(data.anthem.title);
      if (data.anthem.lyrics) setLyrics(data.anthem.lyrics);
      // Pokud je uložený style preset, vybereme ho. Jinak default (první preset).
      if (data.anthem.style) {
        const preset = STYLE_PRESETS.find((p) => p.value === data.anthem.style);
        if (preset) setStyle(preset.value);
      }
      setLoading(false);
    } catch (e) {
      console.error("load club for anthem:", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // Polling stavu generace pokud je generating
  useEffect(() => {
    if (!club?.anthem.generating || !teamId) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    setPollingStatus("Hudba se generuje… (Suno potřebuje 30-90s)");
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ status: string; url?: string; error?: string }>(`/api/teams/${teamId}/club/anthem/status`);
        if (res.status === "completed" && res.url) {
          setPollingStatus(null);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          await loadClub();
        } else if (res.status === "error") {
          setMusicError(res.error || "Generace selhala");
          setPollingStatus(null);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch (e) {
        console.error("poll anthem status:", e);
      }
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.anthem.generating, teamId]);

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
      alert((e as Error).message || "Generace textu selhala");
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
      await loadClub();
    } catch (e) {
      console.error("generate music:", e);
      setMusicError((e as Error).message || "Generace hudby selhala");
    } finally {
      setGeneratingMusic(false);
    }
  }

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  if (!club) return <div className="page-container">Klub nenalezen.</div>;

  const attemptsLeft = Math.max(0, club.anthem.attemptsMax - club.anthem.attemptsUsed);

  return (
    <div className="page-container">
      <div className="mb-5">
        <Link href="/dashboard/klub" className="text-sm text-muted hover:text-ink">← Zpět na Klub</Link>
        <h1 className="font-heading font-extrabold text-2xl text-ink mt-1">Klubová hymna</h1>
        <p className="text-sm text-muted mt-0.5">
          AI vygeneruje text v češtině, poté hudbu. Zbývá {attemptsLeft}/{club.anthem.attemptsMax} pokusů generace hudby.
        </p>
      </div>

      {/* Pokud už je hymna hotová */}
      {club.anthem.url && (
        <Card className="mb-5">
          <CardHeader>
            <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
              <span>{"\u{1F3B5}"}</span> {club.anthem.title || "Hymna"}
            </h2>
          </CardHeader>
          <CardBody>
            <audio controls src={club.anthem.url} className="w-full mb-4">
              Váš prohlížeč nepodporuje audio element.
            </audio>
            {club.anthem.lyrics && (
              <div>
                <SectionLabel>Text hymny</SectionLabel>
                <pre className="whitespace-pre-wrap text-sm text-ink font-mono bg-gray-50 rounded-lg p-3 max-h-[300px] overflow-auto">{club.anthem.lyrics}</pre>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Polling info */}
      {club.anthem.generating && pollingStatus && (
        <Card className="mb-5" variant="dark">
          <CardBody className="flex items-center gap-3">
            <Spinner />
            <div className="text-sm">{pollingStatus}</div>
          </CardBody>
        </Card>
      )}

      {/* Krok 1: Text */}
      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-heading font-bold text-base text-ink">1. Text hymny</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLyricsMode("auto")}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-heading font-bold transition-colors ${
                lyricsMode === "auto" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"
              }`}
            >
              {"\u{1F916}"} Automaticky z klubu
            </button>
            <button
              type="button"
              onClick={() => setLyricsMode("custom")}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-heading font-bold transition-colors ${
                lyricsMode === "custom" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"
              }`}
            >
              {"\u{270F}️"} S vlastními slovy
            </button>
          </div>

          {lyricsMode === "custom" && (
            <div>
              <SectionLabel>Klíčová slova, fráze, téma</SectionLabel>
              <textarea
                value={hints}
                onChange={(e) => setHints(e.target.value.slice(0, 500))}
                placeholder="Např.: Medvědi, hospoda U Lípy, nikdy nezapomeneme, Šumava, bratři Novákové"
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none resize-none"
              />
              <div className="text-xs text-muted mt-1">{hints.length}/500 znaků. AI to zahrne do textu.</div>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateLyrics}
            disabled={generatingLyrics || (lyricsMode === "custom" && !hints.trim())}
            className="px-6 py-2.5 rounded-lg text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors self-start"
          >
            {generatingLyrics ? "Generuji..." : title ? "Vygenerovat znovu" : "Vygenerovat text"}
          </button>

          {(title || lyrics) && (
            <>
              <div>
                <SectionLabel>Název hymny (můžeš upravit)</SectionLabel>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none"
                />
              </div>
              <div>
                <SectionLabel>Text (můžeš upravit)</SectionLabel>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value.slice(0, 3000))}
                  rows={14}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:border-pitch-500 focus:outline-none resize-vertical"
                />
                <div className="text-xs text-muted mt-1">{lyrics.length}/3000 znaků</div>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Krok 2: Hudba */}
      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-heading font-bold text-base text-ink">2. Styl hudby</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STYLE_PRESETS.map((preset) => {
              const active = style === preset.value;
              return (
                <button
                  type="button"
                  key={preset.value}
                  onClick={() => setStyle(preset.value)}
                  className={`px-3 py-2.5 rounded-lg text-sm text-left border-2 transition-all ${
                    active ? "border-pitch-500 bg-pitch-50 text-pitch-700 font-bold" : "border-gray-200 hover:border-gray-300 bg-white text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="text-xs text-muted">Styl posíláme na Suno v angličtině (čeština dělá problémy s citlivými slovy).</div>
        </CardBody>
      </Card>

      {/* Generate button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          Pokusy: <span className="font-bold">{club.anthem.attemptsUsed}/{club.anthem.attemptsMax}</span>.
          {attemptsLeft === 0 && " Vyčerpáno."}
        </div>
        <button
          type="button"
          onClick={handleGenerateMusic}
          disabled={generatingMusic || !title.trim() || !lyrics.trim() || attemptsLeft === 0 || club.anthem.generating}
          className="px-6 py-3 rounded-lg text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors"
        >
          {generatingMusic ? "Odesílám..." : club.anthem.generating ? "Generuji hudbu..." : "\u{1F3A4} Vygenerovat hudbu"}
        </button>
      </div>

      {musicError && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {musicError}
        </div>
      )}
    </div>
  );
}
