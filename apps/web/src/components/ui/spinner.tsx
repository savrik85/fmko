"use client";

import React, { useEffect, useId, useState } from "react";
import { BALL_DELAY_MS, LOADING_QUIPS, SLOW_LOADING_MS, loadingPhase, quipAt } from "./loading-quips";

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

/**
 * Hláška pod míčem: od 1,5 s po připojení, pak střídání (loading-quips.ts). Od 10 s místo ní `slow`.
 * Kdy naskočí sám míč, řídí CSS (animation-delay), aby to platilo i před načtením JS.
 */
function useLoadingQuip(): { quip: string; slow: boolean } {
  const [state, setState] = useState({ quip: "", slow: false });
  useEffect(() => {
    const startedAt = performance.now();
    // Náhoda až v efektu: při renderu na serveru by se hláška lišila od klienta.
    const startIndex = Math.floor(Math.random() * LOADING_QUIPS.length);
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const phase = loadingPhase(elapsed);
      if (phase === "slow") {
        window.clearInterval(timer);
        setState({ quip: "", slow: true });
        return;
      }
      setState({ quip: phase === "quip" ? quipAt(startIndex, elapsed) : "", slow: false });
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  return state;
}

/** Načítání trvá přes 10 s (SLOW_LOADING_MS): do té doby nic, pak `true`. */
function useSlowLoading(): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return slow;
}

const SLOW_TEXT = "Trvá to déle než obvykle.";

/** Zkusit znovu = načíst stránku znovu: nevíme, který z dotazů se zasekl. */
function RetryButton() {
  return (
    <button type="button" onClick={() => window.location.reload()} className="btn btn-secondary btn-sm shrink-0">
      Zkusit znovu
    </button>
  );
}

/**
 * Pro skeletony: po 10 s karta s vysvětlením a tlačítkem „Zkusit znovu“, do té doby nic.
 * Míč má totéž vestavěné místo hlášky.
 */
export function SlowLoadingNotice({ className = "card p-4" }: { className?: string }) {
  const slow = useSlowLoading();
  if (!slow) return null;
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <p className="text-sm text-ink">{SLOW_TEXT}</p>
      <RetryButton />
    </div>
  );
}

/** Skákající míč se stínem a hláškou. Místo zabírá hned, jen je do 300 ms neviditelný. */
function LoadingBall() {
  const { quip, slow } = useLoadingQuip();
  return (
    <div className="loading-indicator" style={{ animationDelay: `${BALL_DELAY_MS}ms` }}>
      <div className="loading-ball">
        <div className="loading-ball-body"><BallIcon /></div>
        <div className="loading-ball-shadow" />
      </div>
      {slow ? (
        <>
          {/* Na rozdíl od hlášek tohle čtečka přečte: hráč má co udělat. */}
          <p className="loading-quip">{SLOW_TEXT}</p>
          <RetryButton />
        </>
      ) : (
        // Hláška jen pro oko: čtečka by ji jinak hlásila každé 2,6 s.
        <p key={quip} className="loading-quip" aria-hidden="true">{quip}</p>
      )}
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
