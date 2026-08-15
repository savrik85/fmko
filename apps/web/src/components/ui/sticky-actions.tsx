"use client";

import type { ReactNode } from "react";

/**
 * Lepivá lišta s hlavními akcemi na konci stránky.
 *
 * Vznikla z toho, že Dres, Stadion a Identita měly tři kopie stejného kódu
 * — včetně stejné chyby: `bg-canvas`, což není definovaný token, takže lišta
 * byla průhledná a obsah pod ní prosvítal.
 *
 * Na mobilu se lišta drží nad spodní navigací, ne pod ní.
 */
export function StickyActions({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mt-6 sticky bottom-0 z-10 bg-paper/95 backdrop-blur-sm border-t border-line -mx-3 sm:-mx-8 px-3 sm:px-8 py-3 flex items-center justify-end gap-3 ${className}`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
    >
      {children}
    </div>
  );
}
