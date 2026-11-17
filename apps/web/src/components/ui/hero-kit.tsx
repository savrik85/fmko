import type { ReactNode } from "react";
import Link from "next/link";
import { isLightColor } from "@/lib/team-color";

/**
 * Stavebnice velké hlavičky detailu (hráč, tým): ukazatele bez rámečků oddělené
 * linkou, navigační šipky a řada akcí pod čarou.
 *
 * Dřív měla každá stránka vlastní průsvitné dlaždice a v nich se míchaly údaje
 * (počet hráčů) s tlačítky (Stadion, Web). Tady jsou údaje nahoře a akce dole.
 */
export interface HeroTone {
  light: boolean;
  text: string;
  muted: string;
  soft: string;
  label: string;
  divider: string;
  rule: string;
  panel: string;
  plate: string;
  track: string;
  fill: string;
  nav: string;
  button: string;
  buttonActive: string;
  buttonDanger: string;
  buttonAccent: string;
}

const ON_DARK: HeroTone = {
  light: false,
  text: "text-white",
  muted: "text-white/75",
  soft: "text-white/40",
  label: "text-white/65",
  divider: "divide-white/15",
  rule: "border-white/15",
  panel: "bg-white/10",
  plate: "bg-white",
  track: "bg-white/20",
  fill: "bg-white",
  nav: "bg-white/10 hover:bg-white/20 text-white",
  button: "bg-white/10 hover:bg-white/20 text-white",
  buttonActive: "bg-white/25 text-white",
  buttonDanger: "bg-black/15 text-white hover:bg-red-500/40",
  buttonAccent: "bg-gold-400/30 text-white ring-1 ring-gold-300/50",
};

const ON_LIGHT: HeroTone = {
  light: true,
  text: "text-gray-900",
  muted: "text-gray-700",
  soft: "text-gray-400",
  label: "text-gray-600",
  divider: "divide-black/10",
  rule: "border-black/10",
  panel: "bg-black/5",
  plate: "bg-gray-900",
  track: "bg-black/10",
  fill: "bg-gray-900",
  nav: "bg-black/5 hover:bg-black/10 text-gray-900",
  button: "bg-black/10 hover:bg-black/20 text-gray-900",
  buttonActive: "bg-black/25 text-gray-900",
  buttonDanger: "bg-black/5 text-red-700 hover:bg-red-500/20",
  buttonAccent: "bg-gold-500/40 text-gray-900 ring-1 ring-gold-600/50",
};

export function heroTone(color: string): HeroTone {
  return isLightColor(color) ? ON_LIGHT : ON_DARK;
}

/** Společný tvar tlačítka v řadě akcí; barvu dodá `tone.button*`. */
export const HERO_BUTTON = "rounded-control px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[13px] sm:text-sm font-heading font-bold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50";

/** Řada akcí pod čarou. Na mobilu nízká a těsná: hlavička nesmí zabrat třetinu displeje. */
export const HERO_ACTIONS_ROW = "mt-2.5 pt-2.5 sm:mt-4 sm:pt-3 border-t flex flex-wrap items-center gap-1.5 sm:gap-2";

export function HeroNavButton({ tone, direction, onClick, label, className = "" }: {
  tone: HeroTone; direction: "prev" | "next"; onClick: () => void; label: string; className?: string;
}) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-control items-center justify-center shrink-0 transition-colors ${tone.nav} ${className}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={direction === "prev" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Řada ukazatelů: na mobilu přes celou šířku pod jménem, na desktopu vpravo. */
export function HeroStats({ tone, children }: { tone: HeroTone; children: ReactNode }) {
  return <div className={`flex items-stretch w-full sm:w-auto divide-x ${tone.divider}`}>{children}</div>;
}

export function HeroStat({ tone, label, children, href, title, wide }: {
  tone: HeroTone; label: string; children: ReactNode; href?: string; title?: string;
  /** Širší sloupec na mobilu pro obsah, který se do rovného dílu nevejde (forma). */
  wide?: boolean;
}) {
  const body = (
    <>
      <div className={`h-7 sm:h-11 flex flex-col items-center justify-center gap-0.5 sm:gap-1 ${tone.text}`}>{children}</div>
      <div className={`${tone.label} text-micro font-heading font-bold uppercase sm:tracking-wide mt-0.5 sm:mt-1 truncate`}>{label}</div>
    </>
  );
  const shape = `${wide ? "flex-[1.7]" : "flex-1"} sm:flex-initial min-w-0 sm:min-w-[72px] px-1 sm:px-4 text-center first:pl-0 last:pr-0 sm:first:pl-4 sm:last:pr-4`;
  return href ? (
    <Link href={href} title={title} className={`${shape} hover:opacity-80 transition-opacity`}>{body}</Link>
  ) : (
    <div title={title} className={shape}>{body}</div>
  );
}

/** Akce pod čarou: oddělené od ukazatelů, ať je jasné, na co se dá kliknout. */
export function HeroActions({ tone, children }: { tone: HeroTone; children: ReactNode }) {
  return <div className={`${HERO_ACTIONS_ROW} ${tone.rule}`}>{children}</div>;
}
