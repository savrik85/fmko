import type { LayoutItem } from "./types";

/**
 * Výchozí podoba stránky Domů — odpovídá tomu, jak vypadala, než šla rozložit
 * na widgety. Kdo nikdy needitoval, nepozná rozdíl.
 *
 * Uložený layout tuhle konstantu přebíjí; DELETE endpointu se sem vrací.
 */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: "today-program", w: 3 },
  { id: "next-match", w: 1 },
  { id: "standings", w: 1 },
  { id: "squad-status", w: 1 },
  { id: "manager-card", w: 1 },
  { id: "budget-summary", w: 1 },
  { id: "recent-matches", w: 1 },
  { id: "pub-session", w: 3 },
  { id: "fixtures", w: 1 },
  { id: "season-record", w: 1 },
  { id: "news", w: 1 },
  { id: "achievements", w: 2 },
  { id: "hall-of-fame", w: 1 },
  { id: "top-scorers", w: 1 },
  { id: "top-assists", w: 1 },
  { id: "top-rated", w: 1 },
];
