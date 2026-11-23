"use client";

import React, { useEffect, useId, useState } from "react";
import { LOADING_QUIPS, loadingPhase, quipAt, type LoadingPhase } from "./loading-quips";

type SpinnerSize = "sm" | "md" | "lg";

const SEAM_ANGLES = [0, 72, 144, 216, 288];

/**
 * Starý černobílý míč. Vzor u okraje ořezává kruh; id ořezu má každý míč vlastní,
 * jinak by se při víc míčích na stránce vzor rozbil (prohlížeč vezme první definici).
 */
function BallIcon() {
  const clipId = `ball-clip-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}><circle cx="50" cy="50" r="45" /></clipPath>
      </defs>
      <circle cx="50" cy="50" r="46" fill="#FFFFFF" />
      <g clipPath={`url(#${clipId})`} fill="#1A1714" stroke="#1A1714" strokeWidth="3">
        {SEAM_ANGLES.map((angle) => (
          <g key={angle} transform={`rotate(${angle} 50 50)`}>
            <line x1="50" y1="37" x2="50" y2="22" />
            <polygon points="50,22 38.6,13.7 43,0.3 57,0.3 61.4,13.7" stroke="none" />
            <line x1="38.6" y1="13.7" x2="24" y2="22" />
          </g>
        ))}
        <polygon points="50,37 62.4,46 57.6,60.5 42.4,60.5 37.6,46" stroke="none" />
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#1A1714" strokeWidth="4" />
    </svg>
  );
}

/** Malý točící se míček (tlačítka, řádky). Rozměry jako dřívější kolečko, rozložení se nemění. */
export function Spinner({ size = "md" }: { size?: SpinnerSize }) {
  return (
    <span className={`spinner spinner-${size}`}>
      <BallIcon />
    </span>
  );
}

interface LoadingState {
  phase: LoadingPhase;
  quip: string;
}

/** Odpočítává od připojení: do 300 ms nic, pak míč, od 1,5 s hláška (loading-quips.ts). */
function useLoadingPhase(): LoadingState {
  const [state, setState] = useState<LoadingState>({ phase: "hidden", quip: "" });
  useEffect(() => {
    const startedAt = performance.now();
    // Náhoda až v efektu: při renderu na serveru by se hláška lišila od klienta.
    const startIndex = Math.floor(Math.random() * LOADING_QUIPS.length);
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const phase = loadingPhase(elapsed);
      const quip = phase === "quip" ? quipAt(startIndex, elapsed) : "";
      setState((prev) => (prev.phase === phase && prev.quip === quip ? prev : { phase, quip }));
      // Po 100 ms, ať míč naskočí nejpozději ve 0,4 s (při 250 ms to bylo až v 0,55 s).
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  return state;
}

/** Skákající míč se stínem a hláškou. Místo zabírá hned, jen je do 300 ms neviditelný. */
function LoadingBall() {
  const { phase, quip } = useLoadingPhase();
  return (
    <div className={`loading-indicator${phase === "hidden" ? "" : " is-visible"}`}>
      <div className="loading-ball">
        <div className="loading-ball-body"><BallIcon /></div>
        <div className="loading-ball-shadow" />
      </div>
      {/* Hláška jen pro oko: čtečka by ji jinak hlásila každé 2,6 s. */}
      <p key={quip} className="loading-quip" aria-hidden="true">{quip}</p>
    </div>
  );
}

/** Načítá se celá stránka: míč uprostřed horní poloviny obrazovky. */
export function PageLoading() {
  return (
    <div className="page-container flex items-center justify-center min-h-[50vh]" role="status" aria-label="Načítám">
      <LoadingBall />
    </div>
  );
}

/** Načítá se část stránky (karta, záložka). Když byl spinner v kartě, karta zůstává kolem. */
export function SectionLoading() {
  return (
    <div className="flex justify-center py-6" role="status" aria-label="Načítám">
      <LoadingBall />
    </div>
  );
}
