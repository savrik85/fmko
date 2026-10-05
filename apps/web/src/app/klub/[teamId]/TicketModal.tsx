"use client";

import { useEffect } from "react";

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  adultPrice: number;
  childPrice?: number;
  seasonPassPrice?: number;
  stadiumName: string | null;
  primaryColor: string;
  /** Úroveň parkoviště stadionu; 0 = klub parkoviště nemá. */
  parkingLevel?: number;
}

export function TicketModal({
  isOpen,
  onClose,
  teamName,
  adultPrice,
  stadiumName,
  primaryColor,
  parkingLevel = 0,
}: TicketModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vstupné na utkání"
        className="relative w-full max-w-md bg-[#111827] text-white border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with team accent */}
        <div
          className="p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}cc, #111827 90%)`,
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm uppercase tracking-widest font-heading font-bold text-white/70">
                Informace pro návštěvníky
              </div>
              <h3 className="text-2xl font-heading font-[900] mt-1 text-white">
                Vstupné na utkání
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
        <div className="p-6 space-y-5">
          {/* Jednotné vstupné */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center">
            <div className="text-sm uppercase tracking-wider text-amber-400 font-heading font-bold mb-1">
              Jednotné vstupné na zápas
            </div>
            <div className="text-4xl font-heading font-[900] text-white tabular-nums my-1">
              {adultPrice} Kč
            </div>
            <div className="text-sm text-white/60">
              Dospělí na mistrovské utkání A-týmu, děti zdarma
            </div>
          </div>

          {/* Organizační pokyny k zápasu */}
          <div className="bg-white/5 rounded-2xl p-4 text-sm text-white/80 space-y-2.5 border border-white/5">
            <div className="flex items-start gap-2.5">
              <span className="text-base shrink-0">🎟️</span>
              <div>
                <strong className="text-white block font-heading">Prodej u vstupu</strong>
                <span>Vstupenky se prodávají u pokladny u vchodu do sportovního areálu.</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-base shrink-0">⏰</span>
              <div>
                <strong className="text-white block font-heading">Otevření areálu</strong>
                <span>Areál i pokladna otevírají 45 minut před stanoveným výkopem.</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-base shrink-0">🅿️</span>
              <div>
                <strong className="text-white block font-heading">Parkování</strong>
                <span>
                  {parkingLevel > 0
                    ? "Parkoviště pro diváky je přímo u areálu."
                    : "Vlastní parkoviště areál nemá, parkuje se v obci a dojde se pěšky."}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-base shrink-0">🍺</span>
              <div>
                <strong className="text-white block font-heading">Klubový bufet</strong>
                <span>Bufet je otevřený po celou dobu utkání, ceník najdeš na webu klubu.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/40 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-heading font-extrabold text-sm shadow-md transition-colors"
          >
            Rozumím
          </button>
        </div>
      </div>
    </div>
  );
}
