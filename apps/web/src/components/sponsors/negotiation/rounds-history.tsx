"use client";

import { Card, CardBody } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative } from "@/lib/sponsor-format";
import { PROMISE_LABELS, RESPONSE_LABELS, type NegotiationRound, type Proposal } from "@/lib/sponsor-negotiation";

function summary(p: Proposal): string {
  const parts = [`${formatCZK(p.demands.monthly)} měsíčně`, `na ${seasonsAccusative(p.seasons)}`];
  if (p.demands.winBonus > 0) parts.push(`${formatCZK(p.demands.winBonus)} za výhru`);
  if (p.demands.signingBonus > 0) parts.push(`${formatCZK(p.demands.signingBonus)} za podpis`);
  if (p.promises.length > 0) parts.push(`sliby: ${p.promises.map((s) => PROMISE_LABELS[s.kind].toLowerCase()).join(", ")}`);
  return parts.join(", ");
}

/** Kola jednání od nejnovějšího: co klub navrhl a co majitel odpověděl. */
export function RoundsHistory({ rounds, ownerName, onUseCounter }: {
  rounds: NegotiationRound[]; ownerName: string; onUseCounter?: (p: Proposal) => void;
}) {
  if (rounds.length === 0) return null;
  const ordered = [...rounds].reverse();
  return (
    <Card>
      <CardBody className="space-y-3">
        {ordered.map((r, i) => (
          <div key={rounds.length - i} className={i > 0 ? "pt-3 border-t border-line-soft" : ""}>
            <div className="text-sm text-muted">Kolo {rounds.length - i}: {summary(r.proposal)}</div>
            <div className="text-base mt-1">
              <span className="font-heading font-bold">{ownerName}:</span> „{r.response.text}“
            </div>
            <div className="text-sm font-heading font-bold text-gold-600">{RESPONSE_LABELS[r.response.kind]}</div>
            {r.response.counter && (
              <div className="text-sm mt-1">
                Protinabídka: {summary(r.response.counter)}
                {i === 0 && onUseCounter && (
                  <button type="button" onClick={() => onUseCounter(r.response.counter!)} className="block min-h-11 text-sm text-pitch-600 font-heading font-bold">
                    Upravit protinabídku a navrhnout znovu
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
