"use client";

/**
 * Obal jednoho widgetu — karta, nadpis a v editačním režimu ovládací lišta
 * (posun nahoru/dolů, odebrání, šířka 1–3 sloupce).
 *
 * Widget, který nemá co ukázat, se v běžném režimu nevykreslí vůbec. V editaci
 * ale zůstane jako prázdný rámeček — jinak by nešel odebrat.
 */

import type { HTMLAttributes, ReactNode } from "react";
import { SectionLabel } from "@/components/ui";
import type { WidgetWidth } from "./types";

export interface WidgetFrameProps {
  title: string;
  icon: string;
  bare?: boolean;
  editing: boolean;
  width: WidgetWidth;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onWidth: (w: WidgetWidth) => void;
  /** Právě se s tímhle widgetem táhne. */
  dragging?: boolean;
  /** Někde na dashboardu se táhne — lišta pak nemá reagovat na hover. */
  dragActive?: boolean;
  /** Pointer handlery pro úchyt; lišta widgetu slouží jako celá jako madlo. */
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}

const WIDTHS: WidgetWidth[] = [1, 2, 3];

export function WidgetFrame({
  title, icon, bare, editing, width, isFirst, isLast,
  onMoveUp, onMoveDown, onRemove, onWidth,
  dragging, dragActive, dragHandleProps, children,
}: WidgetFrameProps) {
  const body = bare ? children : (
    <div className="card p-4 sm:p-5 h-full">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );

  if (!editing) return <>{body}</>;

  // Tlačítka v liště nesmí spustit tažení — pointerdown se u nich zastaví.
  const stopDrag = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

  return (
    <div
      className={`relative rounded-[14px] ring-2 ring-offset-2 ring-offset-paper transition-shadow ${
        dragging ? "ring-pitch-500 shadow-lg" : "ring-pitch-300"
      }`}
    >
      <div
        {...dragHandleProps}
        className={`flex items-center gap-1 px-2 py-2 bg-pitch-50 rounded-t-[14px] border-b border-pitch-100 select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{ touchAction: "none" }}
        role="button"
        tabIndex={-1}
        aria-label={`Přetáhnout widget ${title}`}
        title="Chyť a přetáhni na jiné místo"
      >
        <span className="shrink-0 text-muted leading-none px-0.5" aria-hidden="true">⠿</span>
        <span className="text-base shrink-0" aria-hidden="true">{icon}</span>
        <span className="font-heading font-bold text-sm truncate flex-1 min-w-0">{title}</span>

        <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label={`Šířka widgetu ${title}`}>
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              {...stopDrag}
              onClick={() => onWidth(w)}
              aria-pressed={width === w}
              title={`Šířka ${w} ze 3 sloupců`}
              className={`w-7 h-7 rounded-md text-sm font-heading font-bold transition-colors ${
                width === w ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        <span className="w-px h-5 bg-pitch-100 mx-1 shrink-0" />

        <button
          type="button"
          {...stopDrag}
          onClick={onMoveUp}
          disabled={isFirst}
          title="Posunout výš"
          aria-label={`Posunout ${title} výš`}
          className="w-8 h-8 rounded-md bg-white text-ink hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white transition-colors"
        >
          ↑
        </button>
        <button
          type="button"
          {...stopDrag}
          onClick={onMoveDown}
          disabled={isLast}
          title="Posunout níž"
          aria-label={`Posunout ${title} níž`}
          className="w-8 h-8 rounded-md bg-white text-ink hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white transition-colors"
        >
          ↓
        </button>
        <button
          type="button"
          {...stopDrag}
          onClick={onRemove}
          title="Odebrat z dashboardu"
          aria-label={`Odebrat ${title}`}
          className="w-8 h-8 rounded-md bg-white text-card-red hover:bg-red-50 transition-colors font-bold"
        >
          ✕
        </button>
      </div>

      {/* V editaci widget nereaguje na klikání — ovládá se jen lišta */}
      <div className={`pointer-events-none select-none ${dragActive && !dragging ? "opacity-70" : ""}`}>{body}</div>
    </div>
  );
}

/** Zástupný obsah, dokud se zdroj načítá. */
export function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-1" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 rounded bg-gray-100 animate-pulse" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Hláška, když se zdroj nepodařilo načíst. */
export function WidgetError() {
  return <div className="text-sm text-muted py-4 text-center">Data se nepodařilo načíst.</div>;
}
