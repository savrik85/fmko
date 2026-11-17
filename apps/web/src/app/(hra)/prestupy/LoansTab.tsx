"use client";

/**
 * Přestupy → Můj tým → Hostování: koho klub půjčil a koho má půjčeného. U každého hráče
 * stav podmínky hraní a jak hraje; podrobnosti a stažení zpátky jsou na přehledu hostování.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ListCard, ListEmpty, ListRow, PositionBadge, RatingPill, Spinner, StatusChip, type RowTone } from "@/components/ui";
import { LOAN_STATE_STYLE, daysWord, type LoanOverview, type LoanSummary } from "@/lib/loans";

const STATE_CHIP_TONE: Record<LoanSummary["playingTimeState"], "ok" | "warn" | "danger" | "neutral"> = {
  none: "neutral",
  pending: "neutral",
  ok: "ok",
  at_risk: "warn",
  breached: "danger",
};

const STATE_ROW_TONE: Partial<Record<LoanSummary["playingTimeState"], RowTone>> = {
  at_risk: "warn",
  breached: "danger",
};

/** Jeden hráč na hostování; celý řádek vede na podrobný přehled. */
function LoanRow({ s, lent }: { s: LoanSummary; lent: boolean }) {
  const state = LOAN_STATE_STYLE[s.playingTimeState];
  const hasCondition = s.playingTime !== "none";
  const stats = [
    `${s.matches} ${s.matches === 1 ? "zápas" : s.matches >= 2 && s.matches <= 4 ? "zápasy" : "zápasů"}`,
    `${s.starts}× v základu`,
    `${s.minutes} min`,
    s.goals > 0 ? `${s.goals} ${s.goals === 1 ? "gól" : s.goals <= 4 ? "góly" : "gólů"}` : null,
    s.avgRating != null ? `známka ${s.avgRating.toLocaleString("cs-CZ")}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <ListRow href={`/prestupy/hostovani/${s.agreementId}`}
      tone={hasCondition ? STATE_ROW_TONE[s.playingTimeState] : undefined}
      title={s.playerName}
      meta={<><PositionBadge position={s.position} /> {s.age} let</>}
      trailing={
        // Hodnocení a o kolik se změnilo od začátku hostování.
        <span className="inline-flex items-center gap-1.5">
          {s.ratingChange != null && s.ratingChange !== 0 && (
            <span className={`text-meta font-bold tabular-nums ${s.ratingChange > 0 ? "text-pitch-700" : "text-red-800"}`}>
              {s.ratingChange > 0 ? `+${s.ratingChange}` : s.ratingChange}
            </span>
          )}
          <RatingPill value={s.rating ?? "-"} />
        </span>
      }
      detail={<>
        <span className="block">
          {lent ? <>v klubu <span className="font-bold text-ink">{s.borrowerName}</span></> : <>od klubu <span className="font-bold text-ink">{s.lenderName}</span></>}
          <span className="text-muted">, vrací se za {s.daysLeft} {daysWord(s.daysLeft)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
          <span>{s.playingTimeLabel}</span>
          {hasCondition && (
            <>
              <StatusChip tone={STATE_CHIP_TONE[s.playingTimeState]}>{state.label}</StatusChip>
              <span className="text-muted">{s.playingTimeSummary}</span>
            </>
          )}
        </span>
        <span className="block text-muted mt-1">{stats}</span>
      </>} />
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
      <ListCard title="Půjčení hráči" count={data.lent.length}>
        {data.lent.length === 0 ? (
          <ListEmpty icon="🤝">
            Nikoho nemáš půjčeného. Hráče nabídneš na hostování z jeho profilu tlačítkem „Na hostování“.
          </ListEmpty>
        ) : (
          data.lent.map((s) => <LoanRow key={s.agreementId} s={s} lent />)
        )}
      </ListCard>
      {data.borrowed.length > 0 && (
        <ListCard title="U nás na hostování" count={data.borrowed.length}>
          {data.borrowed.map((s) => <LoanRow key={s.agreementId} s={s} lent={false} />)}
        </ListCard>
      )}
    </div>
  );
}
