"use client";

/**
 * Hostování na profilu hráče: komu je půjčený (nebo odkud ho máme), do kdy, podmínka hraní
 * a jak se plní. Odkaz vede na podrobný přehled. Hráče, který na hostování není, karta
 * neukáže.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";
import { LOAN_STATE_STYLE, daysWord, type LoanOverview, type LoanSummary } from "@/lib/loans";

export function LoanStatusCard({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [loan, setLoan] = useState<{ s: LoanSummary; lent: boolean } | null>(null);

  useEffect(() => {
    apiFetch<LoanOverview>(`/api/teams/${teamId}/loans`)
      .then((d) => {
        const lent = d.lent.find((l) => l.playerId === playerId);
        const borrowed = d.borrowed.find((l) => l.playerId === playerId);
        setLoan(lent ? { s: lent, lent: true } : borrowed ? { s: borrowed, lent: false } : null);
      })
      .catch((e) => console.error("načtení hostování hráče:", e));
  }, [teamId, playerId]);

  if (!loan) return null;
  const { s, lent } = loan;
  const state = LOAN_STATE_STYLE[s.playingTimeState];

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>Hostování</SectionLabel>
        <Link href={`/prestupy/hostovani/${s.agreementId}`} className="text-sm text-muted hover:text-pitch-500 underline decoration-pitch-500/20">
          Podrobný přehled
        </Link>
      </div>
      <p className="text-sm">
        {lent ? <>Půjčený do klubu <Link href={`/tym/${s.borrowerTeamId}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20">{s.borrowerName}</Link></>
          : <>Na hostování od klubu <Link href={`/tym/${s.lenderTeamId}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20">{s.lenderName}</Link></>}
        {", "}vrací se za {s.daysLeft} {daysWord(s.daysLeft)}.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-heading font-bold">{s.playingTimeLabel}</span>
        {s.playingTime !== "none" && (
          <>
            <span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${state.className}`}>{state.label}</span>
            <span className="text-muted">{s.playingTimeSummary}</span>
          </>
        )}
      </div>
      {!lent && s.playingTimeState === "breached" && (
        <p className="text-sm text-red-800 mt-2">Slib se neplní. {s.lenderName} může hráče kdykoli stáhnout zpátky.</p>
      )}
      {!lent && s.playingTimeState === "at_risk" && (
        <p className="text-sm text-amber-800 mt-2">
          Když v příštím zápase {s.playingTime === "starter" ? "nezačne v základu" : "nenastoupí"}, podmínka padne.
        </p>
      )}
    </div>
  );
}
