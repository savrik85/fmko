"use client";

/**
 * Přestupy → Závazky: všechny smluvní závazky klubu na jednom místě. Splátky přestupů
 * (co splácím a co mi chodí), procenta z příštího přestupu (co dlužím a na co mám nárok)
 * a hostování. Splátky se strhávají každé pondělí, i když je klub v minusu.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";

export interface Deal {
  id: string; playerId: string; playerName: string; otherTeamId: string; otherTeamName: string;
  totalAmount: number; upfrontAmount: number; installmentAmount: number;
  installmentsTotal: number; installmentsPaid: number; remaining: number;
  nextPayment: number; nextDue: string | null;
}
export interface Clause { id: string; playerId: string; playerName: string; otherTeamId: string; otherTeamName: string; pct: number }
interface Obligations {
  paying: Deal[]; receiving: Deal[]; sellOnOwed: Clause[]; sellOnClaims: Clause[];
  totals: { payThisWeek: number; receiveThisWeek: number; owedTotal: number; receivableTotal: number };
}

const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;
const dueLabel = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" }) : "pondělí");

export function DealCard({ deal, side }: { deal: Deal; side: "paying" | "receiving" }) {
  const paidSoFar = deal.totalAmount - deal.remaining;
  const pct = deal.totalAmount > 0 ? Math.round((paidSoFar / deal.totalAmount) * 100) : 0;
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <Link href={`/hrac/${deal.playerId}`} className="font-heading font-bold text-base hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
          {deal.playerName}
        </Link>
        <span className="text-sm text-muted">
          {side === "paying" ? "od " : "do "}
          <Link href={`/tym/${deal.otherTeamId}`} className="hover:text-pitch-500 underline decoration-pitch-500/20">{deal.otherTeamName}</Link>
        </span>
        <span className="ml-auto font-heading font-bold tabular-nums">{kc(deal.totalAmount)}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden" aria-label={`Splaceno ${pct} %`}>
        <div className="h-full bg-pitch-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm tabular-nums">
        <span className="text-muted">Záloha</span><span className="text-right">{kc(deal.upfrontAmount)}</span>
        <span className="text-muted">Splátky</span><span className="text-right">{deal.installmentsPaid} z {deal.installmentsTotal} · {kc(deal.installmentAmount)} týdně</span>
        <span className="text-muted">Zbývá {side === "paying" ? "doplatit" : "dostat"}</span><span className="text-right font-heading font-bold">{kc(deal.remaining)}</span>
        <span className="text-muted">Příští splátka</span><span className="text-right">{kc(deal.nextPayment)} · {dueLabel(deal.nextDue)}</span>
      </div>
      {side === "paying" && (
        <div className="text-sm text-muted">Když hráče prodáš dál, zbytek se doplatí hned z ceny prodeje.</div>
      )}
    </div>
  );
}

export function ClauseRow({ clause, side }: { clause: Clause; side: "owed" | "claim" }) {
  return (
    <div className="card p-3 flex items-baseline gap-2 flex-wrap">
      <Link href={`/hrac/${clause.playerId}`} className="font-heading font-bold text-base hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
        {clause.playerName}
      </Link>
      <span className="text-sm text-muted">
        {side === "owed" ? "pro " : "u "}
        <Link href={`/tym/${clause.otherTeamId}`} className="hover:text-pitch-500 underline decoration-pitch-500/20">{clause.otherTeamName}</Link>
      </span>
      <span className="ml-auto font-heading font-bold tabular-nums">{clause.pct} % z příštího přestupu</span>
    </div>
  );
}

export function ObligationsTab({ teamId, loans }: { teamId: string; loans: React.ReactNode }) {
  const [data, setData] = useState<Obligations | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<Obligations>(`/api/teams/${teamId}/obligations`)
      .then((r) => { setData(r); setFailed(false); })
      .catch((e) => { console.error("load obligations:", e); setFailed(true); });
  }, [teamId]);

  if (failed) return <div className="card p-6 text-center text-muted">Závazky se nepodařilo načíst.</div>;
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;

  const { paying, receiving, sellOnOwed, sellOnClaims, totals } = data;
  const nothing = paying.length + receiving.length + sellOnOwed.length + sellOnClaims.length === 0;

  return (
    <div className="space-y-5">
      {(paying.length > 0 || receiving.length > 0) && (
        <div className="card p-4 grid grid-cols-2 gap-3 text-sm tabular-nums">
          <div>
            <div className="text-muted">Příští pondělí zaplatím</div>
            <div className={`font-heading font-bold text-lg ${totals.payThisWeek > 0 ? "text-card-red" : "text-ink"}`}>{kc(totals.payThisWeek)}</div>
            <div className="text-muted">celkem dlužím {kc(totals.owedTotal)}</div>
          </div>
          <div className="text-right">
            <div className="text-muted">Příští pondělí dostanu</div>
            <div className={`font-heading font-bold text-lg ${totals.receiveThisWeek > 0 ? "text-pitch-600" : "text-ink"}`}>{kc(totals.receiveThisWeek)}</div>
            <div className="text-muted">celkem mi dluží {kc(totals.receivableTotal)}</div>
          </div>
          <div className="col-span-2 text-muted">Splátky se strhávají každé pondělí, i když je klub v minusu.</div>
        </div>
      )}

      {paying.length > 0 && (
        <div>
          <SectionLabel>Splácím</SectionLabel>
          <div className="space-y-2">{paying.map((d) => <DealCard key={d.id} deal={d} side="paying" />)}</div>
        </div>
      )}
      {receiving.length > 0 && (
        <div>
          <SectionLabel>Splácejí mi</SectionLabel>
          <div className="space-y-2">{receiving.map((d) => <DealCard key={d.id} deal={d} side="receiving" />)}</div>
        </div>
      )}
      {sellOnOwed.length > 0 && (
        <div>
          <SectionLabel>Procenta z přestupu, která dlužím</SectionLabel>
          <div className="space-y-2">{sellOnOwed.map((c) => <ClauseRow key={c.id} clause={c} side="owed" />)}</div>
          <div className="text-sm text-muted mt-1">Zaplatí se z ceny, až hráče prodáš. Když odejde zadarmo, procenta propadnou.</div>
        </div>
      )}
      {sellOnClaims.length > 0 && (
        <div>
          <SectionLabel>Procenta z přestupu, na která mám nárok</SectionLabel>
          <div className="space-y-2">{sellOnClaims.map((c) => <ClauseRow key={c.id} clause={c} side="claim" />)}</div>
        </div>
      )}

      {loans}

      {nothing && !loans && (
        <div className="card p-6 text-center text-muted">Žádné splátky, procenta ani hostování.</div>
      )}
    </div>
  );
}
