"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetchBlob } from "@/lib/api";
import { Spinner } from "@/components/ui";

/**
 * Hlasovka od hráče v konverzaci (`messages.metadata.type = "voice"`).
 *
 * Nahrávka se stahuje až na první přehrání, ne s načtením konverzace: hlasovka
 * má kolem megabajtu a většinu starých si nikdo znovu nepustí. Přepis je text
 * zprávy, ze kterého AI bere kontext, když trenér odpoví.
 */
interface VoiceMessageProps {
  teamId: string;
  messageId: string;
  durationSec: number;
  /** Obrys nahrávky 0–1, spočítaný při vytvoření. Bez něj se vykreslí náhradní. */
  peaks?: number[];
  transcript: string;
}

type PlayState = "idle" | "loading" | "playing" | "paused" | "error";

const FALLBACK_BARS = 40;

function fallbackPeaks(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: FALLBACK_BARS }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.25 + ((h >>> 16) % 1000) / 1333;
  });
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VoiceMessage({ teamId, messageId, durationSec, peaks, transcript }: VoiceMessageProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [state, setState] = useState<PlayState>("idle");
  const [progress, setProgress] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const bars = useMemo(() => (peaks && peaks.length > 0 ? peaks : fallbackPeaks(messageId)), [peaks, messageId]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function loadAudio(): Promise<HTMLAudioElement> {
    if (audioRef.current) return audioRef.current;
    const blob = await apiFetchBlob(`/api/teams/${teamId}/voice-messages/${messageId}/audio`);
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const audio = new Audio(url);
    audio.ontimeupdate = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    audio.onplay = () => setState("playing");
    audio.onpause = () => setState("paused");
    audio.onended = () => { setState("paused"); setProgress(0); };
    audioRef.current = audio;
    return audio;
  }

  async function toggle() {
    if (state === "loading") return;
    if (state === "playing") {
      audioRef.current?.pause();
      return;
    }
    if (!audioRef.current) setState("loading");
    try {
      const audio = await loadAudio();
      await audio.play();
    } catch (e) {
      console.error("Hlasovku se nepodařilo přehrát:", e);
      setState("error");
    }
  }

  async function seek(ratio: number) {
    try {
      const audio = await loadAudio();
      if (audio.duration) audio.currentTime = ratio * audio.duration;
      setProgress(ratio);
      if (audio.paused) await audio.play();
    } catch (e) {
      console.error("Posun v hlasovce selhal:", e);
      setState("error");
    }
  }

  const shownTime = state === "idle" ? durationSec : progress * durationSec;

  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={state === "playing" ? "Pozastavit hlasovku" : "Přehrát hlasovku"}
          className="w-10 h-10 shrink-0 rounded-full bg-pitch-500 text-white flex items-center justify-center text-base"
        >
          {state === "loading" ? <Spinner size="sm" /> : state === "playing" ? "⏸" : "▶"}
        </button>
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center gap-[2px] h-8 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
            }}
            role="slider"
            aria-label="Posun v hlasovce"
            aria-valuemin={0}
            aria-valuemax={Math.round(durationSec)}
            aria-valuenow={Math.round(shownTime)}
          >
            {bars.map((h, i) => (
              <span
                key={i}
                className={`flex-1 rounded-full ${(i + 0.5) / bars.length <= progress ? "bg-pitch-500" : "bg-pitch-200"}`}
                style={{ height: `${Math.round(Math.max(0.15, Math.min(1, h)) * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between items-center text-sm text-muted">
            <span>🎤 {formatDuration(shownTime)}</span>
            <button type="button" onClick={() => setShowTranscript((v) => !v)} className="underline">
              {showTranscript ? "Skrýt přepis" : "Přepis"}
            </button>
          </div>
        </div>
      </div>
      {state === "error" && <p className="text-sm text-danger mt-1">Nahrávku se nepodařilo načíst.</p>}
      {showTranscript && <p className="whitespace-pre-wrap mt-1.5 text-sm text-muted italic">{transcript}</p>}
    </div>
  );
}
