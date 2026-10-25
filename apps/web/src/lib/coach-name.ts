/**
 * Jméno trenéra, jak ho vidí hráči.
 *
 * AI klub se od lidského klubu liší jen štítkem „(AI)“ za jménem trenéra.
 * Štítek se přidává při zobrazení podle příznaku z API (`coachIsAi`),
 * do jména v databázi se nikdy nezapisuje.
 */

const AI_COACH_LABEL = "(AI)";

export function coachDisplayName(name: string, isAi: boolean): string {
  const trimmed = name.trim();
  if (!isAi || !trimmed || trimmed.endsWith(AI_COACH_LABEL)) return trimmed;
  return `${trimmed} ${AI_COACH_LABEL}`;
}
