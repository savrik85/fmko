"use client";

import { useState, useEffect } from "react";
import type { ClubWebsiteMatchSummary, ClubWebsiteMatchHighlight } from "@okresni-masina/shared";

interface MatchHighlightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMatch: ClubWebsiteMatchSummary | null;
  recentMatches?: ClubWebsiteMatchSummary[];
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
}

export function MatchHighlightsModal({
  isOpen,
  onClose,
  initialMatch,
  recentMatches = [],
  teamName,
  primaryColor,
  secondaryColor,
}: MatchHighlightsModalProps) {
  const matchesList = recentMatches.length > 0 ? recentMatches : initialMatch ? [initialMatch] : [];
  const [selectedMatchId, setSelectedMatchId] = useState<string>(initialMatch?.id || matchesList[0]?.id || "");
  const [activeMomentIndex, setActiveMomentIndex] = useState<number>(0);
  const [isAutoplay, setIsAutoplay] = useState<boolean>(false);

  // Sync selected match if initialMatch changes
  useEffect(() => {
    if (initialMatch?.id) {
      setSelectedMatchId(initialMatch.id);
      setActiveMomentIndex(0);
      setIsAutoplay(false);
    }
  }, [initialMatch?.id]);

  const activeMatch = matchesList.find((m) => m.id === selectedMatchId) || initialMatch || matchesList[0] || null;
  const highlights: ClubWebsiteMatchHighlight[] = activeMatch?.highlights || [];
  const currentMoment: ClubWebsiteMatchHighlight | null = highlights[activeMomentIndex] || highlights[0] || null;

  // Autoplay timer
  useEffect(() => {
    if (!isAutoplay || highlights.length <= 1) return;
    const interval = setInterval(() => {
      setActiveMomentIndex((prev) => {
        if (prev >= highlights.length - 1) {
          setIsAutoplay(false);
          return 0;
        }
        return prev + 1;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [isAutoplay, highlights.length]);

  if (!isOpen || !activeMatch) return null;

  const homeTeamName = activeMatch.isHome ? teamName : activeMatch.opponent.name;
  const awayTeamName = activeMatch.isHome ? activeMatch.opponent.name : teamName;

  const handlePrev = () => {
    setIsAutoplay(false);
    setActiveMomentIndex((i) => (i > 0 ? i - 1 : highlights.length - 1));
  };

  const handleNext = () => {
    setIsAutoplay(false);
    setActiveMomentIndex((i) => (i < highlights.length - 1 ? i + 1 : 0));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-[#0f172a] text-white border border-white/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top TV Header */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-white/10"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}44, #0f172a 90%)`,
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/90 text-white font-heading font-black text-[11px] uppercase tracking-wider animate-pulse shadow">
              <span>●</span>
              <span>FK TV SESTŘIH</span>
            </span>
            <div className="text-xs font-heading font-bold opacity-80">
              {activeMatch.round ? `${activeMatch.round}. kolo soutěže` : "Mistrovské utkání"}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
            aria-label="Zavřít"
          >
            ✕
          </button>
        </div>

        {/* Match selector if multiple matches are available */}
        {matchesList.length > 1 && (
          <div className="px-6 py-2.5 bg-black/30 border-b border-white/10 flex items-center gap-2 overflow-x-auto text-xs font-heading">
            <span className="opacity-50 uppercase text-[10px] shrink-0 font-bold">Vybrat zápas:</span>
            {matchesList.map((m) => {
              const isSelected = m.id === selectedMatchId;
              const opp = m.opponent.name;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMatchId(m.id);
                    setActiveMomentIndex(0);
                    setIsAutoplay(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-amber-500 text-black font-extrabold"
                      : "bg-white/5 hover:bg-white/15 text-white/80"
                  }`}
                >
                  <span>{m.isHome ? "vs" : "@"} {opp}</span>
                  <span className="opacity-80">({m.scoreHome}:{m.scoreAway})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Modal Body with TV Broadcast Player */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Score Header */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
            <div className="flex-1 text-right truncate pr-4">
              <span className={`font-heading font-extrabold text-sm sm:text-lg ${activeMatch.isHome ? "text-amber-400" : "text-white"}`}>
                {homeTeamName}
              </span>
            </div>
            <div className="px-5 py-1.5 rounded-xl bg-black/60 border border-white/20 font-heading font-[900] text-2xl sm:text-3xl tabular-nums text-white shrink-0 shadow-inner">
              {activeMatch.scoreHome} : {activeMatch.scoreAway}
            </div>
            <div className="flex-1 text-left truncate pl-4">
              <span className={`font-heading font-extrabold text-sm sm:text-lg ${!activeMatch.isHome ? "text-amber-400" : "text-white"}`}>
                {awayTeamName}
              </span>
            </div>
          </div>

          {highlights.length === 0 ? (
            <div className="p-10 text-center rounded-2xl bg-black/20 border border-white/10 text-white/60 font-heading">
              <div className="text-4xl mb-2">⚽</div>
              <div>K tomuto zápasu zatím není k dispozici podrobný sestřih momentů.</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Virtual Highlight TV Screen */}
              <div className="relative aspect-[16/9] sm:aspect-[2.1/1] w-full rounded-2xl overflow-hidden bg-gradient-to-b from-[#1b3a24] to-[#0e2416] border-2 border-white/15 shadow-2xl flex flex-col justify-between p-4 sm:p-6 select-none">
                {/* Field Markings (SVG overlay) */}
                <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="4%" y="6%" width="92%" height="88%" fill="none" stroke="white" strokeWidth="2" />
                  <line x1="50%" y1="6%" x2="50%" y2="94%" stroke="white" strokeWidth="2" />
                  <circle cx="50%" cy="50%" r="14%" fill="none" stroke="white" strokeWidth="2" />
                  {/* Left box */}
                  <rect x="4%" y="28%" width="16%" height="44%" fill="none" stroke="white" strokeWidth="2" />
                  {/* Right box */}
                  <rect x="80%" y="28%" width="16%" height="44%" fill="none" stroke="white" strokeWidth="2" />
                </svg>

                {/* Broadcast Banner top */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur border border-white/20 font-heading font-extrabold text-xs text-amber-300">
                      ⏱️ {currentMoment?.minute}&apos; MINUTA
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur border border-white/20 font-heading font-bold text-xs uppercase tracking-wide text-white/90">
                      {currentMoment?.type === "goal"
                        ? "⚽ GÓL!"
                        : currentMoment?.type === "card"
                        ? (currentMoment.detail === "red" ? "🟥 ČERVENÁ KARTA" : "🟨 ŽLUTÁ KARTA")
                        : currentMoment?.type === "penalty"
                        ? "🥅 PENALTA"
                        : "💥 KLÍČOVÝ MOMENT"}
                    </span>
                  </div>

                  <span className="text-[11px] font-heading font-bold text-white/60">
                    Moment {activeMomentIndex + 1} z {highlights.length}
                  </span>
                </div>

                {/* Center Pitch Action Visualizer */}
                <div className="relative z-10 flex flex-col items-center justify-center my-auto text-center px-4">
                  <div className="text-4xl sm:text-6xl mb-2 animate-bounce drop-shadow-lg">
                    {currentMoment?.type === "goal" ? "⚽" : currentMoment?.type === "card" ? (currentMoment.detail === "red" ? "🟥" : "🟨") : "💥"}
                  </div>
                  <div className="font-heading font-black text-xl sm:text-2xl text-white drop-shadow-md">
                    {currentMoment?.playerName}
                  </div>
                  <div className="text-xs sm:text-sm text-emerald-200/90 font-heading mt-0.5 font-bold">
                    {currentMoment?.isHome ? homeTeamName : awayTeamName}
                  </div>
                </div>

                {/* Commentary Narrative Box */}
                <div className="relative z-10 p-3 sm:p-4 rounded-xl bg-black/80 backdrop-blur border border-white/20 text-xs sm:text-sm leading-relaxed text-amber-200">
                  <span className="font-heading font-extrabold text-amber-400 mr-2">
                    {currentMoment?.minute}&apos;
                  </span>
                  {currentMoment?.description || "Klíčová akce utkání, která zvedla diváky ze sedadel!"}
                </div>

                {/* Autoplay progress bar */}
                {isAutoplay && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-amber-400 animate-[progress_4.5s_linear_infinite]" />
                  </div>
                )}
              </div>

              {/* Scrubber of key moments */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-heading font-bold opacity-70 px-1">
                  <span>Klíčové momenty sestřihu</span>
                  <span>{highlights.length} záznamů</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                  {highlights.map((h, i) => {
                    const isActive = i === activeMomentIndex;
                    const icon = h.type === "goal" ? "⚽" : h.type === "card" ? (h.detail === "red" ? "🟥" : "🟨") : "💥";
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setIsAutoplay(false);
                          setActiveMomentIndex(i);
                        }}
                        className={`px-3 py-2 rounded-xl border text-xs font-heading font-bold shrink-0 transition-all flex items-center gap-2 ${
                          isActive
                            ? "bg-amber-500 text-black border-amber-400 shadow-lg scale-105"
                            : "bg-black/30 border-white/10 hover:border-white/30 text-white/80"
                        }`}
                      >
                        <span>{icon}</span>
                        <span>{h.minute}&apos;</span>
                        <span className="truncate max-w-[120px]">{h.playerName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Player Controls */}
              <div className="p-4 rounded-2xl bg-black/30 border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-heading font-bold text-xs transition"
                  >
                    ◀ Předchozí
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-heading font-bold text-xs transition"
                  >
                    Další ▶
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAutoplay(!isAutoplay)}
                  className={`px-4 py-2 rounded-xl font-heading font-extrabold text-xs shadow transition flex items-center gap-1.5 ${
                    isAutoplay
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-emerald-500 hover:bg-emerald-400 text-black"
                  }`}
                >
                  <span>{isAutoplay ? "⏸ Pozastavit sestřih" : "▶ Přehrát celý sestřih"}</span>
                </button>
              </div>

              {/* Text Summary of all moments */}
              <div className="pt-2">
                <h4 className="text-xs uppercase font-heading font-bold opacity-60 mb-2">
                  Zápis všech klíčových událostí
                </h4>
                <div className="space-y-2">
                  {highlights.map((h, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setIsAutoplay(false);
                        setActiveMomentIndex(i);
                      }}
                      className={`p-3 rounded-xl border text-xs flex items-center gap-3 transition cursor-pointer ${
                        i === activeMomentIndex
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                          : "bg-black/20 border-white/5 hover:border-white/20 text-white/80"
                      }`}
                    >
                      <span className="font-heading font-black tabular-nums w-8 text-right opacity-80">
                        {h.minute}&apos;
                      </span>
                      <span className="text-base">
                        {h.type === "goal" ? "⚽" : h.type === "card" ? (h.detail === "red" ? "🟥" : "🟨") : "💥"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <strong className="font-heading font-bold text-white block">
                          {h.playerName} ({h.isHome ? homeTeamName : awayTeamName})
                        </strong>
                        <span className="opacity-75 line-clamp-1">{h.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-black/40 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-heading font-bold text-xs transition"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
