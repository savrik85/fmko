"use client";

import { Card, CardBody, SectionLabel } from "@/components/ui";

import { formatGameDay, seasonsAccusative } from "@/lib/sponsor-format";
import type { NegotiationView } from "@/lib/sponsor-negotiation";
import { formatKc } from "@/lib/format";

/** Co se podepíše: platby, stavba, všechny sliby s odměnou a pokutou. Bez tlačítka, to je na konci stránky. */
export function SigningSummary({ view }: { view: NegotiationView }) {
  const p = view.pending;
  if (!p) return null;
  const d = p.proposal.demands;
  const lastKind = view.rounds[view.rounds.length - 1]?.response.kind;
  return (
    <section>
      <SectionLabel>{view.status === "accepted" ? "Majitel souhlasí" : lastKind === "offer" ? "Nabídka majitele k podpisu" : "Protinabídka k podpisu"}</SectionLabel>
      <Card>
        <CardBody className="space-y-2 text-sm">
          <div>Měsíčně <span className="font-heading font-bold text-pitch-600">{formatKc(d.monthly)}</span> na {seasonsAccusative(p.proposal.seasons)}</div>
          {d.winBonus > 0 && <div>Za výhru {formatKc(d.winBonus)}</div>}
          {d.signingBonus > 0 && <div>Za podpis hned {formatKc(d.signingBonus)}</div>}
          {d.construction && <div>Sponzor zaplatí stavbu za {formatKc(p.constructionCost)}</div>}
          {d.equipment && <div>Sponzor koupí vybavení za {formatKc(p.equipmentCost)}</div>}
          {p.currentFee > 0 && <div>Sponzor zaplatí výpovědní pokutu {formatKc(p.currentFee)}</div>}
          {view.current && !view.current.sameSponsor && p.currentFee === 0 && view.current.terminationFee > 0 && (
            <div className="text-card-red">Výpovědní pokutu {formatKc(view.current.terminationFee)} u {view.current.sponsorName} platí klub.</div>
          )}
          {view.current && !view.current.sameSponsor && view.current.isLegacy && (
            <div className="text-pitch-600">Přechod ze staré smlouvy je zdarma: žádná výpovědní pokuta ani ztráta reputace.</div>
          )}
          {view.current && view.current.clawback > 0 && (
            <div className="text-card-red">
              Klub vrací nesplacenou zálohu ze současné smlouvy {formatKc(view.current.clawback)} (část příspěvku za podpis a darů).
            </div>
          )}
          {view.current && !view.current.sameSponsor && (view.current.forfeitPenalty ?? 0) > 0 && (
            <div className="text-card-red">
              Propadlé sliby: pokuta {formatKc(view.current.forfeitPenalty ?? 0)} (sliby této sezóny a sliby s termínem u {view.current.sponsorName}).
            </div>
          )}
          <div className="text-muted">Výpovědní pokuta nové smlouvy {formatKc(p.terminationFee)}.</div>
          {p.renamesClub && p.reputationPenalty > 0 && <div className="text-gold-600">Klub ponese jméno sponzora, -3 reputace.</div>}
          {p.renamesClub && p.reputationPenalty === 0 && <div className="text-muted">Klub ponese jméno sponzora.</div>}
          {p.promises.length > 0 && (
            <ul className="pt-2 border-t border-line-soft space-y-1.5">
              {p.promises.map((r, i) => (
                <li key={i}>
                  <span className="font-heading font-bold">{r.label}</span>
                  <span className="text-muted">
                    {r.season ? `, sezóna ${r.season}` : r.deadlineGameDate ? `, do ${formatGameDay(r.deadlineGameDate)}` : ", po celou smlouvu"}
                  </span>
                  <div>
                    {r.reward > 0 && <span className="text-pitch-600">odměna {formatKc(r.reward)}, </span>}
                    <span className="text-card-red">pokuta {formatKc(r.penalty)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
