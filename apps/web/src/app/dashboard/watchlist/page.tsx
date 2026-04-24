"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Spinner, BadgePreview, PositionBadge } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

interface WatchedPlayer {
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
  teamColor: string | null;
  teamSecondary: string | null;
  teamBadge: string | null;
  teamIsAI: boolean;
  villageName: string | null;
  district: string | null;
  injury: { daysRemaining: number; type: string | null } | null;
  watchedSince: string;
  recentStats: {
    matches: number;
    goals: number;
    assists: number;
    avgRating: number;
  };
  transfers: Array<{
    date: string;
    fromTeam: string | null;
    toTeam: string | null;
    fee: number;
  }>;
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-600";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("cs", { day: "numeric", month: "numeric", year: "numeric" });
}

export default function WatchlistPage() {
  const { teamId } = useTeam();
  const [players, setPlayers] = useState<WatchedPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ players: WatchedPlayer[] }>(`/api/teams/${teamId}/watchlist`)
      .then((d) => {
        setPlayers(d.players ?? []);
        setLoading(false);
      })
      .catch((e) => {
        console.error("load watchlist:", e);
        setLoading(false);
      });
  }, [teamId]);

  const removeFromWatchlist = async (playerId: string) => {
    if (!teamId) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/watchlist/${playerId}`, { method: "DELETE" }), "Odebrání ze sledování se nezdařilo")) {
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    }
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const countLabel = `${players.length} ${players.length === 1 ? "hráč" : players.length >= 2 && players.length <= 4 ? "hráči" : "hráčů"}`;

  return (
    <>
      <div className="page-container space-y-4">
        <div className="text-sm text-muted font-heading">{countLabel}</div>
        {players.length === 0 ? (
          <div className="card p-8 text-center text-muted">
            <div className="text-4xl mb-3">☆</div>
            <p className="text-lg font-heading font-bold mb-2">Žádní sledovaní hráči</p>
            <p className="text-sm">Otevři profil hráče a klikni na tlačítko „☆ Sledovat&ldquo; — přidá se sem do seznamu.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {players.map((p) => {
              const teamColor = p.teamColor || "#2D5F2D";
              // Position-specific key attributes (already rounded by API)
              const attrSpec: Array<{ key: string; label: string }> =
                p.position === "GK" ? [
                  { key: "goalkeeping", label: "Brn" },
                  { key: "defense", label: "Obr" },
                  { key: "heading", label: "Hlv" },
                  { key: "passing", label: "Při" },
                ] : p.position === "DEF" ? [
                  { key: "defense", label: "Obr" },
                  { key: "heading", label: "Hlv" },
                  { key: "speed", label: "Rch" },
                  { key: "passing", label: "Při" },
                ] : p.position === "MID" ? [
                  { key: "technique", label: "Tch" },
                  { key: "passing", label: "Při" },
                  { key: "shooting", label: "Stř" },
                  { key: "speed", label: "Rch" },
                ] : [
                  { key: "shooting", label: "Stř" },
                  { key: "speed", label: "Rch" },
                  { key: "technique", label: "Tch" },
                  { key: "heading", label: "Hlv" },
                ];

              return (
                <div key={p.id} className="card overflow-hidden">
                  {/* Header row with player info + team + remove */}
                  <div className="flex items-start gap-3 p-3 sm:p-4">
                    {/* Avatar */}
                    <Link href={`/dashboard/player/${p.id}`} className="shrink-0">
                      {p.avatar && typeof p.avatar === "object" && Object.keys(p.avatar).length > 2 ? (
                        <FaceAvatar faceConfig={p.avatar as any} size={48} className="rounded-lg" />
                      ) : (
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold border ${isLightColor(teamColor) ? "text-gray-900 border-gray-300" : "text-white border-transparent"}`} style={{ backgroundColor: teamColor }}>
                          {p.firstName[0]}
                        </div>
                      )}
                    </Link>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold text-base sm:text-lg hover:text-pitch-500 transition-colors truncate">
                          {p.firstName} {p.lastName}
                        </Link>
                        {p.injury && (
                          <span className="inline-flex items-center gap-1 bg-red-50 text-card-red rounded px-1.5 py-0.5 text-[10px] font-heading font-bold">
                            🩹 {p.injury.daysRemaining}d
                          </span>
                        )}
                      </div>
                      {p.nickname && (
                        <div className="text-xs text-gold-500">&bdquo;{p.nickname}&ldquo;</div>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted flex-wrap">
                        <PositionBadge position={p.position} />
                        <span>{p.age} let</span>
                        {p.teamId && p.teamName && (
                          <>
                            <span className="text-gray-300">·</span>
                            <Link href={`/dashboard/team/${p.teamId}`} className="flex items-center gap-1 hover:text-pitch-500 transition-colors min-w-0">
                              <BadgePreview
                                primary={teamColor}
                                secondary={p.teamSecondary || "#FFF"}
                                pattern={(p.teamBadge as BadgePattern) || "shield"}
                                initials={(p.teamName || "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()}
                                size={16}
                              />
                              <span className="truncate">{p.teamName}</span>
                            </Link>
                          </>
                        )}
                        {p.villageName && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span>📍 {p.villageName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Rating + remove */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span
                        className={`px-2 py-1 rounded-lg font-heading font-bold text-sm tabular-nums tabular-nums border ${isLightColor(teamColor) ? "text-gray-900 border-gray-300" : "text-white border-transparent"}`}
                        style={{ backgroundColor: teamColor }}
                      >
                        {p.overallRating}
                      </span>
                      <button
                        onClick={() => removeFromWatchlist(p.id)}
                        className="text-[10px] text-muted hover:text-card-red transition-colors font-heading uppercase"
                        title="Odebrat ze sledovaných"
                      >
                        ✕ odebrat
                      </button>
                    </div>
                  </div>

                  {/* Attributes + stats row */}
                  <div className="flex flex-col sm:flex-row border-t border-gray-50">
                    {/* Attributes (rounded, position-specific) */}
                    <div className="flex-1 px-3 sm:px-4 py-2.5 border-b sm:border-b-0 sm:border-r border-gray-50">
                      <div className="text-[10px] uppercase font-heading font-bold text-muted mb-1.5">Známé atributy</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {attrSpec.map((a) => {
                          const val = p.skills[a.key] ?? 0;
                          return (
                            <div key={a.key} className="text-center">
                              <div className={`text-sm font-heading font-bold tabular-nums ${attrColor(val)}`}>{val}</div>
                              <div className="text-[9px] text-muted font-heading uppercase">{a.label}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Recent stats */}
                    <div className="flex-1 px-3 sm:px-4 py-2.5">
                      <div className="text-[10px] uppercase font-heading font-bold text-muted mb-1.5">Poslední zápasy</div>
                      {p.recentStats.matches > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5">
                          <div className="text-center">
                            <div className="text-sm font-heading font-bold tabular-nums">{p.recentStats.matches}</div>
                            <div className="text-[9px] text-muted font-heading uppercase">Záp</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-heading font-bold tabular-nums text-pitch-500">{p.recentStats.goals}</div>
                            <div className="text-[9px] text-muted font-heading uppercase">Gól</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-heading font-bold tabular-nums text-gold-600">{p.recentStats.assists}</div>
                            <div className="text-[9px] text-muted font-heading uppercase">Asist</div>
                          </div>
                          <div className="text-center">
                            <div className={`text-sm font-heading font-bold tabular-nums ${
                              p.recentStats.avgRating >= 7.5 ? "text-pitch-500"
                              : p.recentStats.avgRating >= 6.5 ? "text-gold-600" : "text-muted"
                            }`}>
                              {p.recentStats.avgRating > 0 ? p.recentStats.avgRating.toFixed(1) : "—"}
                            </div>
                            <div className="text-[9px] text-muted font-heading uppercase">Hod</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted italic">Zatím žádné zápasy</div>
                      )}
                    </div>
                  </div>

                  {/* Transfer history */}
                  {p.transfers.length > 0 && (
                    <div className="border-t border-gray-50 px-3 sm:px-4 py-2.5 bg-gray-50/50">
                      <div className="text-[10px] uppercase font-heading font-bold text-muted mb-1.5">Přestupy</div>
                      <div className="flex flex-col gap-1">
                        {p.transfers.map((t, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-muted tabular-nums shrink-0">{formatDate(t.date)}</span>
                            <span className="truncate">
                              {t.fromTeam ?? "—"} <span className="text-muted">→</span> <span className="font-heading font-bold">{t.toTeam ?? "—"}</span>
                            </span>
                            {t.fee > 0 && (
                              <span className="shrink-0 ml-auto font-heading font-bold text-gold-600 tabular-nums">
                                {t.fee.toLocaleString("cs")} Kč
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
