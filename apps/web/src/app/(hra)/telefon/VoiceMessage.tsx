"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetchBlob } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

/**
 * Hlasovka v konverzaci (`messages.metadata.type = "voice"`), vzhledem jako hlasová
 * zpráva ve WhatsAppu: přehrávání, vlnovka s puntíkem, délka a u příchozí fotka
 * odesílatele s mikrofonem.
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
  /** Verze nahrávky. Po přehrání se mění adresa, jinak by prohlížeč hrál starou z mezipaměti. */
  rev?: number;
  /** Moje hlasovka (zelená bublina vpravo). */
  outgoing?: boolean;
  /** Obličej odesílatele příchozí hlasovky. */
  avatar?: Record<string, unknown> | null;
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

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
  );
}

function MicBadge() {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-white flex items-center justify-center" aria-hidden>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="#00A884"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z" /></svg>
    </span>
  );
}

export function VoiceMessage({ teamId, messageId, durationSec, peaks, transcript, rev, outgoing, avatar }: VoiceMessageProps) {
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
    const blob = await apiFetchBlob(`/api/teams/${teamId}/voice-messages/${messageId}/audio?v=${rev ?? 1}`);
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

  const shownTime = state === "idle" || state === "loading" ? durationSec : progress * durationSec;
  const played = "bg-[#00A884]";
  const unplayed = outgoing ? "bg-[#9DC79A]" : "bg-[#C5CDD2]";

  return (
    <div className="w-[236px] max-w-full">
      <div className="flex items-center gap-2">
        {!outgoing && avatar && Object.keys(avatar).length > 2 && (
          <div className="relative shrink-0">
            <FaceAvatar faceConfig={avatar} size={44} className="rounded-full" />
            <MicBadge />
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={state === "playing" ? "Pozastavit hlasovku" : "Přehrát hlasovku"}
          className="w-8 h-8 shrink-0 flex items-center justify-center text-[#54656F]"
        >
          {state === "loading" ? <Spinner size="sm" /> : <PlayIcon playing={state === "playing"} />}
        </button>
        <div className="flex-1 min-w-0 pt-2">
          <div
            className="relative flex items-center gap-[2px] h-6 cursor-pointer"
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
                className={`flex-1 rounded-full ${(i + 0.5) / bars.length <= progress ? played : unplayed}`}
                style={{ height: `${Math.round(Math.max(0.18, Math.min(1, h)) * 100)}%` }}
              />
            ))}
            {/* Puntík jako ve WhatsAppu ukazuje, kde se právě hraje. */}
            <span
              className="absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-[#00A884] shadow"
              style={{ left: `${Math.round(progress * 1000) / 10}%` }}
              aria-hidden
            />
          </div>
          <div className="text-sm text-[#667781] tabular-nums mt-0.5">{formatDuration(shownTime)}</div>
        </div>
      </div>
      {state === "error" && <p className="text-sm text-card-red mt-1">Nahrávku se nepodařilo načíst.</p>}
      <button type="button" onClick={() => setShowTranscript((v) => !v)} className="text-sm text-[#027EB5] mt-1">
        {showTranscript ? "Skrýt přepis" : "Přepis"}
      </button>
      {/* Místo na konci posledního řádku pro čas zprávy, který bublina kreslí vpravo dole. */}
      {showTranscript && (
        <p className="whitespace-pre-wrap mt-0.5 text-sm text-[#3B4A54]">
          {transcript}
          <span className="inline-block w-[4.5rem]" aria-hidden />
        </p>
      )}
    </div>
  );
}
