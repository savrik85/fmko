"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SectionLabel, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

interface TransferRow {
  direction: "in" | "out";
  kind: "transfer" | "swap" | "free_agent" | "released";
  playerId: string;
  playerName: string;
  otherTeamId: string | null;
  otherTeamName: string | null;
  otherTeamBadge: { primary: string; secondary: string; pattern: string; initials: string; symbol: string | null } | null;
  playerAvatar: Record<string, unknown> | null;
  fee: number;
  seasonNumber: number | null;
  date: string;
}

const KIND_LABEL: Record<TransferRow["kind"], string> = {
  transfer: "Přestup",
  swap: "Výměna",
  free_agent: "Volný hráč",
  released: "Propuštěn",
};

const fmtCZK = (v: number) => `${v.toLocaleString("cs")} Kč`;

/** Přehled přestupů klubu (vlastního i cizího): kdo přišel, kdo odešel, odkud/kam a za kolik. */
export function TransferOverview({ teamId }: { teamId: string }) {
  const [rows, setRows] = useState<TransferRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    apiFetch<{ transfers: TransferRow[] }>(`/api/teams/${teamId}/transfer-overview`)
      .then((r) => { if (alive) setRows(r.transfers); })
      .catch((e) => {
        console.error("load transfer overview:", e);
        if (alive) setRows([]);
      });
    return () => { alive = false; };
  }, [teamId]);

  if (rows === null) return null;

  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Přehled přestupů</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádné přestupy.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {rows.map((r, i) => (
            <li key={`${r.direction}-${r.playerId}-${r.date}-${i}`} className="py-2.5 flex items-center gap-3">
              {r.playerAvatar && Object.keys(r.playerAvatar).length > 2 ? (
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100">
                  <FaceAvatar faceConfig={r.playerAvatar} size={33} />
                </div>
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/hrac/${r.playerId}`} className="text-base font-heading font-bold hover:underline">
                  {r.playerName}
                </Link>
                <div className="text-sm text-muted flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className={`font-bold ${r.direction === "in" ? "text-pitch-600" : "text-card-red"}`}>
                    {r.direction === "in" ? "→" : "←"} {KIND_LABEL[r.kind]}
                  </span>
                  {r.otherTeamId && r.otherTeamName && (
                    <>
                      <span>{r.direction === "in" ? "z" : "do"}</span>
                      <Link href={`/tym/${r.otherTeamId}`} className="inline-flex items-center gap-1 font-semibold text-gray-700 hover:underline">
                        {r.otherTeamBadge && (
                          <BadgePreview
                            primary={r.otherTeamBadge.primary}
                            secondary={r.otherTeamBadge.secondary}
                            pattern={r.otherTeamBadge.pattern as BadgePattern}
                            initials={r.otherTeamBadge.initials}
                            symbol={r.otherTeamBadge.symbol}
                            size={20}
                          />
                        )}
                        {r.otherTeamName}
                      </Link>
                    </>
                  )}
                  {r.fee > 0 && <span>· {fmtCZK(r.fee)}</span>}
                  {r.seasonNumber != null && <span>· sezóna {r.seasonNumber}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
