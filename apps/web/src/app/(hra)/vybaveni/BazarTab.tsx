"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LockDetail, ListCard, ListRow, ListEmpty, RowIcon, RowValue, SectionLoading } from "@/components/ui";
import { AmenityGainChip } from "@/components/equipment/amenity-gain-chip";
import { EQUIPMENT_ICONS, condBarColor, condColor, daysLeft, type BazarData, type BazarListing, type MyListing } from "./types";
import { formatKc } from "@/lib/format";

interface Props {
  data: BazarData | null;
  loading: boolean;
  budget: number;
  busy: string | null;
  onBuy: (listing: BazarListing) => void;
  onWithdraw: (listing: MyListing) => void;
  onReport: (listing: BazarListing) => void;
}

type Sort = "cheapest" | "best_condition" | "biggest_saving";

const SORTS: Array<[Sort, string]> = [
  ["cheapest", "Nejlevnější"],
  ["best_condition", "Nejlepší stav"],
  ["biggest_saving", "Největší úspora"],
];

export function BazarTab({ data, loading, budget, busy, onBuy, onWithdraw, onReport }: Props) {
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

  if (loading) return <SectionLoading />;
  if (!data) return <div className="card p-8 text-center text-muted">Bazar se nepodařilo načíst.</div>;

  return (
    <div className="space-y-5">
      {/* Moje nabídky */}
      {data.myListings.length > 0 && (
        <ListCard title="Moje nabídky" count={data.myListings.length}>
          {data.myListings.map((l) => (
            <ListRow key={l.id}
              leading={<RowIcon>{EQUIPMENT_ICONS[l.category] ?? "📦"}</RowIcon>}
              title={<>{l.categoryLabel} <span className="text-muted font-normal">· úroveň {l.level}</span></>}
              meta={<>{formatKc(l.price)} · stav <span className={condColor(l.condition)}>{l.condition} %</span> · {daysLeft(l.expiresAt)}</>}
              trailing={
                <button onClick={() => onWithdraw(l)} disabled={!!busy}
                  className="py-1.5 px-4 rounded-control text-sm font-bold border border-gray-300 text-muted hover:text-ink hover:border-gray-400 disabled:opacity-50 transition-colors">
                  {busy === `w-${l.id}` ? "..." : "Stáhnout"}
                </button>
              } />
          ))}
        </ListCard>
      )}

      {/* Filtry */}
      {data.listings.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setOnlyAvailable((v) => !v)}
            className={`py-1.5 px-3 rounded-soft text-sm font-heading font-bold transition-colors ${
              onlyAvailable ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"
            }`}
          >
            Jen co můžu koupit
          </button>
          <div className="flex gap-1 bg-surface rounded-soft p-1 ml-auto">
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

      {/* Nabídky. Řádek není odkaz: uvnitř je odkaz na klub, na incident a tlačítka. */}
      <ListCard>
        {listings.length === 0 && (
          <ListEmpty icon="📦">
            {data.listings.length === 0
              ? "V bazaru je zatím prázdno. Buď první, kdo něco nabídne."
              : "Žádná nabídka neprošla filtrem."}
          </ListEmpty>
        )}
        {listings.map((l) => {
          const affordable = budget >= l.price;
          const canBuy = l.canBuy && affordable;
          return (
            <ListRow key={l.id}
              leading={<RowIcon>{EQUIPMENT_ICONS[l.category] ?? "📦"}</RowIcon>}
              title={l.categoryLabel}
              trailing={<RowValue>{formatKc(l.price)}</RowValue>}
              detail={
                <span className="block space-y-1.5 mt-0.5">
                  <span className="flex items-start gap-2">
                    <span className="flex gap-1 shrink-0 pt-[3px]">
                      {[1, 2, 3].map((n) => (
                        <span key={n} className={`w-3 h-3 rounded-full ${n <= l.level ? "bg-pitch-400" : "bg-gray-200"}`} />
                      ))}
                    </span>
                    <span className="text-muted">{l.levelDescription}</span>
                  </span>

                  <span className="block text-muted">
                    od{" "}
                    {l.teamId ? (
                      <Link href={`/tym/${l.teamId}`} className="font-heading font-bold text-ink hover:text-pitch-600 transition-colors">{l.teamName}</Link>
                    ) : (
                      // Virtuální klub ze sousedního okresu: nemá stránku, na kterou odkázat.
                      <span className="font-heading font-bold text-ink">{l.teamName}</span>
                    )}
                    {l.isPrivateListing
                      ? <span> · soukromý inzerát</span>
                      : l.isAiListing && <span className="text-xs"> · z okolí</span>}
                  </span>

                  {l.vypadaJakoVase && (
                    <span className="block rounded-soft bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
                      Vypadá to jako vaše ukradené vybavení: {l.categoryLabel}.
                      {l.incidentId && (
                        <>
                          {" "}
                          <Link href={`/incidenty?id=${encodeURIComponent(l.incidentId)}`} className="font-heading font-bold underline">
                            Otevřít incident
                          </Link>
                        </>
                      )}
                    </span>
                  )}

                  {/* Stav je hlavní rozhodovací informace, proto hned nahoře. */}
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted uppercase">Stav</span>
                    <span className="flex-1 bg-gray-200 rounded-full h-2">
                      <span className={`block h-2 rounded-full ${condBarColor(l.condition)}`} style={{ width: `${l.condition}%` }} />
                    </span>
                    <span className={`font-heading font-bold tabular-nums ${condColor(l.condition)}`}>{l.condition} %</span>
                  </span>

                  {l.effect && (
                    <span className="block">
                      <span className="block text-pitch-600">{l.effect}</span>
                      {l.effectNote && <span className="block text-muted leading-snug mt-0.5">{l.effectNote}</span>}
                      {l.amenity && <AmenityGainChip amenity={l.amenity} />}
                    </span>
                  )}

                  {l.shopPrice > 0 && (
                    <span className="block text-muted">
                      v obchodě {formatKc(l.shopPrice)}{" "}
                      {l.savings > 0
                        ? <span className="text-pitch-600 font-heading font-bold">(ušetříš {formatKc(l.savings)})</span>
                        : <span className="text-card-red font-heading font-bold">(v obchodě levněji)</span>}
                    </span>
                  )}
                  <span className="block text-muted">
                    Máš úroveň {l.myLevel}
                    {l.repairCostAfterBuy > 0 && <> · po koupi oprava {formatKc(l.repairCostAfterBuy)}</>}
                  </span>

                  {l.lockDetail && <LockDetail detail={l.lockDetail} fallback={l.blockReason ?? undefined} />}
                  {(!l.lockDetail || l.lzeNahlasit) && (
                    <span className="flex flex-wrap gap-2 pt-1">
                      {!l.lockDetail && (
                        <button
                          onClick={() => onBuy(l)}
                          disabled={!canBuy || !!busy}
                          className={`py-2 px-4 rounded-soft text-sm font-heading font-bold transition-colors ${
                            canBuy ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          {busy === `b-${l.id}` ? "..." : !l.canBuy ? (l.blockReason ?? "Nedostupné") : !affordable ? "Nedostatek peněz" : "Koupit"}
                        </button>
                      )}
                      {l.lzeNahlasit && (
                        <button
                          onClick={() => onReport(l)}
                          disabled={!!busy}
                          className="py-2 px-4 rounded-soft text-sm font-heading font-bold border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                        >
                          {busy === `n-${l.id}` ? "..." : "Nahlásit policii"}
                        </button>
                      )}
                    </span>
                  )}

                  <span className="block text-xs text-muted">{daysLeft(l.expiresAt)}</span>
                </span>
              } />
          );
        })}
      </ListCard>

      {/* Historie */}
      {data.history.length > 0 && (
        <ListCard title="Co jsem prodal">
          {data.history.map((h, i) => (
            <ListRow key={i} dense
              leading={<span className="text-lg" aria-hidden="true">{EQUIPMENT_ICONS[h.category] ?? "📦"}</span>}
              title={<>{h.categoryLabel} <span className="text-muted font-normal">· úroveň {h.level}</span></>}
              trailing={
                <span className="text-meta text-muted text-right">
                  {h.status === "sold" && <>prodáno {h.buyerName ? `do ${h.buyerName}` : ""} za <span className="font-bold text-pitch-600">{formatKc(h.soldPrice ?? 0)}</span></>}
                  {h.status === "pawned" && <>zastaveno za <span className="font-bold text-gold-600">{formatKc(h.soldPrice ?? 0)}</span></>}
                  {h.status === "expired" && "inzerát vypršel"}
                  {h.status === "withdrawn" && "staženo"}
                </span>
              } />
          ))}
        </ListCard>
      )}
    </div>
  );
}
