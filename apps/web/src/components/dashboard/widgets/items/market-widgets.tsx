"use client";

/** Widgety kolem trhu — volní hráči, hráči na prodej, dokončené přestupy v lize. */

import Link from "next/link";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import { ChartEmpty, compactCZK, fullCZK } from "../charts";
import type { WidgetProps } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { MoreLink } from "./shared";

const POSITION_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };

function PosTag({ position }: { position: string }) {
  return (
    <span className="text-micro font-heading font-bold uppercase text-muted w-8 shrink-0">
      {POSITION_LABELS[position] ?? position}
    </span>
  );
}

function Rating({ value }: { value: number }) {
  return (
    <span className={`font-heading font-bold text-sm tabular-nums px-1.5 py-0.5 rounded shrink-0 ${
      value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-50 text-ink" : "bg-gray-50 text-muted"
    }`}>{value}</span>
  );
}

// ── Volní hráči ─────────────────────────────────────────────────────────────

export function FreeAgentsWidget({ data, height }: WidgetProps) {
  if (data.freeAgents.loading) return <WidgetSkeleton />;
  if (data.freeAgents.error) return <WidgetError />;
  const agents = [...(data.freeAgents.data ?? [])].sort((a, b) => b.overallRating - a.overallRating);
  if (agents.length === 0) return <ChartEmpty>Na trhu není nikdo volný.</ChartEmpty>;

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">
        Volných hráčů <span className="font-heading font-bold text-ink tabular-nums">{agents.length}</span> · zdarma, platíš jen mzdu
      </div>
      <ul className="space-y-1">
        {agents.slice(0, rowsForHeight(height, ROW_PX.rich, 56)).map((a) => (
          <li key={a.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
            <PosTag position={a.position} />
            <div className="min-w-0 flex-1">
              <div className="font-heading font-bold text-sm truncate">{a.firstName} {a.lastName}</div>
              <div className="text-micro text-muted truncate">
                {a.age} let{a.villageName ? ` · ${a.villageName}` : ""}
                {a.distanceKm != null ? ` · ${Math.round(a.distanceKm)} km` : ""}
              </div>
            </div>
            <span className="text-sm text-muted tabular-nums shrink-0">{compactCZK(a.weeklyWage)}/t</span>
            <Rating value={a.overallRating} />
          </li>
        ))}
      </ul>
      <MoreLink href="/dashboard/transfers">Celý trh →</MoreLink>
    </div>
  );
}

// ── Hráči na trhu ───────────────────────────────────────────────────────────

export function MarketListingsWidget({ data, height }: WidgetProps) {
  if (data.market.loading) return <WidgetSkeleton />;
  if (data.market.error) return <WidgetError />;
  const listings = [...(data.market.data ?? [])].sort((a, b) => b.overallRating - a.overallRating);
  if (listings.length === 0) return <ChartEmpty>Nikdo teď nikoho neprodává.</ChartEmpty>;

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">
        Na prodej <span className="font-heading font-bold text-ink tabular-nums">{listings.length}</span> hráčů
      </div>
      <ul className="space-y-1">
        {listings.slice(0, rowsForHeight(height, ROW_PX.rich, 56)).map((l) => (
          <li key={l.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
            <PosTag position={l.position} />
            <div className="min-w-0 flex-1">
              <a href={`/dashboard/player/${l.playerId}`} className="font-heading font-bold text-sm truncate block hover:text-pitch-500 hover:underline transition-colors">
                {l.playerName}
              </a>
              <div className="text-micro text-muted truncate">{l.playerAge} let · {l.teamName}</div>
            </div>
            <span className="text-sm font-heading font-bold tabular-nums shrink-0">{compactCZK(l.askingPrice)}</span>
            <Rating value={l.overallRating} />
          </li>
        ))}
      </ul>
      <MoreLink href="/dashboard/transfers">Celý trh →</MoreLink>
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
      <ul className="space-y-1">
        {transfers.slice(0, rowsForHeight(height, ROW_PX.rich, 56)).map((t, i) => {
          const mine = t.toTeamId === teamId || t.fromTeamId === teamId;
          return (
            <li key={`${t.playerId}-${i}`} className={`py-1.5 border-b border-gray-50 last:border-b-0 ${mine ? "bg-pitch-50/40 -mx-1 px-1 rounded" : ""}`}>
              <div className="flex items-center gap-2">
                <a href={`/dashboard/player/${t.playerId}`} className="font-heading font-bold text-sm truncate min-w-0 flex-1 hover:text-pitch-500 hover:underline transition-colors">
                  {t.playerName}
                </a>
                <span className="text-sm font-heading font-bold tabular-nums shrink-0">
                  {/* U výměny je částka jen doplatek — psát ji jako cenu by z obchodu
                      za hráče udělalo výprodej za pár korun. */}
                  {t.isSwap ? <span className="text-sky-700">⇄&nbsp;výměna</span>
                    : t.fee > 0 ? compactCZK(t.fee) : "zdarma"}
                </span>
              </div>
              <div className="text-micro text-muted truncate">
                {t.fromTeam ?? "volný hráč"} <span className="text-muted-light">→</span>{" "}
                {t.toTeamId ? <Link href={`/dashboard/team/${t.toTeamId}`} className="hover:text-pitch-500 transition-colors">{t.toTeam}</Link> : t.toTeam}
              </div>
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
      <MoreLink href="/dashboard/transfers">Přehled přestupů →</MoreLink>
    </div>
  );
}
