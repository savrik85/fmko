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

/**
 * Kola jednání od nejnovějšího: co klub navrhl a co majitel odpověděl. Úvodní nabídka majitele
 * (kind "offer") není návrh klubu, ukazuje se bez něj a do číslování kol se nepočítá.
 */
export function RoundsHistory({ rounds, ownerName, onUseCounter }: {
  rounds: NegotiationRound[]; ownerName: string; onUseCounter?: (p: Proposal) => void;
}) {
  if (rounds.length === 0) return null;
  let clubRound = 0;
  const numbered = rounds.map((r) => ({ r, no: r.response.kind === "offer" ? null : ++clubRound }));
  const ordered = [...numbered].reverse();
  return (
    <Card>
      <CardBody className="space-y-3">
        {ordered.map(({ r, no }, i) => {
          const isOffer = r.response.kind === "offer";
          return (
            <div key={rounds.length - i} className={i > 0 ? "pt-3 border-t border-line-soft" : ""}>
              {isOffer
                ? <div className="text-sm font-heading font-bold text-gold-600">{RESPONSE_LABELS.offer}</div>
                : <div className="text-sm text-muted">Kolo {no}: {summary(r.proposal)}</div>}
              <div className="text-base mt-1">
                <span className="font-heading font-bold">{ownerName}:</span> „{r.response.text}“
              </div>
              {!isOffer && <div className="text-sm font-heading font-bold text-gold-600">{RESPONSE_LABELS[r.response.kind]}</div>}
              {r.response.counter && (
                <div className="text-sm mt-1">
                  {isOffer ? "Nabídka" : "Protinabídka"}: {summary(r.response.counter)}
                  {i === 0 && onUseCounter && (
                    <button type="button" onClick={() => onUseCounter(r.response.counter!)} className="block min-h-11 text-sm text-pitch-600 font-heading font-bold">
                      Vrátit nabídku majitele do formuláře
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
