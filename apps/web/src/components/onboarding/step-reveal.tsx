"use client";

import { useState, useEffect, useCallback } from "react";
import type { VillageSelection } from "@/app/onboarding/page";
import type { Player } from "@/lib/api";
import { PlayerRevealCard } from "@/components/players/reveal-card";

interface Props {
  village: VillageSelection;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  players: Player[];
  onComplete: () => void;
}

export function StepReveal({ teamName, primaryColor, players, onComplete }: Props) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (skipped) {
      setRevealedCount(players.length);
      setIsComplete(true);
      return;
    }
    if (revealedCount >= players.length) {
      setIsComplete(true);
      return;
    }
    const t = setTimeout(() => setRevealedCount((c) => c + 1), 500);
    return () => clearTimeout(t);
  }, [revealedCount, players.length, skipped]);

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-label mb-2">Krok 4 ze 4</p>
          <h2 className="text-h1 text-ink">{teamName}</h2>
          <p className="text-muted mt-1">
            {isComplete
              ? `${players.length} hráčů v kádru`
              : `Odhalování kádru... ${revealedCount}/${players.length}`}
          </p>
        </div>

        {!isComplete && (
          <button onClick={() => setSkipped(true)} className="btn btn-ghost btn-sm">
            Přeskočit &#8594;
          </button>
        )}
      </div>

      {/* Progress bar */}
      {!isComplete && (
        <div className="h-1 bg-pitch-500/10 rounded-full mb-6 overflow-hidden">
          <div className="h-full bg-pitch-500 rounded-full transition-all duration-300"
            style={{ width: `${(revealedCount / players.length) * 100}%` }} />
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-8">
        {players.slice(0, revealedCount).map((player, i) => (
          <PlayerRevealCard
            key={player.id || i}
            player={player}
            teamColor={primaryColor}
            delay={0}
          />
        ))}

        {/* Placeholder cards for unrevealed */}
        {!isComplete && Array.from({ length: Math.min(3, players.length - revealedCount) }).map((_, i) => (
          <div key={`ph-${i}`}
            className="aspect-[3/4] rounded-2xl border-2 border-dashed border-pitch-500/10 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-pitch-500/20 border-t-pitch-500/60 animate-spin" />
          </div>
        ))}
      </div>

      {/* CTA */}
      {isComplete && (
        <div className="text-center animate-slide-up">
          <p className="text-muted mb-4">Tvůj kádr je kompletní!</p>
          <button onClick={onComplete} className="btn btn-primary btn-xl">
            Jdeme na to! &#8594;
          </button>
        </div>
      )}
    </div>
  );
}
