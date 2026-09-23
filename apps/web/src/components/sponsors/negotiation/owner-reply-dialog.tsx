"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { FaceAvatar } from "@/components/players/face-avatar";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative } from "@/lib/sponsor-format";
import { RESPONSE_LABELS, type NegotiationRound } from "@/lib/sponsor-negotiation";

const RESULT_CHIP_CLASS: Record<string, string> = {
  accept: "bg-pitch-50 text-pitch-600",
  counter_money: "bg-gold-50 text-gold-600",
  counter_wish: "bg-gold-50 text-gold-600",
  reject: "bg-red-50 text-card-red",
  insulted: "bg-red-50 text-card-red",
  walked_away: "bg-red-50 text-card-red",
};

/**
 * Odpověď majitele po "Navrhnout": centrovaný dialog stejného stylu jako ConfirmDialog
 * (components/ui/confirm-dialog.tsx), ne spodní plachta — text u kraje plachty byl na
 * mobilu nečitelný. Escape a klik na pozadí zavírají stejně jako ConfirmDialog.
 */
export function OwnerReplyDialog({
  open, onClose, round, ownerName, faceConfig, note, hasPending, sponsorId, onEdit, onSign, onUseCounter,
}: {
  open: boolean;
  onClose: () => void;
  round: NegotiationRound | null;
  ownerName: string;
  faceConfig: Record<string, unknown>;
  note: string;
  /** Jednání pořád nabízí něco k podpisu (i po odmítnutí zůstává na stole poslední nabídka majitele). */
  hasPending: boolean;
  sponsorId: number;
  onEdit: () => void;
  onSign: () => void;
  onUseCounter: () => void;
}) {
  // onClose drží ref, ne závislost efektu (stejný vzorec jako Sheet) — rodič ho předává jako
  // inline funkci, nová při každém překreslení.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !round) return null;
  const kind = round.response.kind;
  const counter = kind === "counter_money" || kind === "counter_wish" ? round.response.counter : undefined;

  return (
    <div className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Odpověď majitele"
      >
        <div className="p-5">
          <div className="flex items-center gap-3">
            <FaceAvatar faceConfig={faceConfig} size={48} className="shrink-0" />
            <div className="min-w-0">
              <div className="font-heading font-bold text-lg">{ownerName}</div>
              <span className={`inline-block mt-0.5 rounded-full px-2.5 py-0.5 text-sm font-heading font-bold ${RESULT_CHIP_CLASS[kind] ?? "bg-gray-100 text-muted"}`}>
                {RESPONSE_LABELS[kind]}
              </span>
            </div>
          </div>
          <div className="mt-3 bg-surface rounded-xl p-3 text-base">„{round.response.text}“</div>
          {round.response.complaint && (
            <p className="text-sm text-ink-light mt-2">
              <span className="font-heading font-bold text-ink">Co mu vadí:</span> {round.response.complaint}
            </p>
          )}
          <p className="text-sm text-ink-light mt-3">{note}</p>
          {counter && (
            <div className="mt-3 bg-surface rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Měsíčně</span>
                <span className="font-heading font-bold">{formatCZK(counter.demands.monthly)}</span>
              </div>
              {counter.demands.signingBonus > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Za podpis</span>
                  <span className="font-heading font-bold">{formatCZK(counter.demands.signingBonus)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Délka</span>
                <span className="font-heading font-bold">{seasonsAccusative(counter.seasons)}</span>
              </div>
            </div>
          )}
        </div>

        {kind === "walked_away" ? (
          <div className="flex border-t border-gray-100">
            <Link
              href={`/sponzor/${sponsorId}`}
              onClick={onClose}
              className="flex-1 min-h-11 py-3.5 text-sm font-heading font-bold text-center text-ink hover:bg-gray-50 transition-colors"
            >
              Zpět na sponzora
            </Link>
          </div>
        ) : kind === "accept" || kind === "counter_money" || kind === "counter_wish" ? (
          <div className="flex border-t border-gray-100">
            <button type="button" onClick={onEdit} className="flex-1 min-h-11 py-3.5 text-sm font-heading font-bold text-muted hover:bg-gray-50 transition-colors">
              Upravit návrh
            </button>
            <div className="w-px bg-gray-100" />
            <button type="button" onClick={onSign} className="flex-1 min-h-11 py-3.5 text-sm font-heading font-bold text-pitch-500 hover:bg-pitch-50 transition-colors">
              Podepsat smlouvu
            </button>
          </div>
        ) : hasPending ? (
          <div className="flex border-t border-gray-100">
            <button type="button" onClick={onEdit} className="flex-1 min-h-11 py-3.5 text-sm font-heading font-bold text-muted hover:bg-gray-50 transition-colors">
              Upravit návrh
            </button>
            <div className="w-px bg-gray-100" />
            <button type="button" onClick={onUseCounter} className="flex-1 min-h-11 py-3.5 text-sm font-heading font-bold text-pitch-500 hover:bg-pitch-50 transition-colors">
              Vrátit se k jeho nabídce
            </button>
          </div>
        ) : (
          <div className="flex border-t border-gray-100">
            <button type="button" onClick={onEdit} className="flex-1 min-h-11 py-3.5 text-sm font-heading font-bold text-muted hover:bg-gray-50 transition-colors">
              Upravit návrh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
