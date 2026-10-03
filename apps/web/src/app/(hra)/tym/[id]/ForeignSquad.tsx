"use client";

/**
 * Kádr cizího týmu — na procházení kvůli přestupům i před zápasem.
 * Vykresluje sdílená tabulka hráčů (stejná jako Sledovaní v Přestupech).
 */

import type { Player } from "@/lib/api";
import { SectionLabel } from "@/components/ui";
import { PlayerBrowseTable, type BrowseRow } from "@/components/players/PlayerBrowseTable";

export function ForeignSquad({ players, color, onColorText, ratingColor }: {
  players: Player[];
  color: string;
  onColorText: string;
  ratingColor: string;
}) {
  const rows: BrowseRow[] = players.map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    nickname: p.nickname,
    age: p.age,
    position: p.position,
    rating: p.overall_rating,
    skills: p.skills ?? {},
    avatar: (p.avatar as Record<string, unknown> | null) ?? null,
    condition: p.lifeContext?.condition ?? null,
    injury: p.injury ? { type: p.injury.type, daysRemaining: p.injury.daysRemaining } : null,
  }));

  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3"><SectionLabel>Kádr ({players.length})</SectionLabel></div>
      <PlayerBrowseTable rows={rows} color={color} onColorText={onColorText} ratingColor={ratingColor} columns={{ condition: true }} />
    </div>
  );
}
