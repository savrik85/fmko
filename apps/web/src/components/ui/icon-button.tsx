"use client";

import React from "react";

/**
 * Tlačítko, které nese jen ikonu.
 *
 * Řeší dvě věci, na které se u ručně psaných ikonových tlačítek zapomínalo:
 *
 * - `label` je povinný a jde do `aria-label`. V projektu bylo 138 míst
 *   s `title=` místo toho — jenže tooltip se na dotyku nikdy nezobrazí,
 *   takže tlačítko nemělo název pro nikoho.
 * - Dotyková plocha je vždy aspoň 44×44, i když je ikona menší. Vizuální
 *   velikost řídí `size`, plocha zůstává.
 */
interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  /** Vizuální velikost ikony; dotyková plocha je vždy 44×44. */
  size?: "sm" | "md";
  tone?: "default" | "dark" | "danger";
}

const tones: Record<NonNullable<IconButtonProps["tone"]>, string> = {
  default: "text-muted hover:text-ink hover:bg-black/5",
  dark: "text-white/60 hover:text-white hover:bg-white/10",
  danger: "text-card-red hover:bg-danger-soft",
};

export function IconButton({
  label,
  size = "md",
  tone = "default",
  className = "",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center shrink-0 min-w-11 min-h-11 rounded-control transition-colors ${tones[tone]} ${
        size === "sm" ? "text-base" : "text-xl"
      } ${className}`}
      {...props}
    >
      <span aria-hidden="true" className="flex items-center justify-center">{children}</span>
    </button>
  );
}
