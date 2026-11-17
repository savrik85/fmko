"use client";

import { MANAGER_FANS_BANDS } from "@okresni-masina/shared";
import { DataTable } from "@/components/ui";

type Band = (typeof MANAGER_FANS_BANDS)[number];

const signed = (v: number) => `${v > 0 ? "+" : ""}${v}`;
const tone = (v: number) => (v > 0 ? "text-pitch-600" : v < 0 ? "text-card-red" : "text-ink");

/**
 * Stupně vlivu trenéra na fanoušky: rozsah vlivu, dopad po zápase, loajalita a jak to
 * fanoušci berou. Stejná tabulka je v Nápovědě i u Fanoušků; u Fanoušků s vyznačeným
 * stupněm, ve kterém klub právě je.
 */
export function ManagerFansBandsTable({ currentKey }: { currentKey?: string }) {
  const rangeOf = (band: Band) => {
    const i = MANAGER_FANS_BANDS.indexOf(band);
    const upper = i === 0 ? null : MANAGER_FANS_BANDS[i - 1].min - 1;
    return upper === null ? `${band.min} a víc` : band.min === 0 ? `${upper} a míň` : `${band.min}–${upper}`;
  };
  return (
    <DataTable
      rows={[...MANAGER_FANS_BANDS]} rowKey={(b) => b.key}
      rowTone={(b) => ({ own: b.key === currentKey })}
      empty="Stupně vlivu nejsou k dispozici."
      columns={[
        { key: "range", header: "Vliv", align: "left", cell: (b) => <span className="whitespace-nowrap tabular-nums">{rangeOf(b)}</span> },
        { key: "match", header: "Po zápase", align: "right", width: "w-20", cell: (b) => <span className={`font-bold ${tone(b.matchBoost)}`}>{signed(b.matchBoost)}</span> },
        { key: "loyalty", header: "Loajalita", align: "right", width: "w-20", priority: 2, cell: (b) => signed(b.loyaltyOffset) },
        { key: "view", header: "Jak to fanoušci berou", align: "left", cell: (b) => <span className="text-meta">{b.fanView}</span> },
      ]} />
  );
}
