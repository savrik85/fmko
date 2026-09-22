"use client";

import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
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

export function FirmsTab({ firms }: { firms: DistrictFirm[] | null }) {
  if (!firms) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">Firmy v okrese se nepodařilo načíst.</p></CardBody></Card>;
  }
  if (firms.length === 0) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">V okrese zatím nejsou žádné firmy.</p></CardBody></Card>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Vztah k majitelům si budujte dopředu: pozvěte je na zápas, potkejte je v hospodě. Kdo vás má rád, dá víc.
      </p>
      {firms.map((f) => <FirmCard key={f.sponsorId} firm={f} />)}
    </div>
  );
}
