"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, BadgePreview, DataTable, EntityCell, ListCard } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import type { BadgePattern } from "@/components/ui";
import { CoachName } from "@/components/manager/coach-name";

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
  /** Trenér AI klubu: k jménu patří odznak s robotem. */
  coachIsAi?: boolean;
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

  // AI kluby patří do žebříčku jako každý jiný klub, liší se jen štítkem u trenéra.
  const reranked = entries.map((e, i) => ({ ...e, displayRank: i + 1 }));

  return (
    <div className="page-container pb-24 space-y-4">
      <div className="card p-4 sm:p-5">
        <h1 className="font-heading font-[800] text-2xl">🏆 Síň slávy</h1>
        <p className="text-sm text-muted mt-0.5">Žebříček trenérů podle počtu úspěchů</p>
      </div>

      <ListCard>
        <DataTable rows={reranked} rowKey={(e) => e.teamId}
          rowHref={(e) => (e.managerId ? `/manazer/${e.teamId}` : `/tym/${e.teamId}`)}
          rowTone={(e) => ({ own: e.teamId === teamId })}
          empty="Žebříček je prázdný. Úspěchy se sbírají za vítězství, poháry a sérii bez porážky."
          emptyIcon="🏆"
          columns={[
            { key: "rank", header: "#", width: "w-10", align: "center",
              cell: (e) => <span className={`font-bold ${e.displayRank === 1 ? "text-gold-700" : e.displayRank <= 3 ? "text-ink-light" : "text-muted"}`}>{e.displayRank}</span> },
            { key: "coach", header: "Trenér", align: "left",
              cell: (e) => {
                const hasAvatar = e.managerAvatar && Object.keys(e.managerAvatar).length > 2;
                return (
                  <EntityCell
                    leading={hasAvatar
                      ? <FaceAvatar faceConfig={e.managerAvatar as Record<string, unknown>} size={28} className="bg-gray-100 rounded-full" />
                      : <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-micro font-bold text-muted">{e.managerName?.[0] ?? "-"}</span>}
                    name={e.managerId && e.managerName ? <CoachName name={e.managerName} isAi={e.coachIsAi === true} /> : <span className="text-muted italic">-</span>}
                    bold={e.teamId === teamId}
                    meta={e.teamName} metaMobileOnly />
                );
              } },
            { key: "team", header: "Tým", align: "left", priority: 2,
              cell: (e) => (
                <Link href={`/tym/${e.teamId}`} onClick={(ev) => ev.stopPropagation()} className="flex items-center gap-2 hover:opacity-80">
                  <BadgePreview primary={e.primaryColor} secondary={e.secondaryColor} pattern={e.badgePattern as BadgePattern}
                    initials={e.teamName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={20} />
                  <span className="min-w-0">
                    <span className="block font-bold text-ink">{e.teamName}</span>
                    {e.villageName && <span className="block text-meta text-muted">{e.villageName}</span>}
                  </span>
                </Link>
              ) },
            { key: "gold", header: "🥇", title: "Zlato", width: "w-12", priority: 2, cell: (e) => <span className="font-bold text-gold-700">{e.gold || ""}</span> },
            { key: "silver", header: "🥈", title: "Stříbro", width: "w-12", priority: 2, cell: (e) => <span className="font-bold text-gray-500">{e.silver || ""}</span> },
            { key: "bronze", header: "🥉", title: "Bronz", width: "w-12", priority: 2, cell: (e) => <span className="font-bold text-orange-700">{e.bronze || ""}</span> },
            { key: "total", header: "Σ", title: "Úspěchů celkem", width: "w-12", emphasis: true, cell: (e) => e.total },
          ]} />
      </ListCard>
    </div>
  );
}
