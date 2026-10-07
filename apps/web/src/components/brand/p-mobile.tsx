/**
 * P-Mobile — fiktivní herní operátor, pořadatel Turnaje P-Mobile.
 * Logo: bílé „P" v magentové dlaždici se signálem (operátor), barvy značky a motiv
 * stránky turnaje, který přebarví zelenou hry (pitch) na magentu.
 */

import type { CSSProperties } from "react";

export const PMOBILE = {
  magenta: "#C8006A",
  deep: "#4A0027",
  light: "#FCE8F2",
} as const;

/**
 * Motiv stránek P-Mobile: Tailwind bere barvy z CSS proměnných, takže přepsání
 * `--color-pitch-*` v obalu přebarví tlačítka, záložky a zvýraznění bez úprav komponent.
 */
export const pMobileTheme = {
  "--color-pitch-50": "#FCE8F2",
  "--color-pitch-100": "#F8C9E0",
  "--color-pitch-200": "#EE8DBF",
  "--color-pitch-300": "#E0529C",
  "--color-pitch-400": "#D1207F",
  "--color-pitch-500": "#C8006A",
  "--color-pitch-600": "#9E0054",
  "--color-pitch-700": "#74003E",
} as CSSProperties;

/** Dlaždice s „P" a signálem. `inverse` = bílá dlaždice pro magentový podklad. */
export function PMobileMark({ size = 32, inverse = false }: { size?: number; inverse?: boolean }) {
  const bg = inverse ? "#FFFFFF" : PMOBILE.magenta;
  const fg = inverse ? PMOBILE.magenta : "#FFFFFF";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="P-Mobile" style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx="8" fill={bg} />
      {/* „P": svislý dřík a bříško */}
      <path d="M9 25V7h7.5a5.5 5.5 0 0 1 0 11H13v7z M13 11v3.6h3.3a1.8 1.8 0 0 0 0-3.6z" fill={fg} fillRule="evenodd" />
      {/* Signál operátora */}
      <path d="M22.5 10.5a3 3 0 0 1 0 4" stroke={fg} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M25 8.5a6 6 0 0 1 0 8" stroke={fg} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Logo s názvem: dlaždice + „P-Mobile". */
export function PMobileLogo({ size = 32, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <PMobileMark size={size} inverse={inverse} />
      <span
        className="font-heading font-[800] tracking-tight leading-none"
        style={{ fontSize: Math.round(size * 0.62), color: inverse ? "#FFFFFF" : PMOBILE.magenta }}
      >
        P-Mobile
      </span>
    </span>
  );
}

/** Vlny signálu jako dekor do pravé části magentové hlavičky. */
export function SignalWaves({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden fill="none">
      {[40, 70, 100, 130, 160].map((r) => (
        <circle key={r} cx="200" cy="100" r={r} stroke="white" strokeOpacity={0.1 + (160 - r) / 1000} strokeWidth="10" />
      ))}
    </svg>
  );
}
