"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { BadgePreview, ListCard, ListRow, ListEmpty } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { formatKc } from "@/lib/format";

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
    <ListCard title="Přehled přestupů" count={rows.length || undefined}>
      {rows.length === 0 && <ListEmpty icon="🔁">Zatím žádné přestupy. Tady se objeví každý hráč, který přišel nebo odešel.</ListEmpty>}
      {rows.map((r, i) => (
        <ListRow key={`${r.direction}-${r.playerId}-${r.date}-${i}`}
          leading={r.playerAvatar && Object.keys(r.playerAvatar).length > 2
            ? <FaceAvatar faceConfig={r.playerAvatar} size={30} className="rounded-full bg-surface-3" />
            : <span className="w-9 h-9 rounded-full bg-surface-3" aria-hidden="true" />}
          title={<Link href={`/hrac/${r.playerId}`} className="hover:text-pitch-600">{r.playerName}</Link>}
          detail={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className={`font-bold ${r.direction === "in" ? "text-pitch-600" : "text-card-red"}`}>
                {r.direction === "in" ? "→" : "←"} {KIND_LABEL[r.kind]}
              </span>
              {r.otherTeamName && (
                <>
                  <span>{r.direction === "in" ? "z" : "do"}</span>
                  {/* Klub mimo hru (skaut, inzerát, cizí kupec) nemá stránku: jméno bez odkazu. */}
                  {r.otherTeamId ? (
                    <Link href={`/tym/${r.otherTeamId}`} className="inline-flex items-center gap-1 font-semibold text-gray-700 hover:underline">
                      <OtherTeamBadge badge={r.otherTeamBadge} />
                      {r.otherTeamName}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-gray-700">
                      <OtherTeamBadge badge={r.otherTeamBadge} />
                      {r.otherTeamName}
                    </span>
                  )}
                </>
              )}
              {r.fee > 0 && <span>· {formatKc(r.fee)}</span>}
              {r.seasonNumber != null && <span>· sezóna {r.seasonNumber}</span>}
            </span>
          } />
      ))}
    </ListCard>
  );
}

function OtherTeamBadge({ badge }: { badge: TransferRow["otherTeamBadge"] }) {
  if (!badge) return null;
  return (
    <BadgePreview
      primary={badge.primary}
      secondary={badge.secondary}
      pattern={badge.pattern as BadgePattern}
      initials={badge.initials}
      symbol={badge.symbol}
      size={20}
    />
  );
}
