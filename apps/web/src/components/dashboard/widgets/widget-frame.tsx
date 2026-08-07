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
import { WIDGET_COLORS, getWidgetColor } from "./widget-colors";
import { HEIGHT_OPTIONS, heightVar, type WidgetHeight } from "./widget-heights";
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
  /** Klíč barvy karty; undefined = bílá. */
  color?: string;
  onColor: (color: string | undefined) => void;
  height: WidgetHeight;
  onHeight: (height: WidgetHeight) => void;
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
  onMoveUp, onMoveDown, onRemove, onWidth, color, onColor, height, onHeight,
  dragging, dragActive, dragHandleProps, children,
}: WidgetFrameProps) {
  const tint = getWidgetColor(color);

  // Widget s vlastním obalem si výšku řídí sám — pevná výška by mu rozbila chrome.
  const cssHeight = bare ? null : heightVar(height);
  const heightProps = cssHeight
    ? { className: "widget-h", style: { "--widget-h": cssHeight } as React.CSSProperties }
    : {};

  // Odsazení zůstává na vnitřním divu, aby barevný proužek sedl na horní hranu
  // karty. Widgety, které roztahují tabulky zápornými okraji, tím nejsou dotčené.
  const body = bare ? children : (
    <div className="card h-full" style={tint ? { background: tint.bg } : undefined}>
      {tint && <div className="shrink-0" style={{ height: 3, background: tint.accent }} aria-hidden="true" />}
      <div className="widget-body p-4 sm:p-5">
        <SectionLabel>{title}</SectionLabel>
        {children}
      </div>
    </div>
  );

  if (!editing) return <div {...heightProps}>{body}</div>;

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

      {/* Rozměry — šířka ve sloupcích a výška ve třech standardních stupních */}
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap px-3 py-1.5 bg-pitch-50/60 border-b border-pitch-100">
        <div className="flex items-center gap-1" role="group" aria-label={`Šířka widgetu ${title}`}>
          <span className="text-[11px] uppercase tracking-wide text-muted mr-0.5">Šířka</span>
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              {...stopDrag}
              onClick={() => onWidth(w)}
              aria-pressed={width === w}
              title={`${w} ze 3 sloupců`}
              className={`w-7 h-7 rounded-md text-sm font-heading font-bold transition-colors ${
                width === w ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label={`Výška widgetu ${title}`}>
          <span className="text-[11px] uppercase tracking-wide text-muted mr-0.5">Výška</span>
          {HEIGHT_OPTIONS.map((h) => (
            <button
              key={String(h.value)}
              type="button"
              {...stopDrag}
              onClick={() => onHeight(h.value)}
              aria-pressed={height === h.value}
              title={h.title}
              className={`w-7 h-7 rounded-md text-sm font-heading font-bold transition-colors ${
                height === h.value ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Barvy — jen světlé odstíny, takže se nemusí řešit překlápění textu */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 bg-pitch-50/60 border-b border-pitch-100"
        role="group"
        aria-label={`Barva widgetu ${title}`}
      >
        <button
          type="button"
          {...stopDrag}
          onClick={() => onColor(undefined)}
          aria-pressed={!tint}
          title="Bez barvy"
          className={`w-5 h-5 rounded-full bg-white transition-shadow ${
            !tint ? "ring-2 ring-pitch-500 ring-offset-1" : "ring-1 ring-gray-300"
          }`}
        />
        {WIDGET_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            {...stopDrag}
            onClick={() => onColor(c.key)}
            aria-pressed={tint?.key === c.key}
            title={c.label}
            className={`w-5 h-5 rounded-full transition-shadow ${
              tint?.key === c.key ? "ring-2 ring-pitch-500 ring-offset-1" : "ring-1 ring-black/10"
            }`}
            style={{ background: c.accent }}
          />
        ))}
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
