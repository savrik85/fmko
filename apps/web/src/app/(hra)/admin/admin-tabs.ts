import type { TabItem } from "@/components/ui";

/** Záložky administrace. Přehled je první: když je zelený, zbytek není potřeba otevírat. */
export const ADMIN_TABS = [
  { key: "prehled", label: "Přehled", icon: "📋" },
  { key: "ai", label: "AI kluby", icon: "🤖" },
  { key: "hra", label: "Hra", icon: "⏭️" },
  { key: "lide", label: "Lidé", icon: "👥" },
  { key: "data", label: "Data", icon: "🗂️" },
] as const satisfies ReadonlyArray<TabItem>;

export type AdminTab = (typeof ADMIN_TABS)[number]["key"];

export const ADMIN_TAB_KEYS: readonly AdminTab[] = ADMIN_TABS.map((t) => t.key);
