"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Záložky — jedna komponenta místo dvanácti ručních variant.
 *
 * Co dělá jinak než ty původní:
 *
 * 1. Stav drží v URL (`?tab=`). Systémové tlačítko zpět se tak vrací na
 *    předchozí záložku místo aby zavřelo celou stránku, odkaz na konkrétní
 *    záložku jde poslat a obnovení stránky nehodí člověka zpátky na první tab.
 *
 * 2. Nepoužívá `flex-1`. Původní bary roztahovaly každou položku na stejný
 *    díl šířky, takže šest záložek na 375px displeji vyšlo po 60 px a aktivní
 *    pilulka se ořízla. Tady se položky roztáhnou jen když je místa dost,
 *    jinak se lišta scrolluje do strany.
 *
 * 3. Klávesnice: šipky vlevo/vpravo přepínají, Home/End skáčou na kraj —
 *    tak, jak to čtečky obrazovky u role="tablist" očekávají.
 */

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
  /** Číslo za popiskem — počet položek, nepřečtených apod. */
  count?: number | null;
  icon?: string;
}

/**
 * Stav záložky v URL bez `useSearchParams`.
 *
 * Záměrně přes `history.pushState` a ne přes router: `useSearchParams`
 * vyžaduje na staticky generovaných stránkách obal `<Suspense>` a musel by
 * se dopisovat na všechny stránky se záložkami. Tohle funguje všude stejně
 * a přepnutí je okamžité, bez překreslení celé stránky.
 *
 * Cenou je jeden snímek s výchozí záložkou při otevření odkazu s `?tab=`.
 * Stránky stejně načítají data přes spinner, takže to není vidět.
 */
export function useTabParam<T extends string>(
  keys: readonly T[],
  param = "tab",
): [T, (value: T) => void] {
  const [active, setActive] = useState<T>(keys[0]);
  const klice = keys.join(",");

  useEffect(() => {
    const readFromUrl = () => {
      const raw = new URLSearchParams(window.location.search).get(param);
      const found = keys.find((k) => k === raw);
      setActive(found ?? keys[0]);
    };
    readFromUrl();
    window.addEventListener("popstate", readFromUrl);
    return () => window.removeEventListener("popstate", readFromUrl);
    // klice pokrývá obsah pole; `keys` bývá literál a měnil by se každý render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, klice]);

  const select = useCallback(
    (value: T) => {
      setActive(value);
      const url = new URL(window.location.href);
      // Výchozí záložku v adrese nedržíme — URL zůstane čistá.
      if (value === keys[0]) url.searchParams.delete(param);
      else url.searchParams.set(param, value);
      window.history.pushState({}, "", url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [param, klice],
  );

  return [active, select];
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className = "",
  ariaLabel = "Záložky",
}: {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = items.findIndex((t) => t.key === value);
    if (i < 0) return;
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    onChange(items[next].key);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`flex gap-1 bg-surface rounded-card p-1 overflow-x-auto ${className}`}
    >
      {items.map((t) => {
        const isActive = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={`shrink-0 grow basis-auto whitespace-nowrap min-h-11 px-3 rounded-control text-sm font-heading font-bold transition-colors ${
              isActive ? "bg-surface-2 text-pitch-600 shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            {t.icon && <span aria-hidden="true" className="mr-1">{t.icon}</span>}
            {t.label}
            {t.count != null && (
              <span className={`ml-1.5 tabular-nums ${isActive ? "text-pitch-500" : "text-muted-light"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
