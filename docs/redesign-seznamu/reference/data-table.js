"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListEmpty, ShowMore } from "./list-kit";
const PRIORITY_CLASS = {
    1: "",
    2: "hidden sm:table-cell",
    3: "hidden lg:table-cell",
};
const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" };
const BAR_CLASS = { up: "before:bg-pitch-500", down: "before:bg-card-red", warn: "before:bg-gold-500" };
export function DataTable({ columns, rows, rowKey, rowHref, onRowClick, rowTone, defaultSort, pageSize, empty, emptyIcon, emptyAction, scroll, }) {
    const router = useRouter();
    const [sort, setSort] = useState(defaultSort ?? null);
    const [shown, setShown] = useState(pageSize ?? Number.POSITIVE_INFINITY);
    const sorted = useMemo(() => {
        const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
        const valueOf = column?.sortValue;
        if (!sort || !valueOf)
            return rows;
        return [...rows].sort((a, b) => {
            const av = valueOf(a);
            const bv = valueOf(b);
            const cmp = typeof av === "string" || typeof bv === "string"
                ? String(av).localeCompare(String(bv), "cs")
                : av - bv;
            return sort.dir === "asc" ? cmp : -cmp;
        });
    }, [rows, columns, sort]);
    const toggleSort = (column) => {
        if (!column.sortValue)
            return;
        setSort((current) => {
            if (current?.key === column.key)
                return { key: column.key, dir: current.dir === "asc" ? "desc" : "asc" };
            const sample = rows.length > 0 ? column.sortValue?.(rows[0]) : 0;
            return { key: column.key, dir: column.firstDir ?? (typeof sample === "string" ? "asc" : "desc") };
        });
    };
    if (rows.length === 0)
        return <ListEmpty icon={emptyIcon} action={emptyAction}>{empty}</ListEmpty>;
    const visible = sorted.slice(0, shown);
    const alignOf = (column, index) => ALIGN_CLASS[column.align ?? (index === 0 ? "left" : "center")];
    const hideOf = (column) => (scroll ? "" : PRIORITY_CLASS[column.priority ?? 1]);
    const edgeOf = (index) => `${index === 0 ? "pl-4" : "pl-2"} ${index === columns.length - 1 ? "pr-4" : "pr-2"}`;
    const stickyOf = (index, background) => scroll && index === 0 ? `sticky left-0 z-[1] ${background} shadow-[6px_0_8px_-6px_rgba(26,23,20,0.18)]` : "";
    const table = (<table className="w-full border-collapse" style={scroll ? { minWidth: scroll.minWidth } : undefined}>
      <thead>
        <tr>
          {columns.map((column, index) => {
            const active = sort?.key === column.key;
            const label = column.sortValue ? (<button type="button" onClick={() => toggleSort(column)} className={`inline-flex items-center gap-1 uppercase tracking-wider font-bold ${active ? "text-pitch-600" : "hover:text-ink"}`}>
                {column.header}
                {active && (<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className={sort?.dir === "asc" ? "rotate-180" : ""}>
                    <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>)}
              </button>) : column.header;
            return (<th key={column.key} title={column.title} scope="col" aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined} className={`h-9 bg-surface-2 border-b border-line text-micro font-bold uppercase tracking-wider text-muted whitespace-nowrap ${alignOf(column, index)} ${hideOf(column)} ${edgeOf(index)} ${column.width ?? ""} ${stickyOf(index, "bg-surface-2")}`}>
                {label}
              </th>);
        })}
        </tr>
      </thead>
      <tbody>
        {visible.map((row, rowIndex) => {
            const tone = rowTone?.(row);
            const href = rowHref?.(row);
            const clickable = !!href || !!onRowClick;
            const open = () => { if (href)
                router.push(href);
            else
                onRowClick?.(row); };
            const background = tone?.own ? "bg-pitch-50" : "bg-surface";
            return (<tr key={rowKey(row)} onClick={clickable ? open : undefined} onKeyDown={clickable ? (e) => { if (e.key === "Enter")
                open(); } : undefined} tabIndex={clickable ? 0 : undefined} role={href ? "link" : undefined} className={`group ${clickable ? "cursor-pointer" : ""}`}>
              {columns.map((column, index) => (<td key={column.key} className={`h-[52px] sm:h-12 border-b border-line-soft group-last:border-b-0 tabular-nums ${background} ${tone?.own ? "" : "group-hover:bg-surface-2"} ${column.emphasis ? "text-body font-bold text-ink" : "text-ink-light"} ${alignOf(column, index)} ${hideOf(column)} ${edgeOf(index)} ${index === 0 && tone?.bar ? `relative before:absolute before:left-0 before:inset-y-0 before:w-[3px] ${BAR_CLASS[tone.bar]}` : ""} ${stickyOf(index, background)}`}>
                  {column.cell(row, rowIndex)}
                </td>))}
            </tr>);
        })}
      </tbody>
    </table>);
    return (<>
      {scroll ? (<>
          <div className="overflow-x-auto table-scroll">{table}</div>
          <div className="sm:hidden px-4 py-2 border-t border-line-soft text-micro text-muted">← Tabulku lze posunout do strany →</div>
        </>) : table}
      {pageSize != null && (<ShowMore shown={Math.min(shown, sorted.length)} total={sorted.length} step={pageSize} onMore={() => setShown((n) => n + pageSize)}/>)}
    </>);
}
/** Buňka s entitou: znak nebo odznak vlevo, název a volitelně druhý řádek (jen na telefonu, nebo vždy). */
export function EntityCell({ leading, name, meta, metaMobileOnly, bold }) {
    return (<span className="flex items-center gap-2 min-w-0 py-1.5">
      {leading && <span className="shrink-0 flex items-center">{leading}</span>}
      <span className="min-w-0">
        <span className={`block text-body text-ink leading-snug ${bold ? "font-extrabold" : "font-bold"}`}>{name}</span>
        {meta && <span className={`block text-meta font-normal text-muted ${metaMobileOnly ? "sm:hidden" : ""}`}>{meta}</span>}
      </span>
    </span>);
}
//# sourceMappingURL=data-table.js.map