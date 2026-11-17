"use client";

/**
 * Přestupy → Závazky: všechny smluvní závazky klubu na jednom místě. Splátky přestupů
 * (co splácím a co mi chodí), procenta z příštího přestupu (co dlužím a na co mám nárok)
 * a hostování. Splátky se strhávají každé pondělí, i když je klub v minusu.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ListCard, ListEmpty, ListRow, RowValue, SectionLoading, ProgressBar } from "@/components/ui";
import { CPU_CLUB_ID } from "@okresni-masina/shared";
import { formatKc } from "@/lib/format";

/** Klub jako odkaz; cizí klub z trhu stránku nemá. */
function ClubName({ id, name }: { id: string; name: string }) {
  if (id === CPU_CLUB_ID) return <span>{name}</span>;
  return <Link href={`/tym/${id}`} className="hover:text-pitch-500 underline decoration-pitch-500/20">{name}</Link>;
}

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

const dueLabel = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" }) : "pondělí");

/** Splátky jednoho přestupu: řádek do `ListCard`. Jméno je odkaz, proto řádek sám odkazem není. */
export function DealCard({ deal, side }: { deal: Deal; side: "paying" | "receiving" }) {
  const paidSoFar = deal.totalAmount - deal.remaining;
  const pct = deal.totalAmount > 0 ? Math.round((paidSoFar / deal.totalAmount) * 100) : 0;
  return (
    <ListRow
      /* Částka na řádku se jménem, ne vpravo přes celý řádek: tabulka splátek pod ním
         pak má celou šířku a „511 Kč týdně“ ani datum splátky se nezalomí. */
      title={
        <span className="flex items-start justify-between gap-2">
          <Link href={`/hrac/${deal.playerId}`} className="min-w-0 hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
            {deal.playerName}
          </Link>
          <span className="shrink-0 tabular-nums">{formatKc(deal.totalAmount)}</span>
        </span>
      }
      meta={<>{side === "paying" ? "od " : "do "}<ClubName id={deal.otherTeamId} name={deal.otherTeamName} /></>}
      detail={<>
        <ProgressBar value={pct} label={`Splaceno ${pct} %`} className="mt-1.5" />
        <span className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 tabular-nums">
          <span className="text-muted">Záloha</span><span className="text-right">{formatKc(deal.upfrontAmount)}</span>
          <span className="text-muted">Splátky</span><span className="text-right">{deal.installmentsPaid} z {deal.installmentsTotal} · {formatKc(deal.installmentAmount)} týdně</span>
          <span className="text-muted">Zbývá {side === "paying" ? "doplatit" : "dostat"}</span><span className="text-right font-bold text-ink">{formatKc(deal.remaining)}</span>
          <span className="text-muted">Příští splátka</span><span className="text-right">{formatKc(deal.nextPayment)} · {dueLabel(deal.nextDue)}</span>
        </span>
        {side === "paying" && (
          <span className="block mt-1.5 text-muted">Když hráče prodáš dál, zbytek se doplatí hned z ceny prodeje.</span>
        )}
      </>} />
  );
}

/** Procenta z příštího přestupu: řádek do `ListCard`. */
export function ClauseRow({ clause, side }: { clause: Clause; side: "owed" | "claim" }) {
  return (
    <ListRow
      title={
        <Link href={`/hrac/${clause.playerId}`} className="hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
          {clause.playerName}
        </Link>
      }
      meta={<>
        {side === "owed" ? "pro " : "u "}
        <Link href={`/tym/${clause.otherTeamId}`} className="hover:text-pitch-500 underline decoration-pitch-500/20">{clause.otherTeamName}</Link>
      </>}
      trailing={<RowValue sub="z příštího přestupu">{clause.pct} %</RowValue>} />
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
  if (!data) return <SectionLoading />;

  const { paying, receiving, sellOnOwed, sellOnClaims, totals } = data;
  const nothing = paying.length + receiving.length + sellOnOwed.length + sellOnClaims.length === 0;

  return (
    <div className="space-y-5">
      {(paying.length > 0 || receiving.length > 0) && (
        <div className="card p-4 grid grid-cols-2 gap-3 text-sm tabular-nums">
          <div>
            <div className="text-muted">Příští pondělí zaplatím</div>
            <div className={`font-heading font-bold text-lg ${totals.payThisWeek > 0 ? "text-card-red" : "text-ink"}`}>{formatKc(totals.payThisWeek)}</div>
            <div className="text-muted">celkem dlužím {formatKc(totals.owedTotal)}</div>
          </div>
          <div className="text-right">
            <div className="text-muted">Příští pondělí dostanu</div>
            <div className={`font-heading font-bold text-lg ${totals.receiveThisWeek > 0 ? "text-pitch-600" : "text-ink"}`}>{formatKc(totals.receiveThisWeek)}</div>
            <div className="text-muted">celkem mi dluží {formatKc(totals.receivableTotal)}</div>
          </div>
          <div className="col-span-2 text-muted">Splátky se strhávají každé pondělí, i když je klub v minusu.</div>
        </div>
      )}

      {paying.length > 0 && (
        <ListCard title="Splácím">
          {paying.map((d) => <DealCard key={d.id} deal={d} side="paying" />)}
        </ListCard>
      )}
      {receiving.length > 0 && (
        <ListCard title="Splácejí mi">
          {receiving.map((d) => <DealCard key={d.id} deal={d} side="receiving" />)}
        </ListCard>
      )}
      {sellOnOwed.length > 0 && (
        <div>
          <ListCard title="Procenta z přestupu, která dlužím">
            {sellOnOwed.map((c) => <ClauseRow key={c.id} clause={c} side="owed" />)}
          </ListCard>
          <div className="text-sm text-muted mt-1">Zaplatí se z ceny, až hráče prodáš. Když odejde zadarmo, procenta propadnou.</div>
        </div>
      )}
      {sellOnClaims.length > 0 && (
        <ListCard title="Procenta z přestupu, na která mám nárok">
          {sellOnClaims.map((c) => <ClauseRow key={c.id} clause={c} side="claim" />)}
        </ListCard>
      )}

      {loans}

      {nothing && !loans && (
        <ListCard><ListEmpty icon="🧾">Žádné splátky, procenta ani hostování.</ListEmpty></ListCard>
      )}
    </div>
  );
}
