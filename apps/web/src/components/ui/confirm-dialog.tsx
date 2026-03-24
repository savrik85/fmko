"use client";

import { useState } from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  details?: Array<{ label: string; value: string; color?: string }>;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  details,
  confirmLabel = "Potvrdit",
  cancelLabel = "Zrušit",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [confirming, setConfirming] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  const isLoading = loading || confirming;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h3 className="font-heading font-bold text-lg text-ink">{title}</h3>
          {description && (
            <p className="text-sm text-ink-light mt-1.5">{description}</p>
          )}

          {details && details.length > 0 && (
            <div className="mt-3 bg-surface rounded-xl p-3 space-y-1.5">
              {details.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{d.label}</span>
                  <span className={`font-heading font-bold ${d.color ?? "text-ink"}`}>{d.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex border-t border-gray-100">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-3.5 text-sm font-heading font-bold text-muted hover:bg-gray-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 py-3.5 text-sm font-heading font-bold transition-colors ${
              variant === "danger"
                ? "text-card-red hover:bg-red-50"
                : "text-pitch-500 hover:bg-pitch-50"
            }`}
          >
            {isLoading ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hook for easy confirm dialog usage */
export function useConfirm() {
  const [state, setState] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    details?: Array<{ label: string; value: string; color?: string }>;
    confirmLabel?: string;
    variant?: "default" | "danger";
    resolve?: (confirmed: boolean) => void;
  }>({ isOpen: false, title: "" });

  const confirm = (opts: {
    title: string;
    description?: string;
    details?: Array<{ label: string; value: string; color?: string }>;
    confirmLabel?: string;
    variant?: "default" | "danger";
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...opts, isOpen: true, resolve });
    });
  };

  const dialog = (
    <ConfirmDialog
      isOpen={state.isOpen}
      title={state.title}
      description={state.description}
      details={state.details}
      confirmLabel={state.confirmLabel}
      variant={state.variant}
      onConfirm={() => { state.resolve?.(true); setState((s) => ({ ...s, isOpen: false })); }}
      onCancel={() => { state.resolve?.(false); setState((s) => ({ ...s, isOpen: false })); }}
    />
  );

  return { confirm, dialog };
}
