"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ListEmpty, ShowMore } from "./list-kit";

/**
 * Jednotná tabulka pro porovnávání čísel ve sloupcích: ligová tabulka, kádr,
 * střelci, pohyby v čase.
 *
 * Co hlídá sama:
 * - jedno záhlaví (36 px) a jedna výška řádku (52 px na telefonu, 48 px od `sm`)
 * - na telefonu se tabulka NEPOSOUVÁ do strany: sloupce s `priority` 2 a 3 se schovají
 * - výjimka `scroll`: tabulka s mnoha sloupci se posouvá, první sloupec je
 *   přilepený a pod tabulkou je na telefonu věta, že se dá posunout
 * - řazení klikem na záhlaví sloupce, který má `sortValue`
 */

export interface DataColumn<T> {
  key: string;
  /** Text záhlaví. Krátký, verzálky dodá styl. */
  header: ReactNode;
  /** Vysvětlivka zkratky v záhlaví (atribut title). */
  title?: string;
  /** Výchozí: první sloupec vlevo, ostatní na střed. */
  align?: "left" | "center" | "right";
  /** Šířka jako třída Tailwindu, např. "w-12". Bez ní si sloupec vezme, co zbyde. */
  width?: string;
  /** 1 = vždy, 2 = od 640 px, 3 = od 1024 px. Výchozí 1. Ve variantě `scroll` se ignoruje. */
  priority?: 1 | 2 | 3;
  /** Hodnota pro řazení. Bez ní sloupec řadit nejde. */
  sortValue?: (row: T) => number | string;
  /** Směr při prvním kliknutí. Výchozí: text vzestupně, číslo sestupně. */
  firstDir?: "asc" | "desc";
  /** Hlavní číslo řádku (body, hodnocení): tučně a tmavě. */
  emphasis?: boolean;
  cell: (row: T, index: number) => ReactNode;
}

export interface DataRowTone {
  /** Vlastní klub nebo vlastní hráč: zelený podklad. */
  own?: boolean;
  /** Proužek vlevo: postupová zóna, sestupová zóna, upozornění. */
  bar?: "up" | "down" | "warn";
  /** Ztlumený řádek: hráč nedostupný, odešel, nejede na zápas. Klikat se na něj dá dál, pokud má odkaz. */
  dim?: boolean;
  /** Řádek vybraný v editoru (Sestava: hráč, kterého právě přesouváš): zlatý podklad. */
  selected?: boolean;
}

const PRIORITY_CLASS: Record<1 | 2 | 3, string> = {
  1: "",
  2: "hidden sm:table-cell",
  3: "hidden lg:table-cell",
};
const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;
const BAR_CLASS = { up: "before:bg-pitch-500", down: "before:bg-card-red", warn: "before:bg-gold-500" } as const;
/** `!important` přebije minWidth v atributu style. */
const SCROLL_UNTIL_CLASS = { sm: "sm:!min-w-0", lg: "lg:!min-w-0" } as const;

export function DataTable<T>({
  columns, rows, rowKey, rowHref, onRowClick, rowTone, defaultSort, pageSize, empty, emptyIcon, emptyAction, scroll, dense,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Celý řádek vede na detail. */
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  rowTone?: (row: T) => DataRowTone | undefined;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  /** Kolik řádků ukázat hned; zbytek po „Zobrazit další“. Bez hodnoty všechny. */
  pageSize?: number;
  /** Věta do prázdného stavu. Povinná: prázdná tabulka bez vysvětlení je chyba. */
  empty: ReactNode;
  emptyIcon?: string;
  emptyAction?: ReactNode;
  /**
   * Tabulka s mnoha sloupci: posouvá se do strany, první sloupec je přilepený.
   * `until`: od této šířky obrazovky se minimální šířka vypne a tabulka se vejde
   * (Sestava: na desktopu je panel úzký, ale sloupce se do něj vejdou).
   */
  scroll?: { minWidth: number; until?: "sm" | "lg" };
  /**
   * Hustá tabulka (řádek 40 px) pro soupisky vedle hřiště a tabulky v dlaždicích na Domů,
   * kde se řádky počítají do pevné výšky. Běžné tabulky ji nepoužívají.
   */
  dense?: boolean;
}) {
  const router = useRouter();
  const [sort, setSort] = useState(defaultSort ?? null);
  const [shown, setShown] = useState(pageSize ?? Number.POSITIVE_INFINITY);

  const sorted = useMemo(() => {
    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    const valueOf = column?.sortValue;
    if (!sort || !valueOf) return rows;
    return [...rows].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      const cmp = typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv), "cs")
        : av - bv;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, columns, sort]);

  const toggleSort = (column: DataColumn<T>) => {
    if (!column.sortValue) return;
    setSort((current) => {
      if (current?.key === column.key) return { key: column.key, dir: current.dir === "asc" ? "desc" : "asc" };
      const sample = rows.length > 0 ? column.sortValue?.(rows[0]) : 0;
      return { key: column.key, dir: column.firstDir ?? (typeof sample === "string" ? "asc" : "desc") };
    });
  };

  if (rows.length === 0) return <ListEmpty icon={emptyIcon} action={emptyAction}>{empty}</ListEmpty>;

  const visible = sorted.slice(0, shown);
  const alignOf = (column: DataColumn<T>, index: number) => ALIGN_CLASS[column.align ?? (index === 0 ? "left" : "center")];
  const hideOf = (column: DataColumn<T>) => (scroll ? "" : PRIORITY_CLASS[column.priority ?? 1]);
  const edgeOf = (index: number) => `${index === 0 ? "pl-4" : "pl-2"} ${index === columns.length - 1 ? "pr-4" : "pr-2"}`;
  const stickyOf = (index: number, background: string) =>
    scroll && index === 0 ? `sticky left-0 z-[1] ${background} shadow-[6px_0_8px_-6px_rgba(26,23,20,0.18)]` : "";

  const table = (
    <table className={`w-full border-collapse ${scroll?.until ? SCROLL_UNTIL_CLASS[scroll.until] : ""}`} style={scroll ? { minWidth: scroll.minWidth } : undefined}>
      <thead>
        <tr>
          {columns.map((column, index) => {
            const active = sort?.key === column.key;
            const label = column.sortValue ? (
              <button type="button" onClick={() => toggleSort(column)}
                className={`inline-flex items-center gap-1 uppercase tracking-wider font-bold ${active ? "text-pitch-600" : "hover:text-ink"}`}>
                {column.header}
                {active && (
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className={sort?.dir === "asc" ? "rotate-180" : ""}>
                    <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ) : column.header;
            return (
              <th key={column.key} title={column.title} scope="col"
                aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
                className={`h-9 bg-surface-2 border-b border-line text-micro font-bold uppercase tracking-wider text-muted whitespace-nowrap ${alignOf(column, index)} ${hideOf(column)} ${edgeOf(index)} ${column.width ?? ""} ${stickyOf(index, "bg-surface-2")}`}>
                {label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {visible.map((row, rowIndex) => {
          const tone = rowTone?.(row);
          const href = rowHref?.(row);
          const clickable = !!href || !!onRowClick;
          const open = () => { if (href) router.push(href); else onRowClick?.(row); };
          const background = tone?.selected ? "bg-gold-100" : tone?.own ? "bg-pitch-50" : "bg-surface";
          return (
            <tr key={rowKey(row)}
              onClick={clickable ? open : undefined}
              onKeyDown={clickable ? (e: KeyboardEvent) => { if (e.key === "Enter") open(); } : undefined}
              tabIndex={clickable ? 0 : undefined}
              role={href ? "link" : undefined}
              className={`group ${clickable ? "cursor-pointer" : ""}`}>
              {columns.map((column, index) => (
                <td key={column.key}
                  className={`${dense ? "h-10" : "h-[52px] sm:h-12"} border-b border-line-soft group-last:border-b-0 tabular-nums ${background} ${tone?.dim ? "opacity-50" : ""} ${
                    tone?.own || tone?.selected ? "" : "group-hover:bg-surface-2"
                  } ${column.emphasis ? "text-body font-bold text-ink" : "text-ink-light"} ${alignOf(column, index)} ${hideOf(column)} ${edgeOf(index)} ${
                    index === 0 && tone?.bar ? `relative before:absolute before:left-0 before:inset-y-0 before:w-[3px] ${BAR_CLASS[tone.bar]}` : ""
                  } ${stickyOf(index, background)}`}>
                  {column.cell(row, rowIndex)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      {scroll ? (
        <>
          <div className="overflow-x-auto table-scroll">{table}</div>
          <div className="sm:hidden px-4 py-2 border-t border-line-soft text-micro text-muted">← Tabulku lze posunout do strany →</div>
        </>
      ) : table}
      {pageSize != null && (
        <ShowMore shown={Math.min(shown, sorted.length)} total={sorted.length} step={pageSize} onMore={() => setShown((n) => n + pageSize)} />
      )}
    </>
  );
}

/** Buňka s entitou: znak nebo odznak vlevo, název a volitelně druhý řádek (jen na telefonu, nebo vždy). */
export function EntityCell({ leading, name, meta, metaMobileOnly, bold }: {
  leading?: ReactNode;
  name: ReactNode;
  /** Druhý řádek pod názvem: sem patří údaje ze sloupců, které se na telefonu schovaly. */
  meta?: ReactNode;
  metaMobileOnly?: boolean;
  /** Tučnější název pro vlastní klub. */
  bold?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 min-w-0 py-1.5">
      {leading && <span className="shrink-0 flex items-center">{leading}</span>}
      <span className="min-w-0">
        <span className={`block text-body text-ink leading-snug ${bold ? "font-extrabold" : "font-bold"}`}>{name}</span>
        {meta && <span className={`block text-meta font-normal text-muted ${metaMobileOnly ? "sm:hidden" : ""}`}>{meta}</span>}
      </span>
    </span>
  );
}
