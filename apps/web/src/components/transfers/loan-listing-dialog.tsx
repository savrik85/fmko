"use client";

/**
 * Vystavení hráče na hostování: délka, poplatek a podmínka hraní. Kdo o hráče stojí,
 * požádá, a půjčující každou žádost potvrdí nebo odmítne (nic se nepřijme samo).
 */

import { useState } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import { LOAN_DURATIONS, LOAN_PLAYING_TIME_OPTIONS, type LoanPlayingTime } from "@/lib/loans";
import { RevealPotentialToggle } from "./revealed-potential";

export interface LoanListingValue { days: number; fee: number; playingTime: LoanPlayingTime; revealPotential: boolean }

export function LoanListingDialog({ playerName, playerLine, onClose, onConfirm, loading }: {
  playerName: string;
  playerLine: string;
  onClose: () => void;
  onConfirm: (v: LoanListingValue) => void;
  loading: boolean;
}) {
  const [days, setDays] = useState(60);
  const [fee, setFee] = useState<number | null>(0);
  const [playingTime, setPlayingTime] = useState<LoanPlayingTime>("regular");
  const [revealPotential, setRevealPotential] = useState(false);

  return (
    // Kliknutí vedle dialog nezavírá, rozepsané podmínky by se ztratily. Zavírá jen Zrušit.
    <div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 space-y-5">
          <div>
            <h3 className="font-heading font-bold text-lg text-ink">Nabídnout na hostování</h3>
            <p className="text-sm text-muted mt-1">{playerName} · {playerLine}</p>
          </div>

          <div>
            <div className="text-xs text-muted font-heading uppercase tracking-wide mb-1.5">Na jak dlouho</div>
            <div className="grid grid-cols-3 gap-2">
              {LOAN_DURATIONS.map((d) => (
                <button key={d.days} type="button" onClick={() => setDays(d.days)}
                  className={`py-2 px-2 rounded-soft text-sm font-heading font-bold transition-colors ${days === d.days ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-muted font-heading uppercase tracking-wide block mb-1.5">Poplatek za hostování (Kč)</span>
            <MoneyInput
              value={fee}
              onChange={setFee}
              className="w-full px-3 py-2 rounded-soft border border-gray-200 font-heading font-bold text-lg tabular-nums focus:outline-none focus:border-pitch-500"
            />
            <span className="block text-sm text-muted mt-1">Nula znamená zdarma. Plat hráče po dobu hostování platí ten, kdo si ho půjčí.</span>
          </label>

          <fieldset>
            <legend className="text-xs text-muted font-heading uppercase tracking-wide mb-1.5">Podmínka hraní</legend>
            <div className="space-y-2">
              {LOAN_PLAYING_TIME_OPTIONS.map((o) => (
                <label key={o.key}
                  className={`flex gap-3 items-start p-3 rounded-soft border cursor-pointer transition-colors ${playingTime === o.key ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input type="radio" name="loan-playing-time" value={o.key} checked={playingTime === o.key}
                    onChange={() => setPlayingTime(o.key)} className="mt-1 accent-[var(--color-pitch-500)]" />
                  <span>
                    <span className="block font-heading font-bold text-ink">{o.label}</span>
                    <span className="block text-sm text-muted">{o.note}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-sm text-muted mt-2">
              Počítají se ligové zápasy, ve kterých mohl hrát. Když se podmínka neplní, dáme ti vědět a hráče můžeš stáhnout zpátky.
            </p>
          </fieldset>

          <RevealPotentialToggle checked={revealPotential} onChange={setRevealPotential} />

          <p className="text-sm text-ink">
            Kluby o hráče požádají a ty každou žádost potvrdíš, nebo odmítneš. Bez tvého potvrzení nikam neodejde.
          </p>

          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-soft text-sm font-heading font-bold bg-gray-100 hover:bg-gray-200 text-ink">
              Zrušit
            </button>
            <button onClick={() => onConfirm({ days, fee: fee ?? 0, playingTime, revealPotential })} disabled={loading}
              className="flex-1 py-2.5 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50">
              {loading ? "Ukládám..." : "Nabídnout"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
