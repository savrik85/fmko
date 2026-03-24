"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface PageHeaderOverride {
  name?: string;
  detail?: string;
  color?: string;
}

interface PageHeaderContextValue {
  override: PageHeaderOverride | null;
  setOverride: (o: PageHeaderOverride | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({ override: null, setOverride: () => {} });

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<PageHeaderOverride | null>(null);
  return (
    <PageHeaderContext.Provider value={{ override, setOverride }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderOverride() {
  return useContext(PageHeaderContext);
}
