"use client";

import Link from "next/link";
import { ListCard, ListEmpty, ListRow, RowValue } from "@/components/ui";
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
          <ListCard key={cat}
            title={cat === "main" ? "\u{1F4DD} Hlavní sponzor" : `\u{1F3DF} Sponzor stadionu ${data.stadiumName ? `(${data.stadiumName})` : ""}`}>
            {active && (
              <ContractRow contract={active} favor={favorOf(active)} acting={acting}
                promises={promisesOf(active)} onSleeveLogo={onSleeveLogo}
                onTerminate={() => onTerminate(cat)} onRenew={() => onRenew(cat)} />
            )}
            {!active && expired && (
              <ListRow
                title={<SponsorLink id={expired.sponsorId} name={expired.sponsorName} />}
                detail={<>
                  <span className="block text-sm text-muted">
                    {expired.renewable
                      ? "Smlouva vypršela. O nové se domluvíš s majitelem firmy."
                      : `Smlouva vypršela a obnovit ji nejde: ${expired.blockedReason ?? "firma teď nejedná"}.`}
                  </span>
                  {expired.renewable && expired.sponsorId && (
                    <Link href={`/sponzor/${expired.sponsorId}`} className="inline-block min-h-11 leading-[2.75rem] text-sm text-pitch-600 font-heading font-bold">
                      🤝 Jednat o obnovení
                    </Link>
                  )}
                </>} />
            )}
            {running.map((n) => (
              <ListRow key={n.id}
                title={<SponsorLink id={n.sponsorId} name={n.sponsorName} />}
                meta={n.status === "accepted" ? "Souhlasí, čeká na podpis" : "Jednání běží"}
                trailing={<Link href={`/sponzor/${n.sponsorId}/jednani?id=${n.id}`} className="shrink-0 btn btn-primary btn-sm min-h-11">Pokračovat</Link>} />
            ))}
            {/* Upozornění a cesta k firmám pod řádky karty; bez řádků slouží jako prázdný stav. */}
            <div className="px-4 py-3 space-y-3">
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
          </ListCard>
        );
      })}

      {/* ── Reklamní bannery ── */}
      <ListCard title={"\u{1F3AF} Reklamní bannery"} count={`${data.bannerContracts.length}/${data.maxBanners}`}>
        {data.bannerContracts.map((c) => (
          <ContractRow key={c.id} contract={c} favor={favorOf(c)} acting={acting}
            promises={promisesOf(c)} onSleeveLogo={onSleeveLogo}
            onTerminate={() => onTerminate("banner", c.id)} onRenew={() => onRenew("banner", c.id)} />
        ))}
        {data.bannerContracts.length >= data.maxBanners ? (
          <p className="px-4 py-3 text-center text-sm text-muted">Maximální počet bannerů ({data.maxBanners}) je dosažen.</p>
        ) : data.bannerOffers.length > 0 ? (
          <>
            <p className="px-4 py-2 bg-surface-2 border-b border-line-soft text-sm text-muted">Můžeš podepsat až {data.maxBanners - data.bannerContracts.length} dalších bannerů.</p>
            <OffersList offers={data.bannerOffers} category="banner" onSign={onSign} acting={acting} />
          </>
        ) : (
          <ListEmpty icon={"\u{1F3AF}"}>Žádné nabídky bannerů.</ListEmpty>
        )}
      </ListCard>
    </div>
  );
}

/** Aktivní smlouva: týdenní částka vpravo, ostatní částky v jednom řádku, náklonnost majitele, prodloužení a výpověď. */
function ContractRow({ contract, favor, onTerminate, onRenew, acting, promises, onSleeveLogo }: {
  contract: ActiveContract; favor: number | null; onTerminate: () => void; onRenew: () => void; acting: boolean;
  promises: SponsorPromiseView[]; onSleeveLogo: (promiseId: string) => void;
}) {
  return (
    <ListRow
      title={<SponsorLink id={contract.sponsorId} name={contract.sponsorName} />}
      meta={sponsorTypeLabel(contract.sponsorType)}
      trailing={<RowValue tone="plus" sub="týdně">+{formatCZK(weeklyAmount(contract.monthlyAmount))}</RowValue>}
      detail={<>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          {contract.winBonus > 0 && <span className="text-pitch-400">+{formatCZK(contract.winBonus)} za výhru</span>}
          <span className="text-muted">zbývá {contract.seasonsRemaining} z {contract.seasonsTotal} {seasonsGenitive(contract.seasonsTotal)}</span>
          {!(contract.isLegacy && contract.category !== "banner") && (
            <span className="text-card-red">výpovědní pokuta {formatCZK(contract.terminationFee)}</span>
          )}
        </span>
        {contract.isLegacy && contract.category !== "banner" && (
          <span className="block mt-1 text-sm text-pitch-600">Přechod na nového sponzora přes jednání je zdarma, bez pokuty i bez ztráty reputace.</span>
        )}
        {favor != null && <span className="block mt-1"><FavorLine favor={favor} /></span>}
        {promises.length > 0 && (
          <span className="block mt-2"><ContractPromises promises={promises} acting={acting} onSleeveLogo={onSleeveLogo} /></span>
        )}
        {contract.renewal ? (
          <span className="block mt-1 text-sm text-muted">
            Prodloužení: <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.renewal.monthlyAmount))}/týd</span>{" "}
            na {seasonsAccusative(contract.renewal.seasons)}
          </span>
        ) : contract.renewable ? (
          <span className="block mt-1 text-sm text-muted">Smlouva je v poslední sezóně, o prodloužení se domluvíš s majitelem firmy.</span>
        ) : (
          <span className="block mt-1 text-sm text-muted">
            {contract.blockedReason
              ? `Smlouva skončí s koncem sezóny: ${contract.blockedReason}.`
              : "Prodloužit půjde v poslední sezóně smlouvy."}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-5">
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
        </span>
      </>} />
  );
}

/** Řádky nabídek do karty (`ListCard`), ve které jsou; prázdný seznam ukáže větu místo řádků. */
function OffersList({ offers, category, onSign, acting, current, signDisabled }: {
  offers: SponsorOffer[];
  category: SponsorCategory;
  onSign: (offer: SponsorOffer, category: SponsorCategory) => void;
  acting: boolean;
  current?: ActiveContract | null;
  signDisabled?: boolean;
}) {
  if (offers.length === 0) {
    return <ListEmpty>Žádné nabídky. Zvyš reputaci pro lepší sponzory.</ListEmpty>;
  }
  // Výpovědní pokuta za ukončení aktuální smlouvy TEĎ: terminationFee počítá API stejným vzorcem jako POST /sponsors/terminate.
  const currentTerminationFee = current?.terminationFee ?? 0;
  const currentWeekly = current ? weeklyAmount(current.monthlyAmount) : 0;
  return (
    <>
      {offers.map((offer, i) => {
        const offerWeekly = weeklyAmount(offer.monthlyAmount);
        const weeklyDelta = offerWeekly - currentWeekly;
        // Po kolika týdnech se odpočítá sankce za ukončení smlouvy?
        const payback = current && weeklyDelta > 0 ? Math.ceil(currentTerminationFee / weeklyDelta) : null;
        return (
          <ListRow key={`${offer.sponsorId}-${i}`}
            title={<SponsorLink id={offer.sponsorId} name={offer.sponsorName} />}
            meta={sponsorTypeLabel(offer.sponsorType)}
            trailing={
              <button onClick={() => onSign(offer, category)} disabled={acting || signDisabled}
                title={signDisabled ? "Limit změny pro tuto sezónu vyčerpán" : undefined}
                className="shrink-0 btn btn-primary btn-sm min-h-11">
                Podepsat
              </button>
            }
            detail={<>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className="text-pitch-500 font-heading font-bold">+{formatCZK(offerWeekly)}/týd</span>
                {offer.winBonus > 0 && <span className="text-pitch-400">+{formatCZK(offer.winBonus)} za výhru</span>}
                <span className="text-muted">na {seasonsAccusative(offer.seasons)}</span>
                <span className="text-card-red">výpovědní pokuta {formatCZK(offer.earlyTerminationFee)}</span>
              </span>
              {(category === "main" || offer.requirement) && (
                <span className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gold-600">
                  {category === "main" && <span>Změní název klubu, -3 reputace</span>}
                  {offer.requirement && <span>{offer.requirement}</span>}
                </span>
              )}
              {current && (
                <span className="block mt-1.5 pt-1.5 border-t border-line-soft text-sm">
                  <span className="text-muted">Oproti {current.sponsorName}: </span>
                  <span className={weeklyDelta > 0 ? "text-pitch-500 font-heading font-bold" : weeklyDelta < 0 ? "text-card-red font-heading font-bold" : "text-muted"}>
                    {weeklyDelta > 0 ? "+" : ""}{formatCZK(weeklyDelta)}/týd
                  </span>
                  <span className="text-muted">. Výpovědní pokuta za ukončení: <span className="text-card-red font-bold">{formatCZK(currentTerminationFee)}</span>.</span>
                  {payback && (
                    <span className="text-muted"> Návratnost změny: <span className="font-bold">{payback} {payback === 1 ? "týden" : payback < 5 ? "týdny" : "týdnů"}</span>.</span>
                  )}
                  {weeklyDelta <= 0 && <span className="text-card-red"> Nevyplatí se.</span>}
                </span>
              )}
            </>} />
        );
      })}
    </>
  );
}
