"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";

interface TransferRow {
  direction: "in" | "out";
  kind: "transfer" | "swap" | "free_agent" | "released";
  playerId: string;
  playerName: string;
  otherTeamId: string | null;
  otherTeamName: string | null;
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
            <li key={`${r.direction}-${r.playerId}-${r.date}-${i}`} className="py-2.5 flex items-start gap-3">
              <span
                className={`shrink-0 mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${r.direction === "in" ? "bg-pitch-500/15 text-pitch-600" : "bg-card-red/10 text-card-red"}`}
                aria-label={r.direction === "in" ? "Příchod" : "Odchod"}
              >
                {r.direction === "in" ? "→" : "←"}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/hrac/${r.playerId}`} className="text-base font-heading font-bold hover:underline">
                  {r.playerName}
                </Link>
                <div className="text-sm text-muted">
                  {KIND_LABEL[r.kind]}
                  {r.otherTeamId && r.otherTeamName && (
                    <>
                      {r.direction === "in" ? " z " : " do "}
                      <Link href={`/tym/${r.otherTeamId}`} className="font-semibold text-gray-700 hover:underline">{r.otherTeamName}</Link>
                    </>
                  )}
                  {r.fee > 0 && ` · ${fmtCZK(r.fee)}`}
                  {r.seasonNumber != null && ` · sezóna ${r.seasonNumber}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
