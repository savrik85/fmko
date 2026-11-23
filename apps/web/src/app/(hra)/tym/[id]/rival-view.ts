// Záložka Soupeř: pomocné výpočty bez Reactu.

export type Competition = "league" | "cup" | "friendly" | "tournament";

interface Fixture {
  status: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  scheduledAt: string | null;
}

/**
 * Nejbližší neodehraný zápas se soupeřem. Rozpis řadí ligu podle data, ale pohár a turnaj
 * připojuje až na konec, proto se tu řadí znovu.
 */
export function nextMeeting<T extends Fixture>(schedule: readonly T[], rivalId: string): T | null {
  const upcoming = schedule
    .filter((m) => m.status !== "simulated" && (m.homeTeamId === rivalId || m.awayTeamId === rivalId))
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  return upcoming[0] ?? null;
}

export function competitionLabel(m: { competition: Competition; label: string | null }): string {
  if (m.competition === "friendly") return "Přátelák";
  if (m.competition === "tournament") return m.label ?? "Turnaj";
  const name = m.competition === "cup" ? "Pohár" : "Liga";
  if (!m.label) return name;
  // Název pohárového kola začíná velkým písmenem („Čtvrtfinále“), za čárkou má být malé.
  const round = m.competition === "cup" ? m.label.charAt(0).toLocaleLowerCase("cs") + m.label.slice(1) : m.label;
  return `${name}, ${round}`;
}

/** Nejčastější rozestavení; při shodě to, které soupeř hrál naposledy (seznam jde od nejnovějšího). */
export function mostCommonFormation(formations: ReadonlyArray<{ formation: string }>): { formation: string; count: number } | null {
  let best: { formation: string; count: number } | null = null;
  for (const { formation } of formations) {
    const count = formations.filter((f) => f.formation === formation).length;
    if (!best || count > best.count) best = { formation, count };
  }
  return best;
}
