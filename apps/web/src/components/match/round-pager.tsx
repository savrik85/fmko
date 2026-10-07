"use client";

/**
 * Stránkování kol: šipky na předchozí a další kolo a řada kol k přímému skoku.
 * Ukazuje vždy jen jedno kolo — v poháru jich je deset a pod sebou se v nich nedalo vyznat.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface RoundPage {
  key: string;
  /** Krátký popisek na přepínači („1. kolo", „Finále"). */
  label: string;
}

export function RoundPager({ pages, initialKey, accent, children }: {
  pages: RoundPage[];
  initialKey?: string | null;
  /** Barva aktivního kola (výchozí tmavá ink). */
  accent?: string | null;
  children: (key: string) => ReactNode;
}) {
  const [current, setCurrent] = useState<string | null>(initialKey ?? pages.at(-1)?.key ?? null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Když se data načtou až po prvním vykreslení, skoč na doporučené kolo.
  useEffect(() => {
    if (current == null || !pages.some((p) => p.key === current)) setCurrent(initialKey ?? pages.at(-1)?.key ?? null);
  }, [initialKey, pages, current]);

  // Aktivní kolo vždy vidět v řadě (na mobilu se řada posouvá do strany). Posun řady
  // přímo, ne scrollIntoView: ten umí posunout i celou stránku a plynulý posun se
  // bez vykreslování (aplikace na pozadí) neprovede vůbec.
  useEffect(() => {
    const strip = stripRef.current;
    const el = strip?.querySelector<HTMLElement>("[aria-current='true']");
    if (!strip || !el) return;
    strip.scrollLeft = Math.max(0, el.offsetLeft - strip.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2);
  }, [current]);

  if (pages.length === 0 || current == null) return null;
  const idx = Math.max(0, pages.findIndex((p) => p.key === current));
  const prev = idx > 0 ? pages[idx - 1] : null;
  const next = idx < pages.length - 1 ? pages[idx + 1] : null;

  const arrow = (target: RoundPage | null, dir: "prev" | "next") => (
    <button
      type="button"
      onClick={() => target && setCurrent(target.key)}
      disabled={!target}
      aria-label={target ? `${dir === "prev" ? "Předchozí" : "Další"}: ${target.label}` : undefined}
      className="shrink-0 w-10 h-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-ink disabled:opacity-30 hover:border-pitch-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pitch-500"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path d={dir === "prev" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {arrow(prev, "prev")}
        <div ref={stripRef} className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto no-scrollbar scroll-px-2" role="tablist" aria-label="Kola">
          {pages.map((p) => {
            const active = p.key === current;
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-current={active ? "true" : undefined}
                onClick={() => setCurrent(p.key)}
                style={active && accent ? { background: accent, borderColor: accent } : undefined}
                className={`shrink-0 px-3 h-10 rounded-full text-sm font-heading font-bold whitespace-nowrap border transition-colors ${
                  active ? "bg-ink text-white border-ink" : "bg-white text-ink/70 border-gray-200 hover:border-pitch-300"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {arrow(next, "next")}
      </div>
      {children(current)}
    </div>
  );
}
