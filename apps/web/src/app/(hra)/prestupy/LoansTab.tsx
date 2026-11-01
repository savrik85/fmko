"use client";

/**
 * Přestupy → Můj tým → Hostování: koho klub půjčil a koho má půjčeného. U každého hráče
 * stav podmínky hraní a jak hraje; podrobnosti a stažení zpátky jsou na přehledu hostování.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PositionBadge, SectionLabel, Spinner } from "@/components/ui";
import { LOAN_STATE_STYLE, daysWord, type LoanOverview, type LoanSummary } from "@/lib/loans";

function LoanCard({ s, lent }: { s: LoanSummary; lent: boolean }) {
  const state = LOAN_STATE_STYLE[s.playingTimeState];
  const stats = [
    `${s.matches} ${s.matches === 1 ? "zápas" : s.matches >= 2 && s.matches <= 4 ? "zápasy" : "zápasů"}`,
    `${s.starts}× v základu`,
    `${s.minutes} min`,
    s.goals > 0 ? `${s.goals} ${s.goals === 1 ? "gól" : s.goals <= 4 ? "góly" : "gólů"}` : null,
    s.avgRating != null ? `známka ${s.avgRating.toLocaleString("cs-CZ")}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Link href={`/prestupy/hostovani/${s.agreementId}`} className="card p-4 block hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-heading font-bold text-base">{s.playerName}</span>
        <PositionBadge position={s.position as "GK" | "DEF" | "MID" | "FWD"} />
        <span className="text-sm text-muted">{s.age} let</span>
        <span className="text-sm text-muted">· rating <span className="font-heading font-bold text-ink">{s.rating ?? "–"}</span></span>
        {s.ratingChange != null && s.ratingChange !== 0 && (
          <span className={`text-sm font-heading font-bold ${s.ratingChange > 0 ? "text-pitch-700" : "text-red-800"}`}>
            {s.ratingChange > 0 ? `+${s.ratingChange}` : s.ratingChange}
          </span>
        )}
      </div>
      <div className="text-sm mt-1">
        {lent ? <>v klubu <span className="font-heading font-bold">{s.borrowerName}</span></> : <>od klubu <span className="font-heading font-bold">{s.lenderName}</span></>}
        <span className="text-muted">, vrací se za {s.daysLeft} {daysWord(s.daysLeft)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span>{s.playingTimeLabel}</span>
        {s.playingTime !== "none" && (
          <>
            <span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${state.className}`}>{state.label}</span>
            <span className="text-muted">{s.playingTimeSummary}</span>
          </>
        )}
      </div>
      <div className="text-sm text-muted mt-1">{stats}</div>
      <div className="text-sm font-heading font-bold text-pitch-500 mt-2">Podrobný přehled →</div>
    </Link>
  );
}

export function LoansTab({ teamId }: { teamId: string }) {
  const [data, setData] = useState<LoanOverview | null>(null);

  useEffect(() => {
    apiFetch<LoanOverview>(`/api/teams/${teamId}/loans`)
      .then(setData)
      .catch((e) => { console.error("načtení hostování:", e); setData({ lent: [], borrowed: [] }); });
  }, [teamId]);

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Půjčení hráči ({data.lent.length})</SectionLabel>
        {data.lent.length === 0 ? (
          <div className="card p-5 text-sm text-muted">
            Nikoho nemáš půjčeného. Hráče nabídneš na hostování z jeho profilu tlačítkem „Na hostování“.
          </div>
        ) : (
          <div className="space-y-3">{data.lent.map((s) => <LoanCard key={s.agreementId} s={s} lent />)}</div>
        )}
      </div>
      {data.borrowed.length > 0 && (
        <div>
          <SectionLabel>U nás na hostování ({data.borrowed.length})</SectionLabel>
          <div className="space-y-3">{data.borrowed.map((s) => <LoanCard key={s.agreementId} s={s} lent={false} />)}</div>
        </div>
      )}
    </div>
  );
}
