"use client";

import { useLayoutEffect, useRef } from "react";
import { MAX_TRANSFER_AMOUNT } from "@okresni-masina/shared";

/** Částka s mezerami po tisících: 45 000. */
export function formatAmount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Pole na částku v Kč — jedno pro všechny dialogy s penězi.
 *
 * Dřív měl každý dialog vlastní pole a číselné `<input type="number">` se při každém úhozu
 * přepisovalo na `parseInt(...) || 0`: pole nešlo vymazat (skočilo na 0) a další číslice
 * se psaly za nulu, takže z 45000 bylo na obrazovce „045000". Jinde zase nebyl strop
 * a v DB skončily nabídky na 1,25·10²⁶ Kč.
 *
 * `value === null` = prázdné pole (volající rozhodne, jestli je to platné — hostování zdarma).
 */
export function MoneyInput({ value, onChange, max = MAX_TRANSFER_AMOUNT, className, placeholder, autoFocus }: {
  value: number | null;
  onChange: (value: number | null) => void;
  max?: number;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Kolik číslic bylo před kurzorem — po přeformátování (mezery) ho posadíme za stejnou číslici.
  const digitsBeforeCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const wanted = digitsBeforeCaret.current;
    if (!el || wanted === null || document.activeElement !== el) return;
    digitsBeforeCaret.current = null;
    let remaining = wanted;
    let pos = 0;
    while (pos < el.value.length && remaining > 0) {
      if (/\d/.test(el.value[pos])) remaining--;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  });

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value === null ? "" : formatAmount(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const caret = e.target.selectionStart ?? raw.length;
        const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        digitsBeforeCaret.current = Math.min(digits.length, raw.slice(0, caret).replace(/\D/g, "").length);
        onChange(digits === "" ? null : Math.min(max, parseInt(digits, 10)));
      }}
      className={className}
    />
  );
}
