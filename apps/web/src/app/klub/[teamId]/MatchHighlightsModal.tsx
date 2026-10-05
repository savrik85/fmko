"use client";

import { useState, useEffect } from "react";
import type { ClubWebsiteMatchSummary } from "@okresni-masina/shared";
import { MatchReplayViewer } from "@/components/match/MatchReplayViewer";

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
}: MatchHighlightsModalProps) {
  const matchesList =
    recentMatches.length > 0 ? recentMatches : initialMatch ? [initialMatch] : [];

  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    initialMatch?.id || matchesList[0]?.id || "",
  );

  // Při každém otevření ukázat zápas, na který návštěvník klikl. Dřív se výběr
  // synchronizoval jen při změně ID, takže po přepnutí v okně a znovuotevření
  // stejného zápasu se okno otevřelo na jiném zápase.
  const initialId = initialMatch?.id || matchesList[0]?.id || "";
  useEffect(() => {
    if (isOpen) setSelectedMatchId(initialId);
  }, [isOpen, initialId]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeMatch =
    matchesList.find((m) => m.id === selectedMatchId) || initialMatch || matchesList[0] || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-[#0d1610] text-white border border-white/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top TV Header */}
        <div
          className="px-4 sm:px-6 py-3.5 flex items-center justify-between border-b border-white/10 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}55, #0d1610 90%)`,
          }}
        >
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/90 text-white font-heading font-black text-sm uppercase tracking-wide shadow">
              <span aria-hidden="true">▶</span>
              <span>Záznam utkání</span>
            </span>
            <div className="text-sm font-heading font-bold opacity-80 hidden sm:inline">
              {activeMatch?.round ? `${activeMatch.round}. kolo soutěže` : "Mistrovské utkání"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 hover:text-white font-heading font-bold text-sm transition-colors flex items-center gap-1"
              aria-label="Zavřít přehrávač"
            >
              <span>✕</span>
              <span className="hidden sm:inline">Zavřít</span>
            </button>
          </div>
        </div>

        {/* Match selector if multiple matches are available */}
        {matchesList.length > 1 && (
          <div className="px-4 sm:px-6 py-2.5 bg-black/40 border-b border-white/10 flex items-center gap-2 overflow-x-auto text-sm font-heading shrink-0 scrollbar-thin">
            <span className="opacity-60 shrink-0 font-bold">
              Vybrat zápas:
            </span>
            {matchesList.map((m) => {
              const isSelected = m.id === selectedMatchId;
              const opp = m.opponent.name;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMatchId(m.id)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-amber-500 text-black font-extrabold shadow-md scale-[1.02]"
                      : "bg-white/5 hover:bg-white/15 text-white/80"
                  }`}
                >
                  <span>
                    {m.round ? `${m.round}. kolo: ` : ""}{m.isHome ? "doma s" : "venku s"} {opp}
                  </span>
                  <span className="opacity-75">
                    ({m.scoreHome}:{m.scoreAway})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Modal Body with in-game MatchReplayViewer */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-5">
          {selectedMatchId ? (
            <MatchReplayViewer
              key={selectedMatchId}
              matchId={selectedMatchId}
              onClose={onClose}
              showCloseButton={false}
            />
          ) : (
            <div className="p-12 text-center text-white/60 font-heading">
              <div className="text-4xl mb-2">⚽</div>
              <div>Žádný zápas k přehrání nebyl vybrán.</div>
            </div>
          )}
        </div>

        {/* Footer for mobile / PWA back safety */}
        <div className="px-4 py-2.5 bg-black/50 border-t border-white/10 flex items-center justify-between text-sm font-heading opacity-80 shrink-0">
          <span className="truncate">
            {teamName} · Záznamy zápasů
          </span>
          <button
            type="button"
            onClick={onClose}
            className="hover:underline font-bold text-amber-400 shrink-0 ml-3"
          >
            ✕ Zpět na web
          </button>
        </div>
      </div>
    </div>
  );
}

// Backward-compatible alias
export { MatchHighlightsModal as MatchReplayModal };
