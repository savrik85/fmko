"use client";

import { Card, CardBody, SectionLabel, Spinner } from "@/components/ui";
import { formatFavorDelta, formatGameDay } from "@/lib/sponsor-format";
import { FAVOR_BAND_LABELS, FAVOR_BAND_ORDER, favorLabel } from "@/lib/sponsor-owners";
import type { FavorBand, FirmFavorItem, SponsorOverview } from "@/lib/sponsor-page-types";
import { FavorBadge } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";

const BAND_COLORS: Record<FavorBand, string> = {
  loves: "bg-pitch-500",
  friendly: "bg-pitch-300",
  neutral: "bg-muted-light",
  cold: "bg-gold-400",
  hostile: "bg-card-red",
};

function FirmList({ firms, empty }: { firms: FirmFavorItem[]; empty: string }) {
  if (firms.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="divide-y divide-line-soft">
      {firms.map((f) => (
        <div key={f.sponsorId} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0 break-words">
            <SponsorLink id={f.sponsorId} name={f.name} className="font-heading font-bold text-base" />
            {f.ownerName && <div className="text-sm text-muted">{f.ownerName}</div>}
          </div>
          <FavorBadge favor={f.favor} />
        </div>
      ))}
    </div>
  );
}

export function PopularityTab({ overview, error }: { overview: SponsorOverview | null; error: string | null }) {
  if (error) {
    return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Přehled se nepodařilo načíst: {error}</div>;
  }
  if (!overview) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (overview.firmsCount === 0 || overview.avgFavor == null) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">V okrese zatím nejsou žádné firmy.</p></CardBody></Card>;
  }

  return (
    <div className="space-y-5">
      {/* ── Průměr a pořadí ── */}
      <Card>
        <CardBody>
          <div className="text-sm text-muted">Průměrná náklonnost firem v okrese</div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="font-heading font-bold text-3xl tabular-nums">{overview.avgFavor.toLocaleString("cs")}</span>
            <span className="text-base font-heading font-bold">{favorLabel(overview.avgFavor)}</span>
          </div>
          {overview.rank != null && (
            <div className="text-sm mt-2">
              <span className="font-heading font-bold">{overview.rank}. místo</span>{" "}
              z {overview.clubsInDistrict} {overview.clubsInDistrict === 1 ? "klubu" : "klubů"} v okrese
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Rozložení do pásem ── */}
      <section>
        <SectionLabel>Jak vás firmy vidí</SectionLabel>
        <Card>
          <CardBody className="space-y-3">
            {FAVOR_BAND_ORDER.map((band) => {
              const n = overview.bands[band];
              const pct = Math.round((n / overview.firmsCount) * 100);
              return (
                <div key={band}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{FAVOR_BAND_LABELS[band]}</span>
                    <span className="font-heading font-bold tabular-nums">{n}</span>
                  </div>
                  <div className="h-2.5 mt-1 rounded-full bg-surface-3 overflow-hidden"
                    role="img" aria-label={`${FAVOR_BAND_LABELS[band]}: ${n} z ${overview.firmsCount} firem`}>
                    <div className={`h-full rounded-full ${BAND_COLORS[band]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </section>

      {/* ── Nejoblíbenější a nejchladnější ── */}
      <section>
        <SectionLabel>Nejvíc vás mají rádi</SectionLabel>
        <Card>
          <CardBody>
            <FirmList firms={overview.top} empty="Zatím vás žádná firma nemá raději než ostatní. Zvěte majitele na zápasy a choďte s nimi na pivo." />
          </CardBody>
        </Card>
      </section>
      <section>
        <SectionLabel>Nejchladnější</SectionLabel>
        <Card>
          <CardBody>
            <FirmList firms={overview.coldest} empty="Žádná firma vás nemá v nelásce." />
          </CardBody>
        </Card>
      </section>

      {/* ── Poslední změny ── */}
      <section>
        <SectionLabel>Poslední změny</SectionLabel>
        <Card>
          <CardBody>
            {overview.recentChanges.length === 0 ? (
              <p className="text-sm text-muted">Zatím se nic nezměnilo.</p>
            ) : (
              <div className="divide-y divide-line-soft">
                {overview.recentChanges.map((ch, i) => (
                  <div key={`${ch.sponsorId}-${ch.gameDate}-${i}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0 break-words">
                      <SponsorLink id={ch.sponsorId} name={ch.sponsorName} className="font-heading font-bold text-base" />
                      <div className="text-sm text-muted">
                        {formatGameDay(ch.gameDate)}
                        {ch.ownerName ? ` · ${ch.ownerName}: ` : " · "}
                        {ch.reason}
                      </div>
                    </div>
                    <span className={`shrink-0 font-heading font-bold tabular-nums text-base ${ch.delta > 0 ? "text-pitch-500" : "text-card-red"}`}>
                      {formatFavorDelta(ch.delta)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
