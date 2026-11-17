"use client";

import { ListCard, ListEmpty, ListRow, Spinner, StatusChip } from "@/components/ui";
import { seasonsAccusative, weeklyAmount } from "@/lib/sponsor-format";

import type { ActiveContract, SponsorCategory, SponsorHistoryItem } from "@/lib/sponsor-page-types";
import { SponsorLink } from "./sponsor-link";
import { formatKc } from "@/lib/format";

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
        <ListCard title="Hlavní sponzoři podle sezón">
          {mains.map((m) => (
            <ListRow key={m.id} dense
              title={<SponsorLink id={m.sponsorId} name={m.sponsorName} />}
              trailing={<span className="text-sm text-muted tabular-nums">od sezóny {m.signedSeason}</span>} />
          ))}
          {mainContract && (
            <ListRow dense
              title={<SponsorLink id={mainContract.sponsorId} name={mainContract.sponsorName} />}
              trailing={<StatusChip tone="ok">současný</StatusChip>} />
          )}
        </ListCard>
      )}

      <ListCard title="Skončené smlouvy">
        {items.length === 0 && <ListEmpty icon="📄">Zatím žádná skončená smlouva.</ListEmpty>}
        {items.map((i) => (
          <ListRow key={i.id}
            title={<SponsorLink id={i.sponsorId} name={i.sponsorName} />}
            meta={CATEGORY_LABELS[i.category]}
            detail={`${i.signedSeason != null ? `Podepsána v sezóně ${i.signedSeason}, ` : ""}na ${seasonsAccusative(i.seasonsTotal)}. Naposledy ${formatKc(weeklyAmount(i.monthlyAmount))} týdně.`}
            trailing={<StatusChip tone={i.status === "terminated" ? "danger" : "neutral"}>{STATUS_LABELS[i.status]}</StatusChip>} />
        ))}
      </ListCard>
    </div>
  );
}
