"use client";

/**
 * Podrobný přehled jednoho hostování: jak hráč hraje (zápasy, minuty, známky), jak se
 * zlepšuje (hodnocení a dovednosti od začátku hostování), jak trénuje (docházka,
 * zlepšení) a v jakém je stavu. Půjčující odsud hráče může stáhnout zpátky.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiAction, apiFetch } from "@/lib/api";
import { PositionBadge, SectionLabel, Spinner, useConfirm } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import {
  LOAN_STATE_STYLE, SKILL_LABELS, daysWord, shortDate, type LoanReport,
} from "@/lib/loans";

const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-soft bg-[var(--color-paper)] px-3 py-2.5">
      <div className="text-xs text-muted font-heading uppercase tracking-wide">{label}</div>
      <div className="font-heading font-bold text-xl tabular-nums text-ink">{value}</div>
      {note && <div className="text-xs text-muted">{note}</div>}
    </div>
  );
}

function Change({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted">beze změny</span>;
  return (
    <span className={`font-heading font-bold tabular-nums ${value > 0 ? "text-pitch-700" : "text-red-800"}`}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

export default function LoanReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId } = useTeam();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [data, setData] = useState<LoanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!teamId) return;
    apiFetch<LoanReport>(`/api/teams/${teamId}/loans/${params.id}`)
      .then((d) => { setData(d); setError(null); })
      .catch((e: Error) => { console.error("načtení přehledu hostování:", e); setError(e.message || "Přehled se nepodařilo načíst"); });
  }, [teamId, params.id]);

  useEffect(() => { load(); }, [load]);

  const recall = async () => {
    if (!teamId || !data || busy) return;
    const ok = await confirm({
      title: `Stáhnout ${data.playerName} z hostování?`,
      description: data.recall.breached
        ? `${data.borrowerName} neplní podmínku hraní, poplatek ti zůstane. Hráč se vrací hned.`
        : data.recall.refund > 0
          ? `Podmínka se plní, proto ${data.borrowerName} vrátíš část poplatku za dny, které u nich už nebude. Hráč se vrací hned.`
          : "Hráč se vrací hned.",
      details: data.recall.refund > 0 ? [{ label: "Vrátíš", value: kc(data.recall.refund), color: "text-card-red" }] : undefined,
      confirmLabel: "Stáhnout zpátky",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const done = await apiAction(apiFetch(`/api/teams/${teamId}/loans/${data.agreementId}/recall`, { method: "POST" }), "Stažení z hostování se nezdařilo");
    setBusy(false);
    if (done) router.push("/prestupy?tab=squad&tym=hostovani");
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="card p-6 text-center text-muted">{error}</div>
        <Link href="/prestupy?tab=squad&tym=hostovani" className="block text-center mt-4 text-sm underline">Zpět na hostování</Link>
      </div>
    );
  }
  if (!data) return <div className="flex justify-center py-16"><Spinner /></div>;

  const lent = data.role === "lender";
  const state = LOAN_STATE_STYLE[data.playingTimeState];
  const t = data.totals;
  const active = data.status === "active";
  const attendancePct = data.training.total > 0 ? Math.round((data.training.attended / data.training.total) * 100) : null;
  const ratingNow = data.rating ?? 0;
  const changedSkills = data.development.skills.filter((s) => s.now !== s.before);
  const steadySkills = data.development.skills.filter((s) => s.now === s.before);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
      <Link href="/prestupy?tab=squad&tym=hostovani" className="text-sm text-muted hover:text-pitch-500 underline decoration-pitch-500/20">
        ← Hostování
      </Link>

      {/* Hráč a hostování */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          {Object.keys(data.avatar).length > 0
            ? <FaceAvatar faceConfig={data.avatar} size={56} className="rounded-full shrink-0" />
            : <div className="w-14 h-14 rounded-full bg-gray-100 shrink-0" />}
          <div className="min-w-0">
            <Link href={`/hrac/${data.playerId}`} className="font-heading font-bold text-lg hover:text-pitch-500 underline decoration-pitch-500/20">
              {data.playerName}
            </Link>
            <div className="flex items-center gap-2 text-sm text-muted flex-wrap">
              <PositionBadge position={data.position as "GK" | "DEF" | "MID" | "FWD"} />
              <span>{data.age} let</span>
              <span>·</span>
              <span>rating <span className="font-heading font-bold text-ink">{ratingNow}</span></span>
              {data.ratingChange != null && data.ratingChange !== 0 && <Change value={data.ratingChange} />}
            </div>
          </div>
        </div>
        <p className="text-sm mt-3">
          {lent
            ? <>Půjčený do klubu <Link href={`/tym/${data.borrowerTeamId}`} className="font-heading font-bold underline decoration-pitch-500/20">{data.borrowerName}</Link></>
            : <>Na hostování od klubu <Link href={`/tym/${data.lenderTeamId}`} className="font-heading font-bold underline decoration-pitch-500/20">{data.lenderName}</Link></>}
          {" "}od {shortDate(data.startedAt)} do {shortDate(data.until)}
          {active && <> (zbývá {data.daysLeft} {daysWord(data.daysLeft)})</>}.
          {" "}Poplatek {data.fee > 0 ? kc(data.fee) : "žádný"}.
        </p>
        {!active && <p className="text-sm text-muted mt-1">Hostování už skončilo.</p>}
      </div>

      {/* Podmínka hraní */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Podmínka hraní</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading font-bold">{data.playingTimeLabel}</span>
          {data.playingTime !== "none" && (
            <span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${state.className}`}>{state.label}</span>
          )}
        </div>
        {data.playingTime !== "none" && (
          <p className="text-sm text-muted mt-1">
            {data.playingTimeSummary}
            {data.playingTimeCheck.eligible > 0 && data.playingTimeCheck.required > 0 && <>, potřeba aspoň {data.playingTimeCheck.required}</>}.
            {" "}Počítají se ligové zápasy, ve kterých mohl hrát. Hodnotí se od 3. zápasu.
          </p>
        )}
        {!lent && data.playingTimeState === "at_risk" && (
          <p className="text-sm text-amber-800 mt-2">
            Když v příštím zápase {data.playingTime === "starter" ? "nezačne v základu" : "nenastoupí"}, podmínka padne a {data.lenderName} ho může stáhnout.
          </p>
        )}
        {!lent && data.playingTimeState === "breached" && (
          <p className="text-sm text-red-800 mt-2">Slib se neplní. {data.lenderName} může hráče kdykoli stáhnout zpátky a poplatek si nechá.</p>
        )}
      </div>

      {/* Jak hraje */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Jak hraje</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Zápasy" value={String(t.matches)} note={t.missed > 0 ? `${t.missed}× chyběl` : undefined} />
          <Stat label="V základu" value={String(t.starts)} />
          <Stat label="Minuty" value={String(t.minutes)} />
          <Stat label="Průměrná známka" value={t.avgRating != null ? t.avgRating.toLocaleString("cs-CZ") : "–"} />
          <Stat label="Góly" value={String(t.goals)} />
          <Stat label="Asistence" value={String(t.assists)} />
          <Stat label="Žluté" value={String(t.yellowCards)} />
          <Stat label="Červené" value={String(t.redCards)} />
        </div>

        {data.matchLines.length === 0 ? (
          <p className="text-sm text-muted mt-3">Od začátku hostování zatím neodehráli žádný ligový zápas.</p>
        ) : (
          <div className="mt-4 overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted font-heading uppercase tracking-wide">
                  <th className="py-1.5 px-1 font-normal">Datum</th>
                  <th className="py-1.5 px-1 font-normal">Soupeř</th>
                  <th className="py-1.5 px-1 font-normal text-center">Skóre</th>
                  <th className="py-1.5 px-1 font-normal">Hrál</th>
                  <th className="py-1.5 px-1 font-normal text-right">Známka</th>
                </tr>
              </thead>
              <tbody>
                {[...data.matchLines].reverse().map((m) => (
                  <tr key={m.matchId} className="border-t border-gray-100 align-top">
                    <td className="py-2 px-1 tabular-nums whitespace-nowrap">{shortDate(m.playedAt)}</td>
                    <td className="py-2 px-1">
                      <span className="text-muted">{m.home ? "doma" : "venku"}</span> {m.opponentName}
                    </td>
                    <td className="py-2 px-1 text-center tabular-nums whitespace-nowrap">
                      {m.goalsFor ?? "–"}:{m.goalsAgainst ?? "–"}
                    </td>
                    <td className="py-2 px-1">
                      {m.minutes > 0 ? (
                        <>
                          {m.started ? "v základu" : "střídal"}, {m.minutes} min
                          {m.goals > 0 && <>, {m.goals}× gól</>}
                          {m.assists > 0 && <>, {m.assists}× asistence</>}
                          {m.redCards > 0 ? <>, červená</> : m.yellowCards > 0 ? <>, žlutá</> : null}
                        </>
                      ) : m.available ? (
                        <span className="text-amber-800">nehrál</span>
                      ) : (
                        <span className="text-muted">chyběl: {(m.absenceReason ?? "").toLowerCase()}</span>
                      )}
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums font-heading font-bold">
                      {m.rating != null ? m.rating.toLocaleString("cs-CZ", { maximumFractionDigits: 1 }) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Jak se zlepšuje */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Jak se zlepšuje</SectionLabel>
        <p className="text-sm">
          Rating na začátku <span className="font-heading font-bold tabular-nums">{data.development.startRating ?? "–"}</span>,
          teď <span className="font-heading font-bold tabular-nums">{ratingNow}</span>
          {data.ratingChange != null && <> (<Change value={data.ratingChange} />)</>}.
        </p>
        {data.development.sinceBaseline && (
          <p className="text-sm text-muted mt-1">
            Hostování začalo dřív, než hra vývoj sledovala. Změny se počítají od chvíle, kdy se přehled založil.
          </p>
        )}
        {data.development.skills.length > 0 && (
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {[...changedSkills, ...steadySkills].map((s) => (
              <li key={s.key} className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-1">
                <span>{SKILL_LABELS[s.key] ?? s.key}</span>
                <span className="tabular-nums">
                  <span className="text-muted">{s.before} → </span>
                  <span className="font-heading font-bold">{s.now}</span>{" "}
                  {s.now !== s.before && <Change value={s.now - s.before} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Jak trénuje */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Jak trénuje</SectionLabel>
        <p className="text-sm">
          {data.training.total > 0
            ? <>Na tréninku byl <span className="font-heading font-bold tabular-nums">{data.training.attended}× z {data.training.total}</span> ({attendancePct} %).</>
            : "Od začátku hostování zatím žádný trénink."}
        </p>
        {data.training.gains.length > 0 ? (
          <>
            <div className="text-xs text-muted font-heading uppercase tracking-wide mt-3 mb-1">Zlepšení z tréninku a zápasů</div>
            <div className="flex flex-wrap gap-2">
              {data.training.gains.map((g) => (
                <span key={g.key} className="text-sm px-2 py-1 rounded-soft bg-[var(--color-paper)]">
                  {SKILL_LABELS[g.key] ?? g.key} <Change value={g.change} />
                </span>
              ))}
            </div>
          </>
        ) : data.training.total > 0 ? (
          <p className="text-sm text-muted mt-1">Zatím se v ničem nezlepšil.</p>
        ) : null}
      </div>

      {/* Teď */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Jak na tom je teď</SectionLabel>
        <ul className="text-sm space-y-1">
          <li>Kondice: <span className="font-heading font-bold tabular-nums">{data.now.condition != null ? `${Math.round(data.now.condition)} %` : "–"}</span></li>
          <li>Nálada: <span className="font-heading font-bold">{data.now.mood}</span></li>
          <li>
            {data.now.injuryDays
              ? <>Zraněný: {data.now.injury ?? "zranění"}, ještě {data.now.injuryDays} {daysWord(data.now.injuryDays)}.</>
              : "Zdravý."}
          </li>
        </ul>
      </div>

      {lent && data.recall.allowed && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Stáhnout zpátky</SectionLabel>
          <p className="text-sm">
            {data.recall.breached
              ? `${data.borrowerName} neplní podmínku hraní. Když hráče stáhneš, poplatek ti zůstane.`
              : data.recall.refund > 0
                ? `Podmínka se plní. Když hráče stáhneš teď, vrátíš ${data.borrowerName} ${kc(data.recall.refund)} z poplatku za zbývající dny.`
                : "Hráče můžeš stáhnout kdykoli, vrátí se hned."}
          </p>
          <button onClick={recall} disabled={busy}
            className="mt-3 w-full sm:w-auto py-2.5 px-5 rounded-soft text-sm font-heading font-bold bg-red-700 text-white hover:bg-red-800 disabled:opacity-50">
            {busy ? "Stahuji..." : "Stáhnout zpátky"}
          </button>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
