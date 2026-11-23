import React, { type ReactNode } from "react";
import { BALL_DELAY_MS } from "./loading-quips";

// Skeletony ve tvaru stránek. Kde je jasné, jak obsah vypadá, ukazují jeho tvar
// místo míče. Naskočí po 300 ms jako míč, takže rychlé načtení nic neproblikne.

const WIDTHS = ["62%", "48%", "70%", "55%", "40%", "66%", "52%", "58%"];
const widthAt = (index: number) => WIDTHS[index % WIDTHS.length];

/** Šedý pruh se třpytem (`.skeleton` v globals.css). */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`skeleton block ${className}`} style={style} />;
}

/**
 * Obal celé stránky. `header` (třeba skutečná PageHeader) je vidět hned,
 * zbytek naskočí po 300 ms.
 */
export function SkeletonPage({ header, children, className = "page-container space-y-4" }: {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-label="Načítám">
      {header}
      <div className={`skeleton-appear ${className}`} style={{ animationDelay: `${BALL_DELAY_MS}ms` }} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

/**
 * Lišta záložek: tlačítka 44 px. Samotné `Tabs` mají 52 px; `framed` = `Tabs` zabalené
 * ještě do `card p-1.5` (Kádr), celkem 64 px.
 */
export function TabsSkeleton({ count = 4, framed = false }: { count?: number; framed?: boolean }) {
  return (
    <div className={`card ${framed ? "p-1.5" : "p-1"}`}>
      <div className={`flex gap-1.5 ${framed ? "py-1" : ""}`}>
        {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-11 flex-1 rounded-control" />)}
      </div>
    </div>
  );
}

/** Karta se seznamem (`ListCard` + `ListRow`): kulatý obrázek, dva řádky textu, číslo vpravo. */
export function ListSkeleton({ rows = 6, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="card">
      {title && (
        <div className="px-4 py-3 border-b border-line"><Skeleton className="h-3 w-24" /></div>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 min-h-[56px] py-2.5 px-4 border-b border-line-soft last:border-b-0">
          <Skeleton className="w-9 h-9 shrink-0 !rounded-full" />
          <span className="flex-1 min-w-0">
            <Skeleton className="h-3.5" style={{ width: widthAt(i) }} />
            <Skeleton className="h-3 w-1/3 mt-1.5" />
          </span>
          <Skeleton className="h-5 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Karta s tabulkou (`DataTable`): hlavička a řádky po 52 px. */
export function TableSkeleton({ rows = 10, columns = 4 }: { rows?: number; columns?: number }) {
  const numeric = Math.max(0, columns - 1);
  return (
    <div className="card overflow-hidden">
      <div className="h-9 flex items-center gap-4 px-4 bg-surface-2 border-b border-line">
        <Skeleton className="h-2.5 w-16" />
        <span className="flex-1" />
        {Array.from({ length: numeric }, (_, i) => <Skeleton key={i} className="h-2.5 w-6" />)}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[52px] sm:h-12 flex items-center gap-4 px-4 border-b border-line-soft last:border-b-0">
          <Skeleton className="h-3.5 w-4 shrink-0" />
          <span className="flex-1 min-w-0"><Skeleton className="h-3.5" style={{ width: widthAt(i) }} /></span>
          {Array.from({ length: numeric }, (_, n) => <Skeleton key={n} className="h-3.5 w-6 shrink-0" />)}
        </div>
      ))}
    </div>
  );
}

/** Obecná karta: nadpis a pár řádků textu. */
export function CardSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`card p-4 space-y-3 ${className}`}>
      <Skeleton className="h-3 w-28" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-3.5" style={{ width: widthAt(i + 2) }} />)}
    </div>
  );
}

/** Seznam konverzací v Telefonu: avatar 40 px, jméno, poslední zpráva, čas. */
export function ConversationListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-gray-100 skeleton-appear" style={{ animationDelay: `${BALL_DELAY_MS}ms` }} role="status" aria-label="Načítám">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
          <Skeleton className="w-10 h-10 shrink-0 !rounded-full" />
          <span className="flex-1 min-w-0">
            {/* Výšky řádků jako text: jméno 24 px, zpráva 20 px. */}
            <span className="flex items-center justify-between gap-3 h-6">
              <Skeleton className="h-3.5" style={{ width: widthAt(i) }} />
              <Skeleton className="h-2.5 w-8 shrink-0" />
            </span>
            <span className="flex items-center h-5"><Skeleton className="h-3 w-3/4" /></span>
          </span>
        </div>
      ))}
    </div>
  );
}
