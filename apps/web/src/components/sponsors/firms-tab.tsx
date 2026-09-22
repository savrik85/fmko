"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
import { FIRM_FILTERS, FIRM_SORTS, filterFirms, sortFirms, type FirmFilter, type FirmSort } from "@/lib/sponsor-firms";
import { formatCZK, personalityLabel } from "@/lib/sponsor-owners";
import type { DistrictFirm } from "@/lib/sponsor-page-types";
import { sponsorTypeLabel } from "@/lib/sponsor-types";
import { FavorBadge } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";

/** Firma z okresu: obor, majitel, čí je hlavním sponzorem (nebo odhad rozpočtu), náklonnost k nám. */
export function FirmCard({ firm: f }: { firm: DistrictFirm }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SponsorLink id={f.sponsorId} name={f.name} className="font-heading font-bold text-base" />
            <div className="text-sm text-muted">
              {sponsorTypeLabel(f.type)}
              {f.owner ? ` · ${f.owner.firstName} ${f.owner.lastName}, ${personalityLabel(f.owner.personality)}` : ""}
            </div>
            <div className="text-sm mt-1">
              {f.isMine
                ? "Váš hlavní sponzor"
                : f.mainHolder
                  ? <>Hlavní sponzor klubu <Link href={`/tym/${f.mainHolder.teamId}`} className="underline text-base">{f.mainHolder.teamName}</Link></>
                  : `Volný, rozpočet zhruba ${formatCZK(f.budgetEstimate.low)} až ${formatCZK(f.budgetEstimate.high)} měsíčně`}
            </div>
          </div>
          <FavorBadge favor={f.favor} />
        </div>
      </CardBody>
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 px-3 min-h-11 rounded-control text-sm font-heading font-bold transition-colors ${
        active ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function FirmsTab({ firms, mySponsorIds }: { firms: DistrictFirm[] | null; mySponsorIds: ReadonlySet<number> }) {
  const [filter, setFilter] = useState<FirmFilter>("all");
  const [sort, setSort] = useState<FirmSort>("favor");

  if (!firms) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">Firmy v okrese se nepodařilo načíst.</p></CardBody></Card>;
  }
  if (firms.length === 0) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">V okrese zatím nejsou žádné firmy.</p></CardBody></Card>;
  }

  const shown = sortFirms(filterFirms(firms, filter, mySponsorIds), sort);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Vztah k majitelům si budujte dopředu: pozvěte je na zápas, potkejte je v hospodě. Kdo vás má rád, dá víc.
      </p>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Filtr firem">
        {FIRM_FILTERS.map(({ key, label }) => (
          <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
            {label} ({filterFirms(firms, key, mySponsorIds).length})
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Řazení firem">
        <span className="shrink-0 text-sm text-muted mr-1">Řadit:</span>
        {FIRM_SORTS.map(({ key, label }) => (
          <Chip key={key} active={sort === key} onClick={() => setSort(key)}>{label}</Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card><CardBody><p className="text-center text-sm text-muted py-3">V tomhle výběru žádná firma není.</p></CardBody></Card>
      ) : (
        <div className="space-y-2">
          {shown.map((f) => <FirmCard key={f.sponsorId} firm={f} />)}
        </div>
      )}
    </div>
  );
}
