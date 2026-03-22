"use client";

import { useState, useEffect } from "react";
import type { Player } from "@/lib/api";

interface RevealCardProps {
  player: Player;
  teamColor: string;
  delay?: number;
  onRevealed?: () => void;
}

const POS_SHORT: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_FULL: Record<string, string> = { GK: "Brankář", DEF: "Obránce", MID: "Záložník", FWD: "Útočník" };

function getRatingColor(rating: number): string {
  if (rating >= 70) return "#C4A035"; // gold
  if (rating >= 50) return "#3A7A3A"; // green
  if (rating >= 30) return "#8B8578"; // muted
  return "#D94032"; // red
}

function getTopStat(player: Player): { label: string; value: number } | null {
  const skills = player.skills;
  if (!skills) return null;
  const entries = Object.entries(skills).filter(([, v]) => typeof v === "number") as [string, number][];
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  const labels: Record<string, string> = {
    speed: "RYC", technique: "TEC", shooting: "STŘ", passing: "PŘI",
    heading: "HLA", defense: "OBR", goalkeeping: "BRA",
  };
  return { label: labels[entries[0][0]] ?? entries[0][0], value: entries[0][1] };
}

/**
 * FIFA-style player reveal card.
 * Reusable pro: onboarding reveal, nový dorostenec, přestup, balíček.
 */
export function PlayerRevealCard({ player, teamColor, delay = 0, onRevealed }: RevealCardProps) {
  const [phase, setPhase] = useState<"hidden" | "flipping" | "revealed">("hidden");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("flipping"), delay);
    const t2 = setTimeout(() => {
      setPhase("revealed");
      onRevealed?.();
    }, delay + 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [delay, onRevealed]);

  const ratingColor = getRatingColor(player.overall_rating);
  const topStat = getTopStat(player);

  if (phase === "hidden") {
    return (
      <div className="w-full aspect-[3/4] rounded-2xl bg-pitch-800 border border-pitch-700 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-3 border-pitch-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-2xl overflow-hidden shadow-lg transition-all duration-500 ${
        phase === "flipping" ? "animate-[cardFlip_0.6s_ease-out]" : ""
      }`}
      style={{
        background: `linear-gradient(165deg, ${teamColor}18 0%, ${teamColor}08 40%, #FFFFFF 100%)`,
        border: `1px solid ${teamColor}20`,
      }}
    >
      {/* Top bar with position + rating */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[10px] font-heading font-bold tracking-widest uppercase px-2 py-0.5 rounded"
          style={{ backgroundColor: `${teamColor}15`, color: teamColor }}>
          {POS_SHORT[player.position]}
        </span>
        <div className="text-right">
          <span className="font-heading font-[800] text-3xl leading-none tabular-nums" style={{ color: ratingColor }}>
            {player.overall_rating}
          </span>
        </div>
      </div>

      {/* Avatar area */}
      <div className="flex justify-center py-3">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-white font-heading font-bold text-3xl shadow-inner"
          style={{ backgroundColor: teamColor }}>
          {player.first_name[0]}
        </div>
      </div>

      {/* Name */}
      <div className="text-center px-4 pb-2">
        <div className="font-heading font-bold text-base text-ink leading-tight">
          {player.first_name} {player.last_name}
        </div>
        {player.nickname && (
          <div className="text-sm mt-0.5" style={{ color: teamColor }}>&bdquo;{player.nickname}&ldquo;</div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 h-px" style={{ backgroundColor: `${teamColor}15` }} />

      {/* Info strip */}
      <div className="flex items-center justify-center gap-3 py-2.5 text-xs text-muted">
        <span>{player.age} let</span>
        <span className="w-1 h-1 rounded-full bg-muted-light" />
        <span>{player.lifeContext?.occupation ?? "—"}</span>
        {topStat && (
          <>
            <span className="w-1 h-1 rounded-full bg-muted-light" />
            <span className="font-heading font-bold" style={{ color: teamColor }}>{topStat.label} {topStat.value}</span>
          </>
        )}
      </div>

      {/* Description */}
      <div className="px-4 pb-4">
        <p className="text-xs text-muted leading-relaxed text-center italic">
          {player.description}
        </p>
      </div>
    </div>
  );
}

/**
 * Grid reveal — postupně odkrývá kartičky.
 */
export function PlayerRevealGrid({
  players,
  teamColor,
  revealInterval = 400,
  onAllRevealed,
}: {
  players: Player[];
  teamColor: string;
  revealInterval?: number;
  onAllRevealed?: () => void;
}) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (revealedCount >= players.length) {
      onAllRevealed?.();
      return;
    }
    const t = setTimeout(() => setRevealedCount((c) => c + 1), revealInterval);
    return () => clearTimeout(t);
  }, [revealedCount, players.length, revealInterval, onAllRevealed]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {players.map((player, i) => (
        <PlayerRevealCard
          key={player.id || i}
          player={player}
          teamColor={teamColor}
          delay={i < revealedCount ? 0 : 100}
        />
      ))}
    </div>
  );
}
