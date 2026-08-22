"use client";

import { SectionLabel } from "@/components/ui";
import { czk, kurz, signed, IKONA_TIPU, POPIS_TIPU, Prazdno, Statek, StavPill, TYP_TIKETU } from "./ui";
import type { Tiket, TiketyOdpoved } from "./types";

function TiketKarta({ t }: { t: Tiket }) {
  const anulovane = t.selections.filter((s) => s.result === "void").length;
  const popisVyplaty = t.status === "won" ? "Výhra"
    : t.status === "lost" ? "Prohráno"
    : t.status === "void" ? "Vráceno" : "Možná výhra";

  return (
    <article className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 flex-wrap">
        <StavPill stav={t.status} />
        <span className="font-commentary text-micro tabular-nums tracking-widest text-muted">č. {t.cislo}</span>
        <span className="text-micro text-muted">{TYP_TIKETU[t.selections.length] ?? "Tiket"}</span>
        {t.gameWeek != null && (
          <span className="ml-auto text-micro text-muted tabular-nums">{t.gameWeek}. kolo</span>
        )}
      </div>

      <ol className="divide-y divide-gray-50">
        {t.selections.map((s) => (
          <li key={`${s.matchId}-${s.label}`} className="flex items-start gap-2 px-3 py-2.5">
            <span className="mt-0.5 shrink-0 text-sm" title={POPIS_TIPU[s.result]}
                  aria-label={POPIS_TIPU[s.result]}>
              {IKONA_TIPU[s.result]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold leading-tight break-words">{s.zapas}</div>
              <div className="text-sm text-muted leading-tight break-words">
                {s.label}
                {s.vysledek && <> · <span className="tabular-nums text-ink">{s.vysledek}</span></>}
              </div>
            </div>
            <span className={`text-base font-heading font-bold tabular-nums shrink-0
                             ${s.result === "lost" ? "text-muted line-through" : ""}`}>
              {kurz(s.oddsX100)}
            </span>
          </li>
        ))}
      </ol>

      <div className="px-3 py-2.5 bg-gray-50/60 grid grid-cols-3 gap-2 text-center">
        <Statek label="Vklad" value={czk(t.stake)} />
        <Statek label="Kurz" value={kurz(t.totalOddsX100)} />
        <Statek label={popisVyplaty}
                value={czk(t.status === "open" ? t.potentialPayout : t.payout)}
                className={t.status === "won" ? "text-pitch-600"
                  : t.status === "lost" ? "text-muted line-through" : ""} />
      </div>

      {t.capped && t.status !== "lost" && (
        <div className="px-3 pb-2.5 text-sm text-gold-700">
          Výhra byla seříznuta stropem kanceláře.
        </div>
      )}
      {anulovane > 0 && (
        <div className="px-3 pb-2.5 text-sm text-muted">
          {anulovane === 1 ? "Jeden tip se anuloval" : `${anulovane} tipy se anulovaly`} —
          hráč nenastoupil, kurz o něj klesl.
        </div>
      )}
    </article>
  );
}

export function MojeTikety({ data }: { data: TiketyOdpoved | null }) {
  if (!data) return null;
  const bezici = data.tickets.filter((t) => t.status === "open");
  const hotove = data.tickets.filter((t) => t.status !== "open");
  const s = data.summary;

  return (
    <div className="space-y-4">
      {/* Souhrn je v hlavičce stránky, tady stačí rozpad a vysvětlení. */}
      <div className="card p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Statek label="Vsazeno" value={czk(s.staked + s.levy)} />
          <Statek label="Vyhráno" value={czk(s.won)} />
          <Statek label="Rozdíl" value={signed(s.net)}
                  className={s.net >= 0 ? "text-pitch-600" : "text-card-red"} />
        </div>
        <p className="text-sm text-muted mt-2 leading-snug">
          Kancelář si na každém kurzu bere osm procent. Není to charita, je to hospoda.
          {s.levy > 0 && ` Na odvodech soutěži jsi zaplatil ${czk(s.levy)}.`}
        </p>
      </div>

      {bezici.length > 0 && (
        <>
          <SectionLabel>Čeká na kolo</SectionLabel>
          <div className="space-y-3">{bezici.map((t) => <TiketKarta key={t.id} t={t} />)}</div>
        </>
      )}

      <SectionLabel>Vyhodnocené</SectionLabel>
      {hotove.length === 0 ? (
        <Prazdno nadpis="Zatím nic vyhodnoceného">
          Až se odehraje kolo, najdeš tady, jak tvoje tikety dopadly.
        </Prazdno>
      ) : (
        <div className="space-y-3">{hotove.map((t) => <TiketKarta key={t.id} t={t} />)}</div>
      )}
    </div>
  );
}
