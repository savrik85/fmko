"use client";

/**
 * Doplňkové trhy pod zápasem: handicap, přesný počet gólů, oba týmy dají gól,
 * góly týmu a výsledek s počtem gólů. Schované v rozbalovací sekci „Další sázky",
 * aby hlavní lístek zůstal přehledný.
 *
 * Popisky i kurzy chodí ze serveru. Klient z kódu výběru bere jen to, kam
 * kurz na kartě patří (strana, linie), a jméno týmu z popisku vyjímá, protože
 * na kartě je jméno odkaz nad řádky, ne text v nich.
 */

import { EntityLink } from "@/components/ui";
import { OddsButton } from "./ui";
import type { Nabidka, ServerMarket, Strana, VybranyTip, Zapas } from "./types";

type Markets = NonNullable<Zapas["markets"]>;

/** Kolik doplňkových kurzů zápas má. Podle toho se ukáže tlačítko „Další sázky". */
export function extraMarketCount(m: Markets): number {
  return (m.handicap?.length ?? 0) + (m.goalsBand?.length ?? 0) + (m.btts?.length ?? 0)
    + (m.teamTotals?.length ?? 0) + (m.resultTotal?.length ?? 0);
}

/** Linie z konce kódu výběru: 'home_over15' → '1,5'. */
function lineFromCode(selection: string): string {
  const m = /(\d+)$/.exec(selection);
  return m ? (Number(m[1]) / 10).toFixed(1).replace(".", ",") : "";
}

/** Popisek bez jména týmu na začátku: „Sokol vyhraje o 2 a víc" → „vyhraje o 2 a víc". */
function withoutTeam(label: string, team: string): string {
  return label.startsWith(`${team} `) ? label.slice(team.length + 1) : label;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="text-micro font-heading font-bold uppercase tracking-wide text-muted mb-2">
      {children}
    </div>
  );
}

function TeamName({ team }: { team: Strana }) {
  return (
    <EntityLink type="team" id={team.id} className="block text-base font-semibold truncate">
      {team.name}
    </EntityLink>
  );
}

/** Pořadí handicapů u týmu: nejdřív výhra o víc, pak neprohra o víc. */
const HANDICAP_ORDER = ["m15", "m25", "p15", "p25"];

/** Tip v tlačítku: 'home_m15' → '−1,5', 'away_p25' → '+2,5'. */
function handicapTip(selection: string): string {
  const sign = /_m\d+$/.test(selection) ? "−" : "+";
  return `${sign}${lineFromCode(selection)}`;
}

const BAND_ORDER: Array<[string, string]> = [
  ["goals_0_1", "0 až 1"], ["goals_2_3", "2 až 3"], ["goals_4_5", "4 až 5"], ["goals_6_plus", "6 a víc"],
];

export function ExtraMarkets({ match, isSelected, onPick }: {
  match: Zapas;
  isSelected: (serverMarket: ServerMarket, selection: string) => boolean;
  onPick: (market: VybranyTip["market"], serverMarket: ServerMarket, offer: Nabidka) => void;
}) {
  const m = match.markets;
  if (!m) return null;

  const handicap = m.handicap ?? [];
  const goalsBand = m.goalsBand ?? [];
  const btts = m.btts ?? [];
  const teamTotals = m.teamTotals ?? [];
  const resultTotal = m.resultTotal ?? [];
  const sides = [["home", match.home], ["away", match.away]] as const;

  const button = (
    market: VybranyTip["market"], serverMarket: ServerMarket, offer: Nabidka | undefined,
    tip: string, key: string,
  ) => offer ? (
    <OddsButton key={offer.selection} tip={tip} label={offer.label} oddsX100={offer.oddsX100}
                vybrano={isSelected(serverMarket, offer.selection)}
                onClick={() => onPick(market, serverMarket, offer)} />
  ) : <span key={key} aria-hidden />;

  const resultLine = resultTotal.length > 0 ? lineFromCode(resultTotal[0].selection) : "";

  return (
    <div className="border-t border-gray-50 px-3 py-3 space-y-4 bg-gray-50/40">
      {handicap.length > 0 && (
        <section>
          <SectionTitle>Handicap</SectionTitle>
          <div className="space-y-3">
            {sides.map(([side, team]) => {
              const offers = handicap
                .filter((o) => o.selection.startsWith(`${side}_`))
                .sort((a, b) => HANDICAP_ORDER.indexOf(a.selection.slice(side.length + 1))
                  - HANDICAP_ORDER.indexOf(b.selection.slice(side.length + 1)));
              if (offers.length === 0) return null;
              return (
                <div key={side} className="space-y-1.5">
                  <TeamName team={team} />
                  {offers.map((o) => (
                    <div key={o.selection} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-sm leading-snug">{withoutTeam(o.label, team.name)}</span>
                      <div className="w-20 shrink-0">
                        {button("handicap", "handicap", o, handicapTip(o.selection), o.selection)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted mt-2 leading-snug">
            Výhra o 2 a víc je třeba 2:0 nebo 4:2. Neprohra o víc než gól projde i při remíze
            nebo prohře o jediný gól.
          </p>
        </section>
      )}

      {goalsBand.length > 0 && (
        <section>
          <SectionTitle>Počet gólů</SectionTitle>
          <div className="grid grid-cols-4 gap-1.5">
            {BAND_ORDER.map(([code, tip]) =>
              button("goalsBand", "goals_band", goalsBand.find((o) => o.selection === code), tip, code))}
          </div>
          <p className="text-sm text-muted mt-2 leading-snug">
            Kolik gólů padne v zápase dohromady, za oba týmy.
          </p>
        </section>
      )}

      {btts.length > 0 && (
        <section>
          <SectionTitle>Oba týmy dají gól</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            {button("btts", "btts", btts.find((o) => o.selection === "btts_yes"), "Ano", "btts_yes")}
            {button("btts", "btts", btts.find((o) => o.selection === "btts_no"), "Ne", "btts_no")}
          </div>
        </section>
      )}

      {teamTotals.length > 0 && (
        <section>
          <SectionTitle>Góly týmu</SectionTitle>
          <div className="space-y-3">
            {sides.map(([side, team]) => {
              const offers = teamTotals.filter((o) => o.selection.startsWith(`${side}_`));
              if (offers.length === 0) return null;
              const lines = [...new Set(offers.map((o) => lineFromCode(o.selection)))]
                .sort((a, b) => Number(a.replace(",", ".")) - Number(b.replace(",", ".")));
              return (
                <div key={side} className="space-y-1.5">
                  <TeamName team={team} />
                  {lines.map((line) => {
                    const pick = (dir: string) => offers.find((o) =>
                      o.selection.startsWith(`${side}_${dir}`) && lineFromCode(o.selection) === line);
                    return (
                      <div key={line} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-1.5">
                        <span className="text-sm font-heading font-bold tabular-nums text-muted">{line}</span>
                        {button("teamTotals", "team_totals", pick("over"), "Víc", `${side}-over-${line}`)}
                        {button("teamTotals", "team_totals", pick("under"), "Míň", `${side}-under-${line}`)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted mt-2 leading-snug">
            Počítají se jen góly vybraného týmu, soupeřovy ne.
          </p>
        </section>
      )}

      {resultTotal.length > 0 && (
        <section>
          <SectionTitle>Výsledek a počet gólů</SectionTitle>
          <div className="space-y-1.5">
            {([["1", match.home], ["X", null], ["2", match.away]] as const).map(([outcome, team]) => {
              const pick = (dir: string) => resultTotal.find((o) => o.selection.startsWith(`${outcome}_${dir}`));
              const over = pick("over");
              const under = pick("under");
              if (!over && !under) return null;
              return (
                <div key={outcome} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-1.5">
                  {team ? <TeamName team={team} /> : <span className="text-base font-semibold">Remíza</span>}
                  {button("resultTotal", "result_total", over, "Víc", `${outcome}-over`)}
                  {button("resultTotal", "result_total", under, "Míň", `${outcome}-under`)}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted mt-2 leading-snug">
            Sedět musí obojí: kdo vyhraje (nebo remíza) a jestli padne víc, nebo míň
            než {resultLine} gólu.
          </p>
        </section>
      )}
    </div>
  );
}
