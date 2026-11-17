"use client";

import type { ReactNode } from "react";

/**
 * Výběr z voleb: jeden vzhled pro místo zápasu, sázku, den, velikost autobusu,
 * filtry i uložené sestavy (vzhled C z docs/redesign-prvku/maketa.html).
 * Vybraná volba je bílá se zeleným rámečkem a fajfkou v rohu, ostatní šedé.
 * Záložky stránky sem nepatří, ty dělá `Tabs`.
 */

const BASE = "relative rounded-control transition-[background-color,box-shadow,color] duration-150 "
  + "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-500";
const IDLE = "bg-surface-3 text-ink-light hover:bg-line";
const SELECTED = "bg-surface text-ink shadow-[inset_0_0_0_2px_var(--color-pitch-500),0_1px_3px_rgba(26,23,20,0.08)]";
const DISABLED = "bg-transparent text-muted-light line-through cursor-not-allowed";

function stateClass(selected: boolean, disabled: boolean | undefined): string {
  if (disabled) return DISABLED;
  return selected ? SELECTED : IDLE;
}

/** Fajfka v pravém horním rohu vybrané volby. */
function SelectedMark() {
  return (
    <span aria-hidden="true"
      className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-pitch-500 text-white text-[11px] font-extrabold leading-none grid place-items-center ring-2 ring-surface">
      ✓
    </span>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Drobný druhý řádek pod popiskem (datum pod dnem v týdnu, formace pod sestavou). */
  hint?: ReactNode;
  disabled?: boolean;
  /** Nápověda po najetí myší (třeba proč nejde den vybrat). */
  title?: string;
}

const COLUMNS: Record<2 | 3 | 4 | 6 | 7, string> = {
  2: "grid grid-cols-2",
  3: "grid grid-cols-3",
  4: "grid grid-cols-4",
  6: "grid grid-cols-3 sm:grid-cols-6",
  7: "grid grid-cols-7",
};

type ChoiceGroupProps<T extends string> = {
  options: ReadonlyArray<ChoiceOption<T>>;
  ariaLabel: string;
  /** Bez `columns` je to řada, která se zalamuje. */
  columns?: 2 | 3 | 4 | 6 | 7;
  /** `sm` pro filtry (32 px), `md` pro formuláře (44 px). */
  size?: "sm" | "md";
  className?: string;
} & (
  | { multiple?: false; value: T | null; onChange: (value: T) => void }
  | { multiple: true; value: ReadonlyArray<T>; onChange: (value: T) => void }
);

/**
 * Řada nebo mřížka voleb. Jedna volba (`role="radiogroup"`), nebo víc najednou
 * (`multiple`: tlačítka s `aria-pressed`, `onChange` dostane přepnutou volbu).
 */
export function ChoiceGroup<T extends string>(props: ChoiceGroupProps<T>) {
  const { options, ariaLabel, columns, size = "md", className = "" } = props;
  const isSelected = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const layout = columns ? COLUMNS[columns] : "flex flex-wrap";
  const gap = columns === 7 ? "gap-1.5" : "gap-2";
  const sizing = size === "sm"
    ? "min-h-8 px-3 py-1 text-[13px]"
    : columns === 7 ? "min-h-12 px-0.5 py-1 text-[13px]" : "min-h-11 px-2.5 py-1.5 text-sm";
  return (
    <div role={props.multiple ? "group" : "radiogroup"} aria-label={ariaLabel} className={`${layout} ${gap} ${className}`}>
      {options.map((o) => {
        const selected = isSelected(o.value);
        return (
          <button key={o.value} type="button" disabled={o.disabled} title={o.title}
            {...(props.multiple ? { "aria-pressed": selected } : { role: "radio", "aria-checked": selected })}
            onClick={() => props.onChange(o.value)}
            className={`${BASE} ${sizing} flex flex-col items-center justify-center text-center font-bold leading-tight ${stateClass(selected, o.disabled)}`}>
            <span>{o.label}</span>
            {o.hint != null && <span className="block text-micro font-medium text-muted mt-px">{o.hint}</span>}
            {selected && !o.disabled && <SelectedMark />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Velká volba s ikonou, názvem, popisem a cenou (velikost autobusu, kurz, úroveň).
 * Vkládá se do mřížky (`grid grid-cols-3 gap-2`); skupinu značí obal s `role="radiogroup"`.
 */
export function ChoiceCard({ selected, onSelect, disabled, icon, title, detail, aside, className = "" }: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
      className={`${BASE} flex flex-col items-start gap-0.5 p-3 text-left ${stateClass(selected, disabled)} ${className}`}>
      {icon != null && <span className="text-[22px] leading-none mb-1" aria-hidden="true">{icon}</span>}
      <span className="text-sm font-bold leading-snug">{title}</span>
      {detail != null && <span className="text-micro text-muted">{detail}</span>}
      {aside != null && <span className="text-[13px] font-extrabold tabular-nums mt-0.5">{aside}</span>}
      {selected && !disabled && <SelectedMark />}
    </button>
  );
}
