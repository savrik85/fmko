"use client";

import { useState } from "react";

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  adultPrice: number;
  childPrice: number;
  seasonPassPrice: number;
  stadiumName: string | null;
  primaryColor: string;
}

export function TicketModal({
  isOpen,
  onClose,
  teamName,
  adultPrice,
  childPrice,
  seasonPassPrice,
  stadiumName,
  primaryColor,
}: TicketModalProps) {
  const [beerBought, setBeerBought] = useState(false);
  const [beerCount, setBeerCount] = useState(0);

  if (!isOpen) return null;

  const handleBuyBeer = () => {
    setBeerBought(true);
    setBeerCount((c) => c + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[#111827] text-white border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with team color accent */}
        <div
          className="p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}dd, #111827 90%)`,
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest font-heading font-bold text-white/70">
                Oficiální ceník vstupného
              </div>
              <h3 className="text-2xl font-heading font-[900] mt-1 text-white">
                Vstupenky & Permanentky
              </h3>
              <p className="text-sm text-white/80 mt-1">
                {teamName} {stadiumName ? `· ${stadiumName}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-colors"
              aria-label="Zavřít"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Price tiers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <div className="text-xs uppercase tracking-wider text-white/50 font-heading font-bold mb-1">
                Dospělí
              </div>
              <div className="text-3xl font-heading font-[900] text-white tabular-nums">
                {adultPrice} Kč
              </div>
              <div className="text-xs text-white/60 mt-1">Jednorázové na zápas</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <div className="text-xs uppercase tracking-wider text-white/50 font-heading font-bold mb-1">
                Děti & Senioři
              </div>
              <div className="text-3xl font-heading font-[900] text-emerald-400">
                {childPrice > 0 ? `${childPrice} Kč` : "Zdarma"}
              </div>
              <div className="text-xs text-white/60 mt-1">Děti do 15 let a důchodci</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <div className="text-xs uppercase tracking-wider text-yellow-400 font-heading font-bold mb-1">
                Permanentka
              </div>
              <div className="text-3xl font-heading font-[900] text-yellow-300 tabular-nums">
                {seasonPassPrice} Kč
              </div>
              <div className="text-xs text-white/60 mt-1">Celá sezóna + pohár</div>
            </div>
          </div>

          {/* Info notes */}
          <div className="bg-white/5 rounded-2xl p-4 text-xs text-white/70 space-y-1.5 border border-white/5">
            <div className="flex items-center gap-2 font-medium text-white/90">
              <span>🎟️</span>
              <span>Pokladny u vchodu otevírají 45 minut před výkopem.</span>
            </div>
            <div className="flex items-center gap-2">
              <span>🅿️</span>
              <span>Parkování přímo u areálu hřiště zdarma.</span>
            </div>
            <div className="flex items-center gap-2">
              <span>🍺</span>
              <span>Klubový bufet otevřen po celou dobu utkání.</span>
            </div>
          </div>

          {/* Viral Virtual Beer Support */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 border border-amber-500/30">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-heading font-bold text-sm text-amber-200">
                  🍺 Kup hráčům virtuální pivo do kabiny!
                </div>
                <div className="text-xs text-amber-200/70 mt-0.5">
                  Podpoř náladu kluků po zápase (symbolických 50 Kč)
                </div>
              </div>
              <button
                type="button"
                onClick={handleBuyBeer}
                className="shrink-0 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-heading font-extrabold text-sm shadow-lg transition-transform active:scale-95"
              >
                Koupit pivo 🍻
              </button>
            </div>

            {beerBought && (
              <div className="mt-3 pt-3 border-t border-amber-500/20 text-xs text-emerald-300 font-heading font-bold flex items-center gap-2 animate-in fade-in">
                <span>✅</span>
                <span>
                  Díky za podporu! Koupeno piv: {beerCount}x. Pivo je v chlaďáku v kabině!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/40 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-heading font-bold text-sm transition-colors"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
