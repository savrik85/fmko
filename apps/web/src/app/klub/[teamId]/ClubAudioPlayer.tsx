"use client";

import { useState, useRef, useEffect } from "react";

interface ClubAudioPlayerProps {
  teamName: string;
  anthem?: {
    url?: string | null;
    title?: string | null;
    lyrics?: string | null;
  } | null;
  chants?: Array<{
    id: string;
    text: string;
    url?: string;
  }>;
}

interface Track {
  id: string;
  title: string;
  subtitle: string;
  url: string | null;
  lyrics: string | null;
}

export function ClubAudioPlayer({ teamName, anthem, chants = [] }: ClubAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [showLyrics, setShowLyrics] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const synthTimerRef = useRef<number | null>(null);
  // Co návštěvník chce (hrát / nehrát). Asynchronní play() se podle toho rozhodne,
  // jestli po selhání spustit bubny; dřív se bubny spustily i po pauze a nešly zastavit.
  const wantPlayRef = useRef(false);
  const volumeRef = useRef(volume);

  // Jen skutečné nahrávky klubu. Když hymna nahrávku nemá, hrají bubny z kotle a píše se to.
  const tracks: Track[] = [
    {
      id: "anthem",
      title: anthem?.title || `Hymna klubu ${teamName}`,
      subtitle: anthem?.url ? "Oficiální klubová hymna" : "Nahrávka hymny zatím chybí, hrají bubny z kotle",
      url: anthem?.url || null,
      lyrics: anthem?.lyrics || null,
    },
    ...chants
      .filter((ch) => ch.url)
      .map((ch, i) => ({
        id: `chant-${ch.id}`,
        title: ch.text.length > 60 ? `${ch.text.slice(0, 57)}…` : ch.text,
        subtitle: i === 0 ? "Chorál z kotle domácích" : "Chorál z kotle",
        url: ch.url ?? null,
        lyrics: ch.text,
      })),
  ];

  const current = tracks[selectedTrack] || tracks[0];

  const stopStadiumSynth = () => {
    if (synthTimerRef.current !== null) {
      clearTimeout(synthTimerRef.current);
      synthTimerRef.current = null;
    }
  };

  const startStadiumSynth = () => {
    // Vždy jen jedna smyčka: případnou běžící nejdřív zastavit
    stopStadiumSynth();
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch((e) => console.warn("přehrávač: AudioContext nejde obnovit", e));
      }

      // Rytmus kotle (bum, bum, bum-bum-bum)
      let beat = 0;
      const playDrumBeat = () => {
        if (!audioContextRef.current || !wantPlayRef.current) return;
        const now = ctx.currentTime;
        const vol = volumeRef.current;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);
        gain.gain.setValueAtTime(Math.max(0.001, vol * 0.45), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);

        const bufferSize = ctx.sampleRate * 0.12;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = "bandpass";
        noiseFilter.frequency.value = 1000;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(Math.max(0.001, vol * 0.15), now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);

        beat = (beat + 1) % 6;
        const delay = beat === 3 || beat === 4 ? 240 : 480;
        synthTimerRef.current = window.setTimeout(playDrumBeat, delay);
      };

      playDrumBeat();
    } catch (e) {
      console.warn("přehrávač: syntetický zvuk selhal", e);
    }
  };

  /** Spustí aktuální stopu. Nahrávka má přednost, bubny jen když nahrávka chybí nebo nejde přehrát. */
  const startCurrent = () => {
    stopStadiumSynth();
    const audio = audioRef.current;
    if (current.url && audio) {
      audio.play().catch((e: unknown) => {
        // Pauza během načítání přeruší play(): to je záměr, ne chyba
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.warn("přehrávač: nahrávku nejde přehrát, hrají bubny", e);
        if (wantPlayRef.current) startStadiumSynth();
      });
    } else {
      startStadiumSynth();
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      wantPlayRef.current = false;
      audioRef.current?.pause();
      stopStadiumSynth();
      setIsPlaying(false);
    } else {
      wantPlayRef.current = true;
      startCurrent();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Přepnutí stopy za běhu: stará stopa skončí, nová začne (src už má <audio> z renderu)
  useEffect(() => {
    if (!wantPlayRef.current) return;
    audioRef.current?.pause();
    startCurrent();
    // startCurrent čte aktuální stopu z renderu; spouštět jen při změně výběru
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack]);

  // Odchod ze stránky: zastavit vše a uvolnit audio kontext
  useEffect(() => () => {
    wantPlayRef.current = false;
    stopStadiumSynth();
    audioContextRef.current?.close().catch((e) => console.warn("přehrávač: zavření AudioContextu selhalo", e));
    audioContextRef.current = null;
  }, []);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
      {current.url && (
        <audio
          ref={audioRef}
          src={current.url}
          onEnded={() => {
            wantPlayRef.current = false;
            setIsPlaying(false);
            stopStadiumSynth();
          }}
        />
      )}

      <button
        type="button"
        onClick={togglePlay}
        className="w-12 h-12 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-lg shadow-sm hover:scale-105 active:scale-95 transition-transform shrink-0 self-center"
        aria-label={isPlaying ? "Pozastavit přehrávání" : "Spustit přehrávání"}
      >
        <span>{isPlaying ? "⏸" : "▶"}</span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {tracks.length > 1 ? (
            <select
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(Number(e.target.value))}
              className="text-sm font-heading font-extrabold bg-transparent border-0 cursor-pointer focus:outline-none truncate max-w-full"
              aria-label="Vybrat skladbu"
            >
              {tracks.map((t, idx) => (
                <option key={t.id} value={idx} className="bg-white dark:bg-neutral-900 text-black dark:text-white">
                  {t.title}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-heading font-extrabold truncate">{current.title}</span>
          )}
          {isPlaying && (
            <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
              <span className="w-1 h-3 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-4 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
        <div className="text-sm opacity-70 font-heading mt-0.5">
          {current.subtitle}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-center sm:self-auto">
        <span className="text-sm opacity-70" aria-hidden="true">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-20 h-1.5 bg-black/20 dark:bg-white/20 rounded-lg cursor-pointer accent-current"
          aria-label="Hlasitost"
        />

        {current.lyrics && (
          <button
            type="button"
            onClick={() => setShowLyrics(!showLyrics)}
            className={`px-2.5 py-1 rounded text-sm font-heading font-bold border transition-colors ${
              showLyrics
                ? "bg-black text-white dark:bg-white dark:text-black border-transparent"
                : "border-black/10 dark:border-white/10 hover:bg-black/5"
            }`}
          >
            Text
          </button>
        )}
      </div>

      {showLyrics && current.lyrics && (
        <div className="w-full mt-2 pt-2 border-t border-black/10 dark:border-white/10 text-sm font-medium opacity-90 leading-relaxed italic whitespace-pre-line">
          „{current.lyrics}“
        </div>
      )}
    </div>
  );
}
