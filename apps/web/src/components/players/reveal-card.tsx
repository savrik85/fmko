"use client";

import { useState, useEffect } from "react";
import type { Player } from "@/lib/api";
import { FaceAvatar } from "./face-avatar";

interface RevealCardProps {
  player: Player;
  teamColor: string;
  delay?: number;
  onRevealed?: () => void;
}

const POS_SHORT: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_CSS: Record<string, string> = { GK: "pos-gk", DEF: "pos-def", MID: "pos-mid", FWD: "pos-fwd" };

function getRatingColor(rating: number): string {
  if (rating >= 70) return "#C4A035";
  if (rating >= 50) return "#3A7A3A";
  if (rating >= 30) return "#8B8578";
  return "#D94032";
}

function getTopStats(player: Player): Array<{ label: string; value: number }> {
  const skills = player.skills;
  if (!skills) return [];
  const labels: Record<string, string> = {
    speed: "RYC", technique: "TEC", shooting: "STŘ", passing: "PŘI",
    heading: "HLA", defense: "OBR", goalkeeping: "BRA",
  };
  return Object.entries(skills)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => ({ label: labels[k] ?? k, value: v as number }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}

/**
 * FIFA-style player reveal card.
 *
 * Fáze animace:
 * 1. hidden — tmavá karta se spinnerem
 * 2. flipping — karta se otáčí (3D flip)
 * 3. revealed — viditelná karta BEZ ratingu
 * 4. rating — rating se animovaně "napočítá"
 */
export function PlayerRevealCard({ player, teamColor, delay = 0, onRevealed }: RevealCardProps) {
  const [phase, setPhase] = useState<"hidden" | "flipping" | "revealed" | "rating">("hidden");
  const [displayRating, setDisplayRating] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("flipping"), delay);
    const t2 = setTimeout(() => setPhase("revealed"), delay + 600);
    const t3 = setTimeout(() => setPhase("rating"), delay + 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [delay]);

  // Animate rating count-up
  useEffect(() => {
    if (phase !== "rating") return;
    const target = player.overall_rating;
    const duration = 600;
    const steps = 15;
    const stepTime = duration / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      // Ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayRating(Math.round(target * eased));

      if (step >= steps) {
        clearInterval(interval);
        setDisplayRating(target);
        onRevealed?.();
      }
    }, stepTime);

    return () => clearInterval(interval);
  }, [phase, player.overall_rating, onRevealed]);

  const ratingColor = getRatingColor(player.overall_rating);
  const topStats = getTopStats(player);

  // Phase: hidden
  if (phase === "hidden") {
    return (
      <div className="w-full aspect-[3/4] rounded-2xl flex items-center justify-center"
        style={{ background: "linear-gradient(145deg, #0d220d 0%, #153615 100%)", border: "1px solid rgba(45,95,45,0.3)" }}>
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-pitch-500/40 border-t-pitch-400 animate-spin mx-auto mb-2" />
          <span className="text-pitch-500/40 text-[10px] font-heading uppercase tracking-wider">Odhaluji...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-2xl overflow-hidden transition-all duration-500 ${
        phase === "flipping" ? "animate-[cardFlip_0.6s_ease-out]" : ""
      } ${phase === "rating" ? "animate-[cardGlow_0.8s_ease-out]" : ""}`}
      style={{
        background: `linear-gradient(165deg, ${teamColor}15 0%, #FFFFFF 50%, ${teamColor}08 100%)`,
        border: `1px solid ${teamColor}18`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
      }}
    >
      {/* Top bar: position badge + rating area */}
      <div className="flex items-start justify-between px-3 pt-3 pb-1">
        <span className={`pos-badge ${POS_CSS[player.position] ?? ""}`}>
          {POS_SHORT[player.position]}
        </span>

        {/* Rating — hidden until phase=rating */}
        <div className="text-right min-w-[2.5rem]">
          {(phase === "rating") ? (
            <span className="font-heading font-[800] text-[2rem] leading-none tabular-nums transition-all"
              style={{ color: ratingColor }}>
              {displayRating}
            </span>
          ) : (
            <span className="font-heading font-[800] text-[2rem] leading-none tabular-nums text-black/5">
              ?
            </span>
          )}
        </div>
      </div>

      {/* Avatar — facesjs from DB */}
      <div className="flex justify-center py-2">
        {player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2 ? (
          <FaceAvatar faceConfig={player.avatar} size={72} />
        ) : (
          <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white font-heading font-bold text-2xl" style={{ backgroundColor: teamColor }}>
            {player.first_name[0]}
          </div>
        )}
      </div>

      {/* Name + nickname */}
      <div className="text-center px-3 pb-1.5">
        <div className="font-heading font-bold text-[0.85rem] text-ink leading-tight truncate">
          {player.first_name} {player.last_name}
        </div>
        {player.nickname && (
          <div className="text-[0.75rem] mt-0.5 font-medium truncate" style={{ color: teamColor }}>
            &bdquo;{player.nickname}&ldquo;
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 h-px" style={{ backgroundColor: `${teamColor}10` }} />

      {/* Top 3 stats — revealed with delay */}
      <div className="px-3 py-2">
        {topStats.map((stat, i) => (
          <div key={stat.label} className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] text-muted w-7 text-right font-heading font-semibold">{stat.label}</span>
            <div className="flex-1 h-1 bg-black/[0.04] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: phase === "rating" ? `${stat.value}%` : "0%",
                  backgroundColor: teamColor,
                  opacity: 0.6 - i * 0.15,
                  transitionDelay: `${i * 100}ms`,
                }} />
            </div>
            <span className={`text-[10px] tabular-nums font-heading font-bold w-5 text-right transition-opacity duration-500 ${phase === "rating" ? "opacity-100" : "opacity-0"}`}
              style={{ color: teamColor, transitionDelay: `${i * 100 + 200}ms` }}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Info line */}
      <div className="px-3 pb-2.5 flex items-center justify-center gap-1.5 text-[10px] text-muted">
        <span>{player.age} let</span>
        <span>&middot;</span>
        <span className="truncate">{player.lifeContext?.occupation ?? ""}</span>
      </div>
    </div>
  );
}
