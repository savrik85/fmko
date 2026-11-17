"use client";

/** Widgety kolem trhu — volní hráči, hráči na prodej, dokončené přestupy v lize. */

import Link from "next/link";
import { ListRow, RatingPill, ratingToneIn } from "@/components/ui";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import { ChartEmpty, compactCZK, fullCZK } from "../charts";
import type { WidgetProps } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { MoreLink } from "./shared";

const POSITION_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };

function PosTag({ position }: { position: string }) {
  return (
    <span className="text-micro font-heading font-bold uppercase text-muted">
      {POSITION_LABELS[position] ?? position}
    </span>
  );
}

// Řádky mají pod jménem jeden řádek údajů v `detail` (hustý řádek 54 px), proto ROW_PX.rich.
// Údaje se jako dřív smí useknout třemi tečkami, jméno ne.

// ── Volní hráči ─────────────────────────────────────────────────────────────

export function FreeAgentsWidget({ data, height }: WidgetProps) {
  if (data.freeAgents.loading) return <WidgetSkeleton />;
  if (data.freeAgents.error) return <WidgetError />;
  const agents = [...(data.freeAgents.data ?? [])].sort((a, b) => b.overallRating - a.overallRating);
  if (agents.length === 0) return <ChartEmpty>Na trhu není nikdo volný.</ChartEmpty>;
  const ratings = agents.map((a) => a.overallRating);

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">
        Volných hráčů <span className="font-heading font-bold text-ink tabular-nums">{agents.length}</span> · zdarma, platíš jen mzdu
      </div>
      <div className="-mx-4 sm:-mx-5">
        {agents.slice(0, rowsForHeight(height, ROW_PX.rich, 56)).map((a) => (
          <ListRow key={a.id} dense
            leading={<PosTag position={a.position} />}
            title={`${a.firstName} ${a.lastName}`}
            detail={
              <span className="block truncate text-muted">
                {a.age} let{a.villageName ? ` · ${a.villageName}` : ""}
                {a.origin ? ` · ${a.origin}` : ""}
                {a.distanceKm != null ? ` · ${Math.round(a.distanceKm)} km` : ""}
              </span>
            }
            trailing={
              <>
                <span className="text-meta text-muted tabular-nums">{compactCZK(a.weeklyWage)}/t</span>
                <RatingPill value={a.overallRating} tone={ratingToneIn(a.overallRating, ratings)} />
              </>
            } />
        ))}
      </div>
      <MoreLink href="/prestupy">Celý trh →</MoreLink>
    </div>
  );
}

// ── Hráči na trhu ───────────────────────────────────────────────────────────

export function MarketListingsWidget({ data, height }: WidgetProps) {
  if (data.market.loading) return <WidgetSkeleton />;
  if (data.market.error) return <WidgetError />;
  const listings = [...(data.market.data ?? [])].sort((a, b) => b.overallRating - a.overallRating);
  if (listings.length === 0) return <ChartEmpty>Nikdo teď nikoho neprodává.</ChartEmpty>;
  const ratings = listings.map((l) => l.overallRating);

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">
        Na prodej <span className="font-heading font-bold text-ink tabular-nums">{listings.length}</span> hráčů
      </div>
      <div className="-mx-4 sm:-mx-5">
        {listings.slice(0, rowsForHeight(height, ROW_PX.rich, 56)).map((l) => (
          <ListRow key={l.id} dense href={`/hrac/${l.playerId}`}
            leading={<PosTag position={l.position} />}
            title={l.playerName}
            detail={
              <span className="block truncate text-muted">
                {l.playerAge} let · {l.teamName}{l.origin ? ` · ${l.origin}` : ""}
              </span>
            }
            trailing={
              <>
                <span className="text-meta font-bold text-ink tabular-nums">{compactCZK(l.askingPrice)}</span>
                <RatingPill value={l.overallRating} tone={ratingToneIn(l.overallRating, ratings)} />
              </>
            } />
        ))}
      </div>
      <MoreLink href="/prestupy">Celý trh →</MoreLink>
    </div>
  );
}

// ── Poslední přestupy v lize ────────────────────────────────────────────────

export function LeagueTransfersWidget({ data, teamId, height }: WidgetProps) {
  if (data.leagueTransfers.loading) return <WidgetSkeleton />;
  if (data.leagueTransfers.error) return <WidgetError />;
  const transfers = data.leagueTransfers.data ?? [];
  if (transfers.length === 0) return <ChartEmpty>V lize se zatím nikdo nestěhoval.</ChartEmpty>;

  return (
    <div className="space-y-3">
      {/* Řádek má dva odkazy (hráč a nový klub), proto celý odkazem není.
          Vlastní přestup podbarvuje <li>; čáry mezi řádky proto kreslí divide-y. */}
      <ul className="-mx-4 sm:-mx-5 divide-y divide-line-soft">
        {transfers.slice(0, rowsForHeight(height, ROW_PX.rich, 56)).map((t, i) => {
          const mine = t.toTeamId === teamId || t.fromTeamId === teamId;
          return (
            <li key={`${t.playerId}-${i}`} className={mine ? "bg-pitch-50" : undefined}>
              <ListRow dense
                title={
                  <a href={`/hrac/${t.playerId}`} className="hover:text-pitch-500 hover:underline transition-colors">
                    {t.playerName}
                  </a>
                }
                detail={
                  <span className="block truncate text-muted">
                    {t.fromTeam ?? "volný hráč"} <span className="text-muted-light">→</span>{" "}
                    {t.toTeamId ? <Link href={`/tym/${t.toTeamId}`} className="hover:text-pitch-500 transition-colors">{t.toTeam}</Link> : t.toTeam}
                  </span>
                }
                trailing={
                  <span className="text-meta font-bold text-ink tabular-nums">
                    {/* U výměny je částka jen doplatek — psát ji jako cenu by z obchodu
                        za hráče udělalo výprodej za pár korun. */}
                    {t.isSwap ? <span className="text-sky-700">⇄&nbsp;výměna</span>
                      : t.fee > 0 ? compactCZK(t.fee) : "zdarma"}
                  </span>
                } />
            </li>
          );
        })}
      </ul>
      <div className="text-sm text-muted text-center">
        Objem{" "}
        <span className="font-heading font-bold text-ink tabular-nums">
          {fullCZK(transfers.reduce((s, t) => s + (t.isSwap ? 0 : (t.fee ?? 0)), 0))}
        </span>
      </div>
      <MoreLink href="/prestupy">Přehled přestupů →</MoreLink>
    </div>
  );
}
