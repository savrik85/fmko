"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type AutoGrowTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "rows"> & {
  value: string;
  /** Nad tolik řádků pole neroste a začne se posouvat. */
  maxRows?: number;
  /** Zavolá se, když pole změní výšku (třeba aby chat dorovnal poslední zprávu do zorného pole). */
  onHeightChange?: () => void;
};

/**
 * Textové pole, které při psaní roste do výšky, aby byl vidět celý text, jako v iMessage.
 * Co dělá Enter, si řeší volající přes `onKeyDown`.
 */
export function AutoGrowTextarea({ value, maxRows = 6, onHeightChange, className = "", ...props }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastHeight = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 24;
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const maxHeight = lineHeight * maxRows + padding + border;

    el.style.height = "auto";
    const contentHeight = el.scrollHeight + border;
    const height = Math.min(contentHeight, maxHeight);
    el.style.height = `${height}px`;
    el.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";

    if (lastHeight.current && lastHeight.current !== height) onHeightChange?.();
    lastHeight.current = height;
  }, [value, maxRows, onHeightChange]);

  return <textarea ref={ref} rows={1} value={value} className={`resize-none ${className}`} {...props} />;
}
