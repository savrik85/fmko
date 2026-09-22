"use client";

import { Card, CardBody, SectionLabel, Spinner } from "@/components/ui";
import { seasonsAccusative, weeklyAmount } from "@/lib/sponsor-format";
import { formatCZK } from "@/lib/sponsor-owners";
import type { ActiveContract, SponsorCategory, SponsorHistoryItem } from "@/lib/sponsor-page-types";
import { SponsorLink } from "./sponsor-link";

const CATEGORY_LABELS: Record<SponsorCategory, string> = {
  main: "Hlavní sponzor",
  stadium: "Sponzor stadionu",
  banner: "Reklamní banner",
};

const STATUS_LABELS: Record<SponsorHistoryItem["status"], string> = {
  expired: "Vypršela",
  terminated: "Vypovězena",
};

export function HistoryTab({ items, error, mainContract }: { items: SponsorHistoryItem[] | null; error: string | null; mainContract: ActiveContract | null }) {
  if (error) {
    return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Historii se nepodařilo načíst: {error}</div>;
  }
  if (!items) return <div className="flex justify-center py-8"><Spinner /></div>;

  // Kdo byl hlavním sponzorem od které sezóny (jen smlouvy se známou sezónou podpisu), od nejstarší.
  // Aktuální hlavní smlouva (pokud existuje) jde na konec časové osy, i když ještě neskončila.
  const mains = items
    .filter((i): i is SponsorHistoryItem & { signedSeason: number } => i.category === "main" && i.signedSeason != null)
    .sort((a, b) => a.signedSeason - b.signedSeason);

  return (
    <div className="space-y-5">
      {(mains.length > 0 || mainContract) && (
        <section>
          <SectionLabel>Hlavní sponzoři podle sezón</SectionLabel>
          <Card>
            <CardBody className="space-y-2">
              {mains.map((m) => (
                <div key={m.id} className="flex items-baseline gap-3">
                  <span className="w-28 shrink-0 text-sm text-muted tabular-nums">od sezóny {m.signedSeason}</span>
                  <SponsorLink id={m.sponsorId} name={m.sponsorName} className="font-heading font-bold text-base min-w-0" />
                </div>
              ))}
              {mainContract && (
                <div className="flex items-baseline gap-3">
                  <span className="w-28 shrink-0 text-sm text-pitch-500 font-heading font-bold tabular-nums">současný</span>
                  <SponsorLink id={mainContract.sponsorId} name={mainContract.sponsorName} className="font-heading font-bold text-base min-w-0" />
                </div>
              )}
            </CardBody>
          </Card>
        </section>
      )}

      <section>
        <SectionLabel>Skončené smlouvy</SectionLabel>
        {items.length === 0 ? (
          <Card><CardBody><p className="text-center text-sm text-muted py-3">Zatím žádná skončená smlouva.</p></CardBody></Card>
        ) : (
          <div className="space-y-2">
            {items.map((i) => (
              <Card key={i.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <SponsorLink id={i.sponsorId} name={i.sponsorName} className="font-heading font-bold text-base" />
                      <div className="text-sm text-muted">
                        {CATEGORY_LABELS[i.category]}
                        {i.signedSeason != null ? ` · podepsána v sezóně ${i.signedSeason}` : ""}
                        {` · na ${seasonsAccusative(i.seasonsTotal)}`}
                      </div>
                      <div className="text-sm">Naposledy {formatCZK(weeklyAmount(i.monthlyAmount))} týdně</div>
                    </div>
                    <span className={`shrink-0 text-sm font-heading font-bold ${i.status === "terminated" ? "text-card-red" : "text-muted"}`}>
                      {STATUS_LABELS[i.status]}
                    </span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
