"use client";

/**
 * Přetahování widgetů v editačním režimu.
 *
 * Staví na pointer eventech, ne na HTML5 drag & drop — ten na dotykových
 * displejích nefunguje vůbec. Tažení se chytá za lištu widgetu, která má
 * `touch-action: none`, takže se prst nepere se scrollováním stránky.
 *
 * Widgety se přeskládají hned, jak kurzor vjede do jiného widgetu. Po přesunu
 * leží tažený widget pod kurzorem, takže se pořadí nemůže rozkmitat sem a tam.
 */

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Dashboard scrolluje uvnitř <main>, ne na okně — auto-scroll musí najít správný kontejner. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/** Pásmo u okraje, ve kterém se při tažení odjíždí, a rychlost odjíždění. */
const EDGE_ZONE = 90;
const SCROLL_STEP = 14;

export function useWidgetDrag(order: string[], onMove: (from: number, to: number) => void) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const orderRef = useRef(order);
  orderRef.current = order;

  const draggingId = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const pointerY = useRef(0);
  const rafId = useRef<number | null>(null);

  /** Uloží DOM uzel widgetu, aby se dalo trefovat, nad čím kurzor zrovna je. */
  const registerNode = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  }, []);

  const stopAutoScroll = () => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  };

  const finish = useCallback((e: ReactPointerEvent) => {
    if (draggingId.current == null) return;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    draggingId.current = null;
    setDragId(null);
    stopAutoScroll();
  }, []);

  const handlers = useCallback((id: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      // Jen hlavní tlačítko; pravý klik ani druhý prst tažení nezačínají.
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      draggingId.current = id;
      setDragId(id);
      pointerY.current = e.clientY;

      const container = findScrollParent(nodes.current.get(id) ?? null);
      const tick = () => {
        if (draggingId.current == null) return;
        const y = pointerY.current;
        const scroller = container ?? (document.scrollingElement as HTMLElement | null);
        if (scroller) {
          const rect = container ? container.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
          if (y - rect.top < EDGE_ZONE) scroller.scrollTop -= SCROLL_STEP;
          else if (rect.bottom - y < EDGE_ZONE) scroller.scrollTop += SCROLL_STEP;
        }
        rafId.current = requestAnimationFrame(tick);
      };
      rafId.current = requestAnimationFrame(tick);
    },

    onPointerMove: (e: ReactPointerEvent) => {
      const fromId = draggingId.current;
      if (fromId == null) return;
      pointerY.current = e.clientY;

      const targetId = orderRef.current.find((otherId) => {
        if (otherId === fromId) return false;
        const el = nodes.current.get(otherId);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (!targetId) return;

      const from = orderRef.current.indexOf(fromId);
      const to = orderRef.current.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return;
      onMove(from, to);
    },

    onPointerUp: finish,
    onPointerCancel: finish,
  }), [finish, onMove]);

  return { registerNode, dragId, dragHandlers: handlers };
}
