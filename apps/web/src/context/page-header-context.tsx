"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Co stránka vzkazuje horní liště.
 *
 * Lišta nese znak, název stránky a pozici v lize. Stránky, které chtějí vlastní
 * název („Přebor Prahy“ místo „Liga“), barvu nebo znak (turnaj pořadatele),
 * to sem předají přes `<PageHeader compact … />`.
 */
export interface PageHeaderOverride {
  name?: string;
  color?: string;
  /** `null` znak skryje, `undefined` nechá znak klubu. */
  badge?: ReactNode | null;
  hideLeaguePosition?: boolean;
}

interface PageHeaderContextValue {
  override: PageHeaderOverride | null;
  setOverride: (o: PageHeaderOverride | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({ override: null, setOverride: () => {} });

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<PageHeaderOverride | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

export function usePageHeaderOverride() {
  return useContext(PageHeaderContext);
}
