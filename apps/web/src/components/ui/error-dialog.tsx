"use client";

import { useEffect, useState } from "react";

interface ErrorState {
  isOpen: boolean;
  title: string;
  message: string;
}

/** Globální error dialog — napojený přes window.__showError (volá ho apiAction z lib/api). */
export function ErrorDialogProvider() {
  const [state, setState] = useState<ErrorState>({ isOpen: false, title: "", message: "" });

  useEffect(() => {
    (window as unknown as { __showError?: (title: string, message: string) => void }).__showError = (title, message) => {
      setState({ isOpen: true, title, message });
    };
    return () => {
      delete (window as unknown as { __showError?: (title: string, message: string) => void }).__showError;
    };
  }, []);

  if (!state.isOpen) return null;

  const close = () => setState((s) => ({ ...s, isOpen: false }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={close}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0 text-xl">⚠️</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading font-bold text-lg text-ink">{state.title}</h3>
              <p className="text-sm text-ink-light mt-1.5 whitespace-pre-wrap break-words">{state.message}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100">
          <button
            onClick={close}
            className="w-full py-3.5 text-sm font-heading font-bold text-pitch-500 hover:bg-pitch-50 transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
