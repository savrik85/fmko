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

export function ClubAudioPlayer({ teamName, anthem, chants = [] }: ClubAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [showLyrics, setShowLyrics] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const synthTimerRef = useRef<number | null>(null);

  const tracks = [
    {
      id: "anthem",
      title: anthem?.title || `Hymna klubu ${teamName}`,
      subtitle: "Oficiální klubová hymna",
      url: anthem?.url || null,
      lyrics: anthem?.lyrics || null,
    },
    {
      id: "chant-1",
      title: chants[0]?.text || `Bojovat za ${teamName}!`,
      subtitle: "Chorál z kotle domácích",
      url: chants[0]?.url || null,
      lyrics: chants[0]?.text || `Dneska hrajem doma, body zůstanou u nás! ${teamName} do toho!`,
    },
    {
      id: "chant-2",
      title: chants[1]?.text || "Zelený pažit, naše srdce bije pro klub",
      subtitle: "Zápasové skandování",
      url: chants[1]?.url || null,
      lyrics: chants[1]?.text || "Gól, gól, do sítě gól! Celá vesnice fandí!",
    },
  ];

  const current = tracks[selectedTrack] || tracks[0];

  const startStadiumSynth = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Rhythmic stadium drum cadence (boom - boom - boom boom boom)
      let beat = 0;
      const playDrumBeat = () => {
        if (!audioContextRef.current) return;
        const now = ctx.currentTime;
        
        // Bass Drum Oscillator
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);

        gain.gain.setValueAtTime(volume * 0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);

        // Crowd applause / whisper noise burst
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
        noiseGain.gain.setValueAtTime(volume * 0.15, now);
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
      console.warn("Synth audio error:", e);
    }
  };

  const stopStadiumSynth = () => {
    if (synthTimerRef.current !== null) {
      clearTimeout(synthTimerRef.current);
      synthTimerRef.current = null;
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      stopStadiumSynth();
      setIsPlaying(false);
    } else {
      if (current.url && audioRef.current) {
        audioRef.current.play().catch(() => {
          // If browser blocks or file missing, fallback to stadium synth
          startStadiumSynth();
        });
      } else {
        startStadiumSynth();
      }
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    // Reset playback when switching tracks
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      stopStadiumSynth();
      if (current.url && audioRef.current) {
        audioRef.current.src = current.url;
        audioRef.current.play().catch(() => startStadiumSynth());
      } else {
        startStadiumSynth();
      }
    }
    return () => {
      stopStadiumSynth();
    };
  }, [selectedTrack]);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
      {/* Hidden audio element if URL exists */}
      {current.url && (
        <audio
          ref={audioRef}
          src={current.url}
          onEnded={() => {
            setIsPlaying(false);
            stopStadiumSynth();
          }}
        />
      )}

      {/* Main Play Button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-12 h-12 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-lg shadow-sm hover:scale-105 active:scale-95 transition-transform shrink-0 self-center"
        aria-label={isPlaying ? "Pozastavit přehrávání" : "Spustit přehrávání"}
      >
        <span>{isPlaying ? "⏸" : "▶"}</span>
      </button>

      {/* Track info & Selector */}
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2">
          <select
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(Number(e.target.value))}
            className="text-xs font-heading font-extrabold bg-transparent border-0 cursor-pointer focus:outline-none truncate max-w-[240px]"
          >
            {tracks.map((t, idx) => (
              <option key={t.id} value={idx} className="bg-white dark:bg-neutral-900 text-black dark:text-white">
                {t.title}
              </option>
            ))}
          </select>
          {isPlaying && (
            <span className="flex items-center gap-0.5">
              <span className="w-1 h-3 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-4 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
        <div className="text-[11px] opacity-60 font-heading truncate mt-0.5">
          {current.subtitle}
        </div>
      </div>

      {/* Volume slider & Lyrics toggle */}
      <div className="flex items-center gap-2 shrink-0 self-center sm:self-auto">
        <span className="text-xs opacity-60">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-16 h-1.5 bg-black/20 dark:bg-white/20 rounded-lg cursor-pointer accent-current"
          aria-label="Hlasitost"
        />

        {current.lyrics && (
          <button
            type="button"
            onClick={() => setShowLyrics(!showLyrics)}
            className={`px-2 py-1 rounded text-[11px] font-heading font-bold border transition-colors ${
              showLyrics
                ? "bg-black text-white dark:bg-white dark:text-black border-transparent"
                : "border-black/10 dark:border-white/10 hover:bg-black/5"
            }`}
          >
            Text
          </button>
        )}
      </div>

      {/* Lyrics popover / display */}
      {showLyrics && current.lyrics && (
        <div className="w-full mt-2 pt-2 border-t border-black/10 dark:border-white/10 text-xs font-medium opacity-90 leading-relaxed italic">
          „{current.lyrics}“
        </div>
      )}
    </div>
  );
}
