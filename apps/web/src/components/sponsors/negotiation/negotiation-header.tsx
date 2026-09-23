"use client";

import { Card, CardBody } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { SponsorLink } from "@/components/sponsors/sponsor-link";
import { formatGameDay, remainingSeasonsText } from "@/lib/sponsor-format";
import { categoryLabel, PROMISE_LABELS, type NegotiationView, type Range } from "@/lib/sponsor-negotiation";
import { favorLabel, formatCZK, personalityLabel } from "@/lib/sponsor-owners";

function pokusy(n: number): string {
  return n === 1 ? "1 pokus" : n >= 2 && n <= 4 ? `${n} pokusy` : `${n} pokusů`;
}

export function NegotiationHeader({ view, estimate, cost }: { view: NegotiationView; estimate: Range; cost: number }) {
  const name = `${view.owner.firstName} ${view.owner.lastName}`;
  const over = cost > estimate.high;
  const under = cost <= estimate.low;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-4">
          <FaceAvatar faceConfig={view.owner.faceConfig} size={64} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-sm text-muted font-heading uppercase tracking-wide">
              {categoryLabel(view.category)}{view.isRenewal ? " · prodloužení" : ""}
            </div>
            <SponsorLink id={view.sponsorId} name={view.sponsorName} className="font-heading font-bold text-base" />
            <div className="text-sm text-muted">
              {name}, {personalityLabel(view.owner.personality)} · {favorLabel(view.favor)} ({view.favor})
            </div>
          </div>
        </div>

        {view.wishes.length > 0 && (
          <div>
            <div className="text-sm text-muted mb-1">Majitel by rád slyšel:</div>
            <div className="flex flex-wrap gap-1.5">
              {view.wishes.map((w) => (
                <span key={w} className="px-2.5 py-1 rounded-full bg-gold-50 text-gold-700 text-sm font-heading font-bold">{PROMISE_LABELS[w]}</span>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm space-y-1">
          <div>Trpělivost: <span className="font-heading font-bold">{pokusy(view.patience)}</span> na odmítnutí</div>
          <div className="text-muted">Jednání platí do {formatGameDay(view.expiresGameDate)}.</div>
          <div>
            Ochota zhruba <span className="font-heading font-bold">{formatCZK(estimate.low)} až {formatCZK(estimate.high)}</span> měsíčně.
            Tvůj návrh ho stojí <span className={`font-heading font-bold ${over ? "text-card-red" : under ? "text-pitch-600" : "text-gold-600"}`}>{formatCZK(cost)}</span> měsíčně.
          </div>
          <p className="text-sm text-muted">Čím lepší vztah s majitelem, tím přesnější odhad.</p>
        </div>

        {view.current && (
          <div className="pt-3 border-t border-line-soft text-sm">
            <div className="text-muted">
              {view.current.sameSponsor ? "Současná smlouva" : `Současný sponzor ${view.current.sponsorName}`}:{" "}
              <span className="font-heading font-bold text-ink">{formatCZK(view.current.monthlyAmount)}</span> měsíčně
              {view.current.winBonus > 0 ? `, ${formatCZK(view.current.winBonus)} za výhru` : ""}, {remainingSeasonsText(view.current.seasonsRemaining).toLowerCase()}.
            </div>
            {!view.current.sameSponsor && view.current.terminationFee > 0 && (
              <div className="text-card-red">Přechod znamená výpovědní pokutu {formatCZK(view.current.terminationFee)}.</div>
            )}
            {!view.current.sameSponsor && view.current.isLegacy && (
              <div className="text-pitch-600">Přechod ze staré smlouvy je zdarma: žádná výpovědní pokuta ani ztráta reputace.</div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
