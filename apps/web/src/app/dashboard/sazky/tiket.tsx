"use client";

import { useState } from "react";
import { Sheet, ErrorBox, IconButton } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { czk, kurz, Radek, TYP_TIKETU } from "./ui";
import type { Board, VybranyTip } from "./types";

/** Lepivá lišta s košíkem. Částka v ní ZÁMĚRNĚ není — ceny nepatří do tlačítek. */
export function TiketLista({ vybrane, celkovyKurz, onOpen }: {
  vybrane: VybranyTip[]; celkovyKurz: number; onOpen: () => void;
}) {
  if (vybrane.length === 0) return null;
  return (
    <div className="fixed inset-x-0 z-[var(--z-nav)] px-3 sm:px-8 pointer-events-none
                    bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-4">
      <button type="button" onClick={onOpen}
        className="pointer-events-auto mx-auto max-w-[820px] w-full min-h-14 rounded-card
                   bg-pitch-600 text-white shadow-lg flex items-center gap-3 px-3 py-2
                   active:scale-[0.99] transition-transform cursor-pointer">
        <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center
                         font-heading font-bold text-base tabular-nums shrink-0">
          {vybrane.length}
        </span>
        <span className="flex-1 min-w-0 text-left leading-tight">
          <span className="block text-micro font-heading font-bold uppercase tracking-widest text-white/60">
            {TYP_TIKETU[vybrane.length] ?? "Tiket"}
          </span>
          <span className="block text-base font-heading font-bold tabular-nums">
            Kurz {kurz(celkovyKurz)}
          </span>
        </span>
        <span className="shrink-0 px-3 py-2 rounded-control bg-white text-[#7A2E2E] font-heading font-bold text-sm">
          Na tiket
        </span>
      </button>
    </div>
  );
}

interface Potvrzenka {
  cislo: string; stake: number; totalOddsX100: number; payout: number; capped: boolean;
}

export function TiketSheet({ open, onClose, vybrane, celkovyKurz, board, teamId, onOdeber, onVysyp, onHotovo }: {
  open: boolean;
  onClose: () => void;
  vybrane: VybranyTip[];
  celkovyKurz: number;
  board: Extract<Board, { open: true }>;
  teamId: string;
  onOdeber: (klic: string) => void;
  onVysyp: () => void;
  onHotovo: () => void;
}) {
  const L = board.limits;
  const [vklad, setVklad] = useState(500);
  const [potvrzuji, setPotvrzuji] = useState(false);
  const [odesilam, setOdesilam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hotovo, setHotovo] = useState<Potvrzenka | null>(null);

  const maxVklad = Math.min(L.maxStake, board.budget);
  const hruba = Math.floor((vklad * celkovyKurz) / 100);
  const strop = hruba > L.maxPayout;
  const vyplata = strop ? L.maxPayout : hruba;
  const odvod = Math.round((vklad * L.levyPct) / 100);
  const lzePodat = vklad >= L.minStake && vklad <= maxVklad && vybrane.length > 0;

  const zavri = () => {
    setPotvrzuji(false);
    setChyba(null);
    if (hotovo) { setHotovo(null); onHotovo(); }
    onClose();
  };

  const podat = async () => {
    setOdesilam(true);
    setChyba(null);
    try {
      const r = await apiFetch<{ cislo: string; totalOddsX100: number; payout: number; capped: boolean }>(
        `/api/teams/${teamId}/bets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stake: vklad,
            selections: vybrane.map((v) => ({
              matchId: v.matchId, market: v.serverMarket,
              selection: v.selection, oddsX100: v.oddsX100,
            })),
          }),
        },
      );
      setHotovo({ cislo: r.cislo, stake: vklad, totalOddsX100: r.totalOddsX100, payout: r.payout, capped: r.capped });
      setPotvrzuji(false);
      onVysyp();
    } catch (e) {
      console.error("podání tiketu:", e);
      setChyba(e instanceof Error ? e.message : "Tiket se nepodařilo podat.");
      setPotvrzuji(false);
    } finally {
      setOdesilam(false);
    }
  };

  // Potvrzenka — obsah plachty se po odeslání vymění. Číslo tiketu v monospace
  // dělá z obrazovky stvrzenku z přepážky, ne systémovou hlášku.
  if (hotovo) {
    return (
      <Sheet open={open} onClose={zavri} title="Tiket přijat" maxWidth="520px">
        <div className="p-5 text-center space-y-3">
          <div className="text-4xl" aria-hidden>🎫</div>
          <div className="font-heading font-[800] text-xl">Tiket přijat</div>
          <div className="font-commentary text-base tabular-nums tracking-widest">č. {hotovo.cislo}</div>
          <div className="rounded-card border border-dashed border-line-strong bg-paper p-3 text-left space-y-1">
            <Radek label="Vklad" value={czk(hotovo.stake)} />
            <Radek label="Kurz" value={kurz(hotovo.totalOddsX100)} />
            <Radek label={hotovo.capped ? "Vyplatíme" : "Možná výhra"} value={czk(hotovo.payout)} strong />
          </div>
          <p className="text-sm text-muted">Výsledek ti přijde do telefonu hned po kole.</p>
          <button type="button" onClick={zavri}
            className="w-full min-h-12 rounded-soft bg-pitch-500 text-white font-heading font-bold cursor-pointer">
            Hotovo
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={zavri} title="Tiket" maxWidth="520px" zavritKlikemVedle={false}>
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-heading font-[800] text-xl">Tiket</div>
          <div className="text-micro font-heading uppercase tracking-widest text-muted">
            {TYP_TIKETU[vybrane.length] ?? "Tiket"} · {board.gameWeek}. kolo
          </div>
        </div>

        <ul className="rounded-card border border-dashed border-line-strong bg-paper divide-y divide-dashed divide-line">
          {vybrane.map((t) => (
            <li key={`${t.matchId}|${t.selection}`} className="flex items-start gap-2 p-3">
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold leading-tight break-words">{t.zapas}</div>
                <div className="text-sm text-muted leading-tight break-words">{t.label}</div>
              </div>
              <span className="text-base font-heading font-bold tabular-nums shrink-0 mt-0.5">
                {kurz(t.oddsX100)}
              </span>
              <IconButton label={`Odebrat ${t.zapas} z tiketu`}
                          onClick={() => onOdeber(`${t.matchId}|${t.selection}`)}>
                ✕
              </IconButton>
            </li>
          ))}
        </ul>

        <div>
          <label htmlFor="vklad" className="text-micro font-heading font-bold uppercase tracking-wide text-muted">
            Vklad
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input id="vklad" type="number" inputMode="numeric" value={vklad}
              min={L.minStake} max={maxVklad} step={100}
              onChange={(e) => setVklad(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="input flex-1 text-lg font-heading font-bold tabular-nums" />
            <span className="text-base text-muted shrink-0">Kč</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[100, 500, 1000, 2000].map((v) => (
              <button key={v} type="button" onClick={() => setVklad(v)}
                className="min-h-11 rounded-control bg-gray-50 hover:bg-gray-100 text-sm font-heading font-bold tabular-nums cursor-pointer">
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-card bg-pitch-50 p-3 space-y-1">
          <Radek label="Celkový kurz" value={kurz(celkovyKurz)} />
          <Radek label={strop ? "Spočítaná výhra" : "Možná výhra"} value={czk(hruba)} strong={!strop} />
          {strop && <Radek label="Vyplatíme" value={czk(L.maxPayout)} strong />}
          {strop && (
            <p className="text-sm text-gold-700 leading-snug pt-1">
              Strop kanceláře je {czk(L.maxPayout)} na tiket. Víc ti nevyplatíme — na vyšší vklad
              už se nevyplatí sázet.
            </p>
          )}
          {odvod > 0 && <Radek label={`Odvod soutěži (${L.levyPct} %)`} value={czk(odvod)} />}
          <div className="text-sm text-muted pt-1 leading-snug">
            Z klubové kasy odejde {czk(vklad + odvod)}. Zůstane {czk(board.budget - vklad - odvod)}.
          </div>
        </div>

        {chyba && <ErrorBox message={chyba} />}

        {!potvrzuji ? (
          <button type="button" onClick={() => setPotvrzuji(true)} disabled={!lzePodat}
            className="w-full min-h-12 rounded-soft bg-pitch-500 text-white font-heading font-bold text-base disabled:opacity-50 cursor-pointer">
            Podat tiket
          </button>
        ) : (
          <div className="space-y-2">
            <div className="rounded-card bg-gold-50 border border-gold-200 p-3 text-sm leading-snug">
              Vsadíš <b className="tabular-nums">{czk(vklad + odvod)}</b> z klubové kasy.
              Když to vyjde, kancelář vyplatí <b className="tabular-nums">{czk(vyplata)}</b>.
              Když ne, jsou ty peníze pryč.
            </div>
            <button type="button" onClick={podat} disabled={odesilam}
              className="w-full min-h-12 rounded-soft bg-pitch-500 text-white font-heading font-bold text-base disabled:opacity-50 cursor-pointer">
              {odesilam ? "Podávám…" : "Ano, podat tiket"}
            </button>
            <button type="button" onClick={() => setPotvrzuji(false)}
              className="w-full min-h-11 text-sm font-heading font-bold text-muted cursor-pointer">
              Ještě ne
            </button>
          </div>
        )}

        <button type="button" onClick={() => { onVysyp(); zavri(); }}
          className="w-full min-h-11 text-sm font-heading font-bold text-muted cursor-pointer">
          Vysypat tiket
        </button>
      </div>
    </Sheet>
  );
}
