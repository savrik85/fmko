"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_WIDTH = 240;
const EDGE_GAP = 8;

export type CaptureAction = "share" | "bug";

/**
 * Rozbalovací menu u kroužku nápovědy v horní liště: nápověda ke stránce,
 * fotka stránky ke sdílení a nahlášení chyby.
 *
 * Kreslí se přes portál do `body`, ne uvnitř lišty: lišta nese `.on-dark`
 * se světlými obrysy fokusu a tmavým pozadím, menu je světlé. Pozici bere
 * z kroužku, takže sedí pod ním na mobilu i na počítači.
 *
 * `data-capture-ignore`: focení stránky menu vynechá, kdyby se ještě
 * nestihlo zavřít.
 */
export function HelpMenu({
  anchor,
  hasHelp,
  busyAction = null,
  onShowHelp,
  onShareScreenshot,
  onReportBug,
  onClose,
}: {
  /** Kroužek, pod kterým se menu otevře. */
  anchor: HTMLElement | null;
  /** Stránka má nápovědu; bez ní menu nabídne jen fotku a nahlášení chyby. */
  hasHelp: boolean;
  /** Které focení právě běží; další volby jsou do konce zamčené. */
  busyAction?: CaptureAction | null;
  onShowHelp: () => void;
  onShareScreenshot: () => void;
  onReportBug: () => void;
  onClose: () => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  // onClose drží ref, aby inline funkce rodiče neuklízela posluchače při každém překreslení.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const maxLeft = window.innerWidth - MENU_WIDTH - EDGE_GAP;
      setPosition({
        top: rect.bottom + 4,
        left: Math.max(EDGE_GAP, Math.min(rect.left - EDGE_GAP, maxLeft)),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); }
    };
    document.addEventListener("keydown", onKey);
    firstItem.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!position) return null;

  const item = "w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-ink hover:bg-pitch-50 disabled:opacity-50 disabled:cursor-wait transition-colors";

  return createPortal(
    <div data-capture-ignore>
      <div className="fixed inset-0 z-[var(--z-nav)]" onClick={onClose} aria-hidden />
      <div
        role="menu"
        aria-label="Nápověda, fotka a hlášení"
        className="fixed z-[var(--z-nav)] overflow-hidden rounded-card bg-white shadow-2xl border border-gray-200 animate-slide-up"
        style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
      >
        {hasHelp && (
          <button ref={firstItem} type="button" role="menuitem" className={item} onClick={onShowHelp}>
            <span aria-hidden className="text-lg leading-none">{"📖"}</span>
            Nápověda ke stránce
          </button>
        )}
        <button
          ref={hasHelp ? undefined : firstItem}
          type="button"
          role="menuitem"
          className={`${item} ${hasHelp ? "border-t border-gray-100" : ""}`}
          onClick={onShareScreenshot}
          disabled={busyAction != null}
        >
          <span aria-hidden className="text-lg leading-none">{"📸"}</span>
          {busyAction === "share" ? "Fotím stránku…" : "Vyfotit stránku"}
        </button>
        <button
          type="button"
          role="menuitem"
          className={`${item} border-t border-gray-100`}
          onClick={onReportBug}
          disabled={busyAction != null}
        >
          <span aria-hidden className="text-lg leading-none">{"🐞"}</span>
          {busyAction === "bug" ? "Fotím stránku…" : "Nahlásit chybu"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
