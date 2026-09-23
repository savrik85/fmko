"use client";

import { Card, CardBody, SectionLabel } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { formatGameDay, seasonsAccusative } from "@/lib/sponsor-format";
import type { NegotiationView } from "@/lib/sponsor-negotiation";

/** Co se podepíše: platby, stavba, všechny sliby s odměnou a pokutou. Bez tlačítka, to je na konci stránky. */
export function SigningSummary({ view }: { view: NegotiationView }) {
  const p = view.pending;
  if (!p) return null;
  const d = p.proposal.demands;
  return (
    <section>
      <SectionLabel>{view.status === "accepted" ? "Majitel souhlasí" : "Protinabídka k podpisu"}</SectionLabel>
      <Card>
        <CardBody className="space-y-2 text-sm">
          <div>Měsíčně <span className="font-heading font-bold text-pitch-600">{formatCZK(d.monthly)}</span> na {seasonsAccusative(p.proposal.seasons)}</div>
          {d.winBonus > 0 && <div>Za výhru {formatCZK(d.winBonus)}</div>}
          {d.signingBonus > 0 && <div>Za podpis hned {formatCZK(d.signingBonus)}</div>}
          {d.construction && <div>Sponzor zaplatí stavbu za {formatCZK(p.constructionCost)}</div>}
          {d.equipment && <div>Sponzor koupí vybavení za {formatCZK(p.equipmentCost)}</div>}
          {p.currentFee > 0 && <div>Sponzor zaplatí výpovědní pokutu {formatCZK(p.currentFee)}</div>}
          {view.current && !view.current.sameSponsor && p.currentFee === 0 && (
            <div className="text-card-red">Výpovědní pokutu {formatCZK(view.current.terminationFee)} u {view.current.sponsorName} platí klub.</div>
          )}
          <div className="text-muted">Výpovědní pokuta nové smlouvy {formatCZK(p.terminationFee)}.</div>
          {p.renamesClub && <div className="text-gold-600">Klub ponese jméno sponzora, -3 reputace.</div>}
          {p.promises.length > 0 && (
            <ul className="pt-2 border-t border-line-soft space-y-1.5">
              {p.promises.map((r, i) => (
                <li key={i}>
                  <span className="font-heading font-bold">{r.label}</span>
                  <span className="text-muted">
                    {r.season ? `, sezóna ${r.season}` : r.deadlineGameDate ? `, do ${formatGameDay(r.deadlineGameDate)}` : ", po celou smlouvu"}
                  </span>
                  <div>
                    {r.reward > 0 && <span className="text-pitch-600">odměna {formatCZK(r.reward)}, </span>}
                    <span className="text-card-red">pokuta {formatCZK(r.penalty)}</span>
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
