import { type ReactNode } from "react";
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
}
export declare function DataTable<T>({ columns, rows, rowKey, rowHref, onRowClick, rowTone, defaultSort, pageSize, empty, emptyIcon, emptyAction, scroll, }: {
    columns: DataColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    /** Celý řádek vede na detail. */
    rowHref?: (row: T) => string | undefined;
    onRowClick?: (row: T) => void;
    rowTone?: (row: T) => DataRowTone | undefined;
    defaultSort?: {
        key: string;
        dir: "asc" | "desc";
    };
    /** Kolik řádků ukázat hned; zbytek po „Zobrazit další“. Bez hodnoty všechny. */
    pageSize?: number;
    /** Věta do prázdného stavu. Povinná: prázdná tabulka bez vysvětlení je chyba. */
    empty: ReactNode;
    emptyIcon?: string;
    emptyAction?: ReactNode;
    /** Tabulka s mnoha sloupci: posouvá se do strany, první sloupec je přilepený. */
    scroll?: {
        minWidth: number;
    };
}): import("react").JSX.Element;
/** Buňka s entitou: znak nebo odznak vlevo, název a volitelně druhý řádek (jen na telefonu, nebo vždy). */
export declare function EntityCell({ leading, name, meta, metaMobileOnly, bold }: {
    leading?: ReactNode;
    name: ReactNode;
    /** Druhý řádek pod názvem: sem patří údaje ze sloupců, které se na telefonu schovaly. */
    meta?: ReactNode;
    metaMobileOnly?: boolean;
    /** Tučnější název pro vlastní klub. */
    bold?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=data-table.d.ts.map