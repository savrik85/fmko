"use client";

/**
 * Plachta s nadpisem a tlačítky Zrušit / potvrdit — náhrada bílých dialogů uprostřed.
 *
 * Na mobilu vyjede zespodu (tlačítka jsou pod palcem), na desktopu je uprostřed jako
 * dřív. Postavená na `Sheet`, takže umí Escape, zámek scrollu a vrácení fokusu.
 * Kliknutí vedle ji nezavírá: rozepsaná částka nebo zpráva by se ztratila.
 */

import { useState, type ReactNode } from "react";
import { Sheet } from "./sheet";

const confirmColors = {
  default: "bg-pitch-500 hover:bg-pitch-600 text-white",
  danger: "bg-card-red hover:bg-red-600 text-white",
  gold: "bg-gold-500 hover:bg-gold-600 text-white",
} as const;

export function SheetDialog({
  open, title, description, children,
  confirmLabel = "Potvrdit", cancelLabel = "Zrušit", variant = "default",
  confirmDisabled = false, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: keyof typeof confirmColors;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={() => { if (!busy) onCancel(); }} title={title} maxWidth="440px" zavritKlikemVedle={false}>
      <div className="px-5 pt-3 sm:pt-5 pb-2">
        <h3 className="font-heading font-bold text-lg text-ink">{title}</h3>
        {description && <div className="text-sm text-ink-light mt-1.5 whitespace-pre-line">{description}</div>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      <div
        className="sticky bottom-0 bg-paper flex gap-2 px-5 pt-3"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <button type="button" onClick={onCancel} disabled={busy}
          className="flex-1 py-3 rounded-xl text-sm font-heading font-bold text-muted bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-50">
          {cancelLabel}
        </button>
        <button type="button" onClick={confirm} disabled={busy || confirmDisabled}
          className={`flex-1 py-3 rounded-xl text-sm font-heading font-bold transition-colors disabled:opacity-50 ${confirmColors[variant]}`}>
          {busy ? "..." : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
