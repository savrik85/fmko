"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview } from "@/components/ui";
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
  villageName: string | null;
  total: number;
  gold: number;
  silver: number;
  bronze: number;
}

export default function HallOfFamePage() {
  const { teamId } = useTeam();
  const [entries, setEntries] = useState<HofEntry[]>([]);
  const [humansOnly, setHumansOnly] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ entries: HofEntry[] }>(`/api/hall-of-fame`)
      .then((d) => { setEntries(d.entries); setLoading(false); })
      .catch((e) => { console.error("hall of fame load:", e); setLoading(false); });
  }, []);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;

  const filtered = humansOnly ? entries.filter((e) => e.isHuman) : entries;
  const reranked = filtered.map((e, i) => ({ ...e, displayRank: i + 1 }));

  return (
    <div className="page-container pb-24 space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading font-[800] text-2xl">🏆 Síň slávy</h1>
            <p className="text-sm text-muted mt-0.5">Žebříček trenérů podle počtu úspěchů</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-heading font-bold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={humansOnly}
              onChange={(e) => setHumansOnly(e.target.checked)}
              className="w-4 h-4 accent-pitch-500"
            />
            Jen lidští
          </label>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-label border-b border-gray-200 text-[11px] uppercase tracking-wide">
              <th className="py-3 pl-4 pr-2 w-12">#</th>
              <th className="py-3 px-2">Trenér</th>
              <th className="py-3 px-2">Tým</th>
              <th className="py-3 px-2 text-right w-16">🥇</th>
              <th className="py-3 px-2 text-right w-16">🥈</th>
              <th className="py-3 px-2 text-right w-16">🥉</th>
              <th className="py-3 px-2 pr-4 text-right w-16">Σ</th>
            </tr>
          </thead>
          <tbody>
            {reranked.map((e) => {
              const isMe = e.teamId === teamId;
              return (
                <tr
                  key={e.teamId}
                  className={`border-b border-gray-50 last:border-b-0 hover:bg-gray-50/40 transition-colors ${isMe ? "bg-pitch-50/40" : ""}`}
                >
                  <td className="py-2.5 pl-4 pr-2 font-heading font-[800] tabular-nums">
                    {e.displayRank <= 3 ? (
                      <span className={e.displayRank === 1 ? "text-amber-600" : e.displayRank === 2 ? "text-gray-500" : "text-orange-700"}>
                        {e.displayRank}.
                      </span>
                    ) : (
                      <span className="text-muted">{e.displayRank}.</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {e.managerId && e.managerName ? (
                      <Link href={`/dashboard/manager/${e.managerId}`} className="font-heading font-bold hover:text-pitch-500 transition-colors">
                        {e.managerName}
                      </Link>
                    ) : (
                      <span className="text-muted italic">—</span>
                    )}
                    {!e.isHuman && <span className="ml-2 text-[10px] text-muted uppercase">AI</span>}
                  </td>
                  <td className="py-2.5 px-2">
                    <Link href={`/dashboard/team/${e.teamId}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                      <BadgePreview
                        primary={e.primaryColor}
                        secondary={e.secondaryColor}
                        pattern={e.badgePattern as BadgePattern}
                        initials={e.teamName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                        size={20}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-heading font-bold">{e.teamName}</div>
                        {e.villageName && <div className="text-[10px] text-muted truncate">{e.villageName}</div>}
                      </div>
                    </Link>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-heading font-bold text-amber-600">{e.gold || ""}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-heading font-bold text-gray-500">{e.silver || ""}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-heading font-bold text-orange-700">{e.bronze || ""}</td>
                  <td className="py-2.5 px-2 pr-4 text-right tabular-nums font-heading font-[800]">{e.total}</td>
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
