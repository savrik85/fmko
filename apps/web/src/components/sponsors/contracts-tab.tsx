"use client";

import Link from "next/link";
import { Card, CardBody, SectionLabel } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative, weeklyAmount, seasonsGenitive } from "@/lib/sponsor-format";
import type { ActiveContract, SponsorCategory, SponsorOffer, SponsorPromiseView, SponsorsData } from "@/lib/sponsor-page-types";
import { sponsorTypeLabel } from "@/lib/sponsor-types";
import { ContractPromises } from "./contract-promises";
import { FavorLine } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";

export function ContractsTab({ data, reputation, favors, acting, onSign, onTerminate, onRenew, promisesByContract, onSleeveLogo }: {
  data: SponsorsData;
  reputation: number;
  /** sponsorId → náklonnost majitele k nám (firmy z okresu). */
  favors: Map<number, number>;
  acting: boolean;
  onSign: (offer: SponsorOffer, category: SponsorCategory) => void;
  onTerminate: (category: SponsorCategory, contractId?: string) => void;
  onRenew: (category: SponsorCategory, contractId?: string) => void;
  /** contractId → sliby u té smlouvy (GET /sponsor-promises). */
  promisesByContract: Map<string, SponsorPromiseView[]>;
  onSleeveLogo: (promiseId: string) => void;
}) {
  const favorOf = (c: ActiveContract): number | null => (c.sponsorId != null ? favors.get(c.sponsorId) ?? null : null);
  const promisesOf = (c: ActiveContract): SponsorPromiseView[] => promisesByContract.get(c.id) ?? [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Nabídky závisí na reputaci tvého klubu ({reputation}), ta určuje jejich počet i částku.{" "}
        <Link href="/reputace" className="text-pitch-600 underline">Jak ji zvednout →</Link>
      </p>

      {/* ── Hlavní sponzor a stadion: jen jednáním s majitelem firmy ── */}
      {(["main", "stadium"] as const).map((cat) => {
        const active = cat === "main" ? data.mainContract : data.stadiumContract;
        const expired = cat === "main" ? data.mainExpired : data.stadiumExpired;
        const running = data.negotiations.filter((n) => n.category === cat);
        return (
          <section key={cat}>
            <SectionLabel>
              {cat === "main" ? "\u{1F4DD} Hlavní sponzor" : `\u{1F3DF} Sponzor stadionu ${data.stadiumName ? `(${data.stadiumName})` : ""}`}
            </SectionLabel>
            <div className="space-y-3">
              {active && (
                <ContractCard contract={active} favor={favorOf(active)} acting={acting}
                  promises={promisesOf(active)} onSleeveLogo={onSleeveLogo}
                  onTerminate={() => onTerminate(cat)} onRenew={() => onRenew(cat)} />
              )}
              {!active && expired && (
                <Card>
                  <CardBody className="space-y-1">
                    <SponsorLink id={expired.sponsorId} name={expired.sponsorName} className="font-heading font-bold text-base" />
                    <div className="text-sm text-muted">
                      {expired.renewable
                        ? "Smlouva vypršela. O nové se domluvíš s majitelem firmy."
                        : `Smlouva vypršela a obnovit ji nejde: ${expired.blockedReason ?? "firma teď nejedná"}.`}
                    </div>
                    {expired.renewable && expired.sponsorId && (
                      <Link href={`/sponzor/${expired.sponsorId}`} className="inline-block min-h-11 leading-[2.75rem] text-sm text-pitch-600 font-heading font-bold">
                        🤝 Jednat o obnovení
                      </Link>
                    )}
                  </CardBody>
                </Card>
              )}
              {running.map((n) => (
                <Card key={n.id}>
                  <CardBody className="flex items-center justify-between gap-3">
                    <div className="min-w-0 break-words">
                      <SponsorLink id={n.sponsorId} name={n.sponsorName} className="font-heading font-bold text-base" />
                      <div className="text-sm text-muted">{n.status === "accepted" ? "Souhlasí, čeká na podpis" : "Jednání běží"}</div>
                    </div>
                    <Link href={`/sponzor/${n.sponsorId}/jednani?id=${n.id}`} className="shrink-0 btn btn-primary btn-sm min-h-11">Pokračovat</Link>
                  </CardBody>
                </Card>
              ))}
              {cat === "main" && !data.canChangeMainSponsor && (
                <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">
                  Hlavního sponzora jde změnit jen jednou za sezónu, tahle sezóna je vyčerpaná. Prodloužit současnou smlouvu jde dál.
                </div>
              )}
              <p className="text-sm text-muted">
                {cat === "main" ? "Nového hlavního sponzora" : "Sponzora názvu stadionu"} si vyjednáš s majitelem firmy z okresu.{" "}
                <Link href="/sponzori?tab=firms" className="text-pitch-600 underline">Firmy v okrese →</Link>
              </p>
            </div>
          </section>
        );
      })}

      {/* ── Reklamní bannery ── */}
      <section>
        <SectionLabel>{"\u{1F3AF}"} Reklamní bannery ({data.bannerContracts.length}/{data.maxBanners})</SectionLabel>
        {data.bannerContracts.length > 0 && (
          <div className="space-y-2 mb-3">
            {data.bannerContracts.map((c) => (
              <ContractCard key={c.id} contract={c} favor={favorOf(c)} acting={acting}
                promises={promisesOf(c)} onSleeveLogo={onSleeveLogo}
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
function ContractCard({ contract, favor, onTerminate, onRenew, acting, promises, onSleeveLogo }: {
  contract: ActiveContract; favor: number | null; onTerminate: () => void; onRenew: () => void; acting: boolean;
  promises: SponsorPromiseView[]; onSleeveLogo: (promiseId: string) => void;
}) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="min-w-0 break-words">
          <SponsorLink id={contract.sponsorId} name={contract.sponsorName} className="font-heading font-bold text-base" />
          <div className="text-sm text-muted">{sponsorTypeLabel(contract.sponsorType)}</div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.monthlyAmount))}/týd</span>
          {contract.winBonus > 0 && <span className="text-pitch-400">+{formatCZK(contract.winBonus)} za výhru</span>}
          <span className="text-muted">zbývá {contract.seasonsRemaining} z {contract.seasonsTotal} {seasonsGenitive(contract.seasonsTotal)}</span>
          <span className="text-card-red">výpovědní pokuta {formatCZK(contract.terminationFee)}</span>
        </div>
        {favor != null && <FavorLine favor={favor} />}
        <ContractPromises promises={promises} acting={acting} onSleeveLogo={onSleeveLogo} />
        {contract.renewal ? (
          <div className="text-sm text-muted">
            Prodloužení: <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.renewal.monthlyAmount))}/týd</span>{" "}
            na {seasonsAccusative(contract.renewal.seasons)}
          </div>
        ) : contract.renewable ? (
          <div className="text-sm text-muted">Smlouva je v poslední sezóně, o prodloužení se domluvíš s majitelem firmy.</div>
        ) : (
          <div className="text-sm text-muted">
            {contract.blockedReason
              ? `Smlouva skončí s koncem sezóny: ${contract.blockedReason}.`
              : "Prodloužit půjde v poslední sezóně smlouvy."}
          </div>
        )}
        <div className="pt-2 border-t border-line-soft flex items-center gap-5 flex-wrap">
          {(contract.renewal || contract.renewable) && (
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
  // Výpovědní pokuta za ukončení aktuální smlouvy TEĎ: terminationFee počítá API stejným vzorcem jako POST /sponsors/terminate.
  const currentTerminationFee = current?.terminationFee ?? 0;
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
                <div className="min-w-0 break-words">
                  <SponsorLink id={offer.sponsorId} name={offer.sponsorName} className="font-heading font-bold text-base" />
                  <div className="text-sm text-muted">{sponsorTypeLabel(offer.sponsorType)}</div>
                </div>
                <button onClick={() => onSign(offer, category)} disabled={acting || signDisabled}
                  title={signDisabled ? "Limit změny pro tuto sezónu vyčerpán" : undefined}
                  className="shrink-0 btn btn-primary btn-sm min-h-11">
                  Podepsat
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className="text-pitch-500 font-heading font-bold">+{formatCZK(offerWeekly)}/týd</span>
                {offer.winBonus > 0 && <span className="text-pitch-400">+{formatCZK(offer.winBonus)} za výhru</span>}
                <span className="text-muted">na {seasonsAccusative(offer.seasons)}</span>
                <span className="text-card-red">výpovědní pokuta {formatCZK(offer.earlyTerminationFee)}</span>
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
                  <span className="text-muted">. Výpovědní pokuta za ukončení: <span className="text-card-red font-bold">{formatCZK(currentTerminationFee)}</span>.</span>
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
