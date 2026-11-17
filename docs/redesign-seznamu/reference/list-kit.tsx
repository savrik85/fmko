import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Stavebnice seznamů: karta se záhlavím, řádkový seznam, prázdný stav,
 * „Zobrazit další“ a drobné štítky (výsledek, skóre, hodnocení, částka).
 *
 * Tabulku s porovnáváním čísel dělá `DataTable` (data-table.tsx). Tady jsou
 * položky, na které se kliká: hráči, zápasy, nabídky, pohyby na účtu.
 *
 * Pravidla, která díly hlídají samy:
 * - řádek je vysoký nejmíň 56 px a jeho stavba je vždy stejná
 * - hlavní text se zalomí nejvýš na dva řádky, třemi tečkami končí jen podrobnosti
 * - stav řádku značí 3px proužek vlevo, ne barva podkladu
 */

/* ── Karta se záhlavím ── */

export function ListCard({ title, count, controls, children, className = "" }: {
  /** Nadpis verzálkami vlevo. Bez něj se záhlaví nekreslí. */
  title?: ReactNode;
  /** Počet nebo krátký údaj vedle nadpisu, např. „22 hráčů“. */
  count?: ReactNode;
  /** Přepínače a filtry vpravo. */
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      {(title || controls) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 border-b border-line">
          {title && <span className="section-label !mb-0">{title}</span>}
          {count != null && <span className="text-meta font-semibold text-muted-light">{count}</span>}
          {controls && <div className="ml-auto flex items-center gap-2">{controls}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Řádkový seznam ── */

export type RowTone = "new" | "warn" | "danger";

const ROW_TONE_BAR: Record<RowTone, string> = {
  new: "before:bg-pitch-500",
  warn: "before:bg-gold-500",
  danger: "before:bg-card-red",
};

/** Úzký šedý nadpis skupiny řádků: den, kolo, stav. */
export function RowGroup({ label, aside }: { label: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-surface-2 border-b border-line-soft text-micro font-bold uppercase tracking-wider text-muted">
      <span>{label}</span>
      {aside != null && <span className="tabular-nums">{aside}</span>}
    </div>
  );
}

export function ListRow({ href, onClick, leading, title, meta, detail, trailing, tone, chevron, dense }: {
  /** Celý řádek je odkaz. Nepoužívat spolu s tlačítkem v `trailing`. */
  href?: string;
  onClick?: () => void;
  /** Vlevo: portrét, znak nebo `RowIcon`. Vždy 36 px. */
  leading?: ReactNode;
  /**
   * Hlavní text. Zalomí se nejvýš na dva řádky. Položka, která je celá jednou větou
   * a krátký název nemá (výtržnost v hospodě), ho vynechá a větu dá do `detail`.
   */
  title?: ReactNode;
  /** Jeden řádek podrobností pod názvem. Smí skončit třemi tečkami. */
  meta?: ReactNode;
  /**
   * Celá věta pod podrobnostmi, která se nesmí useknout (popis události, zápis v kronice).
   * Zalomí se na libovolný počet řádků. Pro údaje, které se vejdou do `meta`, nepoužívat.
   */
  detail?: ReactNode;
  /** Vpravo: hlavní číslo, štítek nebo tlačítko. */
  trailing?: ReactNode;
  tone?: RowTone;
  /** Šipka vpravo. Výchozí: ano, když je řádek klikací. */
  chevron?: boolean;
  /**
   * Hustý řádek (40 px) pro žebříčky a krátké výčty v dlaždicích: pořadí, jméno, číslo.
   * Bez šipky. Běžné seznamy ho nepoužívají.
   */
  dense?: boolean;
}) {
  const clickable = !!href || !!onClick;
  const showChevron = chevron ?? (clickable && !dense);
  const shape = `relative flex ${detail ? "items-start" : "items-center"} ${dense ? "gap-2.5 min-h-[40px] py-1.5" : "gap-3 min-h-[56px] py-2.5"} px-4 border-b border-line-soft last:border-b-0 text-left w-full ${
    clickable ? "hover:bg-surface-2 transition-colors cursor-pointer" : ""
  } ${tone ? `before:absolute before:left-0 before:inset-y-0 before:w-[3px] ${ROW_TONE_BAR[tone]}` : ""}`;
  const body = (
    <>
      {leading && <span className={`shrink-0 flex items-center justify-center ${dense ? "w-6" : "w-9 h-9"}`}>{leading}</span>}
      <span className="flex-1 min-w-0">
        {/* Bez `block`: přebil by display z line-clamp a titulek by se neomezil na dva řádky. */}
        {title && <span className="text-body font-bold text-ink leading-snug line-clamp-2">{title}</span>}
        {meta && <span className="block text-meta text-muted truncate">{meta}</span>}
        {detail && (
          <span className={`block text-meta leading-snug ${title ? "text-ink-light mt-0.5" : "text-ink"}`}>{detail}</span>
        )}
      </span>
      {(trailing || showChevron) && (
        <span className="shrink-0 flex items-center gap-2 text-right">
          {trailing}
          {showChevron && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-muted-light">
              <path d="M5 2.5L9.5 7 5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      )}
    </>
  );
  if (href) return <Link href={href} className={shape}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={shape}>{body}</button>;
  return <div className={shape}>{body}</div>;
}

/** Ikona v šedé dlaždici pro řádky bez portrétu a znaku (pohyby na účtu, události). */
export function RowIcon({ children }: { children: ReactNode }) {
  return <span className="w-9 h-9 rounded-control bg-surface-3 flex items-center justify-center text-lg leading-none" aria-hidden="true">{children}</span>;
}

/** Změna o kolik jako kolečko vlevo v řádku historie: zeleně nahoru, červeně dolů. */
export function DeltaMark({ value }: { value: number }) {
  const color = value > 0 ? "bg-pitch-50 text-pitch-600" : value < 0 ? "bg-danger-soft text-card-red" : "bg-surface-3 text-muted";
  return (
    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-meta font-bold tabular-nums ${color}`}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}{Math.abs(value)}
    </span>
  );
}

/** Hlavní hodnota vpravo s volitelným drobným popiskem pod ní. */
export function RowValue({ children, sub, tone }: { children: ReactNode; sub?: ReactNode; tone?: "plus" | "minus" }) {
  const color = tone === "plus" ? "text-pitch-600" : tone === "minus" ? "text-card-red" : "text-ink";
  return (
    <span className="block">
      <span className={`block text-body font-bold tabular-nums ${color}`}>{children}</span>
      {sub && <span className="block text-micro text-muted">{sub}</span>}
    </span>
  );
}

/* ── Prázdný stav a „Zobrazit další“ ── */

export function ListEmpty({ icon = "📭", children, action }: {
  icon?: string;
  /** Věta, co prázdný seznam znamená a co s tím. Ne „Žádná data“. */
  children: ReactNode;
  /** Tlačítko nebo odkaz s dalším krokem. */
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-7 text-center">
      <div className="text-3xl leading-none" aria-hidden="true">{icon}</div>
      <p className="mt-2 mx-auto max-w-xs text-body text-ink-light">{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ShowMore({ shown, total, step, onMore }: { shown: number; total: number; step: number; onMore: () => void }) {
  if (shown >= total) return null;
  const rest = total - shown;
  // „Zobrazit dalších 10 z 42“, na konci „Zobrazit zbylé 3“.
  const label = rest <= step ? `Zobrazit ${rest === 1 ? "poslední" : `zbylé ${rest}`}` : `Zobrazit dalších ${step} z ${rest}`;
  return (
    <button type="button" onClick={onMore}
      className="block w-full border-t border-line py-3 text-meta font-bold text-pitch-600 hover:bg-surface-2 transition-colors">
      {label}
    </button>
  );
}

/* ── Štítky ── */

export type MatchOutcome = "W" | "D" | "L";

const OUTCOME_LETTER: Record<MatchOutcome, string> = { W: "V", D: "R", L: "P" };
const OUTCOME_SOLID: Record<MatchOutcome, string> = { W: "bg-pitch-500", D: "bg-gray-400", L: "bg-card-red" };
const OUTCOME_SOFT: Record<MatchOutcome, string> = {
  W: "bg-pitch-50 text-pitch-600",
  D: "bg-surface-3 text-muted",
  L: "bg-danger-soft text-card-red",
};

/** Čtvereček V / R / P do formy. */
export function ResultChip({ result }: { result: MatchOutcome }) {
  return (
    <span className={`inline-flex w-[22px] h-[22px] rounded-tight items-center justify-center text-micro font-bold text-white ${OUTCOME_SOLID[result]}`}>
      {OUTCOME_LETTER[result]}
    </span>
  );
}

/** Skóre zápasu podbarvené výsledkem. */
export function ScoreChip({ result, children }: { result: MatchOutcome; children: ReactNode }) {
  return (
    <span className={`inline-block min-w-[44px] text-center px-2 py-0.5 rounded-tight text-meta font-bold tabular-nums ${OUTCOME_SOFT[result]}`}>
      {children}
    </span>
  );
}

export type RatingTone = "top" | "good" | "neutral" | "poor";

const RATING_TONE: Record<RatingTone, string> = {
  top: "bg-gold-50 text-gold-700",
  good: "bg-pitch-50 text-pitch-600",
  neutral: "bg-surface-3 text-ink",
  poor: "bg-danger-soft text-card-red",
};

/**
 * Hodnocení hráče. Barva se NEURČUJE absolutními prahy (škála není stovková):
 * buď zůstane neutrální, nebo ji volající spočítá proti ostatním v seznamu
 * přes `ratingToneIn`.
 */
export function RatingPill({ value, tone = "neutral" }: { value: number | string; tone?: RatingTone }) {
  return (
    <span className={`inline-flex min-w-[36px] h-7 px-1.5 rounded-control items-center justify-center text-body font-bold tabular-nums ${RATING_TONE[tone]}`}>
      {value}
    </span>
  );
}

/** Nejlepší v seznamu zlatě, nad průměrem seznamu zeleně, ostatní neutrálně. */
export function ratingToneIn(value: number, all: number[]): RatingTone {
  if (all.length < 3) return "neutral";
  const max = Math.max(...all);
  const mean = all.reduce((sum, v) => sum + v, 0) / all.length;
  if (value >= max) return "top";
  return value > mean ? "good" : "neutral";
}

/** Stavový štítek vpravo v řádku. */
export function StatusChip({ tone = "neutral", children }: { tone?: "ok" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  const color = tone === "ok" ? "bg-pitch-50 text-pitch-600"
    : tone === "warn" ? "bg-warn-soft text-warn"
    : tone === "danger" ? "bg-danger-soft text-card-red"
    : "bg-surface-3 text-muted";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-micro font-bold whitespace-nowrap ${color}`}>{children}</span>;
}
