"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LockDetail, SectionLabel, Spinner } from "@/components/ui";
import {
  EQUIPMENT_ICONS, condBarColor, condColor, daysLeft, formatCZK,
  type BazarData, type BazarListing, type MyListing,
} from "./types";

interface Props {
  data: BazarData | null;
  loading: boolean;
  budget: number;
  busy: string | null;
  onBuy: (listing: BazarListing) => void;
  onWithdraw: (listing: MyListing) => void;
}

type Sort = "cheapest" | "best_condition" | "biggest_saving";

const SORTS: Array<[Sort, string]> = [
  ["cheapest", "Nejlevnější"],
  ["best_condition", "Nejlepší stav"],
  ["biggest_saving", "Největší úspora"],
];

export function BazarTab({ data, loading, budget, busy, onBuy, onWithdraw }: Props) {
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sort, setSort] = useState<Sort>("cheapest");

  const listings = useMemo(() => {
    if (!data) return [];
    const filtered = onlyAvailable ? data.listings.filter((l) => l.canBuy) : data.listings;
    return [...filtered].sort((a, b) => {
      if (sort === "cheapest") return a.price - b.price;
      if (sort === "best_condition") return b.condition - a.condition;
      return b.savings - a.savings;
    });
  }, [data, onlyAvailable, sort]);

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!data) return <div className="card p-8 text-center text-muted">Bazar se nepodařilo načíst.</div>;

  return (
    <div className="space-y-5">
      {/* Moje nabídky */}
      {data.myListings.length > 0 && (
        <div className="card p-4">
          <SectionLabel>Moje nabídky</SectionLabel>
          <div className="space-y-2">
            {data.myListings.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className="text-2xl shrink-0">{EQUIPMENT_ICONS[l.category] ?? "📦"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold">{l.categoryLabel} <span className="text-muted font-normal">· úroveň {l.level}</span></div>
                  <div className="text-sm text-muted">
                    {formatCZK(l.price)} · stav <span className={condColor(l.condition)}>{l.condition} %</span> · {daysLeft(l.expiresAt)}
                  </div>
                </div>
                <button
                  onClick={() => onWithdraw(l)}
                  disabled={!!busy}
                  className="shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold border border-gray-300 text-muted hover:text-ink hover:border-gray-400 disabled:opacity-50 transition-colors"
                >
                  {busy === `w-${l.id}` ? "..." : "Stáhnout"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtry */}
      {data.listings.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setOnlyAvailable((v) => !v)}
            className={`py-1.5 px-3 rounded-lg text-sm font-heading font-bold transition-colors ${
              onlyAvailable ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"
            }`}
          >
            Jen co můžu koupit
          </button>
          <div className="flex gap-1 bg-surface rounded-lg p-1 ml-auto">
            {SORTS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`py-1.5 px-3 rounded text-sm font-heading font-bold transition-colors ${
                  sort === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nabídky */}
      {listings.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">📦</div>
          <div className="text-base text-muted">
            {data.listings.length === 0
              ? "V bazaru je zatím prázdno. Buď první, kdo něco nabídne."
              : "Žádná nabídka neprošla filtrem."}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {listings.map((l) => {
          const affordable = budget >= l.price;
          const canBuy = l.canBuy && affordable;
          return (
            <div key={l.id} className="card p-4 flex flex-col">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-2xl">{EQUIPMENT_ICONS[l.category] ?? "📦"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold">{l.categoryLabel}</div>
                  <div className="text-xs text-muted">{l.levelDescription}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className={`w-3 h-3 rounded-full ${n <= l.level ? "bg-pitch-400" : "bg-gray-200"}`} />
                  ))}
                </div>
              </div>

              <div className="text-sm text-muted mb-3">
                od <Link href={`/dashboard/team/${l.teamId}`} className="font-heading font-bold text-ink hover:text-pitch-600 transition-colors">{l.teamName}</Link>
              </div>

              {/* Stav je hlavní rozhodovací informace — proto nahoře a velký. */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted uppercase">Stav</span>
                  <span className={`text-sm font-heading font-bold tabular-nums ${condColor(l.condition)}`}>{l.condition} %</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className={`h-2 rounded-full ${condBarColor(l.condition)}`} style={{ width: `${l.condition}%` }} />
                </div>
              </div>

              {l.effect && <div className="text-sm text-pitch-600 mb-3">{l.effect}</div>}

              <div className="mt-auto space-y-1">
                <div className="text-base font-heading font-bold tabular-nums">{formatCZK(l.price)}</div>
                <div className="text-sm text-muted">
                  {l.shopPrice > 0 && (
                    <>
                      v obchodě {formatCZK(l.shopPrice)}{" "}
                      {l.savings > 0
                        ? <span className="text-pitch-600 font-heading font-bold">(ušetříš {formatCZK(l.savings)})</span>
                        : <span className="text-card-red font-heading font-bold">(v obchodě levněji)</span>}
                    </>
                  )}
                </div>
                <div className="text-sm text-muted">
                  Máš úroveň {l.myLevel}
                  {l.repairCostAfterBuy > 0 && <> · po koupi oprava {formatCZK(l.repairCostAfterBuy)}</>}
                </div>

                {l.lockDetail
                  ? <div className="pt-2"><LockDetail detail={l.lockDetail} fallback={l.blockReason ?? undefined} /></div>
                  : (
                    <button
                      onClick={() => onBuy(l)}
                      disabled={!canBuy || !!busy}
                      className={`w-full mt-2 py-2 rounded-lg text-sm font-heading font-bold transition-colors ${
                        canBuy ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {busy === `b-${l.id}` ? "..." : !l.canBuy ? (l.blockReason ?? "Nedostupné") : !affordable ? "Nedostatek peněz" : "Koupit"}
                    </button>
                  )}

                <div className="text-xs text-muted pt-1">{daysLeft(l.expiresAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Historie */}
      {data.history.length > 0 && (
        <div className="card p-4">
          <SectionLabel>Co jsem prodal</SectionLabel>
          <div className="space-y-1.5">
            {data.history.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-gray-100 last:border-0">
                <span className="text-lg shrink-0">{EQUIPMENT_ICONS[h.category] ?? "📦"}</span>
                <span className="font-heading font-bold">{h.categoryLabel}</span>
                <span className="text-muted">úroveň {h.level}</span>
                <span className="ml-auto text-muted">
                  {h.status === "sold" && <>prodáno {h.buyerName ? `do ${h.buyerName}` : ""} za <span className="font-heading font-bold text-pitch-600">{formatCZK(h.soldPrice ?? 0)}</span></>}
                  {h.status === "pawned" && <>zastaveno za <span className="font-heading font-bold text-gold-600">{formatCZK(h.soldPrice ?? 0)}</span></>}
                  {h.status === "expired" && "inzerát vypršel"}
                  {h.status === "withdrawn" && "staženo"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
