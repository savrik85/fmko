"use client";

import { useState } from "react";
import { EntityLink } from "@/components/ui";
import { Forma, OddsButton } from "./ui";
import { ExtraMarkets, extraMarketCount } from "./extra-markets";
import type { Board, Nabidka, Strana, VybranyTip, Zapas } from "./types";

/**
 * Řádek týmu: pořadí, jméno, forma a skóre.
 *
 * Všechno pod sebou, ne do sloupců — na 360 px se dvě vesnická jména vedle
 * sebe nevejdou a přidávat sloupce do tabulky je proti zvyklostem téhle hry.
 */
function RadekTymu({ t, odkaz }: { t: Strana; odkaz: boolean }) {
  // Barva klubu jen jako tenký akcent. Dřív tu byl barevný čtvereček s pořadím,
  // ale ten přetahoval pozornost ze jména týmu — a pořadí je kontext, ne identita.
  const barva = t.color ?? "#2D5F2D";

  return (
    <div className="flex items-stretch gap-2.5 min-w-0">
      <span className="w-1 rounded-full shrink-0" style={{ background: barva }} aria-hidden />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          {odkaz ? (
            <EntityLink type="team" id={t.id} className="text-base font-semibold truncate">
              {t.name}
            </EntityLink>
          ) : (
            <span className="text-base font-semibold truncate">{t.name}</span>
          )}
          {t.played > 0 && (
            <span className="text-sm font-heading font-bold tabular-nums shrink-0">{t.points} b</span>
          )}
        </div>

        {t.played > 0 && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Forma form={t.form} />
            <span className="text-micro text-muted tabular-nums">
              {t.pos > 0 && `${t.pos}. místo · `}{t.goalsFor}:{t.goalsAgainst}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Popisek linie: 'over25' → 'Víc než 2,5'. */
function lineLabel(selection: string): { smer: string; cara: string } {
  const smer = selection.startsWith("over") ? "Víc" : "Míň";
  const cislice = selection.replace(/^(over|under)/, "");
  return { smer, cara: (Number(cislice) / 10).toFixed(1).replace(".", ",") };
}

function ZapasKarta({ z, vybrane, onToggle, muzeSazet }: {
  z: Zapas; vybrane: VybranyTip[]; onToggle: (t: VybranyTip) => void; muzeSazet: boolean;
}) {
  const [rozbaleno, setRozbaleno] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const nazev = `${z.home.name} ${z.away.name}`;
  const vybranyKlic = vybrane.find((v) => v.matchId === z.matchId);

  if (z.ownMatch) {
    return (
      <article className="card overflow-hidden opacity-70">
        <div className="px-3 py-2.5 space-y-2.5">
          {[z.home, z.away].map((t) => <RadekTymu key={t.id} t={t} odkaz={false} />)}
        </div>
        <div className="px-3 py-2.5 border-t border-gray-50 bg-gray-50/60">
          <div className="font-heading font-bold text-sm mb-0.5">Na svůj zápas si nevsadíš</div>
          <p className="text-sm text-muted leading-snug">
            Kancelář to má v pravidlech od chvíle, kdy si jeden trenér vsadil na vlastní prohru.
            A vyhrál.
          </p>
        </div>
      </article>
    );
  }

  const m = z.markets;
  if (!m) return null;

  const pridej = (
    market: VybranyTip["market"], serverMarket: VybranyTip["serverMarket"], n: Nabidka,
  ) => onToggle({
    matchId: z.matchId, market, serverMarket, selection: n.selection,
    oddsX100: n.oddsX100, label: n.label, zapas: nazev,
  });

  // Kód výběru se porovnává i s trhem: jeden zápas má víc trhů a tip je na tiketu jen jeden.
  const jeVybran = (serverMarket: VybranyTip["serverMarket"], selection: string) =>
    vybranyKlic?.serverMarket === serverMarket && vybranyKlic.selection === selection;
  const pocetDalsich = m.dchance.length + m.totals.length + m.scorers.length;
  const extraCount = extraMarketCount(m);

  return (
    <article className="card overflow-hidden">
      {/* Týmy pod sebou, ne vedle sebe — dvě vesnická jména se na 360 px vedle sebe nevejdou. */}
      <div className="px-3 pt-2.5 pb-2.5 space-y-2.5">
        {[z.home, z.away].map((t) => <RadekTymu key={t.id} t={t} odkaz />)}
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
        {m.result.map((n) => (
          <OddsButton key={n.selection} tip={n.selection} label={n.label} oddsX100={n.oddsX100}
                vybrano={jeVybran("1x2", n.selection)}
                onClick={() => muzeSazet && pridej("result", "1x2", n)} />
        ))}
      </div>

      {pocetDalsich > 0 && (
        <button type="button" onClick={() => setRozbaleno(!rozbaleno)} aria-expanded={rozbaleno}
          className="w-full min-h-11 px-3 border-t border-gray-50 flex items-center gap-2 text-sm text-muted hover:bg-gray-50/50 cursor-pointer">
          <span className="font-heading font-bold">Neprohra, góly a střelci</span>
          <span className="text-micro tabular-nums">({pocetDalsich})</span>
          <span className={`ml-auto transition-transform ${rozbaleno ? "rotate-180" : ""}`} aria-hidden>▾</span>
        </button>
      )}

      {rozbaleno && (
        <div className="border-t border-gray-50 px-3 py-3 space-y-4 bg-gray-50/40">
          {m.dchance.length > 0 && (
            <section>
              <div className="text-micro font-heading font-bold uppercase tracking-wide text-muted mb-2">
                Kdo neprohraje
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {m.dchance.map((n) => (
                  <OddsButton key={n.selection} tip={n.selection} label={n.label} oddsX100={n.oddsX100}
                        vybrano={jeVybran("dchance", n.selection)}
                        onClick={() => muzeSazet && pridej("dchance", "dchance", n)} />
                ))}
              </div>
              <p className="text-sm text-muted mt-2 leading-snug">
                <b>1X</b> = domácí vyhrají nebo remizují · <b>X2</b> = totéž pro hosty ·
                {" "}<b>12</b> = padne vítěz, remíza prohrává.
              </p>
            </section>
          )}

          {m.totals.length > 0 && (
            <section>
              <div className="text-micro font-heading font-bold uppercase tracking-wide text-muted mb-2">
                Kolik padne gólů
              </div>
              <div className="space-y-1.5">
                {/* Linie od nejnižší, „víc" vždy vlevo a „míň" vpravo. Chybějící strana
                    (kurz mimo rozumné meze) nechá prázdné místo, ať sloupce nelezou. */}
                {[...new Set(m.totals.map((t) => lineLabel(t.selection).cara))]
                  .sort((a, b) => Number(a.replace(",", ".")) - Number(b.replace(",", ".")))
                  .map((cara) => {
                    const side = (prefix: string) => m.totals.find((t) =>
                      t.selection.startsWith(prefix) && lineLabel(t.selection).cara === cara);
                    return (
                      <div key={cara} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-1.5">
                        <span className="text-sm font-heading font-bold tabular-nums text-muted">{cara}</span>
                        {[side("over"), side("under")].map((n, i) => n ? (
                          <OddsButton key={n.selection} tip={lineLabel(n.selection).smer} label={n.label}
                                oddsX100={n.oddsX100} vybrano={jeVybran("totals", n.selection)}
                                onClick={() => muzeSazet && pridej("totals", "totals", n)} />
                        ) : <span key={i} aria-hidden />)}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {m.scorers.length > 0 && (
            <section>
              <div className="text-micro font-heading font-bold uppercase tracking-wide text-muted mb-2">
                Kdo se trefí
              </div>
              <div className="space-y-1.5">
                {m.scorers.map((n) => (
                  <div key={n.selection} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <EntityLink type="player" id={n.selection} className="block text-base font-semibold truncate">
                        {n.label.replace(/\s*\(.*\)$/, "")}
                      </EntityLink>
                      <span className="block text-micro text-muted truncate">
                        {n.label.match(/\(([^)]*)\)$/)?.[1] ?? ""}
                      </span>
                    </div>
                    <div className="w-20 shrink-0">
                      <OddsButton tip="Gól" label={n.label} oddsX100={n.oddsX100}
                            vybrano={jeVybran("scorer", n.selection)}
                            onClick={() => muzeSazet && pridej("scorers", "scorer", n)} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted mt-2 leading-snug">
                Počítá se gól v základní hrací době. Když hráč vůbec nenastoupí, tip se anuluje
                a kurz tiketu se o něj sníží.
              </p>
            </section>
          )}
        </div>
      )}

      {extraCount > 0 && (
        <button type="button" onClick={() => setExtraOpen(!extraOpen)} aria-expanded={extraOpen}
          className="w-full min-h-11 px-3 border-t border-gray-50 flex items-center gap-2 text-sm text-muted hover:bg-gray-50/50 cursor-pointer">
          <span className="font-heading font-bold">Další sázky</span>
          <span className="text-micro tabular-nums">({extraCount})</span>
          <span className={`ml-auto transition-transform ${extraOpen ? "rotate-180" : ""}`} aria-hidden>▾</span>
        </button>
      )}

      {extraOpen && (
        <ExtraMarkets
          match={z}
          isSelected={jeVybran}
          onPick={(market, serverMarket, n) => muzeSazet && pridej(market, serverMarket, n)}
        />
      )}
    </article>
  );
}

export function KurzovyListek({ board, vybrane, onToggle }: {
  board: Extract<Board, { open: true }>;
  vybrane: VybranyTip[];
  onToggle: (t: VybranyTip) => void;
}) {
  return (
    <div className="space-y-3">
      {!board.canBet && board.blockedReason && (
        <div className="card p-4 border-l-4" style={{ borderLeftColor: "#D94032" }}>
          <div className="font-heading font-bold text-base mb-0.5">Dneska ti nevsadíme</div>
          <p className="text-sm text-muted leading-snug">{board.blockedReason}</p>
        </div>
      )}

      <p className="text-sm text-muted leading-snug px-1">
        <b>1</b> = domácí · <b>X</b> = remíza · <b>2</b> = hosté. Kurzy platí do začátku kola.
      </p>

      {board.matches.map((z) => (
        <ZapasKarta key={z.matchId} z={z} vybrane={vybrane} onToggle={onToggle}
                    muzeSazet={board.canBet} />
      ))}
    </div>
  );
}
