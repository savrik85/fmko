"use client";

import Link from "next/link";
import { Card, CardBody, SectionLabel } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative, weeklyAmount } from "@/lib/sponsor-format";
import type { ActiveContract, SponsorCategory, SponsorOffer, SponsorsData } from "@/lib/sponsor-page-types";
import { sponsorTypeLabel } from "@/lib/sponsor-types";
import { FavorLine } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";

export function ContractsTab({ data, reputation, favors, acting, onSign, onTerminate, onRenew }: {
  data: SponsorsData;
  reputation: number;
  /** sponsorId → náklonnost majitele k nám (firmy z okresu). */
  favors: Map<number, number>;
  acting: boolean;
  onSign: (offer: SponsorOffer, category: SponsorCategory) => void;
  onTerminate: (category: SponsorCategory, contractId?: string) => void;
  onRenew: (category: SponsorCategory, contractId?: string) => void;
}) {
  const favorOf = (c: ActiveContract): number | null => (c.sponsorId != null ? favors.get(c.sponsorId) ?? null : null);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Nabídky závisí na reputaci tvého klubu ({reputation}), ta určuje jejich počet i částku.{" "}
        <Link href="/reputace" className="text-pitch-600 underline">Jak ji zvednout →</Link>
      </p>

      {/* ── Hlavní sponzor ── */}
      <section>
        <SectionLabel>{"\u{1F4DD}"} Hlavní sponzor</SectionLabel>
        {data.mainContract ? (
          <div className="space-y-3">
            <ContractCard contract={data.mainContract} favor={favorOf(data.mainContract)} acting={acting}
              onTerminate={() => onTerminate("main")} onRenew={() => onRenew("main")} />
            {data.mainOffers.length > 0 && (
              <div>
                <div className="text-sm text-muted font-heading font-bold mb-2">Konkurenční nabídky: porovnej, jestli se vyplatí ukončit</div>
                {!data.canChangeMainSponsor && (
                  <div className="mb-2 text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">
                    Limit změny hlavního sponzora 1× za sezónu už je vyčerpaný. Smlouvu můžeš ukončit, novou ale podepíšeš až příští sezónu.
                  </div>
                )}
                <OffersList offers={data.mainOffers} category="main" onSign={onSign} acting={acting}
                  current={data.mainContract} signDisabled={!data.canChangeMainSponsor} />
              </div>
            )}
          </div>
        ) : !data.canChangeMainSponsor ? (
          <Card>
            <CardBody>
              <p className="text-center text-sm text-muted py-3">
                Tuto sezónu už nového hlavního sponzora podepsat nejde (limit 1× za sezónu).
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.mainExpired?.renewal && (
              <ExpiredRenewCard contract={data.mainExpired} favor={favorOf(data.mainExpired)} onRenew={() => onRenew("main")} acting={acting} />
            )}
            {data.mainExpired?.blockedReason && (
              <Card>
                <CardBody>
                  <SponsorLink id={data.mainExpired.sponsorId} name={data.mainExpired.sponsorName} className="font-heading font-bold text-base" />
                  <div className="text-sm text-muted">Smlouva vypršela a obnovit ji nejde: {data.mainExpired.blockedReason}.</div>
                </CardBody>
              </Card>
            )}
            <OffersList offers={data.mainOffers} category="main" onSign={onSign} acting={acting} />
          </div>
        )}
      </section>

      {/* ── Sponzor stadionu ── */}
      <section>
        <SectionLabel>{"\u{1F3DF}"} Sponzor stadionu {data.stadiumName ? `(${data.stadiumName})` : ""}</SectionLabel>
        {data.stadiumContract ? (
          <div className="space-y-3">
            <ContractCard contract={data.stadiumContract} favor={favorOf(data.stadiumContract)} acting={acting}
              onTerminate={() => onTerminate("stadium")} onRenew={() => onRenew("stadium")} />
            {data.stadiumOffers.length > 0 && (
              <div>
                <div className="text-sm text-muted font-heading font-bold mb-2">Konkurenční nabídky: porovnej, jestli se vyplatí ukončit</div>
                <OffersList offers={data.stadiumOffers} category="stadium" onSign={onSign} acting={acting} current={data.stadiumContract} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {data.stadiumExpired?.renewal && (
              <ExpiredRenewCard contract={data.stadiumExpired} favor={favorOf(data.stadiumExpired)} onRenew={() => onRenew("stadium")} acting={acting} />
            )}
            <OffersList offers={data.stadiumOffers} category="stadium" onSign={onSign} acting={acting} />
          </div>
        )}
      </section>

      {/* ── Reklamní bannery ── */}
      <section>
        <SectionLabel>{"\u{1F3AF}"} Reklamní bannery ({data.bannerContracts.length}/{data.maxBanners})</SectionLabel>
        {data.bannerContracts.length > 0 && (
          <div className="space-y-2 mb-3">
            {data.bannerContracts.map((c) => (
              <ContractCard key={c.id} contract={c} favor={favorOf(c)} acting={acting}
                onTerminate={() => onTerminate("banner", c.id)} onRenew={() => onRenew("banner", c.id)} />
            ))}
          </div>
        )}
        {data.bannerContracts.length >= data.maxBanners ? (
          <Card><CardBody><p className="text-center text-sm text-muted py-3">Maximální počet bannerů ({data.maxBanners}) je dosažen.</p></CardBody></Card>
        ) : data.bannerOffers.length > 0 ? (
          <>
            <p className="text-sm text-muted mb-2">Můžeš podepsat až {data.maxBanners - data.bannerContracts.length} dalších bannerů.</p>
            <OffersList offers={data.bannerOffers} category="banner" onSign={onSign} acting={acting} />
          </>
        ) : (
          <Card><CardBody><p className="text-center text-sm text-muted py-3">Žádné nabídky bannerů.</p></CardBody></Card>
        )}
      </section>
    </div>
  );
}

/** Aktivní smlouva: částky v jednom řádku, náklonnost majitele, prodloužení a výpověď. */
function ContractCard({ contract, favor, onTerminate, onRenew, acting }: {
  contract: ActiveContract; favor: number | null; onTerminate: () => void; onRenew: () => void; acting: boolean;
}) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="min-w-0">
          <SponsorLink id={contract.sponsorId} name={contract.sponsorName} className="font-heading font-bold text-base" />
          <div className="text-sm text-muted">{sponsorTypeLabel(contract.sponsorType)}</div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.monthlyAmount))}/týd</span>
          {contract.winBonus > 0 && <span className="text-pitch-400">+{formatCZK(contract.winBonus)} za výhru</span>}
          <span className="text-muted">zbývá {contract.seasonsRemaining} z {contract.seasonsTotal} sezón</span>
          <span className="text-card-red">sankce {formatCZK(contract.earlyTerminationFee)}</span>
        </div>
        {favor != null && <FavorLine favor={favor} />}
        {contract.renewal ? (
          <div className="text-sm text-muted">
            Prodloužení: <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.renewal.monthlyAmount))}/týd</span>{" "}
            na {seasonsAccusative(contract.renewal.seasons)}
          </div>
        ) : (
          <div className="text-sm text-muted">
            {contract.blockedReason
              ? `Smlouva skončí s koncem sezóny: ${contract.blockedReason}.`
              : "Prodloužit půjde v poslední sezóně smlouvy."}
          </div>
        )}
        <div className="pt-2 border-t border-line-soft flex items-center gap-5 flex-wrap">
          {contract.renewal && (
            <button onClick={onRenew} disabled={acting}
              className="min-h-11 text-sm text-pitch-600 hover:text-pitch-500 font-heading font-bold transition-colors disabled:opacity-50">
              🤝 Prodloužit smlouvu
            </button>
          )}
          <button onClick={onTerminate} disabled={acting}
            className="min-h-11 text-sm text-card-red hover:text-red-700 font-heading font-bold transition-colors disabled:opacity-50">
            Ukončit předčasně
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

/** Nedávno vypršelá smlouva: obnova se stejným sponzorem za aktuální podmínky. Cena je v info řádku, ne v tlačítku. */
function ExpiredRenewCard({ contract, favor, onRenew, acting }: {
  contract: ActiveContract; favor: number | null; onRenew: () => void; acting: boolean;
}) {
  const r = contract.renewal;
  if (!r) return null;
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="min-w-0">
          <SponsorLink id={contract.sponsorId} name={contract.sponsorName} className="font-heading font-bold text-base" />
          <div className="text-sm text-muted">Smlouva vypršela s koncem sezóny, sponzor je připraven jednat o nové.</div>
        </div>
        {favor != null && <FavorLine favor={favor} />}
        <div className="text-sm">
          Nové podmínky: <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(r.monthlyAmount))}/týd</span>{" "}
          na {seasonsAccusative(r.seasons)}
        </div>
        <button onClick={onRenew} disabled={acting} className="btn btn-primary btn-sm">🤝 Obnovit smlouvu</button>
      </CardBody>
    </Card>
  );
}

function OffersList({ offers, category, onSign, acting, current, signDisabled }: {
  offers: SponsorOffer[];
  category: SponsorCategory;
  onSign: (offer: SponsorOffer, category: SponsorCategory) => void;
  acting: boolean;
  current?: ActiveContract | null;
  signDisabled?: boolean;
}) {
  if (offers.length === 0) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">Žádné nabídky. Zvyš reputaci pro lepší sponzory.</p></CardBody></Card>;
  }
  // Sankce za ukončení aktuální smlouvy (poměrná podle zbývajících sezón), stejný vzorec jako handleTerminate na stránce.
  const currentTerminationFee = current ? Math.round(current.earlyTerminationFee * (current.seasonsRemaining / 3)) : 0;
  const currentWeekly = current ? weeklyAmount(current.monthlyAmount) : 0;
  return (
    <div className="space-y-2">
      {offers.map((offer, i) => {
        const offerWeekly = weeklyAmount(offer.monthlyAmount);
        const weeklyDelta = offerWeekly - currentWeekly;
        // Po kolika týdnech se odpočítá sankce za ukončení smlouvy?
        const payback = current && weeklyDelta > 0 ? Math.ceil(currentTerminationFee / weeklyDelta) : null;
        return (
          <Card key={`${offer.sponsorId}-${i}`}>
            <CardBody className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SponsorLink id={offer.sponsorId} name={offer.sponsorName} className="font-heading font-bold text-base" />
                  <div className="text-sm text-muted">{sponsorTypeLabel(offer.sponsorType)}</div>
                </div>
                <button onClick={() => onSign(offer, category)} disabled={acting || signDisabled}
                  title={signDisabled ? "Limit změny pro tuto sezónu vyčerpán" : undefined}
                  className="shrink-0 btn btn-primary btn-sm">
                  Podepsat
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className="text-pitch-500 font-heading font-bold">+{formatCZK(offerWeekly)}/týd</span>
                {offer.winBonus > 0 && <span className="text-pitch-400">+{formatCZK(offer.winBonus)} za výhru</span>}
                <span className="text-muted">na {seasonsAccusative(offer.seasons)}</span>
                <span className="text-card-red">sankce {formatCZK(offer.earlyTerminationFee)}</span>
              </div>
              {(category === "main" || offer.requirement) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gold-600">
                  {category === "main" && <span>Změní název klubu, -3 reputace</span>}
                  {offer.requirement && <span>{offer.requirement}</span>}
                </div>
              )}
              {current && (
                <div className="pt-1.5 border-t border-line-soft text-sm">
                  <span className="text-muted">Oproti {current.sponsorName}: </span>
                  <span className={weeklyDelta > 0 ? "text-pitch-500 font-heading font-bold" : weeklyDelta < 0 ? "text-card-red font-heading font-bold" : "text-muted"}>
                    {weeklyDelta > 0 ? "+" : ""}{formatCZK(weeklyDelta)}/týd
                  </span>
                  <span className="text-muted">. Sankce za ukončení: <span className="text-card-red font-bold">{formatCZK(currentTerminationFee)}</span>.</span>
                  {payback && (
                    <span className="text-muted"> Návratnost změny: <span className="font-bold">{payback} {payback === 1 ? "týden" : payback < 5 ? "týdny" : "týdnů"}</span>.</span>
                  )}
                  {weeklyDelta <= 0 && <span className="text-card-red"> Nevyplatí se.</span>}
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
