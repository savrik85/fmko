"use client";

import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

interface Props {
  title: ReactNode;
  /** Jednořádkové shrnutí, které je vidět i ve sbaleném stavu. */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Začít sbalené i na širší obrazovce. Pro karty, které jsou spíš referenční —
   * nad sestavou jich je několik a rozbalené odtlačují hřiště pod okraj i na desktopu.
   */
  startCollapsed?: boolean;
}

/**
 * Otevřeno na širší obrazovce, sbaleno na telefonu.
 *
 * Výchozí stav se dopočítá až po mountu — na serveru viewport neznáme. Po první
 * ruční změně už se nic nepřepočítává, aby volba uživatele vydržela.
 */
export function useOpenOnDesktop(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpen(window.matchMedia("(min-width: 640px)").matches);
  }, []);

  return [open, setOpen];
}

/**
 * Karta, která je na mobilu sbalená a na širší obrazovce rozbalená.
 *
 * Sestavovač má nad hřištěm několik informačních bloků a na telefonu se kvůli nim
 * ke skutečné práci — postavit jedenáctku — musí dlouho rolovat. Shrnutí zůstává
 * viditelné i ve sbaleném stavu, aby se kvůli základní informaci nemuselo klikat.
 */
export function CollapsibleCard({ title, summary, children, className = "", startCollapsed = false }: Props) {
  const [openOnDesktop, setOpenOnDesktop] = useOpenOnDesktop();
  const [openAlways, setOpenAlways] = useState(false);
  const open = startCollapsed ? openAlways : openOnDesktop;
  const setOpen = startCollapsed ? setOpenAlways : setOpenOnDesktop;

  return (
    <div className={`card p-3 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="font-heading font-bold text-sm">{title}</div>
          {!open && summary && <div className="text-sm text-muted truncate mt-0.5">{summary}</div>}
        </div>
        <span className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>▾</span>
      </button>

      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
