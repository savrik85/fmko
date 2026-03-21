"use client";

import { useState, useEffect } from "react";
import type { VillageSelection } from "@/app/onboarding/page";
import type { Player } from "@/lib/api";

interface Props {
  village: VillageSelection;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  players: Player[];
  onComplete: () => void;
}

const POS_LABEL: Record<string, string> = {
  GK: "Brankář", DEF: "Obránce", MID: "Záložník", FWD: "Útočník",
};

export function StepReveal({ teamName, primaryColor, players, onComplete }: Props) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [isRevealing, setIsRevealing] = useState(true);

  useEffect(() => {
    if (revealedCount >= players.length) {
      setIsRevealing(false);
      return;
    }
    const timer = setTimeout(() => setRevealedCount((c) => c + 1), 500);
    return () => clearTimeout(timer);
  }, [revealedCount, players.length]);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      <h2 className="font-heading text-3xl font-bold text-pitch-500 mb-1">{teamName}</h2>
      <p className="text-muted mb-6">Tady je tvůj kádr!</p>

      <div className="flex-1 overflow-y-auto space-y-3 mb-6">
        {players.slice(0, revealedCount).map((player) => (
          <div key={player.id} className="bg-white rounded-card shadow-card p-4 flex gap-4 items-start">
            <div
              className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white font-heading font-bold text-lg"
              style={{ backgroundColor: primaryColor }}
            >
              {player.first_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-heading font-bold">{player.first_name} {player.last_name}</span>
                {player.nickname && <span className="text-sm text-gold-500">&bdquo;{player.nickname}&ldquo;</span>}
              </div>
              <div className="text-xs text-muted flex gap-2 mt-0.5">
                <span className="bg-pitch-500/10 text-pitch-500 px-1.5 py-0.5 rounded font-heading font-bold">
                  {POS_LABEL[player.position] ?? player.position}
                </span>
                <span>{player.age} let</span>
                <span>&middot;</span>
                <span>{player.lifeContext?.occupation ?? ""}</span>
              </div>
              <p className="text-sm text-muted mt-1.5">{player.description}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-heading font-bold text-2xl tabular-nums" style={{ color: primaryColor }}>{player.overall_rating}</div>
            </div>
          </div>
        ))}
        {isRevealing && <div className="text-center py-4"><div className="inline-block w-6 h-6 border-2 border-pitch-500 border-t-transparent rounded-full animate-spin" /></div>}
      </div>

      {!isRevealing && (
        <button onClick={onComplete} className="w-full bg-pitch-500 hover:bg-pitch-400 text-white font-heading text-xl font-bold py-4 rounded-card shadow-card hover:shadow-hover transition-all">
          Jdeme na to!
        </button>
      )}
    </div>
  );
}
