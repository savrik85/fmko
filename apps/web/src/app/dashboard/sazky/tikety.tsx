"use client";

import { SectionLabel } from "@/components/ui";
import { useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { Sheet } from "@/components/ui";
import { czk, kurz, signed, IkonaTipu, Prazdno, Statek, StavPill, TYP_TIKETU } from "./ui";
import type { Tiket, TiketyOdpoved } from "./types";

function TiketKarta({ t, teamId, onZmena }: { t: Tiket; teamId: string; onZmena: () => void }) {
  const [vyvesuji, setVyvesuji] = useState(false);
  const [vzkaz, setVzkaz] = useState("");
  const [busy, setBusy] = useState(false);

  const posli = async (note: string) => {
    setBusy(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/bets/${t.id}/share`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      }),
      "Nepodařilo se vyvěsit",
    );
    setBusy(false);
    if (ok) { setVyvesuji(false); setVzkaz(""); onZmena(); }
  };

  const anulovane = t.selections.filter((s) => s.result === "void").length;
  const popisVyplaty = t.status === "won" ? "Výhra"
    : t.status === "lost" ? "Prohráno"
    : t.status === "void" ? "Vráceno"
    : t.status === "confiscated" ? "Zabaveno" : "Možná výhra";
  // Číslo musí sedět s popiskem nad ním. Kancelář u prohry nevyplácí nic, ale
  // ztráta hráče nulová není — přišel o vklad, a ten pod „Prohráno" patří.
  const castka = t.status === "open" ? t.potentialPayout
    : t.status === "lost" ? t.stake
    : t.payout;

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
            <span className="mt-0.5"><IkonaTipu stav={s.result} /></span>
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
                value={czk(castka)}
                className={t.status === "won" ? "text-pitch-600"
                  : t.status === "lost" || t.status === "confiscated" ? "text-card-red" : ""} />
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

      {t.sharedAt ? (
        <button type="button" onClick={() => posli("")} disabled={busy}
          className="w-full min-h-11 border-t border-gray-50 text-sm font-heading font-bold
                     text-muted hover:bg-gray-50/50 cursor-pointer disabled:opacity-50">
          {busy ? "…" : "Stáhnout z arény"}
        </button>
      ) : (
        <button type="button" onClick={() => setVyvesuji(true)}
          className="w-full min-h-11 border-t border-gray-50 text-sm font-heading font-bold
                     text-pitch-600 hover:bg-pitch-50/60 cursor-pointer">
          Vyvěsit do arény
        </button>
      )}

      <Sheet open={vyvesuji} onClose={() => setVyvesuji(false)} title="Vyvěsit tiket" maxWidth="480px" zavritKlikemVedle={false}>
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted leading-snug">
            Tiket uvidí všechny kluby v soutěži a můžou se pod ním vyjádřit.
            {t.status === "open" && " Tenhle ještě běží — odkryješ tím, na co sázíš."}
          </p>
          <div>
            <label htmlFor={`vzkaz-${t.id}`} className="text-micro font-heading font-bold uppercase tracking-wide text-muted">
              Chceš k tomu něco říct? (nepovinné)
            </label>
            <textarea id={`vzkaz-${t.id}`} value={vzkaz} onChange={(e) => setVzkaz(e.target.value)}
              rows={3} maxLength={200} placeholder="Třeba: tohle je jistota, dávám do toho všechno…"
              className="input w-full mt-1 text-sm resize-none" />
          </div>
          <button type="button" onClick={() => posli(vzkaz)} disabled={busy}
            className="w-full min-h-12 rounded-soft bg-pitch-500 text-white font-heading font-bold text-sm disabled:opacity-50 cursor-pointer">
            {busy ? "Vyvěšuji…" : "Vyvěsit do arény"}
          </button>
        </div>
      </Sheet>
    </article>
  );
}

export function MojeTikety({ data, teamId, onZmena }: { data: TiketyOdpoved | null; teamId: string; onZmena: () => void }) {
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
          <div className="space-y-3">{bezici.map((t) => <TiketKarta key={t.id} t={t} teamId={teamId} onZmena={onZmena} />)}</div>
        </>
      )}

      <SectionLabel>Vyhodnocené</SectionLabel>
      {hotove.length === 0 ? (
        <Prazdno nadpis="Zatím nic vyhodnoceného">
          Až se odehraje kolo, najdeš tady, jak tvoje tikety dopadly.
        </Prazdno>
      ) : (
        <div className="space-y-3">{hotove.map((t) => <TiketKarta key={t.id} t={t} teamId={teamId} onZmena={onZmena} />)}</div>
      )}
    </div>
  );
}
