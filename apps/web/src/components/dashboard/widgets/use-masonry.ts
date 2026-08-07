"use client";

/**
 * Sesypání widgetů nahoru (masonry).
 *
 * Obyčejná mřížka dělá řádky stejně vysoké jako jejich nejvyšší widget, takže
 * pod krátkými kartami zůstávaly velké díry. Tady místo toho běží mřížka po
 * jemných řádcích (8 px) a každý widget zabere tolik řádků, kolik je opravdu
 * vysoký. S `grid-auto-flow: dense` pak menší widgety zaplní mezery pod vyššími
 * sousedy — ale pořád můžou být přes 1–3 sloupce, což sloupcová masonry neumí.
 *
 * Výšku měří ResizeObserver, takže se rozložení srovná i po doběhnutí dat
 * nebo po překreslení grafu.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Jemnost mřížky.
 *
 * MUSÍ dělit beze zbytku (výška widgetu + MASONRY_GAP) u všech standardních
 * výšek, jinak se span zaokrouhlí nahoru a sloupec se rozejde. Při osmi pixelech
 * se to dělo: (200 + 20) / 8 = 27,5 → 28 řádků, tedy o 4 px navíc, a sloupec
 * „nízký + střední" pak končil o kus níž než sousední „vysoký".
 *
 * Se čtyřmi to vychází přesně pro každou výšku, která je násobkem čtyř —
 * a standardní výšky jsou násobky dvaceti.
 */
export const MASONRY_ROW = 4;
/** Svislá mezera mezi widgety. Row-gap je nula, mezeru dělá právě tenhle přídavek. */
export const MASONRY_GAP = 20;

export function useMasonry() {
  const [spans, setSpans] = useState<Record<string, number>>({});
  const observers = useRef(new Map<string, ResizeObserver>());
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());

  const measure = useCallback((id: string, el: HTMLElement) => {
    const height = el.getBoundingClientRect().height;
    if (height <= 0) return;
    const span = Math.max(1, Math.ceil((height + MASONRY_GAP) / MASONRY_ROW));
    setSpans((prev) => (prev[id] === span ? prev : { ...prev, [id]: span }));
  }, []);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    const old = observers.current.get(id);
    if (old) {
      old.disconnect();
      observers.current.delete(id);
    }
    if (!el) return;
    const ro = new ResizeObserver(() => measure(id, el));
    ro.observe(el);
    observers.current.set(id, ro);
    measure(id, el);
  }, [measure]);

  /**
   * Stabilní ref callback pro dané id — kdyby se vyráběl inline, React by ho
   * při každém renderu odregistroval a znovu zaregistroval.
   */
  const contentRef = useCallback((id: string) => {
    let cb = callbacks.current.get(id);
    if (!cb) {
      cb = (el: HTMLElement | null) => register(id, el);
      callbacks.current.set(id, cb);
    }
    return cb;
  }, [register]);

  useEffect(() => {
    const active = observers.current;
    return () => {
      active.forEach((o) => o.disconnect());
      active.clear();
    };
  }, []);

  return { spans, contentRef };
}
