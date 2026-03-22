"use client";

import Link from "next/link";
import { FaceAvatar } from "@/components/players/face-avatar";
import { PositionBadge } from "@/components/ui";
import type { Player } from "@/lib/api";

/* ── Helpers ── */

function getMoraleEmoji(morale: number): string {
  if (morale >= 80) return "\u{1F60A}";
  if (morale >= 60) return "\u{1F642}";
  if (morale >= 40) return "\u{1F610}";
  if (morale >= 20) return "\u{1F61E}";
  return "\u{1F621}";
}

function conditionLabel(condition: number): { text: string; color: string } {
  if (condition >= 80) return { text: "Fit", color: "text-pitch-500" };
  if (condition >= 50) return { text: "OK", color: "text-gold-500" };
  if (condition >= 20) return { text: "Unavený", color: "text-orange-500" };
  return { text: "Vyčerpaný", color: "text-card-red" };
}

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-500";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

function traitLevel(value: number): { label: string; color: string } {
  if (value >= 80) return { label: "Velmi vysoký", color: "text-pitch-400" };
  if (value >= 60) return { label: "Vysoký", color: "text-pitch-500" };
  if (value >= 40) return { label: "Průměrný", color: "text-muted" };
  if (value >= 20) return { label: "Nízký", color: "text-gold-600" };
  return { label: "Velmi nízký", color: "text-card-red" };
}

/* ── Compact card — squad list row ── */

export function PlayerCardCompact({
  player,
  teamColor,
}: {
  player: Player;
  teamColor: string;
}) {
  const cond = conditionLabel(player.lifeContext?.condition ?? 100);
  const hasAvatar = player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2;

  return (
    <Link
      href={`/dashboard/player/${player.id}`}
      className="card card-hover w-full p-4 text-left flex gap-3 items-center block"
    >
      {/* Avatar */}
      <div className="w-11 h-11 shrink-0 flex items-center justify-center">
        {hasAvatar ? (
          <FaceAvatar faceConfig={player.avatar} size={36} />
        ) : (
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-heading font-bold"
            style={{ backgroundColor: teamColor }}
          >
            {player.first_name[0]}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading font-bold truncate">
            {player.first_name} {player.last_name}
          </span>
          {player.nickname && (
            <span className="text-xs text-gold-500 shrink-0">&bdquo;{player.nickname}&ldquo;</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
          <PositionBadge position={player.position} />
          <span>{player.age} let</span>
          <span>&middot;</span>
          <span className={cond.color}>{cond.text}</span>
          <span>{getMoraleEmoji(player.lifeContext?.morale ?? 50)}</span>
        </div>
      </div>

      {/* Rating */}
      <div className="text-right shrink-0">
        <div className="font-heading font-bold text-xl tabular-nums" style={{ color: teamColor }}>
          {player.overall_rating}
        </div>
      </div>
    </Link>
  );
}

