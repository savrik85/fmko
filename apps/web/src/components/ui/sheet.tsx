"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Plachta — spodní na mobilu, dialog na desktopu.
 *
 * Nahrazuje čtrnáct ručně psaných `fixed inset-0` překryvů, které se lišily
 * ve všem: tři různá chování při kliknutí mimo, čtyři poloměry, nikde
 * `overscroll-behavior`, takže scrollování uvnitř dialogu protáhlo i stránku
 * pod ním, a žádný z nich nešel zavřít Escapem.
 *
 * Co komponenta hlídá navíc:
 * - Escape zavírá.
 * - Po zavření se zaměření vrací na prvek, ze kterého se plachta otevřela.
 * - Pozadí stránky se nescrolluje (`overscroll-contain` + zámek na body).
 * - Leží v hladině `--z-sheet`, tedy nad spodní navigací.
 */
export function Sheet({
  open,
  onClose,
  children,
  title,
  maxWidth = "560px",
  className = "",
  zavritKlikemVedle = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Popisek pro čtečku; když je viditelný nadpis uvnitř, stačí sem jeho text. */
  title?: string;
  maxWidth?: string;
  className?: string;
  /**
   * Zavřít kliknutím vedle plachty. U formulářů se vypíná — jeden vedlejší klik
   * by zahodil rozepsaný návrh a hráč by nepochopil, kam se mu poděl.
   */
  zavritKlikemVedle?: boolean;
}) {
  const vratitFokusNa = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // onClose drží ref, NE závislost efektu.
  //
  // Rodiče ho předávají jako inline funkci, která při každém překreslení vzniká
  // znovu. Kdyby byl v závislostech, efekt by se při každém stisku klávesy uklidil
  // a spustil — cleanup vrátí fokus mimo plachtu, setup ho dá na panel, a psaní
  // do pole uvnitř tak přišlo o fokus po každém písmenu.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    vratitFokusNa.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); }
    };
    document.addEventListener("keydown", onKey);

    // Zámek scrollu pozadí — bez něj se pod otevřenou plachtou posouvala stránka.
    const puvodni = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = puvodni;
      vratitFokusNa.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-sheet)] flex items-end sm:items-center justify-center"
      onClick={zavritKlikemVedle ? onClose : undefined}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className={`relative w-full max-h-[92vh] overflow-y-auto overscroll-contain bg-paper shadow-[var(--shadow-modal)] rounded-t-[20px] sm:rounded-soft outline-none ${className}`}
      >
        {/* Úchyt — na mobilu říká, že se plachta dá stáhnout pohledem i prstem */}
        <div className="sm:hidden sticky top-0 pt-2 pb-1 flex justify-center bg-paper" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>
        {children}
      </div>
    </div>
  );
}
