"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, BadgePreview } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import type { BadgePattern } from "@/components/ui";

interface HofEntry {
  rank: number;
  teamId: string;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  badgePattern: string;
  isHuman: boolean;
  managerId: string | null;
  managerName: string | null;
  managerAvatar: Record<string, unknown> | null;
  villageName: string | null;
  total: number;
  gold: number;
  silver: number;
  bronze: number;
}

export default function HallOfFamePage() {
  const { teamId } = useTeam();
  const [entries, setEntries] = useState<HofEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ entries: HofEntry[] }>(`/api/hall-of-fame`)
      .then((d) => { setEntries(d.entries); setLoading(false); })
      .catch((e) => { console.error("hall of fame load:", e); setLoading(false); });
  }, []);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;

  const filtered = entries.filter((e) => e.isHuman);
  const reranked = filtered.map((e, i) => ({ ...e, displayRank: i + 1 }));

  return (
    <div className="page-container pb-24 space-y-4">
      <div className="card p-4 sm:p-5">
        <h1 className="font-heading font-[800] text-2xl">🏆 Síň slávy</h1>
        <p className="text-sm text-muted mt-0.5">Žebříček trenérů podle počtu úspěchů</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-label border-b border-gray-200 text-[10px] sm:text-[11px] uppercase tracking-wide">
              <th className="py-2 sm:py-3 pl-2 sm:pl-4 pr-1 w-8 sm:w-12">#</th>
              <th className="py-2 sm:py-3 px-1 sm:px-2">Trenér</th>
              <th className="py-2 sm:py-3 px-1 sm:px-2">Tým</th>
              <th className="py-2 sm:py-3 px-1 sm:px-2 text-right w-8 sm:w-12">🥇</th>
              <th className="py-2 sm:py-3 px-1 sm:px-2 text-right w-8 sm:w-12">🥈</th>
              <th className="py-2 sm:py-3 px-1 sm:px-2 text-right w-8 sm:w-12">🥉</th>
              <th className="py-2 sm:py-3 px-1 sm:px-2 pr-2 sm:pr-4 text-right w-8 sm:w-12">Σ</th>
            </tr>
          </thead>
          <tbody>
            {reranked.map((e) => {
              const isMe = e.teamId === teamId;
              const hasAvatar = e.managerAvatar && Object.keys(e.managerAvatar).length > 2;
              return (
                <tr
                  key={e.teamId}
                  className={`border-b border-gray-50 last:border-b-0 hover:bg-gray-50/40 transition-colors ${isMe ? "bg-pitch-50/40" : ""}`}
                >
                  <td className="py-2 sm:py-2.5 pl-2 sm:pl-4 pr-1 font-heading font-[800] tabular-nums text-xs sm:text-sm">
                    {e.displayRank <= 3 ? (
                      <span className={e.displayRank === 1 ? "text-amber-600" : e.displayRank === 2 ? "text-gray-500" : "text-orange-700"}>
                        {e.displayRank}.
                      </span>
                    ) : (
                      <span className="text-muted">{e.displayRank}.</span>
                    )}
                  </td>
                  <td className="py-2 sm:py-2.5 px-1 sm:px-2">
                    {e.managerId && e.managerName ? (
                      <Link href={`/dashboard/manager/${e.managerId}`} className="flex items-center gap-1.5 sm:gap-2 hover:text-pitch-500 transition-colors">
                        {hasAvatar ? (
                          <FaceAvatar faceConfig={e.managerAvatar as Record<string, unknown>} size={24} className="shrink-0 bg-gray-100 rounded-full sm:!w-8 sm:!h-8" />
                        ) : (
                          <div className="shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gray-200 flex items-center justify-center font-heading font-bold text-[10px] sm:text-xs text-muted">
                            {e.managerName[0]}
                          </div>
                        )}
                        <span className="font-heading font-bold truncate text-xs sm:text-sm">{e.managerName}</span>
                      </Link>
                    ) : (
                      <span className="text-muted italic">—</span>
                    )}
                  </td>
                  <td className="py-2 sm:py-2.5 px-1 sm:px-2">
                    <Link href={`/dashboard/team/${e.teamId}`} className="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity">
                      <BadgePreview
                        primary={e.primaryColor}
                        secondary={e.secondaryColor}
                        pattern={e.badgePattern as BadgePattern}
                        initials={e.teamName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                        size={18}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-heading font-bold text-xs sm:text-sm">{e.teamName}</div>
                        {e.villageName && <div className="text-[9px] sm:text-[10px] text-muted truncate">{e.villageName}</div>}
                      </div>
                    </Link>
                  </td>
                  <td className="py-2 sm:py-2.5 px-1 sm:px-2 text-right tabular-nums font-heading font-bold text-amber-600 text-xs sm:text-sm">{e.gold || ""}</td>
                  <td className="py-2 sm:py-2.5 px-1 sm:px-2 text-right tabular-nums font-heading font-bold text-gray-500 text-xs sm:text-sm">{e.silver || ""}</td>
                  <td className="py-2 sm:py-2.5 px-1 sm:px-2 text-right tabular-nums font-heading font-bold text-orange-700 text-xs sm:text-sm">{e.bronze || ""}</td>
                  <td className="py-2 sm:py-2.5 px-1 sm:px-2 pr-2 sm:pr-4 text-right tabular-nums font-heading font-[800] text-xs sm:text-sm">{e.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {reranked.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">Žebříček je prázdný.</div>
        )}
      </div>
    </div>
  );
}
