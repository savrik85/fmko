"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardBody, ListCard, ListEmpty, ListRow, ChoiceGroup } from "@/components/ui";
import { FIRM_FILTERS, FIRM_SORTS, filterFirms, sortFirms, type FirmFilter, type FirmSort } from "@/lib/sponsor-firms";
import { personalityLabel } from "@/lib/sponsor-owners";
import type { DistrictFirm } from "@/lib/sponsor-page-types";
import { sponsorTypeLabel } from "@/lib/sponsor-types";
import { FavorBadge } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";
import { formatKc } from "@/lib/format";

/**
 * Firma z okresu: obor, majitel, čí je hlavním sponzorem (nebo odhad rozpočtu), náklonnost k nám.
 * `isOurStadiumSponsor`: firma je náš sponzor stadionu. Hlavním sponzorem nikoho není, ale „Volný"
 * by klamalo, s klubem už smlouvu má.
 */
export function FirmRow({ firm: f, isOurStadiumSponsor = false }: { firm: DistrictFirm; isOurStadiumSponsor?: boolean }) {
  return (
    <ListRow
      title={<SponsorLink id={f.sponsorId} name={f.name} />}
      meta={`${sponsorTypeLabel(f.type)}${f.owner ? ` · ${f.owner.firstName} ${f.owner.lastName}, ${personalityLabel(f.owner.personality)}` : ""}`}
      trailing={<FavorBadge favor={f.favor} />}
      detail={<>
        <span className="block text-sm">
          {f.isMine
            ? "Váš hlavní sponzor"
            : f.mainHolder
              ? <>Hlavní sponzor klubu <Link href={`/tym/${f.mainHolder.teamId}`} className="underline text-base">{f.mainHolder.teamName}</Link></>
              : isOurStadiumSponsor
                ? "Váš sponzor stadionu"
                : `Volný, bez slibů zhruba ${formatKc(f.budgetEstimate.base.low)} až ${formatKc(f.budgetEstimate.base.high)}, se sliby až ${formatKc(f.budgetEstimate.cap.high)} měsíčně`}
        </span>
        {!f.isMine && !f.mainHolder && (
          <Link href={`/sponzor/${f.sponsorId}`} className="inline-block min-h-11 leading-[2.75rem] text-sm text-pitch-600 font-heading font-bold">
            🤝 Jednat o smlouvě
          </Link>
        )}
      </>} />
  );
}


export function FirmsTab({ firms, mySponsorIds, stadiumSponsorId = null }: {
  firms: DistrictFirm[] | null;
  mySponsorIds: ReadonlySet<number>;
  /** sponsorId našeho sponzora stadionu (null = žádný). */
  stadiumSponsorId?: number | null;
}) {
  const [filter, setFilter] = useState<FirmFilter>("all");
  const [sort, setSort] = useState<FirmSort>("favor");

  if (!firms) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">Firmy v okrese se nepodařilo načíst.</p></CardBody></Card>;
  }
  if (firms.length === 0) {
    return <ListCard><ListEmpty icon="🏢">V okrese zatím nejsou žádné firmy.</ListEmpty></ListCard>;
  }

  const shown = sortFirms(filterFirms(firms, filter, mySponsorIds), sort);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Vztah k majitelům si budujte dopředu: pozvěte je na zápas, potkejte je v hospodě. Kdo vás má rád, dá víc.
      </p>

      <ChoiceGroup ariaLabel="Filtr firem" value={filter} onChange={setFilter}
        options={FIRM_FILTERS.map(({ key, label }) => ({ value: key, label: `${label} (${filterFirms(firms, key, mySponsorIds).length})` }))} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-sm text-muted">Řadit:</span>
        <ChoiceGroup ariaLabel="Řazení firem" size="sm" value={sort} onChange={setSort}
          options={FIRM_SORTS.map(({ key, label }) => ({ value: key, label }))} />
      </div>

      <ListCard>
        {shown.length === 0 && <ListEmpty icon="🏢">V tomhle výběru žádná firma není.</ListEmpty>}
        {shown.map((f) => <FirmRow key={f.sponsorId} firm={f} isOurStadiumSponsor={f.sponsorId === stadiumSponsorId} />)}
      </ListCard>
    </div>
  );
}
