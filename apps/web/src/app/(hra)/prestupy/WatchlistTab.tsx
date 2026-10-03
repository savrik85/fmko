"use client";

/**
 * Sledovaní hráči — záložka Přestupů (dřív samostatná stránka /sledovani).
 * Tabulka je sdílená s kádrem cizího týmu.
 */

import { useEffect, useState } from "react";
import { apiFetch, apiAction } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { PlayerBrowseTable, type BrowseRow } from "@/components/players/PlayerBrowseTable";

export interface WatchedPlayer {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  overallRating: number;
  skills: Record<string, number>;
  avatar: Record<string, unknown> | null;
  teamId: string | null;
  teamName: string | null;
  injury: { daysRemaining: number; type: string | null } | null;
  watchedSince: string;
  recentStats: { matches: number; goals: number; assists: number; avgRating: number };
}

export function WatchlistTab({ teamId, color, onColorText, ratingColor }: {
  teamId: string;
  color: string;
  onColorText: string;
  ratingColor: string;
}) {
  const [players, setPlayers] = useState<WatchedPlayer[] | null>(null);

  useEffect(() => {
    apiFetch<{ players: WatchedPlayer[] }>(`/api/teams/${teamId}/watchlist`)
      .then((r) => setPlayers(r.players ?? []))
      .catch((e) => { console.error("load watchlist:", e); setPlayers([]); });
  }, [teamId]);

  const remove = async (row: BrowseRow) => {
    if (await apiAction(apiFetch(`/api/teams/${teamId}/watchlist/${row.id}`, { method: "DELETE" }), "Odebrání ze sledování se nezdařilo")) {
      setPlayers((list) => (list ?? []).filter((p) => p.id !== row.id));
    }
  };

  if (players === null) return <div className="flex justify-center py-8"><Spinner /></div>;

  const rows: BrowseRow[] = players.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    nickname: p.nickname,
    age: p.age,
    position: p.position,
    rating: p.overallRating,
    skills: p.skills ?? {},
    avatar: p.avatar,
    injury: p.injury ? { type: p.injury.type, daysRemaining: p.injury.daysRemaining } : null,
    club: p.teamId && p.teamName ? { id: p.teamId, name: p.teamName } : null,
    form: p.recentStats ?? null,
    watchedSince: p.watchedSince,
  }));

  return (
    <div className="card p-4 sm:p-5">
      <PlayerBrowseTable rows={rows} color={color} onColorText={onColorText} ratingColor={ratingColor}
        columns={{ club: true, form: true, watchedSince: true }} onRemove={remove}
        emptyText="Zatím nikoho nesleduješ. Hráče přidáš hvězdičkou v jeho profilu." />
    </div>
  );
}
